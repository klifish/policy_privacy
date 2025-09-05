const { poseidon } = require("circomlibjs");
const { utils } = require("ffjavascript");
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const snarkjs = require("snarkjs");
const { setupZkSnarkKeys } = require('./gadgets/exec_snarkjs');

describe("Policy Privacy Main Circuit Test", function () {
    let poseidonHash;
    let zkeyPath;
    let vkeyPath;
    let wasmPath;
    let r1csPath;
    this.timeout(1000000);

    before(async function () {
        // Initialize Poseidon hash function for commitment computation
        poseidonHash = await require("circomlibjs").buildPoseidon();

        // Setup file paths for snarkjs
        wasmPath = path.join(__dirname, "../build/circuits/test_policy_privacy_main_js/test_policy_privacy_main.wasm");
        r1csPath = path.join(__dirname, "../build/circuits/test_policy_privacy_main.r1cs");
        zkeyPath = path.join(__dirname, "../build/circuits/test_policy_privacy_main_final.zkey");
        vkeyPath = path.join(__dirname, "../build/circuits/test_policy_privacy_main_vk.json");

        // Try to setup circuit files for snarkjs testing
        try {
            // First check if the compiled circuit files exist
            if (fs.existsSync(wasmPath) && fs.existsSync(r1csPath)) {
                console.log('Circuit files found, setting up zk-SNARK keys...');
                console.log('- WASM:', path.basename(wasmPath));
                console.log('- R1CS:', path.basename(r1csPath));

                // Setup zk-SNARK keys if circuit is available and files don't exist
                await setupZkSnarkKeys(wasmPath, r1csPath, zkeyPath, vkeyPath);

            } else {
                console.log('Circuit files not found in build directory');
                console.log('To test circuits, run "npm run build:circuit:compile:test:main" first');
            }

        } catch (error) {
            console.log('Circuit setup error:', error.message);
            console.log('To test circuits, run "npm run build:circuit:compile:test:main" first');
        }
    });

    // Helper function to test circuits using snarkjs command line interface 
    async function testWithSnarkjs(input, expectedOutput, testDescription) {
        if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
            throw new Error('Circuit files not found for snarkjs testing');
        }

        try {
            // Use snarkjs wtns calculate to compute witness
            const inputFilePath = path.join(__dirname, '../build/temp_policy_main_input.json');
            const witnessFilePath = path.join(__dirname, '../build/temp_policy_main_witness.wtns');

            // Write input to temporary file
            fs.writeFileSync(inputFilePath, JSON.stringify(input));

            // Calculate witness using snarkjs command line
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            console.log(`Computing witness for: ${testDescription}`);
            await execAsync(`npx snarkjs wtns calculate ${wasmPath} ${inputFilePath} ${witnessFilePath}`);

            // Export witness to JSON to read the output
            const witnessJsonPath = path.join(__dirname, '../build/temp_policy_main_witness.json');
            await execAsync(`npx snarkjs wtns export json ${witnessFilePath} ${witnessJsonPath}`);

            // Read the witness output
            const witnessJson = JSON.parse(fs.readFileSync(witnessJsonPath, 'utf8'));
            const output = BigInt(witnessJson[1]); // First output signal (isAuthorized)

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
                console.log(`Circuit constraint violation: ${error.message}`);
                if (expectedOutput === 0) {
                    // If we expect failure and got a constraint violation, that's correct behavior
                    console.log('✅ Circuit correctly rejected invalid input via constraint violation');
                    return;
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }

    it("Should prove policy satisfaction with commitment consistency", async function () {
        if (!fs.existsSync(wasmPath)) {
            console.log('⚠️  Test skipped - circuit WASM file not found');
            console.log('   Run "npm run build:circuit:compile:test:main" to build the circuit');
            this.skip();
        }

        // Test parameters matching circuit: N=3, M=2, DEPTH=10
        const N = 3;  // requester attributes  
        const M = 2;  // external predicates
        const DEPTH = 10;  // policy depth

        // Policy: attr0 AND attr1 (simpler test first)
        // RPN encoding: [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]  
        // Translation: attr0 attr1 AND
        // where: 0=attr0, 1=attr1, 5=AND(N+M+0)
        const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];

        // Commitment randomizer  
        const randomizer = 12345n;

        // Compute policy commitment: Com(P;r) = Poseidon([Poseidon(policy), randomizer])
        const policyHash = poseidonHash(policy);
        const policyCommitment = poseidonHash([policyHash, randomizer]);

        // Requester attributes: attr0=1, attr1=1, attr2=0
        // Expected: 1 AND 1 = 1 (authorized)
        const requesterAttrs = [1, 1, 0];

        // External predicate setup - both predicates set to pass (type 0 disabled)
        const predicateTypes = [0, 0]; // Both disabled for this test 

        // Mock external predicate inputs (unused when type=0)
        const merkleLeaves = [0, 0];
        const merklePathElements = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
        const merklePathIndices = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
        const merkleRoots = [0, 0];
        const credMessages = [0, 0];
        const credSignatures = [0, 0];
        const credPublicKeys = [0, 0];
        const rangeValues = [0, 0];
        const rangeMin = [0, 0];
        const rangeMax = [100, 100];

        // Number of operations in policy: 3 tokens used
        const numOperations = 3;

        console.log('Testing PolicyPrivacyMain circuit:');
        console.log('- Policy (RPN):', policy.slice(0, 5));
        console.log('- Requester attrs:', requesterAttrs);
        console.log('- Expected result: AUTHORIZED (attr0=1 AND attr1=1)');

        // Prepare circuit inputs with correct data types
        const input = {
            // Private inputs
            policy: policy,
            requesterAttrs: requesterAttrs,
            predicateTypes: predicateTypes,
            merkleLeaves: merkleLeaves.map(x => x.toString()),
            merklePathElements: merklePathElements.map(row => row.map(x => x.toString())),
            merklePathIndices: merklePathIndices,
            credMessages: credMessages.map(x => x.toString()),
            credSignatures: credSignatures.map(x => x.toString()),
            rangeValues: rangeValues,
            randomizer: randomizer.toString(),

            // Public inputs  
            policyCommitment: poseidonHash.F.toObject(policyCommitment).toString(),
            merkleRoots: merkleRoots.map(x => x.toString()),
            credPublicKeys: credPublicKeys.map(x => x.toString()),
            rangeMin: rangeMin,
            rangeMax: rangeMax,
            numOperations: numOperations
        };

        console.log('- Policy commitment:', input.policyCommitment.slice(-8) + '...');

        if (fs.existsSync(zkeyPath) && fs.existsSync(vkeyPath)) {
            // Full zk-SNARK proof generation and verification
            console.log('Generating zk-SNARK proof...');
            const startTime = Date.now();

            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                input,
                wasmPath,
                zkeyPath
            );

            const proofTime = Date.now() - startTime;
            console.log(`✅ Proof generated in ${proofTime}ms`);

            // Verify the proof
            const vKey = JSON.parse(fs.readFileSync(vkeyPath));
            const verifyStart = Date.now();
            const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
            const verifyTime = Date.now() - verifyStart;

            console.log(`✅ Proof verified in ${verifyTime}ms`);
            assert(verified, 'zk-SNARK proof should be valid for valid policy and commitment');

            // Check circuit output (isAuthorized)
            assert.equal(publicSignals[0], '1', 'Circuit should output isAuthorized = 1 for valid case');
            console.log('✅ Circuit correctly authorized the request');

        } else {
            // Use snarkjs command line for witness calculation
            await testWithSnarkjs(input, 1, 'Valid policy with commitment consistency');
            console.log('✅ Circuit correctly processed valid authorization');
        }
    });

    it("Should reject invalid policy commitment", async function () {
        if (!fs.existsSync(wasmPath)) {
            console.log('⚠️  Test skipped - circuit WASM file not found');
            this.skip();
        }

        // Same policy and inputs as valid test
        const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
        const randomizer = 12345n;
        const requesterAttrs = [1, 1, 0];
        const numOperations = 3; // Same as first test

        // Compute correct commitment
        const policyHash = poseidonHash(policy);
        const correctCommitment = poseidonHash([policyHash, randomizer]);

        // Use WRONG commitment to test rejection
        const wrongRandomizer = 99999n;
        const wrongCommitment = poseidonHash([policyHash, wrongRandomizer]);

        console.log('Testing invalid commitment rejection:');
        console.log('- Policy (RPN):', policy.slice(0, 5));
        console.log('- Using incorrect commitment (wrong randomizer)');
        console.log('- Expected result: REJECTED due to commitment verification failure');

        // Setup same inputs as before but with wrong commitment
        const input = {
            // Private inputs (same as valid test)
            policy: policy,
            requesterAttrs: requesterAttrs,
            predicateTypes: [0, 0],
            merkleLeaves: ['0', '0'],
            merklePathElements: [['0', '0', '0', '0', '0', '0', '0', '0'], ['0', '0', '0', '0', '0', '0', '0', '0']],
            merklePathIndices: [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
            credMessages: ['0', '0'],
            credSignatures: ['0', '0'],
            rangeValues: [0, 0],
            randomizer: randomizer.toString(), // Correct randomizer in witness

            // Public inputs - with WRONG commitment
            policyCommitment: poseidonHash.F.toObject(wrongCommitment).toString(),
            merkleRoots: ['0', '0'],
            credPublicKeys: ['0', '0'],
            rangeMin: [0, 0],
            rangeMax: [100, 100],
            numOperations: numOperations
        };

        console.log('- Wrong commitment:', input.policyCommitment.slice(-8) + '...');

        if (fs.existsSync(zkeyPath) && fs.existsSync(vkeyPath)) {
            // Full zk-SNARK should either fail or produce invalid output
            console.log('Attempting zk-SNARK proof with invalid commitment...');

            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                input,
                wasmPath,
                zkeyPath
            );

            // Verify the proof - it should be valid from a cryptographic standpoint
            const vKey = JSON.parse(fs.readFileSync(vkeyPath));
            const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);

            assert(verified, 'Proof should be cryptographically valid even with invalid commitment');

            // However, circuit output should indicate rejection (isAuthorized = 0)
            assert.equal(publicSignals[0], '0', 'Circuit should output isAuthorized = 0 for invalid commitment');
            console.log('✅ Circuit correctly rejected invalid commitment (proof valid, output = 0)');

        } else {
            // Use snarkjs command line
            await testWithSnarkjs(input, 0, 'Invalid commitment rejection');
            console.log('✅ Circuit correctly rejected invalid commitment');
        }
    });

    it("Should handle policy evaluation correctly with external predicates", async function () {
        if (!fs.existsSync(wasmPath)) {
            console.log('⚠️  Test skipped - circuit WASM file not found');
            this.skip();
        }

        // Test with a policy that should fail: attr0 AND attr1 AND attr2  
        // where attr2=0, so the result should be 0
        const policy = [0, 1, 5, 2, 5, 0, 0, 0, 0, 0]; // [attr0, attr1, AND, attr2, AND]
        const randomizer = 54321n;

        // Correct commitment
        const policyHash = poseidonHash(policy);
        const policyCommitment = poseidonHash([policyHash, randomizer]);

        // Requester attributes where attr2=0 makes the policy fail
        const requesterAttrs = [1, 1, 0]; // attr0=1, attr1=1, attr2=0
        // Expected: 1 AND 1 AND 0 = 0 (not authorized)

        console.log('Testing policy evaluation with failing case:');
        console.log('- Policy: attr0 AND attr1 AND attr2');
        console.log('- Attrs:', requesterAttrs, '(attr2=0 should cause failure)');
        console.log('- Expected result: NOT AUTHORIZED');

        const input = {
            policy: policy,
            requesterAttrs: requesterAttrs,
            predicateTypes: [0, 0], // Both disabled
            merkleLeaves: ['0', '0'],
            merklePathElements: [['0', '0', '0', '0', '0', '0', '0', '0'], ['0', '0', '0', '0', '0', '0', '0', '0']],
            merklePathIndices: [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
            credMessages: ['0', '0'],
            credSignatures: ['0', '0'],
            rangeValues: [0, 0],
            randomizer: randomizer.toString(),
            policyCommitment: poseidonHash.F.toObject(policyCommitment).toString(),
            merkleRoots: ['0', '0'],
            credPublicKeys: ['0', '0'],
            rangeMin: [0, 0],
            rangeMax: [100, 100],
            numOperations: 5
        };

        if (fs.existsSync(zkeyPath) && fs.existsSync(vkeyPath)) {
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                input,
                wasmPath,
                zkeyPath
            );

            const vKey = JSON.parse(fs.readFileSync(vkeyPath));
            const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
            assert(verified, 'Proof should be valid');

            // Circuit should output 0 due to failed policy evaluation
            assert.equal(publicSignals[0], '0', 'Circuit should output 0 for failing policy');
            console.log('✅ Circuit correctly rejected due to policy evaluation failure');

        } else {
            await testWithSnarkjs(input, 0, 'Policy evaluation failure (attr2=0)');
            console.log('✅ Circuit correctly evaluated failing policy (output = 0)');
        }
    });
});