const path = require('path');
const wasm_tester = require('circom_tester').wasm;
const assert = require('assert');

// Extended evaluation function that handles predicates
function evalPostfixExtended(tokens, attrs, predicates, N, M) {
    /*
     * Evaluate a Boolean postfix (Reverse Polish) expression with both
     * requester attributes and external predicate values.
     *
     * Parameters
     * ----------
     * tokens : number[]
     *    Encoded postfix expression. 0‥N‑1 = attribute index,
     *    N‥N+M-1 = predicate index, N+M+0 = AND, N+M+1 = OR, 
     *    N+M+2 = NOT, N+M+3 = reserved/invalid.
     * attrs  : number[]
     *    Attribute bitmap. attrs[i] must be 0 or 1.
     * predicates : number[]
     *    Predicate bitmap. predicates[i] must be 0 or 1.
     * N      : number
     *    Number of attributes (length of attrs).
     * M      : number
     *    Number of predicates (length of predicates).
     */
    const st = [];                    // evaluation stack

    for (const t of tokens) {
        if (t < N) {
            /* Requester attribute  –  push attribute value onto the stack */
            st.push(attrs[t]);
        } else if (t < N + M) {
            /* Predicate value  –  push predicate value onto the stack */
            st.push(predicates[t - N]);
        } else {
            /* Operator  –  compute after popping required operands */
            const op = t - (N + M);
            if (op === 0) { // AND
                if (st.length < 2) throw new Error("Binary op depth");
                const b = st.pop(), a = st.pop();
                st.push(a & b);
            } else if (op === 1) { // OR
                if (st.length < 2) throw new Error("Binary op depth");
                const b = st.pop(), a = st.pop();
                st.push(a | b);
            } else if (op === 2) { // NOT
                if (st.length < 1) throw new Error("Unary op depth");
                const a = st.pop();
                st.push(1 - a);
            } else {
                throw new Error("Unsupported op code");
            }
        }
    }

    /* After processing all tokens, exactly one value must remain */
    if (st.length !== 1) throw new Error("Final stack depth != 1");
    return st[0];
}

async function expectValid(circuit, input, expectedIsValid) {
    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, { isValid: expectedIsValid });
}

async function expectInvalid(circuit, input, reasonHint) {
    let ok = false;
    try {
        await circuit.calculateWitness(input, true);
    } catch (e) {
        ok = true;
        // console.log("Expected failure:", reasonHint, e.message);
    }
    if (!ok) {
        throw new Error("Expected invalid but succeeded: " + reasonHint);
    }
}

describe('Extended Postfix Policy Interpreter Test', function () {
    this.timeout(100000);
    let circuit;

    before(async () => {
        circuit = await wasm_tester(path.join(__dirname, '..', 'circuits', 'test_postfix_policy_interpreter_extended.circom'));
        console.log('Extended circuit loaded successfully');
    });

    describe('Basic functionality with predicates', function () {
        
        it("single predicate (P0)", async () => {
            const input = {
                postfixExpr: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0], // P0 (first predicate)
                numOperations: 1,
                requesterPolicy: [1, 1, 1],
                predicateValues: [1, 0]
            };
            await expectValid(circuit, input, 1);
        });

        it("single predicate (P1)", async () => {
            const input = {
                postfixExpr: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0], // P1 (second predicate)
                numOperations: 1,
                requesterPolicy: [1, 1, 1],
                predicateValues: [1, 0]
            };
            await expectValid(circuit, input, 0);
        });

        it("attribute AND predicate (A AND P0)", async () => {
            const input = {
                postfixExpr: [0, 3, 8, 0, 0, 0, 0, 0, 0, 0], // A0, P0, AND (8 = N+M+0 = 3+2+0)
                numOperations: 3,
                requesterPolicy: [1, 0, 0],
                predicateValues: [1, 0]
            };
            // eval: A0(1) AND P0(1) = 1 & 1 = 1
            await expectValid(circuit, input, 1);
        });

        it("attribute OR predicate (A OR P1)", async () => {
            const input = {
                postfixExpr: [0, 4, 9, 0, 0, 0, 0, 0, 0, 0], // A0, P1, OR (9 = N+M+1 = 3+2+1)
                numOperations: 3,
                requesterPolicy: [0, 0, 0],
                predicateValues: [0, 1]
            };
            // eval: A0(0) OR P1(1) = 0 | 1 = 1
            await expectValid(circuit, input, 1);
        });

        it("NOT predicate", async () => {
            const input = {
                postfixExpr: [3, 10, 0, 0, 0, 0, 0, 0, 0, 0], // P0, NOT (10 = N+M+2 = 3+2+2)
                numOperations: 2,
                requesterPolicy: [1, 0, 0],
                predicateValues: [1, 0]
            };
            // eval: NOT P0(1) = ¬1 = 0
            await expectValid(circuit, input, 0);
        });

        it("complex expression: DS AND IRB (example from issue)", async () => {
            const input = {
                postfixExpr: [3, 4, 8, 0, 0, 0, 0, 0, 0, 0], // P0(DS), P1(IRB), AND
                numOperations: 3,
                requesterPolicy: [0, 0, 0],
                predicateValues: [1, 1] // Both DS and IRB are true
            };
            // eval: DS(1) AND IRB(1) = 1 & 1 = 1
            await expectValid(circuit, input, 1);
        });

        it("mixed expression: (A AND P0) OR (B AND P1)", async () => {
            const input = {
                postfixExpr: [0, 3, 8, 1, 4, 8, 9, 0, 0, 0], // A0, P0, AND, A1, P1, AND, OR
                numOperations: 7,
                requesterPolicy: [0, 1, 0], // A0=0, A1=1, A2=0
                predicateValues: [0, 1]     // P0=0, P1=1
            };
            // eval: (A0(0) AND P0(0)) OR (A1(1) AND P1(1)) = 0 OR 1 = 1
            const expected = evalPostfixExtended(input.postfixExpr.slice(0, input.numOperations), 
                                               input.requesterPolicy, input.predicateValues, 3, 2);
            await expectValid(circuit, input, expected);
        });
    });

    describe('Error cases', function () {
        
        it("reserved operator code (N+M+3) should fail", async () => {
            await expectInvalid(circuit, {
                postfixExpr: [3, 11, 0, 0, 0, 0, 0, 0, 0, 0], // P0 <reserved> (11 = N+M+3 = 3+2+3)
                numOperations: 2,
                requesterPolicy: [1, 0, 0],
                predicateValues: [1, 0]
            }, "reserved op");
        });

        it("binary op with insufficient stack depth", async () => {
            await expectInvalid(circuit, {
                postfixExpr: [8, 0, 0, 0, 0, 0, 0, 0, 0, 0], // AND with no operands
                numOperations: 1,
                requesterPolicy: [1, 0, 0],
                predicateValues: [1, 0]
            }, "AND needs two operands");
        });

        it("final stack depth != 1", async () => {
            await expectInvalid(circuit, {
                postfixExpr: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0], // A0, P0 (two operands, no operator)
                numOperations: 2,
                requesterPolicy: [1, 0, 0],
                predicateValues: [1, 0]
            }, "two operands no operator");
        });
    });

    describe('Backward compatibility edge case (M=0 simulation)', function () {
        
        it("should work with no predicates used (only attributes)", async () => {
            const input = {
                postfixExpr: [0, 1, 8, 0, 0, 0, 0, 0, 0, 0], // A0, A1, AND
                numOperations: 3,
                requesterPolicy: [1, 0, 0],
                predicateValues: [0, 0] // predicates not used
            };
            // eval: A0(1) AND A1(0) = 1 & 0 = 0
            await expectValid(circuit, input, 0);
        });
    });
});