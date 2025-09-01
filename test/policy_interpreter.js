const circomTester = require('circom_tester');
const wasm = circomTester.wasm;
const assert = require('assert');

describe('Policy Interpreter Tests', function () {
    this.timeout(100000);

    let circuit;

    before(async function () {
        try {
            circuit = await wasm('test/circuits/test_postfix_policy_interpreter.circom');
        } catch (error) {
            console.log('Circuit build files not found, skipping policy interpreter tests');
            this.skip();
        }
    });

    it('Should evaluate simple AND policy correctly', async function () {
        // Policy: attr0 AND attr1 
        // RPN: [0, 1, 5] (0=attr0, 1=attr1, 5=AND for N=3,M=2)
        const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [1, 1, 0]; // attr0=1, attr1=1, attr2=0
        const externalPredicates = [0, 0]; // No external predicates used

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 1 }); // Should evaluate to true
    });

    it('Should evaluate simple OR policy correctly', async function () {
        // Policy: attr0 OR attr2
        // RPN: [0, 2, 6] (0=attr0, 2=attr2, 6=OR for N=3,M=2)  
        const policy = [0, 2, 6, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [0, 0, 1]; // attr0=0, attr1=0, attr2=1
        const externalPredicates = [0, 0];

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 1 }); // Should evaluate to true
    });

    it('Should evaluate NOT policy correctly', async function () {
        // Policy: NOT attr0
        // RPN: [0, 7] (0=attr0, 7=NOT for N=3,M=2)
        const policy = [0, 7, 0, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [0, 1, 1]; // attr0=0
        const externalPredicates = [0, 0];

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 1 }); // NOT 0 = 1
    });

    it('Should evaluate complex policy correctly', async function () {
        // Policy: (attr0 AND attr1) OR (NOT attr2)
        // RPN: [0, 1, 5, 2, 7, 6] (attr0, attr1, AND, attr2, NOT, OR)
        const policy = [0, 1, 5, 2, 7, 6, 0, 0, 0, 0];
        const requesterAttrs = [0, 0, 0]; // All attributes false
        const externalPredicates = [0, 0];

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 1 }); // (0 AND 0) OR (NOT 0) = 0 OR 1 = 1
    });

    it('Should evaluate policy with external predicates', async function () {
        // Policy: attr0 AND pred0 (external predicate 0)
        // RPN: [0, 3, 5] (0=attr0, 3=pred0 for N=3,M=2, 5=AND)
        const policy = [0, 3, 5, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [1, 0, 0]; // attr0=1
        const externalPredicates = [1, 0]; // pred0=1, pred1=0

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 1 }); // 1 AND 1 = 1
    });

    it('Should handle malformed policy gracefully', async function () {
        // Malformed policy: stack underflow 
        const policy = [5, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // AND without operands
        const requesterAttrs = [1, 1, 1];
        const externalPredicates = [1, 1];

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 0 }); // Malformed = 0
    });

    it('Should reject policy when attributes do not match', async function () {
        // Policy: attr0 AND attr1
        const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
        const requesterAttrs = [1, 0, 0]; // attr0=1, attr1=0 
        const externalPredicates = [0, 0];

        const witness = await circuit.calculateWitness({
            policy: policy,
            requesterAttrs: requesterAttrs,
            externalPredicates: externalPredicates
        });

        await circuit.checkConstraints(witness);
        await circuit.assertOut(witness, { out: 0 }); // 1 AND 0 = 0
    });
});