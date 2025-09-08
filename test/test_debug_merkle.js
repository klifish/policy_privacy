const fs = require('fs');
const path = require('path');
const circomlib = require('circomlibjs');
const assert = require('assert');

describe('Debug Merkle Proof Verification', function () {
    this.timeout(100000);
    
    let poseidonHash;
    let wc; // Witness calculator

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

    before(async () => {
        // Load Poseidon hash function
        poseidonHash = await circomlib.buildPoseidon();
        
        // Load circuit using the original approach
        const wasmPath = path.join(__dirname, '..', 'build', 'circuits', 'test_postfix_policy_interpreter_extended_js', 'test_postfix_policy_interpreter_extended.wasm');
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM file not found at ${wasmPath}. Please run 'npm run build:circuit' first.`);
        }
        
        const WitnessCalculatorBuilder = require('circom_runtime').WitnessCalculatorBuilder;
        const wasm = fs.readFileSync(wasmPath);
        wc = await WitnessCalculatorBuilder(wasm);
    });
    it('should verify simple 1-level Merkle proofs correctly', async () => {
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
        
        // Calculate witness and get result
        const witness = await wc.calculateWitness(testInput, true);
        const result = witness[1];
        
        console.log('✓ Circuit executed');
        console.log('  Result:', result.toString());
        console.log('  Expected: 1 (should verify simple proofs)');
        
        if (result.toString() === '1') {
            console.log('🎉 SUCCESS: Simple Merkle proof verification working!');
            assert.strictEqual(result.toString(), '1', 'Simple Merkle proof should verify correctly');
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
            
            // Still assert the failure for test framework
            assert.fail('Simple Merkle proof verification failed');
        }
    });
    
    it('should reject invalid Merkle proofs', async () => {
        console.log('\n=== Testing Invalid Proof (should fail) ===');
        
        // First set up valid proof components
        const duoId = BigInt(100);
        const icdCode = BigInt(400);
        const icdSibling = BigInt(500);
        const computedIcdRoot = poseidon([icdCode, icdSibling]);
        const bindingVersion = BigInt(1);
        const bindingSalt = BigInt(300);
        const siblingLeaf = BigInt(999);
        const correctedBindingLeaf = poseidon([duoId, computedIcdRoot, bindingVersion, bindingSalt]);
        const correctedBindingRoot = poseidon([correctedBindingLeaf, siblingLeaf]);
        
        // Create input with invalid ICD code to test verification
        const invalidInput = {
            postfixExpr: [0, 8, 0, 0, 0, 0, 0, 0, 0, 0], // A0, EXT
            numOperations: 2,
            requesterPolicy: [1, 0, 0], // A0 = true
            predicateValues: [0, 0],
            
            // Binding verification (valid)
            bindingRoot: correctedBindingRoot.toString(),
            duoId: duoId.toString(),
            icdRoot: computedIcdRoot.toString(),
            bindingVersion: bindingVersion.toString(),
            bindingSalt: bindingSalt.toString(),
            bindingPathElements: [
                siblingLeaf.toString(),
                '0', '0', '0', '0', '0', '0', '0'
            ],
            bindingPathIndices: [0, 0, 0, 0, 0, 0, 0, 0],
            
            // ICD membership (invalid code)
            icdCode: '99999', // Wrong ICD code
            icdPathElements: [
                icdSibling.toString(),
                '0', '0', '0', '0', '0', '0', '0'
            ],
            icdPathIndices: [0, 0, 0, 0, 0, 0, 0, 0]
        };
        
        const witness = await wc.calculateWitness(invalidInput, true);
        const result = witness[1];
        
        console.log('✓ Invalid proof test executed');
        console.log('  Result:', result.toString());
        console.log('  Expected: 0 (should reject invalid proof)');
        
        assert.strictEqual(result.toString(), '0', 'Invalid Merkle proof should be rejected');
    });
});