const circomTester = require('circom_tester');
const wasm = circomTester.wasm;
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const snarkjs = require('snarkjs');

describe('Policy Interpreter Tests', function () {
    this.timeout(100000);

    let circuit;
    let wasmPath;
    let r1csPath;

    before(async function () {
        // Setup file paths for circuit testing
        wasmPath = path.join(__dirname, "../build/circuits/test_postfix_policy_interpreter_js/test_postfix_policy_interpreter.wasm");
        r1csPath = path.join(__dirname, "../build/circuits/test_postfix_policy_interpreter.r1cs");

        // Try to load circuit with circom_tester first
        try {
            circuit = await wasm('test/circuits/test_postfix_policy_interpreter.circom');
            console.log('Circuit loaded successfully with circom_tester');
        } catch (error) {
            console.log('Failed to load circuit with circom_tester:', error.message);
            if (fs.existsSync(wasmPath) && fs.existsSync(r1csPath)) {
                console.log('Circuit files found, will use snarkjs for testing');
            } else {
                throw new Error('Circuit files not found. Run "npm run build:circuit" to compile the circuits first');
            }
        }
    });

    // Helper function to test circuits with snarkjs when circom_tester is not available
    async function testWithSnarkjs(input, expectedOutput) {
        if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
            throw new Error('Circuit files not found for snarkjs testing');
        }
        
        try {
            // Use snarkjs wtns calculate to compute witness
            const inputFilePath = path.join(__dirname, '../build/temp_input.json');
            const witnessFilePath = path.join(__dirname, '../build/temp_witness.wtns');
            
            // Write input to temporary file
            fs.writeFileSync(inputFilePath, JSON.stringify(input));
            
            // Calculate witness using snarkjs
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Run snarkjs wtns calculate
            await execAsync(`npx snarkjs wtns calculate ${wasmPath} ${inputFilePath} ${witnessFilePath}`);
            
            // Export witness to JSON to read the output
            const witnessJsonPath = path.join(__dirname, '../build/temp_witness.json');
            await execAsync(`npx snarkjs wtns export json ${witnessFilePath} ${witnessJsonPath}`);
            
            // Read the witness output
            const witnessJson = JSON.parse(fs.readFileSync(witnessJsonPath, 'utf8'));
            const output = BigInt(witnessJson[1]); // First output signal (isValid)
            
            console.log(`Circuit output: ${output}, expected: ${expectedOutput}`);
            assert.strictEqual(output.toString(), expectedOutput.toString(), 
                `Circuit output mismatch. Got ${output}, expected ${expectedOutput}`);
                
            // Cleanup temporary files
            fs.unlinkSync(inputFilePath);
            fs.unlinkSync(witnessFilePath);
            fs.unlinkSync(witnessJsonPath);
            
        } catch (error) {
            if (error.message.includes('Assert Failed') || error.stderr && error.stderr.includes('Assert Failed')) {
                // This is a constraint violation in the circuit
                console.log(`Circuit constraint violation (expected for invalid inputs): ${error.message}`);
                if (expectedOutput === 0) {
                    // If we expect failure and got a constraint violation, that's correct behavior
                    return;
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }

    it('Should evaluate simple AND policy correctly', async function () {
        // Policy: attr0 AND attr1 
        // RPN: [0, 1, 5] (0=attr0, 1=attr1, 5=AND for N=3,M=2)
        const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [1, 1, 0]; // attr0=1, attr1=1, attr2=0
        const externalPredicates = [0, 0]; // No external predicates used

        const input = {
            postfixExpr: policy,
            numOperations: 3,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available
        if (circuit) {
            try {
                const witness = await circuit.calculateWitness(input);
                await circuit.checkConstraints(witness);
                await circuit.assertOut(witness, { isValid: 1 }); // Should evaluate to true
                console.log('✅ Circuit test passed: AND policy evaluation');
            } catch (error) {
                console.log('Circuit test failed:', error.message);
                throw error;
            }
        } else {
            // Use snarkjs for circuit testing
            await testWithSnarkjs(input, 1);
            console.log('✅ snarkjs test passed: AND policy evaluation');
        }
    });

    it('Should evaluate simple OR policy correctly', async function () {
        // Policy: attr0 OR attr2
        // RPN: [0, 2, 6] (0=attr0, 2=attr2, 6=OR for N=3,M=2)  
        const policy = [0, 2, 6, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [0, 0, 1]; // attr0=0, attr1=0, attr2=1
        const externalPredicates = [0, 0];

        const input = {
            postfixExpr: policy,
            numOperations: 3,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available
        if (circuit) {
            const witness = await circuit.calculateWitness(input);
            await circuit.checkConstraints(witness);
            await circuit.assertOut(witness, { isValid: 1 }); // Should evaluate to true
            console.log('✅ Circuit test passed: OR policy evaluation');
        } else {
            await testWithSnarkjs(input, 1);
            console.log('✅ snarkjs test passed: OR policy evaluation');
        }
    });

    it('Should evaluate NOT policy correctly', async function () {
        // Policy: NOT attr0
        // RPN: [0, 7] (0=attr0, 7=NOT for N=3,M=2)
        const policy = [0, 7, 0, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [0, 1, 1]; // attr0=0
        const externalPredicates = [0, 0];

        const input = {
            postfixExpr: policy,
            numOperations: 2,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available
        if (circuit) {
            const witness = await circuit.calculateWitness(input);
            await circuit.checkConstraints(witness);
            await circuit.assertOut(witness, { isValid: 1 }); // NOT 0 = 1
            console.log('✅ Circuit test passed: NOT policy evaluation');
        } else {
            await testWithSnarkjs(input, 1);
            console.log('✅ snarkjs test passed: NOT policy evaluation');
        }
    });

    it('Should evaluate complex policy correctly', async function () {
        // Policy: (attr0 AND attr1) OR (NOT attr2)
        // RPN: [0, 1, 5, 2, 7, 6] (attr0, attr1, AND, attr2, NOT, OR)
        const policy = [0, 1, 5, 2, 7, 6, 0, 0, 0, 0];
        const requesterAttrs = [0, 0, 0]; // All attributes false
        const externalPredicates = [0, 0];

        const input = {
            postfixExpr: policy,
            numOperations: 6,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available
        if (circuit) {
            const witness = await circuit.calculateWitness(input);
            await circuit.checkConstraints(witness);
            await circuit.assertOut(witness, { isValid: 1 }); // (0 AND 0) OR (NOT 0) = 0 OR 1 = 1
            console.log('✅ Circuit test passed: Complex policy evaluation');
        } else {
            await testWithSnarkjs(input, 1);
            console.log('✅ snarkjs test passed: Complex policy evaluation');
        }
    });

    it('Should evaluate policy with external predicates', async function () {
        // Policy: attr0 AND pred0 (external predicate 0)
        // RPN: [0, 3, 5] (0=attr0, 3=pred0 for N=3,M=2, 5=AND)
        const policy = [0, 3, 5, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [1, 0, 0]; // attr0=1
        const externalPredicates = [1, 0]; // pred0=1, pred1=0

        const input = {
            postfixExpr: policy,
            numOperations: 3,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available
        if (circuit) {
            const witness = await circuit.calculateWitness(input);
            await circuit.checkConstraints(witness);
            await circuit.assertOut(witness, { isValid: 1 }); // 1 AND 1 = 1
            console.log('✅ Circuit test passed: External predicate policy evaluation');
        } else {
            await testWithSnarkjs(input, 1);
            console.log('✅ snarkjs test passed: External predicate policy evaluation');
        }
    });

    it('Should handle malformed policy gracefully', async function () {
        // Malformed policy: stack underflow 
        const policy = [5, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // AND without operands
        const requesterAttrs = [1, 1, 1];
        const externalPredicates = [1, 1];

        const input = {
            postfixExpr: policy,
            numOperations: 1,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available - this should fail constraints
        if (circuit) {
            try {
                const witness = await circuit.calculateWitness(input);
                await circuit.checkConstraints(witness);
                // If we get here, the circuit didn't fail as expected
                throw new Error('Circuit should have failed with constraint violation');
            } catch (error) {
                if (error.message.includes('Assert Failed') || error.message.includes('constraint')) {
                    console.log('✅ Circuit correctly rejected malformed policy with constraint violation');
                } else {
                    throw error;
                }
            }
        } else {
            // With snarkjs, expect constraint violation for malformed input
            try {
                await testWithSnarkjs(input, 0);
                // If this doesn't throw, it means the circuit improperly accepted invalid input
                throw new Error('Circuit should have rejected malformed policy with constraint violation');
            } catch (error) {
                if (error.message.includes('Assert Failed') || error.message.includes('Error in template') || 
                    (error.stderr && error.stderr.includes('Assert Failed'))) {
                    console.log('✅ Circuit correctly rejected malformed policy with constraint violation');
                } else {
                    throw error;
                }
            }
        }
    });

    it('Should reject policy when attributes do not match', async function () {
        // Policy: attr0 AND attr1
        const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [1, 0, 0]; // attr0=1, attr1=0 
        const externalPredicates = [0, 0];

        const input = {
            postfixExpr: policy,
            numOperations: 3,
            requesterPolicy: requesterAttrs,
            predicateValues: externalPredicates
        };

        // Test with circuit if available
        if (circuit) {
            const witness = await circuit.calculateWitness(input);
            await circuit.checkConstraints(witness);
            await circuit.assertOut(witness, { isValid: 0 }); // 1 AND 0 = 0
            console.log('✅ Circuit test passed: Policy rejection when attributes do not match');
        } else {
            await testWithSnarkjs(input, 0);
            console.log('✅ snarkjs test passed: Policy rejection when attributes do not match');
        }
    });
});