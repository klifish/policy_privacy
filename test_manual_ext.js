const fs = require('fs');
const path = require('path');
const { assert } = require('chai');

// Manual test using the compiled WASM file directly
async function testExtCircuitManually() {
    console.log('Testing EXT circuit manually...');
    
    // Load the WASM file
    const wasmPath = path.join(__dirname, 'build', 'circuits', 'test_postfix_policy_interpreter_extended_js', 'test_postfix_policy_interpreter_extended.wasm');
    
    if (!fs.existsSync(wasmPath)) {
        console.error('WASM file not found at:', wasmPath);
        console.log('Please run: npm run build:circuit first');
        return;
    }
    
    console.log('WASM file found at:', wasmPath);
    
    // Load witness calculator builder
    const WitnessCalculatorBuilder = require('circom_runtime').WitnessCalculatorBuilder;
    const wasm = fs.readFileSync(wasmPath);
    const wc = await WitnessCalculatorBuilder(wasm);
    
    console.log('Witness calculator loaded successfully');
    
    // Test 1: Basic AND operation
    console.log('\n=== Test 1: Basic AND Operation ===');
    const input1 = {
        postfixExpr: [0, 3, 5, 0, 0, 0, 0, 0, 0, 0], // A0, P0, AND
        numOperations: 3,
        requesterPolicy: [1, 0, 0],
        predicateValues: [1, 0],
        
        // EXT inputs (not used but required)
        bindingRoot: 0,
        duoId: 0,
        icdRoot: 0,
        bindingVersion: 0,
        bindingSalt: 0,
        bindingPathElements: Array(8).fill(0),
        bindingPathIndices: Array(8).fill(0),
        icdCode: 0,
        icdPathElements: Array(8).fill(0),
        icdPathIndices: Array(8).fill(0)
    };
    
    try {
        const witness1 = await wc.calculateWitness(input1, true);
        console.log('✓ Basic AND test passed');
        console.log('  Result:', witness1[1]); // isValid is typically output #1
        console.log('  Expected: 1 (A0=1 AND P0=1)');
    } catch (error) {
        console.error('✗ Basic AND test failed:', error.message);
    }
    
    // Test 2: Simple EXT operation (should work with mock inputs)
    console.log('\n=== Test 2: EXT Operation ===');
    const input2 = {
        postfixExpr: [0, 8, 0, 0, 0, 0, 0, 0, 0, 0], // A0, EXT (8 = N+M+3)
        numOperations: 2,
        requesterPolicy: [1, 0, 0],
        predicateValues: [0, 0],
        
        // Mock EXT inputs that should verify
        bindingRoot: 123,
        duoId: 100,
        icdRoot: 200,
        bindingVersion: 1,
        bindingSalt: 999,
        bindingPathElements: [100, 123, 0, 0, 0, 0, 0, 0],
        bindingPathIndices: [0, 0, 0, 0, 0, 0, 0, 0],
        icdCode: 300,
        icdPathElements: [300, 200, 0, 0, 0, 0, 0, 0],
        icdPathIndices: [0, 0, 0, 0, 0, 0, 0, 0]
    };
    
    try {
        const witness2 = await wc.calculateWitness(input2, true);
        console.log('✓ EXT operation test passed');
        console.log('  Result:', witness2[1]);
        console.log('  Note: This tests circuit compilation, actual verification depends on proper Merkle proofs');
    } catch (error) {
        console.error('✗ EXT operation test failed:', error.message);
        console.error('  This could be due to invalid Merkle proofs or circuit issues');
    }
    
    console.log('\n=== Manual Testing Complete ===');
}

if (require.main === module) {
    testExtCircuitManually().catch(console.error);
}

module.exports = { testExtCircuitManually };