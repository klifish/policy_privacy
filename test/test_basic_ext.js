const path = require('path');
const wasm_tester = require('circom_tester').wasm;
const assert = require('assert');

describe('Basic EXT Circuit Test', function () {
    this.timeout(100000);
    let circuit;

    before(async () => {
        circuit = await wasm_tester(path.join(__dirname, 'circuits', 'test_postfix_policy_interpreter_extended.circom'));
    });

    it('should handle basic operations without EXT', async () => {
        // Test a simple AND operation: A0 AND P0
        const input = {
            postfixExpr: [0, 3, 5, 0, 0, 0, 0, 0, 0, 0], // A0, P0, AND
            numOperations: 3,
            requesterPolicy: [1, 0, 0],
            predicateValues: [1, 0],

            // EXT operation inputs (not used but required)
            bindingRoot: 0,
            duoId: 0,
            icdRoot: 0,
            bindingVersion: 0,
            bindingSalt: 0,
            bindingPathElements: Array(8).fill(0),
            bindingPathIndices: Array(8).fill(0),
            icdCode: 0,
            icdPathElements: Array(8).fill(0),
            icdPathIndices: Array(8).fill(0)
        };

        const witness = await circuit.calculateWitness(input, true);
        await circuit.assertOut(witness, { isValid: 1 });
    });
});