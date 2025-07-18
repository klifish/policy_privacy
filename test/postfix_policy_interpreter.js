const path = require('path');
const wasm_tester = require('circom_tester').wasm;

describe('Postfix Policy Interpreter Test', function () {
    this.timeout(100000);
    let circuit;

    before(async () => {
        circuit = await wasm_tester(path.join(__dirname, '..', 'circuits', 'postfix_policy_interpreter.circom'));
        console.log('Circuit loaded successfully');
    });

    it('evaluates a simple postfix expression', async () => {
        const input = {
            postfixExpr: [0, 1, 4, 2, 5, 3, 0, 0, 0, 0],
            numOperations: 6,
            requesterPolicy: [1, 0, 1]
        };


        const witness = await circuit.calculateWitness(input, true);

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { isValid: 1 });
    });
});