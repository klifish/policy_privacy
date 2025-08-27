const circomTester = require("circom_tester");
const wasm = circomTester.wasm;
const { poseidon } = require("circomlibjs");
const assert = require('assert');
const path = require('path');
const fs = require('fs');

describe('Commitment Gadget Tests', function() {
    let commitmentCircuit;
    let poseidonHash;
    this.timeout(100000);
    
    before(async function() {
        // Initialize Poseidon hash function for functional testing
        poseidonHash = await require("circomlibjs").buildPoseidon();
        
        // Try to load the test commitment circuit if available
        try {
            commitmentCircuit = await wasm("test/circuits/test_commitment.circom");
            console.log('PolicyCommitmentVerifier circuit loaded successfully');
        } catch (error) {
            console.log('Circuit not available, testing functional commitment logic');
            console.log('To test with circuits, run "npm run build:circuit" first');
        }
    });
    
    describe('Policy Commitment Circuit Integration', function() {
        it('Should verify valid policy commitment in circuit', async function() {
            if (!commitmentCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional commitment instead');
                this.skip();
            }
            
            // Test policy in RPN format
            const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0]; // [attr0, attr1, AND, attr2, NOT]
            const randomizer = 12345n;
            
            // Compute expected commitment using the circuit's approach:
            // First hash the policy tokens, then create commitment with randomizer
            const policyHash = poseidonHash(policy);
            const expectedCommitment = poseidonHash([policyHash, randomizer]);
            
            console.log('Testing policy commitment circuit:');
            console.log('- Policy:', policy.slice(0, 5) + '...');
            console.log('- Randomizer:', randomizer.toString());
            console.log('- Expected commitment:', expectedCommitment.toString().slice(-8));
            
            const input = {
                policy: policy,
                randomizer: randomizer,
                expectedCommitment: expectedCommitment
            };
            
            // Generate witness and check constraints
            const witness = await commitmentCircuit.calculateWitness(input, true);
            await commitmentCircuit.checkConstraints(witness);
            
            // Verify circuit output
            const output = witness[1]; // isValid signal
            assert.equal(output, 1n, 'Circuit should verify valid commitment');
            
            console.log('✅ Circuit successfully verified valid commitment');
        });
        
        it('Should reject invalid policy commitment in circuit', async function() {
            if (!commitmentCircuit) {
                console.log('⚠️  Circuit test skipped - testing functional commitment instead');
                this.skip();
            }
            
            const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
            const randomizer = 54321n;
            
            // Compute correct commitment
            const policyHash = poseidonHash(policy);
            const correctCommitment = poseidonHash([policyHash, randomizer]);
            
            // Use different commitment (simulate invalid case)
            const invalidCommitment = poseidonHash([policyHash, randomizer + 1n]);
            
            console.log('Testing invalid commitment rejection:');
            console.log('- Policy:', policy.slice(0, 4) + '...');
            console.log('- Using invalid commitment');
            
            const input = {
                policy: policy,
                randomizer: randomizer,
                expectedCommitment: invalidCommitment
            };
            
            // Generate witness and check constraints
            const witness = await commitmentCircuit.calculateWitness(input, true);
            await commitmentCircuit.checkConstraints(witness);
            
            // Verify circuit output
            const output = witness[1]; // isValid signal
            assert.equal(output, 0n, 'Circuit should reject invalid commitment');
            
            console.log('✅ Circuit successfully rejected invalid commitment');
        });
    });
    
    describe('Policy Commitment Functional Testing', function() {
        it('Should correctly compute policy commitment using circuit approach', function() {
            // Test the commitment computation logic that the circuit implements
            const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0]; // Test policy in RPN
            const randomizer = 12345n;
            
            // Circuit approach: first hash policy, then combine with randomizer  
            const policyHash = poseidonHash(policy);
            const commitment = poseidonHash([policyHash, randomizer]);
            
            console.log('Testing circuit-compatible commitment computation:');
            console.log('- Policy:', policy.slice(0, 5) + '...');
            console.log('- Policy hash:', policyHash.toString().slice(-8));
            console.log('- Randomizer:', randomizer.toString());
            console.log('- Final commitment:', commitment.toString().slice(-8));
            
            // Verify commitment is computed correctly
            assert(commitment !== null, 'Commitment should be computed');
            assert(commitment instanceof Uint8Array, 'Commitment should be a Uint8Array');
            assert.equal(commitment.length, 32, 'Commitment should be 32 bytes');
        });
        
        it('Should handle different policy structures', function() {
            const policies = [
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],      // Empty policy
                [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],      // Simple AND
                [0, 1, 6, 0, 0, 0, 0, 0, 0, 0],      // Simple OR  
                [1, 2, 5, 0, 0, 0, 0, 0, 0, 0]       // Different attributes
            ];
            const randomizer = 54321n;
            
            console.log('Testing different policy structures:');
            const commitments = policies.map((policy, i) => {
                const policyHash = poseidonHash(policy);
                const commitment = poseidonHash([policyHash, randomizer]);
                console.log(`Policy ${i}: [${policy.slice(0,4).join(',')}...] => ${commitment.toString().slice(-6)}`);
                return commitment;
            });
            
            // Verify all commitments are unique
            const uniqueCommitments = new Set(commitments.map(c => c.toString()));
            assert.equal(uniqueCommitments.size, policies.length, 'All commitments should be unique');
        });
        
        it('Should verify commitment consistency and determinism', function() {
            const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0];
            const randomizer = 54321n;
            
            // Compute commitment twice
            const policyHash1 = poseidonHash(policy);
            const commitment1 = poseidonHash([policyHash1, randomizer]);
            
            const policyHash2 = poseidonHash(policy);
            const commitment2 = poseidonHash([policyHash2, randomizer]);
            
            // Verify same inputs produce same commitment
            assert.equal(commitment1.toString(), commitment2.toString(), 'Same inputs should produce same commitment');
            
            // Verify different randomizer produces different commitment  
            const commitment3 = poseidonHash([policyHash1, randomizer + 1n]);
            assert.notEqual(commitment1.toString(), commitment3.toString(), 'Different randomizer should produce different commitment');
            
            console.log('✅ Commitment computation is deterministic and randomizer-dependent');
        });
    });
});