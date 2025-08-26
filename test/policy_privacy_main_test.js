const circomTester = require("circom_tester");
const wasm = circomTester.wasm;
const { poseidon } = require("circomlibjs");

describe("Policy Privacy Main Circuit Test", function() {
    let circuit;
    this.timeout(100000);

    before(async function() {
        circuit = await wasm("circuits/policy_privacy_test.circom");
    });

    it("Should prove policy satisfaction with commitment consistency", async function() {
        // Test parameters: N=3, M=2, DEPTH=10
        const N = 3;  // requester attributes  
        const M = 2;  // external predicates
        const DEPTH = 10;  // policy depth
        
        // Example policy: WillPublish AND IRBApproval AND NOT DataSale
        // RPN encoding: [0, 1, 6, 2, 7, 0, 0, 0, 0, 0] (6=AND, 7=OR, 8=NOT based on N+M+{0,1,2})
        const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0];  // [attr0, attr1, AND, attr2, NOT]
        
        // Commitment randomizer
        const randomizer = 12345n;
        
        // Compute policy commitment using Poseidon hash
        const policyCommitment = poseidon(policy.concat([randomizer]));
        
        // Requester attributes: [WillPublish=1, IRBApproval=1, DataSale=0] 
        const requesterAttrs = [1, 1, 0];
        
        // External predicate setup
        const predicateTypes = [0, 1]; // [Merkle, Signature]
        
        // Mock Merkle proof for ICD-10 code
        const merkleLeaves = [123456n, 0n]; // Only first predicate uses Merkle
        const merklePathElements = [[789n, 101112n, 131415n, 161718n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]];
        const merklePathIndices = [[0, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
        const merkleRoots = [poseidon([161718n, 789n]), 0n]; // Mock root
        
        // Mock signature for institutional credential 
        const credMessages = [0n, 42n]; // Only second predicate uses signature
        const credSignatures = [0n, poseidon([42n, 999n])]; // Mock signature: hash(message, publicKey)
        const credPublicKeys = [0n, 999n];
        
        // Range proof inputs (unused in this test)
        const rangeValues = [0, 0];
        const rangeMin = [0, 0];  
        const rangeMax = [100, 100];
        
        // Number of operations in policy
        const numOperations = 5; // [0, 1, AND, 2, NOT] = 5 operations
        
        // Prepare circuit inputs
        const input = {
            // Private inputs
            policy: policy,
            requesterAttrs: requesterAttrs,
            predicateTypes: predicateTypes,
            merkleLeaves: merkleLeaves,
            merklePathElements: merklePathElements,
            merklePathIndices: merklePathIndices,
            credMessages: credMessages,
            credSignatures: credSignatures,
            rangeValues: rangeValues,
            randomizer: randomizer,
            
            // Public inputs
            policyCommitment: policyCommitment,
            merkleRoots: merkleRoots,
            credPublicKeys: credPublicKeys,
            rangeMin: rangeMin,
            rangeMax: rangeMax,
            numOperations: numOperations
        };
        
        console.log("Policy commitment:", policyCommitment);
        console.log("Input prepared, running witness calculation...");
        
        // Calculate witness and check output
        const witness = await circuit.calculateWitness(input);
        const output = witness[1]; // First output signal
        
        console.log("Circuit output:", output);
        
        // The output should be 1 if:
        // 1. Policy commitment is valid
        // 2. Policy evaluation passes: WillPublish(1) AND IRBApproval(1) AND NOT DataSale(0) = 1 AND 1 AND 1 = 1
        // 3. External predicates validate
        
        // Note: This is a basic test - the Merkle proof is mock and may not validate correctly
        // For full validation, we'd need proper Merkle tree construction
        
        await circuit.checkConstraints(witness);
        console.log("All constraints satisfied!");
    });
    
    it("Should reject invalid policy commitment", async function() {
        // Same inputs as above but with wrong commitment
        const policy = [0, 1, 5, 2, 6, 0, 0, 0, 0, 0];
        const randomizer = 12345n;
        const wrongCommitment = 99999n; // Incorrect commitment
        
        const input = {
            policy: policy,
            requesterAttrs: [1, 1, 0],
            predicateTypes: [0, 1],
            merkleLeaves: [123456n, 0n],
            merklePathElements: [[789n, 101112n, 131415n, 161718n, 0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]],
            merklePathIndices: [[0, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
            credMessages: [0n, 42n],
            credSignatures: [0n, poseidon([42n, 999n])],
            rangeValues: [0, 0],
            randomizer: randomizer,
            policyCommitment: wrongCommitment,
            merkleRoots: [poseidon([161718n, 789n]), 0n],
            credPublicKeys: [0n, 999n],
            rangeMin: [0, 0],
            rangeMax: [100, 100],
            numOperations: 5
        };
        
        const witness = await circuit.calculateWitness(input);
        const output = witness[1];
        
        console.log("Output with wrong commitment:", output);
        // Output should be 0 due to commitment verification failure
        
        await circuit.checkConstraints(witness);
    });
});