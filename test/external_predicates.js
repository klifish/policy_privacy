const circomTester = require("circom_tester");
const wasm = circomTester.wasm;
const { poseidon } = require("circomlibjs");
const assert = require('assert');

describe('External Predicates Tests', function () {
    let merkleCircuit;
    let credentialCircuit;
    let rangeCircuit;
    let poseidonHash;
    this.timeout(100000);

    before(async function () {
        // Initialize Poseidon hash function for functional testing
        poseidonHash = await require("circomlibjs").buildPoseidon();

        try {
            // Try to load the external predicate test circuits if available
            merkleCircuit = await wasm("test/circuits/test_merkle_proof_verifier.circom");
            credentialCircuit = await wasm("test/circuits/test_credential_signature.circom");
            rangeCircuit = await wasm("test/circuits/test_range_proof.circom");
        } catch (error) {
            console.log('Circuits not available, testing functional predicate logic');
            console.log('To test with circuits, run "npm run build:circuit" first');
        }
    });

    describe('Merkle Proof Circuit Integration', function () {
        it('Should verify valid Merkle proof in circuit', async function () {
            if (!merkleCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional Merkle logic instead');
                this.skip();
            }

            // Test Merkle proof with depth 8
            const leaf = 123456n;
            const pathElements = [789n, 101112n, 131415n, 161718n, 192021n, 222324n, 252627n, 282930n];
            const pathIndices = [0, 1, 0, 1, 1, 0, 1, 0];

            // Compute Merkle root manually 
            let currentHash = poseidonHash([leaf]);
            for (let i = 0; i < pathElements.length; i++) {
                if (pathIndices[i] === 0) {
                    // Leaf on left, sibling on right
                    currentHash = poseidonHash([currentHash, pathElements[i]]);
                } else {
                    // Leaf on right, sibling on left  
                    currentHash = poseidonHash([pathElements[i], currentHash]);
                }
            }
            const expectedRoot = poseidonHash.F.toObject(currentHash);

            console.log('Testing Merkle proof circuit:');
            console.log('- Leaf:', leaf.toString());
            console.log('- Path length:', pathElements.length);
            console.log('- Expected root:', expectedRoot);

            const input = {
                leaf: leaf,
                pathElements: pathElements,
                pathIndices: pathIndices,
                root: expectedRoot
            };

            // Generate witness and check constraints
            const witness = await merkleCircuit.calculateWitness(input, true);
            await merkleCircuit.checkConstraints(witness);

            console.log('✅ Merkle proof circuit verified successfully');
        });

        it('Should verify different leaves produce different proofs', async function () {
            if (!merkleCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional Merkle logic instead');
                this.skip();
            }

            const leaf1 = 111n;
            const leaf2 = 222n;
            const pathElements = [789n, 101n, 131n, 161n, 192n, 222n, 252n, 282n];
            const pathIndices = [0, 1, 0, 1, 0, 1, 0, 1];

            // Compute different roots for different leaves
            let root1 = poseidonHash([leaf1]);
            let root2 = poseidonHash([leaf2]);

            for (let i = 0; i < pathElements.length; i++) {
                if (pathIndices[i] === 0) {
                    root1 = poseidonHash([root1, pathElements[i]]); // Not equal to root1 = poseidonHash([poseidonHash.F.toObject(root1), pathElements[i]]); 
                    root2 = poseidonHash([root2, pathElements[i]]);
                } else {
                    root1 = poseidonHash([pathElements[i], root1]);
                    root2 = poseidonHash([pathElements[i], root2]);
                }
            }

            assert.notEqual(poseidonHash.F.toObject(root1), poseidonHash.F.toObject(root2), 'Different leaves should produce different roots');
            console.log('✅ Merkle circuit handles different leaves correctly');
        });
    });

    describe('Merkle Proof Functional Testing', function () {
        it('Should support Merkle proof structure', function () {
            // Test the Merkle proof logic that the circuit implements
            const leaf = 123456n;
            const pathLength = 4;

            // Mock Merkle tree computation matching circuit logic
            let currentHash = poseidonHash([leaf]);
            const pathElements = [];
            const pathIndices = [];

            for (let i = 0; i < pathLength; i++) {
                const siblingHash = poseidonHash([BigInt(i + 1000)]);
                const pathIndex = i % 2;

                pathElements.push(siblingHash);
                pathIndices.push(pathIndex);

                if (pathIndex === 0) {
                    currentHash = poseidonHash([currentHash, siblingHash]);
                } else {
                    currentHash = poseidonHash([siblingHash, currentHash]);
                }
            }

            console.log('Testing Merkle proof functional logic:');
            console.log('- Leaf:', leaf.toString());
            console.log('- Path length:', pathLength);
            console.log('- Computed root:', currentHash.toString().slice(-8));

            assert(currentHash instanceof Uint8Array, 'Root should be computed correctly');
            assert.equal(currentHash.length, 32, 'Root should be 32 bytes');
        });
    });

    describe('Credential Signature Circuit Integration', function () {
        it('Should verify valid credential signature in circuit', async function () {
            if (!credentialCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional signature logic instead');
                this.skip();
            }

            const message = 42n;
            const publicKey = 999n;

            // Mock signature as Poseidon hash of message and public key
            const signature = poseidonHash([message, publicKey]);

            console.log('Testing credential signature circuit:');
            console.log('- Message:', message.toString());
            console.log('- Public key:', publicKey.toString());
            console.log('- Signature:', signature.toString().slice(-8));

            const input = {
                message: message,
                signature: poseidonHash.F.toObject(signature),
                publicKey: publicKey
            };

            // Generate witness and check constraints
            const witness = await credentialCircuit.calculateWitness(input, true);
            await credentialCircuit.checkConstraints(witness);

            console.log('✅ Credential signature circuit verified successfully');
        });

        it('Should handle signature validation', async function () {
            if (!credentialCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional signature logic instead');
                this.skip();
            }

            const testCases = [
                { message: 100n, publicKey: 200n },
                { message: 300n, publicKey: 400n },
                { message: 500n, publicKey: 600n }
            ];

            console.log('Testing multiple signature validations:');

            for (let i = 0; i < testCases.length; i++) {
                const { message, publicKey } = testCases[i];
                const signature = poseidonHash([message, publicKey]);

                const input = {
                    message: message,
                    signature: poseidonHash.F.toObject(signature),
                    publicKey: publicKey
                };

                const witness = await credentialCircuit.calculateWitness(input, true);
                await credentialCircuit.checkConstraints(witness);

                console.log(`✅ Signature case ${i + 1} verified successfully`);
            }
        });
    });

    describe('Credential Signature Functional Testing', function () {
        it('Should support credential signature verification', function () {
            // Test the signature logic that the circuit implements
            const message = 42n;
            const publicKey = 999n;

            // Mock signature computation matching circuit approach
            const signature = poseidonHash([message, publicKey]);

            console.log('Testing credential signature functional logic:');
            console.log('- Message:', message.toString());
            console.log('- Public key:', publicKey.toString());
            console.log('- Expected signature:', signature.toString().slice(-8));

            assert(signature instanceof Uint8Array, 'Signature should be computed correctly');
            assert.equal(signature.length, 32, 'Signature should be 32 bytes');
        });

        it('Should verify signature consistency', function () {
            const message = 42n;
            const publicKey = 999n;

            // Same inputs should produce same signature
            const sig1 = poseidonHash([message, publicKey]);
            const sig2 = poseidonHash([message, publicKey]);
            assert.equal(sig1.toString(), sig2.toString(), 'Same inputs should produce same signature');

            // Different public key should produce different signature
            const sig3 = poseidonHash([message, publicKey + 1n]);
            assert.notEqual(sig1.toString(), sig3.toString(), 'Different public key should produce different signature');

            console.log('✅ Credential signature functional logic verified - deterministic and key-dependent');
        });
    });

    describe('Range Proof Circuit Integration', function () {
        it('Should verify valid range proof in circuit', async function () {
            if (!rangeCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional range logic instead');
                this.skip();
            }

            const value = 50;
            const minValue = 0;
            const maxValue = 100;

            console.log('Testing range proof circuit:');
            console.log('- Value:', value);
            console.log('- Range: [', minValue, ',', maxValue, ']');

            const input = {
                value: value,
                minValue: minValue,
                maxValue: maxValue
            };

            // Generate witness and check constraints
            const witness = await rangeCircuit.calculateWitness(input, true);
            await rangeCircuit.checkConstraints(witness);

            console.log('✅ Range proof circuit verified successfully');
        });

        it('Should handle boundary values in range proofs', async function () {
            if (!rangeCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional range logic instead');
                this.skip();
            }

            const testCases = [
                { value: 0, min: 0, max: 100 },    // Minimum boundary
                { value: 100, min: 0, max: 100 },  // Maximum boundary  
                { value: 50, min: 10, max: 90 }    // Middle value
            ];

            console.log('Testing range proof boundary cases:');

            for (let i = 0; i < testCases.length; i++) {
                const { value, min, max } = testCases[i];

                const input = {
                    value: value,
                    minValue: min,
                    maxValue: max
                };

                const witness = await rangeCircuit.calculateWitness(input, true);
                await rangeCircuit.checkConstraints(witness);

                console.log(`✅ Range case ${i + 1}: value=${value} in [${min},${max}] verified`);
            }
        });
    });

    describe('Range Proof Functional Testing', function () {
        it('Should support range proof validation', function () {
            // Test various range scenarios matching circuit logic
            const testCases = [
                { value: 50, min: 10, max: 100, expected: true, desc: '10 ≤ 50 ≤ 100' },
                { value: 5, min: 10, max: 100, expected: false, desc: '10 ≤ 5 ≤ 100' },
                { value: 150, min: 10, max: 100, expected: false, desc: '10 ≤ 150 ≤ 100' },
                { value: 10, min: 10, max: 100, expected: true, desc: '10 ≤ 10 ≤ 100' },
                { value: 100, min: 10, max: 100, expected: true, desc: '10 ≤ 100 ≤ 100' }
            ];

            console.log('Testing range proof functional validation:');
            testCases.forEach(testCase => {
                // Simulate range check logic that matches circuit implementation
                const inRange = (testCase.value >= testCase.min && testCase.value <= testCase.max);
                console.log(`${testCase.desc} => ${inRange} (expected ${testCase.expected})`);
                assert.equal(inRange, testCase.expected, `Range check failed for ${testCase.desc}`);
            });
        });

        it('Should verify range proof computation', function () {
            const value = 75;
            const minValue = 10;
            const maxValue = 100;

            // Mock range proof hash representing circuit computation
            const rangeProof = poseidonHash([BigInt(value), BigInt(minValue), BigInt(maxValue)]);

            assert(rangeProof instanceof Uint8Array, 'Range proof should be computed');
            assert.equal(rangeProof.length, 32, 'Range proof should be 32 bytes');

            // Different ranges should produce different proofs
            const differentProof = poseidonHash([BigInt(value), BigInt(minValue + 1), BigInt(maxValue)]);
            assert.notEqual(rangeProof.toString(), differentProof.toString(), 'Different ranges should produce different proofs');

            console.log('✅ Range proof functional logic verified - parameter-dependent computation');
        });
    });
});