const fs = require('fs');
const path = require('path');
const circomlib = require('circomlibjs');

// Create valid Merkle proofs for testing EXT functionality
async function createValidMerkleProofs() {
    console.log('Creating valid Merkle proofs for EXT testing...');
    
    // Load Poseidon
    const poseidonHash = await circomlib.buildPoseidon();
    
    // Helper function to convert poseidon result to BigInt
    function poseidon(inputs) {
        const result = poseidonHash(inputs);
        // Convert Uint8Array to BigInt
        if (result instanceof Uint8Array) {
            let bigintResult = 0n;
            for (let i = 0; i < result.length; i++) {
                bigintResult = bigintResult * 256n + BigInt(result[i]);
            }
            return bigintResult;
        }
        return BigInt(result);
    }
    
    // ===== Create Binding Map Merkle Tree =====
    console.log('\n1. Creating Binding Map Merkle Tree');
    
    const duoId = BigInt(12345);
    const icdRoot = BigInt(67890);
    const bindingVersion = BigInt(1);
    const bindingSalt = BigInt(999);
    
    // Create binding leaf: hash(duoId, icdRoot, version, salt)
    const bindingLeaf = poseidon([duoId, icdRoot, bindingVersion, bindingSalt]);
    console.log('Binding leaf hash:', bindingLeaf.toString());
    
    // Create a simple 3-level Merkle tree for the binding map
    // Level 0: bindingLeaf, otherLeaf1, otherLeaf2, otherLeaf3
    const otherLeaf1 = poseidon([BigInt(11111), BigInt(22222), BigInt(1), BigInt(333)]);
    const otherLeaf2 = poseidon([BigInt(44444), BigInt(55555), BigInt(1), BigInt(666)]);
    const otherLeaf3 = poseidon([BigInt(77777), BigInt(88888), BigInt(1), BigInt(777)]);
    
    // Level 1: hash pairs
    const level1_0 = poseidon([bindingLeaf, otherLeaf1]);  // Our leaf is here (index 0)
    const level1_1 = poseidon([otherLeaf2, otherLeaf3]);
    
    // Level 2: hash pairs  
    const level2_0 = poseidon([level1_0, level1_1]);  // Our path continues here (index 0)
    
    // Level 3: root
    const anotherBranch = poseidon([BigInt(99999), BigInt(111111)]);
    const bindingRoot = poseidon([level2_0, anotherBranch]);  // Final root (index 0)
    
    // Create Merkle proof path for bindingLeaf
    const bindingPathElements = [
        otherLeaf1,    // Sibling at level 0 (we're at index 0, sibling at index 1)
        level1_1,      // Sibling at level 1 (we're at index 0, sibling at index 1) 
        anotherBranch, // Sibling at level 2 (we're at index 0, sibling at index 1)
        BigInt(0),     // Padding
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0)
    ];
    const bindingPathIndices = [0, 0, 0, 0, 0, 0, 0, 0]; // Always left path
    
    console.log('Binding root:', bindingRoot.toString());
    
    // ===== Create ICD Set Merkle Tree =====
    console.log('\n2. Creating ICD Set Merkle Tree');
    
    const icdCode = BigInt(12345); // The ICD code we want to prove membership for
    
    // Create ICD set tree with our code included
    const icdCode2 = BigInt(23456);
    const icdCode3 = BigInt(34567);
    const icdCode4 = BigInt(45678);
    
    // Level 1: hash pairs
    const icdLevel1_0 = poseidon([icdCode, icdCode2]);   // Our code is here (index 0)
    const icdLevel1_1 = poseidon([icdCode3, icdCode4]);
    
    // Level 2: root (equals the icdRoot we used in binding)
    const computedIcdRoot = poseidon([icdLevel1_0, icdLevel1_1]);
    
    // Verify our icdRoot matches
    if (computedIcdRoot.toString() !== icdRoot.toString()) {
        console.log('WARNING: ICD root mismatch!');
        console.log('Expected:', icdRoot.toString());
        console.log('Computed:', computedIcdRoot.toString());
        // Update icdRoot to match computed value
        const correctedIcdRoot = computedIcdRoot;
        console.log('Using corrected ICD root:', correctedIcdRoot.toString());
        
        // Recompute binding with correct ICD root
        const correctedBindingLeaf = poseidon([duoId, correctedIcdRoot, bindingVersion, bindingSalt]);
        const correctedLevel1_0 = poseidon([correctedBindingLeaf, otherLeaf1]);
        const correctedLevel2_0 = poseidon([correctedLevel1_0, level1_1]);
        const correctedBindingRoot = poseidon([correctedLevel2_0, anotherBranch]);
        
        console.log('Corrected binding leaf:', correctedBindingLeaf.toString());
        console.log('Corrected binding root:', correctedBindingRoot.toString());
        
        // Update values
        const finalTest = {
            // Circuit inputs
            postfixExpr: [0, 8, 0, 0, 0, 0, 0, 0, 0, 0], // A0, EXT
            numOperations: 2,
            requesterPolicy: [1, 0, 0], // A0 = true
            predicateValues: [0, 0],
            
            // Binding verification inputs
            bindingRoot: correctedBindingRoot.toString(),
            duoId: duoId.toString(),
            icdRoot: correctedIcdRoot.toString(),
            bindingVersion: bindingVersion.toString(),
            bindingSalt: bindingSalt.toString(),
            bindingPathElements: [
                otherLeaf1.toString(),
                level1_1.toString(),
                anotherBranch.toString(),
                '0', '0', '0', '0', '0'
            ],
            bindingPathIndices: [0, 0, 0, 0, 0, 0, 0, 0],
            
            // ICD membership inputs  
            icdCode: icdCode.toString(),
            icdPathElements: [
                icdCode2.toString(),    // Sibling of icdCode at level 0
                icdLevel1_1.toString(), // Sibling at level 1
                '0', '0', '0', '0', '0', '0'
            ],
            icdPathIndices: [0, 0, 0, 0, 0, 0, 0, 0]
        };
        
        return finalTest;
    }
    
    // Create ICD Merkle proof
    const icdPathElements = [
        icdCode2,      // Sibling at level 0 (we're at index 0, sibling at index 1)
        icdLevel1_1,   // Sibling at level 1 (we're at index 0, sibling at index 1)
        BigInt(0),     // Padding
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0)
    ];
    const icdPathIndices = [0, 0, 0, 0, 0, 0, 0, 0]; // Always left path
    
    console.log('ICD root:', computedIcdRoot.toString());
    
    // ===== Create Test Input =====
    const testInput = {
        // Circuit inputs
        postfixExpr: [0, 8, 0, 0, 0, 0, 0, 0, 0, 0], // A0, EXT
        numOperations: 2,
        requesterPolicy: [1, 0, 0], // A0 = true
        predicateValues: [0, 0],
        
        // Binding verification inputs
        bindingRoot: bindingRoot.toString(),
        duoId: duoId.toString(),
        icdRoot: icdRoot.toString(),
        bindingVersion: bindingVersion.toString(),
        bindingSalt: bindingSalt.toString(),
        bindingPathElements: bindingPathElements.map(x => x.toString()),
        bindingPathIndices: bindingPathIndices,
        
        // ICD membership inputs  
        icdCode: icdCode.toString(),
        icdPathElements: icdPathElements.map(x => x.toString()),
        icdPathIndices: icdPathIndices
    };
    
    console.log('\n3. Test Input Created');
    console.log('Expected behavior: A0=1, EXT should verify both proofs and return 1');
    
    return testInput;
}

// Test the circuit with valid proofs
async function testWithValidProofs() {
    console.log('=== Testing EXT Circuit with Valid Merkle Proofs ===');
    
    try {
        // Create valid test input
        const testInput = await createValidMerkleProofs();
        
        // Load and test the circuit
        const wasmPath = path.join(__dirname, 'build', 'circuits', 'test_postfix_policy_interpreter_extended_js', 'test_postfix_policy_interpreter_extended.wasm');
        
        if (!fs.existsSync(wasmPath)) {
            console.error('WASM file not found. Please run: npm run build:circuit');
            return;
        }
        
        const WitnessCalculatorBuilder = require('circom_runtime').WitnessCalculatorBuilder;
        const wasm = fs.readFileSync(wasmPath);
        const wc = await WitnessCalculatorBuilder(wasm);
        
        console.log('\n=== Testing Valid EXT Operation ===');
        const witness = await wc.calculateWitness(testInput, true);
        const result = witness[1];
        
        console.log('✓ Circuit executed successfully');
        console.log('  Result:', result.toString());
        console.log('  Expected: 1 (A0=1, valid binding + ICD membership)');
        
        if (result.toString() === '1') {
            console.log('🎉 SUCCESS: EXT operator working correctly with valid proofs!');
        } else {
            console.log('⚠️  Unexpected result. This could indicate:');
            console.log('   - Merkle proof verification failed');
            console.log('   - depsOK register not working correctly');
            console.log('   - Other circuit logic issues');
        }
        
        // Test with false clause (A0=0)
        console.log('\n=== Testing EXT with False Clause ===');
        const falseClauseInput = { ...testInput, requesterPolicy: [0, 0, 0] }; // A0 = false
        const witness2 = await wc.calculateWitness(falseClauseInput, true);
        const result2 = witness2[1];
        
        console.log('✓ False clause test executed');
        console.log('  Result:', result2.toString());
        console.log('  Expected: 0 (A0=0, clause fails regardless of membership)');
        
    } catch (error) {
        console.error('✗ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

if (require.main === module) {
    testWithValidProofs().catch(console.error);
}

module.exports = { createValidMerkleProofs, testWithValidProofs };