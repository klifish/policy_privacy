const circomTester = require('circom_tester');
const wasm = circomTester.wasm;
const { poseidon } = require('circomlibjs');
const assert = require('assert');

describe('External Predicates Tests', function() {
    this.timeout(100000);

    describe('Merkle Proof Verifier', function() {
        let circuit;

        before(async function() {
            try {
                circuit = await wasm('test/circuits/test_merkle.circom');
            } catch (error) {
                console.log('Circuit build files not found, skipping Merkle tests');
                this.skip();
            }
        });

        it('Should verify valid Merkle proof', async function() {
            // Create a simple Merkle tree for testing
            const leaf = 123456n;
            const pathElements = [789n, 101112n, 131415n, 161718n, 192021n, 222324n, 252627n, 282930n];
            const pathIndices = [0, 1, 0, 1, 0, 1, 0, 1];
            
            // Calculate expected root (simplified for testing)
            let currentHash = leaf;
            for (let i = 0; i < pathElements.length; i++) {
                if (pathIndices[i] === 0) {
                    currentHash = poseidon([currentHash, pathElements[i]]);
                } else {
                    currentHash = poseidon([pathElements[i], currentHash]);
                }
            }
            const root = currentHash;

            const witness = await circuit.calculateWitness({
                leaf: leaf,
                pathElements: pathElements,
                pathIndices: pathIndices,
                root: root
            });
            
            await circuit.checkConstraints(witness);
        });

        it('Should reject invalid Merkle proof', async function() {
            const leaf = 123456n;
            const pathElements = [789n, 101112n, 131415n, 161718n, 192021n, 222324n, 252627n, 282930n];
            const pathIndices = [0, 1, 0, 1, 0, 1, 0, 1];
            const wrongRoot = 99999n; // Incorrect root
            
            try {
                await circuit.calculateWitness({
                    leaf: leaf,
                    pathElements: pathElements,
                    pathIndices: pathIndices,
                    root: wrongRoot
                });
                throw new Error('Should have failed'););
            } catch (error) {
                assert.notEqual(error.message,('Should have failed'););
            }
        });
    });

    describe('Credential Signature Verifier', function() {
        let circuit;

        before(async function() {
            try {
                circuit = await wasm('test/circuits/test_credential_signature.circom');
            } catch (error) {
                console.log('Circuit build files not found, skipping credential signature tests');
                this.skip();
            }
        });

        it('Should verify valid credential signature', async function() {
            const message = 42n;
            const publicKey = 999n;
            // For this simplified test, signature = Poseidon(message, publicKey)
            const signature = poseidon([message, publicKey]);

            const witness = await circuit.calculateWitness({
                message: message,
                signature: signature,
                publicKey: publicKey
            });
            
            await circuit.checkConstraints(witness);
        });

        it('Should reject invalid credential signature', async function() {
            const message = 42n;
            const publicKey = 999n;
            const wrongSignature = 88888n; // Incorrect signature
            
            try {
                await circuit.calculateWitness({
                    message: message,
                    signature: wrongSignature,
                    publicKey: publicKey
                });
                throw new Error('Should have failed'););
            } catch (error) {
                assert.notEqual(error.message,('Should have failed'););
            }
        });
    });

    describe('Range Proof Verifier', function() {
        let circuit;

        before(async function() {
            try {
                circuit = await wasm('test/circuits/test_range_proof.circom');
            } catch (error) {
                console.log('Circuit build files not found, skipping range proof tests');
                this.skip();
            }
        });

        it('Should verify value within range', async function() {
            const value = 50;
            const minValue = 10;
            const maxValue = 100;

            const witness = await circuit.calculateWitness({
                value: value,
                minValue: minValue,
                maxValue: maxValue
            });
            
            await circuit.checkConstraints(witness);
        });

        it('Should reject value below minimum', async function() {
            const value = 5; // Below minimum
            const minValue = 10;
            const maxValue = 100;
            
            try {
                await circuit.calculateWitness({
                    value: value,
                    minValue: minValue,
                    maxValue: maxValue
                });
                throw new Error('Should have failed'););
            } catch (error) {
                assert.notEqual(error.message,('Should have failed'););
            }
        });

        it('Should reject value above maximum', async function() {
            const value = 150; // Above maximum
            const minValue = 10;
            const maxValue = 100;
            
            try {
                await circuit.calculateWitness({
                    value: value,
                    minValue: minValue,
                    maxValue: maxValue
                });
                throw new Error('Should have failed'););
            } catch (error) {
                assert.notEqual(error.message,('Should have failed'););
            }
        });
    });
});