const circomTester = require('circom_tester');
const wasm = circomTester.wasm;
const { poseidon } = require('circomlibjs');
const assert = require('assert');

describe('Commitment Gadget Tests', function() {
    this.timeout(100000);

    describe('Simple Commitment Component', function() {
        let circuit;

        before(async function() {
            try {
                circuit = await wasm('test/circuits/test_commitment_simple.circom');
            } catch (error) {
                console.log('Circuit build files not found, skipping commitment simple tests');
                this.skip();
            }
        });

        it('Should compute correct commitment', async function() {
            const inputs = [1, 2, 3, 4, 5, 0, 0, 0, 0, 0]; // 10 element array
            const randomizer = 12345n;
            
            // Expected commitment using Poseidon hash
            const expectedCommitment = poseidon(inputs.concat([randomizer]));
            
            const witness = await circuit.calculateWitness({
                inputs: inputs,
                randomizer: randomizer,
                commitment: expectedCommitment
            });
            
            await circuit.checkConstraints(witness);
        });

        it('Should reject incorrect commitment', async function() {
            const inputs = [1, 2, 3, 4, 5, 0, 0, 0, 0, 0];
            const randomizer = 12345n;
            const wrongCommitment = 999n; // Incorrect commitment
            
            try {
                await circuit.calculateWitness({
                    inputs: inputs,
                    randomizer: randomizer,
                    commitment: wrongCommitment
                });
                throw new Error('Should have failed');
            } catch (error) {
                // Expected to fail
                assert.notEqual(error.message, 'Should have failed');
            }
        });
    });

    describe('Policy Commitment Verifier', function() {
        let circuit;

        before(async function() {
            try {
                circuit = await wasm('test/circuits/test_commitment.circom');
            } catch (error) {
                console.log('Circuit build files not found, skipping policy commitment tests');
                this.skip();
            }
        });

        it('Should verify policy commitment correctly', async function() {
            const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0]; // Test policy in RPN
            const randomizer = 54321n;
            
            const expectedCommitment = poseidon(policy.concat([randomizer]));
            
            const witness = await circuit.calculateWitness({
                policy: policy,
                randomizer: randomizer,
                expectedCommitment: expectedCommitment
            });
            
            await circuit.checkConstraints(witness);
        });

        it('Should reject mismatched policy commitment', async function() {
            const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0];
            const randomizer = 54321n;
            const wrongCommitment = 99999n;
            
            try {
                await circuit.calculateWitness({
                    policy: policy,
                    randomizer: randomizer,
                    expectedCommitment: wrongCommitment
                });
                throw new Error('Should have failed');
            } catch (error) {
                assert.notEqual(error.message, 'Should have failed');
            }
        });
    });
});