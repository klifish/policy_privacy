const fs = require('fs');
const path = require('path');
const circomlib = require('circomlibjs');

// Basic test for EXT operator functionality
async function testEXTOperator() {
    console.log('Testing EXT operator functionality...');
    
    // Test 1: Basic AND without EXT (should work)
    console.log('\n=== Test 1: Basic AND operation ===');
    const input1 = {
        postfixExpr: [0, 3, 5, 0, 0, 0, 0, 0, 0, 0], // A0, P0, AND
        numOperations: 3,
        requesterPolicy: [1, 0, 0],
        predicateValues: [1, 0],
        
        // EXT operation inputs (dummy values)
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
    
    // Test 2: EXT operation with simple mock values
    console.log('\n=== Test 2: EXT operation ===');
    
    const input2 = {
        postfixExpr: [0, 8, 0, 0, 0, 0, 0, 0, 0, 0], // A0, EXT (8 = N+M+3 = 3+2+3)
        numOperations: 2,
        requesterPolicy: [1, 0, 0],
        predicateValues: [0, 0],
        
        // EXT operation inputs - simple mock values for testing
        bindingRoot: 12345,
        duoId: 100,
        icdRoot: 200,
        bindingVersion: 1,
        bindingSalt: 999,
        bindingPathElements: [100, 12345, 0, 0, 0, 0, 0, 0], // Mock path that should verify
        bindingPathIndices: [0, 0, 0, 0, 0, 0, 0, 0],
        icdCode: 300,
        icdPathElements: [300, 200, 0, 0, 0, 0, 0, 0], // Mock path that should verify  
        icdPathIndices: [0, 0, 0, 0, 0, 0, 0, 0]
    };
    
    console.log('Input for basic AND test:', JSON.stringify(input1, null, 2));
    console.log('Input for EXT test:', JSON.stringify(input2, null, 2));
    
    console.log('\nTest setup complete. The circuit should be tested with these inputs.');
    
    return { input1, input2 };
}

// Extended evaluation function for EXT operations
function evalPostfixWithEXT(tokens, attrs, predicates, N, M, extResult = true) {
    const st = [];
    for (const tok of tokens) {
        if (tok < N) {
            // Attribute
            st.push(attrs[tok]);
        } else if (tok < N + M) {
            // Predicate
            st.push(predicates[tok - N]);
        } else {
            // Operator
            const opCode = tok - (N + M);
            if (opCode === 0) {
                // AND
                const b = st.pop();
                const a = st.pop();
                st.push(a && b ? 1 : 0);
            } else if (opCode === 1) {
                // OR
                const b = st.pop();
                const a = st.pop();
                st.push(a || b ? 1 : 0);
            } else if (opCode === 2) {
                // NOT
                const a = st.pop();
                st.push(1 - a);
            } else if (opCode === 3) {
                // EXT - for testing, return the provided extResult combined with the stack top
                const p = st.pop();
                const result = p && extResult ? 1 : 0;
                st.push(result);
            } else {
                throw new Error(`Unknown operator code: ${opCode}`);
            }
        }
    }
    if (st.length !== 1) throw new Error("Final stack depth != 1");
    return st[0];
}

// Test JavaScript evaluation
async function testJSEvaluation() {
    console.log('\n=== JavaScript Evaluation Tests ===');
    
    // Test basic operations
    const tokens1 = [0, 3, 5]; // A0, P0, AND
    const result1 = evalPostfixWithEXT(tokens1, [1, 0, 0], [1, 0], 3, 2);
    console.log('A0(1) AND P0(1) =', result1); // Should be 1
    
    // Test EXT operation
    const tokens2 = [0, 8]; // A0, EXT
    const result2 = evalPostfixWithEXT(tokens2, [1, 0, 0], [0, 0], 3, 2, true);
    console.log('A0(1) EXT (valid) =', result2); // Should be 1
    
    const result3 = evalPostfixWithEXT(tokens2, [0, 0, 0], [0, 0], 3, 2, true);
    console.log('A0(0) EXT (valid) =', result3); // Should be 0 (false clause)
    
    const result4 = evalPostfixWithEXT(tokens2, [1, 0, 0], [0, 0], 3, 2, false);
    console.log('A0(1) EXT (invalid) =', result4); // Should be 0 (invalid membership)
}

if (require.main === module) {
    testEXTOperator().then(() => testJSEvaluation()).catch(console.error);
}

module.exports = { testEXTOperator, evalPostfixWithEXT };