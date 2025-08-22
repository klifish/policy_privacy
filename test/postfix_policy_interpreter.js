const path = require('path');
const wasm_tester = require('circom_tester').wasm;
const assert = require('assert');

function evalPostfix(tokens, attrs, N) {
    /*
     * Evaluate a Boolean postfix (Reverse Polish) expression in plain JS.
     *
     * Parameters
     * ----------
     * tokens : number[]
     *    Encoded postfix expression. 0‥N‑1 = attribute index,
     *    N+0 = AND, N+1 = OR, N+2 = NOT, N+3 = reserved/invalid.
     * attrs  : number[]
     *    Attribute bitmap. attrs[i] must be 0 or 1.
     * N      : number
     *    Number of attributes (length of attrs).
     *
     * Returns
     * -------
     * 0 or 1 : evaluation result.
     *
     * Throws
     * ------
     * Error if the expression is malformed (stack under‑/over‑flow,
     * unsupported opcode, or final stack depth ≠ 1).
     */
    const st = [];                    // evaluation stack

    for (const t of tokens) {
        if (t < N) {
            /* Operand  –  push attribute value onto the stack */
            st.push(attrs[t]);
        } else {
            /* Operator  –  compute after popping required operands */
            const op = t - N;
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

function randomInt(max) { return Math.floor(Math.random() * max); }

function genRandomValid(N, DEPTH) {
    // Goal: generate O operands, binary ops B = O - 1, and any number of unary ops U (overall depth unchanged)
    const maxOperands = Math.min(N, Math.max(1, DEPTH)); // at least one operand, at most N
    const O = 1 + randomInt(Math.min(3, maxOperands));
    let U = randomInt(3); // 0..2 unary ops
    const tokens = [];
    let depth = 0;
    let operandsUsed = 0;
    let binariesUsed = 0;
    const neededBinaries = O - 1;

    while (tokens.length < DEPTH && (operandsUsed < O || binariesUsed < neededBinaries || U > 0)) {
        // If depth < 2 must push operand if we still need some
        if (depth < 1 && operandsUsed < O) {
            tokens.push(randomInt(N));
            depth++; operandsUsed++;
            continue;
        }
        if (depth < 2 && operandsUsed < O) {
            tokens.push(randomInt(N));
            depth++; operandsUsed++;
            continue;
        }
        // Option to insert unary if any left
        if (U > 0 && depth >= 1 && Math.random() < 0.3) {
            tokens.push(N + 2); // NOT
            U--; // depth unchanged
            continue;
        }
        // Insert operand if still need
        if (operandsUsed < O && Math.random() < 0.5) {
            tokens.push(randomInt(N));
            depth++; operandsUsed++;
            continue;
        }
        // Insert binary if we still need and depth >=2
        if (binariesUsed < neededBinaries && depth >= 2) {
            const op = (Math.random() < 0.5) ? (N + 0) : (N + 1);
            tokens.push(op);
            depth--; // binary consumes one
            binariesUsed++;
            continue;
        }
        // If nothing else chosen but still unary remains
        if (U > 0 && depth >= 1) {
            tokens.push(N + 2);
            U--;
        } else break;
    }

    // Ensure we used all required binaries
    while (binariesUsed < neededBinaries && tokens.length < DEPTH && depth >= 2) {
        tokens.push(N + (Math.random() < 0.5 ? 0 : 1));
        depth--; binariesUsed++;
    }

    if (depth !== 1) throw new Error("Generator bug: final depth " + depth);
    return { tokens, numOperations: tokens.length };
}

describe('Postfix Policy Interpreter Test', function () {
    this.timeout(100000);
    let circuit;

    before(async () => {
        circuit = await wasm_tester(path.join(__dirname, '..', 'circuits', 'postfix_policy_interpreter_legacy.circom'));
        console.log('Circuit loaded successfully');
    });

    it("single operand (A)", async () => {
        const input = {
            postfixExpr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 1,
            requesterPolicy: [1, 1, 1]
        };
        await expectValid(circuit, input, 1);
    });

    it("single operand (B)", async () => {
        const input = {
            postfixExpr: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 1,
            requesterPolicy: [1, 1, 1]
        };
        await expectValid(circuit, input, 1);
    });

    it("single operand (C)", async () => {
        const input = {
            postfixExpr: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 1,
            requesterPolicy: [1, 1, 1]
        };
        await expectValid(circuit, input, 1);
    });

    it("A(1) B(0) AND", async () => {
        const input = {
            postfixExpr: [0, 1, 3, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 3,
            requesterPolicy: [1, 0, 0]
        };
        // eval: 1 & 0 = 0
        await expectValid(circuit, input, 0);
    });

    it("A(1) B(1) AND", async () => {
        const input = {
            postfixExpr: [0, 1, 3, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 3,
            requesterPolicy: [1, 1, 0]
        };
        // eval: 1 & 1 = 1
        await expectValid(circuit, input, 1);
    });

    it("A(1) B(0) OR", async () => {
        const input = {
            postfixExpr: [0, 1, 4, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 3,
            requesterPolicy: [1, 0, 0]
        };
        // 1 | 0 = 1
        await expectValid(circuit, input, 1);
    });

    it("A(0) B(0) OR", async () => {
        const input = {
            postfixExpr: [0, 1, 4, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 3,
            requesterPolicy: [0, 0, 0]
        };
        // 0 | 0 = 0
        await expectValid(circuit, input, 0);
    });

    it("A NOT", async () => {
        const input = {
            postfixExpr: [0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 2,
            requesterPolicy: [1, 0, 0]
        };
        // ¬1 = 0
        await expectValid(circuit, input, 0);
    });

    it("(A AND (NOT B)) OR C", async () => {
        // A B NOT AND C OR
        const seq = [0, 1, 5, 3, 2, 4, 0, 0, 0, 0];
        const attrs = [1, 0, 1];
        const expected = evalPostfix(seq.slice(0, 6), attrs, 3);
        const input = { postfixExpr: seq, numOperations: 6, requesterPolicy: attrs };
        await expectValid(circuit, input, expected);
    });

    it("A NOT NOT (should return A)", async () => {
        const seq = [0, 5, 5, 0, 0, 0, 0, 0, 0, 0]; // A NOT NOT
        const input = { postfixExpr: seq, numOperations: 3, requesterPolicy: [1, 0, 0] };
        await expectValid(circuit, input, 1);
    });

    it("binary op with empty stack (AND)", async () => {
        await expectInvalid(circuit, {
            postfixExpr: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 1,
            requesterPolicy: [1, 0, 0]
        }, "AND needs two operands");
    });

    it("unary op with empty stack (NOT)", async () => {
        await expectInvalid(circuit, {
            postfixExpr: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 1,
            requesterPolicy: [1, 0, 0]
        }, "NOT needs one operand");
    });

    it("final stack depth != 1 (A B)", async () => {
        await expectInvalid(circuit, {
            postfixExpr: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
            numOperations: 2,
            requesterPolicy: [1, 1, 0]
        }, "two operands no operator");
    });

    it("padding tokens ignored", async () => {
        const core = [0, 1, 3]; // A B AND = 1 & 0 maybe
        const pad1 = [0, 0, 0, 0, 0, 0, 0];
        const pad2 = [6, 6, 6, 6, 6, 6, 6]; // even reserved tokens in padding
        const attrs = [1, 0, 1];

        const input1 = { postfixExpr: core.concat(pad1), numOperations: 3, requesterPolicy: attrs };
        const input2 = { postfixExpr: core.concat(pad2), numOperations: 3, requesterPolicy: attrs };

        const w1 = await circuit.calculateWitness(input1, true);
        const w2 = await circuit.calculateWitness(input2, true);
        await circuit.assertOut(w1, { isValid: w1[1] }); // (index depends; safer re-evaluate)
        await circuit.assertOut(w2, { isValid: w1[1] });
    });

    it("uses highest attribute index (C)", async () => {
        const input = {
            postfixExpr: [2, 5, 0, 0, 0, 0, 0, 0, 0, 0], // C NOT
            numOperations: 2,
            requesterPolicy: [1, 0, 1]
        };
        // C=1 => NOT => 0
        await expectValid(circuit, input, 0);
    });

    it("reserved operator code (N+3) should fail", async () => {
        await expectInvalid(circuit, {
            postfixExpr: [0, 6, 0, 0, 0, 0, 0, 0, 0, 0], // A <reserved>
            numOperations: 2,
            requesterPolicy: [1, 0, 0]
        }, "reserved op");
    });

    it("A AND (NOT A) = 0", async () => {
        // A A NOT AND
        const seq = [0, 0, 5, 3, 0, 0, 0, 0, 0, 0];
        const input = { postfixExpr: seq, numOperations: 4, requesterPolicy: [1, 0, 0] };
        await expectValid(circuit, input, 0);
    });
    it("fuzz valid expressions (20 samples)", async () => {
        for (let k = 0; k < 20; k++) {
            const { tokens, numOperations } = genRandomValid(3, 10);
            const attrs = [randomInt(2), randomInt(2), randomInt(2)];
            const expected = evalPostfix(tokens, attrs, 3);
            const postfixExpr = tokens.concat(Array(10 - tokens.length).fill(0));
            const input = { postfixExpr, numOperations, requesterPolicy: attrs };
            await expectValid(circuit, input, expected);
        }
    });

    it("fuzz invalid (missing final binary)", async () => {
        for (let k = 0; k < 10; k++) {
            // push two operands, stop
            const postfixExpr = [randomInt(3), randomInt(3)].concat(Array(8).fill(0));
            const input = {
                postfixExpr,
                numOperations: 2,
                requesterPolicy: [randomInt(2), randomInt(2), randomInt(2)]
            };
            await expectInvalid(circuit, input, "final depth != 1");
        }
    });

    it('evaluates a simple postfix expression', async () => {
        const input = {
            postfixExpr: [0, 1, 4, 2, 5, 3, 0, 0, 0, 0],
            numOperations: 6,
            requesterPolicy: [1, 1, 0]
        };

        const expected = evalPostfix(input.postfixExpr.slice(0, input.numOperations), input.requesterPolicy, 3);
        await expectValid(circuit, input, expected);
    });
});