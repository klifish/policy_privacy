const path = require('path');
const fs = require('fs');
const circomlibjs = require('circomlibjs');
const assert = require('assert');

describe('Commitment Gadget Tests', function() {
    this.timeout(100000);
    
    let poseidon;
    
    before(async function() {
        // Initialize Poseidon hash function
        poseidon = await circomlibjs.buildPoseidon();
        console.log('Poseidon initialized for commitment gadget tests');
    });
    
    describe('Policy Commitment Functionality', function() {
        it('Should correctly compute Poseidon commitments', function() {
            // Test basic commitment computation using the same logic as the comprehensive test
            const policy = [0, 1, 5, 2, 7, 0, 0, 0, 0, 0]; // Test policy in RPN
            const randomizer = 12345n;
            
            // Compute commitment using Poseidon: h = Poseidon(P || r)
            const commitment = poseidon(policy.concat([randomizer]));
            
            console.log('Policy:', policy.slice(0, 5) + '...');
            console.log('Randomizer:', randomizer);
            console.log('Commitment:', commitment);
            
            // Verify commitment is computed correctly
            assert(commitment !== null, 'Commitment should be computed');
            assert(commitment instanceof Uint8Array, 'Commitment should be a Uint8Array');
            assert.equal(commitment.length, 32, 'Commitment should be 32 bytes');
        });
        
        it('Should handle different policy structures', function() {
            const policies = [
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],  
                [0, 1, 6, 0, 0, 0, 0, 0, 0, 0],
                [0, 7, 0, 0, 0, 0, 0, 0, 0, 0]
            ];
            const randomizer = 54321n;
            
            console.log('Testing different policy structures:');
            const commitments = policies.map((policy, i) => {
                const commitment = poseidon(policy.concat([randomizer]));
                console.log(`Policy ${i}: ${policy.slice(0,4).join(',')}... => ${commitment.toString().slice(-6)}`);
                return commitment;
            });
            
            // Verify all commitments are unique
            const uniqueCommitments = new Set(commitments.map(c => c.toString()));
            assert.equal(uniqueCommitments.size, policies.length, 'All commitments should be unique');
        });
        
        it('Should verify commitment consistency', function() {
            const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0];
            const randomizer = 54321n;
            
            // Compute commitment
            const commitment1 = poseidon(policy.concat([randomizer]));
            
            // Verify same inputs produce same commitment
            const commitment2 = poseidon(policy.concat([randomizer]));
            assert.equal(commitment1.toString(), commitment2.toString(), 'Same inputs should produce same commitment');
            
            // Verify different randomizer produces different commitment  
            const commitment3 = poseidon(policy.concat([randomizer + 1n]));
            assert.notEqual(commitment1.toString(), commitment3.toString(), 'Different randomizer should produce different commitment');
        });
    });
});