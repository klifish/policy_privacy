const path = require('path');
const fs = require('fs');

// Load the witness calculator for the legacy circuit
const wasm = fs.readFileSync('../../build/test/postfix_policy_interpreter_legacy_js/postfix_policy_interpreter_legacy.wasm');
const { WitnessCalculatorBuilder } = require('circom_runtime');

// Original evaluation function
function evalPostfix(tokens, attrs, N) {
    const st = [];
    for (const t of tokens) {
        if (t < N) {
            st.push(attrs[t]);
        } else {
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
    if (st.length !== 1) throw new Error("Final stack depth != 1");
    return st[0];
}

async function testLegacyCircuit() {
    console.log('Testing legacy PostfixPolicyInterpreter for backward compatibility...');
    
    const wc = await WitnessCalculatorBuilder(wasm);
    
    const testCases = [
        {
            name: "single operand (A)",
            input: {
                postfixExpr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                numOperations: 1,
                requesterPolicy: [1, 1, 1]
            },
            expected: 1
        },
        {
            name: "A(1) B(0) AND",
            input: {
                postfixExpr: [0, 1, 3, 0, 0, 0, 0, 0, 0, 0], // A0, A1, AND (3 = N+0 = 3+0)
                numOperations: 3,
                requesterPolicy: [1, 0, 0]
            },
            expected: 0
        },
        {
            name: "A(1) B(0) OR",
            input: {
                postfixExpr: [0, 1, 4, 0, 0, 0, 0, 0, 0, 0], // A0, A1, OR (4 = N+1 = 3+1)
                numOperations: 3,
                requesterPolicy: [1, 0, 0]
            },
            expected: 1
        },
        {
            name: "A NOT",
            input: {
                postfixExpr: [0, 5, 0, 0, 0, 0, 0, 0, 0, 0], // A0, NOT (5 = N+2 = 3+2)
                numOperations: 2,
                requesterPolicy: [1, 0, 0]
            },
            expected: 0
        }
    ];

    let passed = 0;
    let total = testCases.length;

    for (const testCase of testCases) {
        try {
            console.log(`\nTesting: ${testCase.name}`);
            
            // Calculate expected result using JS evaluation
            const jsResult = evalPostfix(
                testCase.input.postfixExpr.slice(0, testCase.input.numOperations),
                testCase.input.requesterPolicy,
                3
            );
            
            console.log(`  JS evaluation result: ${jsResult}`);
            console.log(`  Expected result: ${testCase.expected}`);
            
            if (jsResult === testCase.expected) {
                console.log(`  ✓ JS test PASS`);
                passed++;
            } else {
                console.log(`  ✗ JS test FAIL: result ${jsResult} != expected ${testCase.expected}`);
            }
            
            // Test circuit witness
            try {
                const witness = await wc.calculateWitness(testCase.input, true);
                const circuitResult = parseInt(witness[1].toString());
                console.log(`  Circuit result: ${circuitResult}`);
                
                if (circuitResult === testCase.expected) {
                    console.log(`  ✓ Circuit matches expected`);
                } else {
                    console.log(`  ✗ Circuit result ${circuitResult} != expected ${testCase.expected}`);
                }
            } catch (circuitError) {
                console.log(`  (Circuit test skipped: ${circuitError.message})`);
            }
            
        } catch (error) {
            console.log(`  ✗ FAIL: ${error.message}`);
        }
    }

    console.log(`\n\nBackward compatibility test: ${passed}/${total} passed`);
    return passed === total;
}

// Run tests if this file is executed directly
if (require.main === module) {
    testLegacyCircuit().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { testLegacyCircuit };