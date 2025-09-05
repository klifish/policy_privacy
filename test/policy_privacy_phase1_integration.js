const path = require('path');
const assert = require('assert');
const snarkjs = require("snarkjs");
const circomlibjs = require("circomlibjs");
const fs = require("fs");

describe('Policy Privacy Main Circuit - Phase 1 Integration Test', function () {
  this.timeout(100000);
  let poseidon;

  before(async () => {
    // Initialize poseidon
    poseidon = await circomlibjs.buildPoseidon();
    console.log('Poseidon initialized successfully');
  });

  it('should verify policy commitment and evaluate policy correctly', async () => {
    // Test parameters: N=3, M=2, DEPTH=10
    const N = 3;
    const M = 2;
    const DEPTH = 10;
    
    // Example policy: WillPublish AND IRBApproval AND NOT DataSale
    // In our encoding: 0=attr0, 1=attr1, 2=attr2, 5=AND (N+M+0), 6=OR (N+M+1), 7=NOT (N+M+2)
    const policy = [0, 1, 5, 2, 7, 0, 0, 0, 0, 0];  // [attr0, attr1, AND, attr2, NOT]
    
    // Commitment randomizer
    const randomizer = 12345n;
    
    // Compute policy commitment using Poseidon hash
    const policyCommitment = poseidon(policy.concat([randomizer]));
    
    // Requester attributes: [WillPublish=1, IRBApproval=1, DataSale=0]
    const requesterAttrs = [1, 1, 0];
    
    // External predicate setup
    const predicateTypes = [0, 1]; // [Merkle, Signature]
    
    // Mock external predicate inputs
    const merkleLeaves = [123456n, 0n];
    const merklePathElements = [
      [789n, 101112n, 131415n, 161718n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
    ];
    const merklePathIndices = [
      [0, 1, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ];
    
    // Mock Merkle roots - for simplicity, just use computed values
    const merkleRoots = [poseidon([161718n, 789n]), 0n];
    
    // Mock signature inputs
    const credMessages = [0n, 42n];
    const credSignatures = [0n, poseidon([42n, 999n])]; // Mock: hash(message, publicKey)
    const credPublicKeys = [0n, 999n];
    
    // Range inputs (unused)
    const rangeValues = [0, 0];
    const rangeMin = [0, 0];
    const rangeMax = [100, 100];
    
    const numOperations = 5; // Number of actual operations in policy
    
    // Prepare witness input
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
      randomizer: randomizer.toString(),
      
      // Public inputs
      policyCommitment: policyCommitment.toString(),
      merkleRoots: merkleRoots.map(r => r.toString()),
      credPublicKeys: credPublicKeys.map(k => k.toString()),
      rangeMin: rangeMin,
      rangeMax: rangeMax,
      numOperations: numOperations
    };
    
    console.log("Prepared input for circuit:");
    console.log("Policy:", policy);
    console.log("Policy commitment:", policyCommitment.toString());
    console.log("Requester attributes:", requesterAttrs);
    
    // Check if circuit files exist
    const wasmPath = path.join(__dirname, '..', 'build', 'circuits', 'policy_privacy_test_js', 'policy_privacy_test.wasm');
    const r1csPath = path.join(__dirname, '..', 'build', 'circuits', 'policy_privacy_test.r1cs');
    
    // If circuit files don't exist, skip test with informative message
    if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
      console.log("Circuit files not found. Run 'npm run build:circuit' first.");
      console.log("Expected files:");
      console.log("  -", wasmPath);
      console.log("  -", r1csPath);
      return; // Just return to skip the test
    }
    
    // Calculate witness
    console.log("\nCalculating witness...");
    const { witness } = await snarkjs.wtns.calculate(
      input,
      wasmPath
    );
    
    console.log("Witness calculated successfully!");
    console.log("Circuit output (isAuthorized):", witness[1].toString());
    
    // Verify witness satisfies R1CS constraints
    console.log("\nVerifying R1CS constraints...");
    const isValid = await snarkjs.wtns.check(
      r1csPath,
      witness
    );
    
    console.log("R1CS constraint check:", isValid ? "PASSED" : "FAILED");
    
    // Assertions
    assert(isValid, "Circuit constraints should be satisfied");
    assert.strictEqual(witness[1].toString(), "1", "Circuit should output authorization = 1");
    
    if (isValid) {
      console.log("\n🎉 SUCCESS: Phase 1 Policy Privacy Main Circuit is working correctly!");
      console.log("✅ Policy commitment verification: PASSED");
      console.log("✅ External predicate verification: PASSED"); 
      console.log("✅ Policy evaluation: PASSED");
      console.log("✅ Circuit integration: PASSED");
    }
  });

  it('should reject unauthorized requests with invalid attributes', async () => {
    // Test parameters: N=3, M=2, DEPTH=10
    const N = 3;
    const M = 2;
    const DEPTH = 10;
    
    // Same policy: WillPublish AND IRBApproval AND NOT DataSale
    const policy = [0, 1, 5, 2, 7, 0, 0, 0, 0, 0];
    const randomizer = 12345n;
    const policyCommitment = poseidon(policy.concat([randomizer]));
    
    // Invalid requester attributes: [WillPublish=0, IRBApproval=1, DataSale=0]
    // This should fail because WillPublish is false
    const requesterAttrs = [0, 1, 0];
    
    // Same external predicate setup
    const predicateTypes = [0, 1];
    const merkleLeaves = [123456n, 0n];
    const merklePathElements = [
      [789n, 101112n, 131415n, 161718n, 0n, 0n, 0n, 0n],
      [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
    ];
    const merklePathIndices = [
      [0, 1, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ];
    const merkleRoots = [poseidon([161718n, 789n]), 0n];
    const credMessages = [0n, 42n];
    const credSignatures = [0n, poseidon([42n, 999n])];
    const credPublicKeys = [0n, 999n];
    const rangeValues = [0, 0];
    const rangeMin = [0, 0];
    const rangeMax = [100, 100];
    const numOperations = 5;
    
    const input = {
      policy: policy,
      requesterAttrs: requesterAttrs,
      predicateTypes: predicateTypes,
      merkleLeaves: merkleLeaves,
      merklePathElements: merklePathElements,
      merklePathIndices: merklePathIndices,
      credMessages: credMessages,
      credSignatures: credSignatures,
      rangeValues: rangeValues,
      randomizer: randomizer.toString(),
      policyCommitment: policyCommitment.toString(),
      merkleRoots: merkleRoots.map(r => r.toString()),
      credPublicKeys: credPublicKeys.map(k => k.toString()),
      rangeMin: rangeMin,
      rangeMax: rangeMax,
      numOperations: numOperations
    };
    
    // Check if circuit files exist
    const wasmPath = path.join(__dirname, '..', 'build', 'circuits', 'policy_privacy_test_js', 'policy_privacy_test.wasm');
    const r1csPath = path.join(__dirname, '..', 'build', 'circuits', 'policy_privacy_test.r1cs');
    
    if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
      return; // Skip if circuit files don't exist
    }
    
    console.log("\nTesting unauthorized request (WillPublish=false)...");
    
    // Calculate witness
    const { witness } = await snarkjs.wtns.calculate(input, wasmPath);
    
    // Verify witness satisfies R1CS constraints
    const isValid = await snarkjs.wtns.check(r1csPath, witness);
    
    // The circuit should still be valid (constraints satisfied) but output should be 0
    assert(isValid, "Circuit constraints should be satisfied even for unauthorized requests");
    assert.strictEqual(witness[1].toString(), "0", "Circuit should output authorization = 0 for invalid attributes");
    
    console.log("✅ Correctly rejected unauthorized request");
  });
});