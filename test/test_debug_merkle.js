const fs = require('fs');
const path = require('path');
const circomlib = require('circomlibjs');

// Simple test with minimal Merkle tree to debug verification
async function testSimpleMerkleProof() {
    console.log('Testing simple Merkle proof verification...');
    
    // Load Poseidon
    const poseidonHash = await circomlib.buildPoseidon();
    
    function poseidon(inputs) {
        const result = poseidonHash(inputs);
        if (result instanceof Uint8Array) {
            let bigintResult = 0n;
            for (let i = 0; i < result.length; i++) {
                bigintResult = bigintResult * 256n + BigInt(result[i]);
            }
            return bigintResult;
        }
        return BigInt(result);
    }
    
    // Create simplest possible Merkle proof
    console.log('\n=== Creating Simple 1-Level Merkle Trees ===');
    
    // Binding tree: just one level
    const duoId = BigInt(100);
    const icdRootValue = BigInt(200);
    const bindingVersion = BigInt(1);
    const bindingSalt = BigInt(300);
    
    const bindingLeaf = poseidon([duoId, icdRootValue, bindingVersion, bindingSalt]);
    const siblingLeaf = BigInt(999); // Simple sibling
    const bindingRoot = poseidon([bindingLeaf, siblingLeaf]);
    
    console.log('Binding leaf:', bindingLeaf.toString());
    console.log('Binding root:', bindingRoot.toString());
    
    // ICD tree: just one level  
    const icdCode = BigInt(400);
    const icdSibling = BigInt(500);
    const computedIcdRoot = poseidon([icdCode, icdSibling]);
    
    console.log('ICD code:', icdCode.toString());
    console.log('Computed ICD root:', computedIcdRoot.toString());
    
    // Use the computed ICD root in the binding
    const correctedBindingLeaf = poseidon([duoId, computedIcdRoot, bindingVersion, bindingSalt]);
    const correctedBindingRoot = poseidon([correctedBindingLeaf, siblingLeaf]);
    
    console.log('Corrected binding leaf:', correctedBindingLeaf.toString());
    console.log('Corrected binding root:', correctedBindingRoot.toString());
    
    // Test input with minimal proofs (1 level only)
    const testInput = {
        postfixExpr: [0, 8, 0, 0, 0, 0, 0, 0, 0, 0], // A0, EXT
        numOperations: 2,
        requesterPolicy: [1, 0, 0], // A0 = true
        predicateValues: [0, 0],
        
        // Binding verification (1 level)
        bindingRoot: correctedBindingRoot.toString(),
        duoId: duoId.toString(),
        icdRoot: computedIcdRoot.toString(),
        bindingVersion: bindingVersion.toString(),
        bindingSalt: bindingSalt.toString(),
        bindingPathElements: [
            siblingLeaf.toString(),  // Sibling at level 0
            '0', '0', '0', '0', '0', '0', '0'  // Padding for unused levels
        ],
        bindingPathIndices: [0, 0, 0, 0, 0, 0, 0, 0], // Left path
        
        // ICD membership (1 level)
        icdCode: icdCode.toString(),
        icdPathElements: [
            icdSibling.toString(),   // Sibling at level 0
            '0', '0', '0', '0', '0', '0', '0'  // Padding
        ],
        icdPathIndices: [0, 0, 0, 0, 0, 0, 0, 0] // Left path
    };
    
    console.log('\n=== Testing Simple Merkle Proof ===');
    
    // Load circuit
    const wasmPath = path.join(__dirname, 'build', 'circuits', 'test_postfix_policy_interpreter_extended_js', 'test_postfix_policy_interpreter_extended.wasm');
    
    if (!fs.existsSync(wasmPath)) {
        console.error('WASM file not found');
        return;
    }
    
    const WitnessCalculatorBuilder = require('circom_runtime').WitnessCalculatorBuilder;
    const wasm = fs.readFileSync(wasmPath);
    const wc = await WitnessCalculatorBuilder(wasm);
    
    const witness = await wc.calculateWitness(testInput, true);
    const result = witness[1];
    
    console.log('✓ Circuit executed');
    console.log('  Result:', result.toString());
    console.log('  Expected: 1 (should verify simple proofs)');
    
    if (result.toString() === '1') {
        console.log('🎉 SUCCESS: Simple Merkle proof verification working!');
    } else {
        console.log('❌ FAILED: Simple Merkle proof verification not working');
        
        // Let's try to verify the proofs manually
        console.log('\n=== Manual Verification ===');
        
        // Verify binding proof manually
        const manualBindingLeaf = poseidon([duoId, computedIcdRoot, bindingVersion, bindingSalt]);
        const manualBindingRoot = poseidon([manualBindingLeaf, siblingLeaf]);
        console.log('Manual binding verification:');
        console.log('  Computed leaf:', manualBindingLeaf.toString());
        console.log('  Expected leaf:', correctedBindingLeaf.toString());
        console.log('  Match:', manualBindingLeaf.toString() === correctedBindingLeaf.toString());
        console.log('  Computed root:', manualBindingRoot.toString());
        console.log('  Expected root:', correctedBindingRoot.toString());
        console.log('  Match:', manualBindingRoot.toString() === correctedBindingRoot.toString());
        
        // Verify ICD proof manually
        const manualIcdRoot = poseidon([icdCode, icdSibling]);
        console.log('Manual ICD verification:');
        console.log('  Computed root:', manualIcdRoot.toString());
        console.log('  Expected root:', computedIcdRoot.toString());
        console.log('  Match:', manualIcdRoot.toString() === computedIcdRoot.toString());
    }
    
    // Test with invalid proof to make sure verification actually works
    console.log('\n=== Testing Invalid Proof (should fail) ===');
    const invalidInput = { ...testInput, icdCode: '99999' }; // Wrong ICD code
    const witness2 = await wc.calculateWitness(invalidInput, true);
    const result2 = witness2[1];
    
    console.log('✓ Invalid proof test executed');
    console.log('  Result:', result2.toString());
    console.log('  Expected: 0 (should reject invalid proof)');
}

if (require.main === module) {
    testSimpleMerkleProof().catch(console.error);
}

module.exports = { testSimpleMerkleProof };