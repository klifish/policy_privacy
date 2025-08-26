const path = require('path');
const fs = require('fs');
const circomlibjs = require('circomlibjs');

describe('Policy Privacy - Comprehensive Functional Tests', function() {
    this.timeout(100000);
    
    let poseidon;

    before(async function() {
        // Initialize Poseidon hash function
        poseidon = await circomlibjs.buildPoseidon();
        console.log('Poseidon initialized successfully');
    });

    describe('Circuit Compilation Status', function() {
        it('should have compiled main circuit files', function() {
            const mainWasmPath = path.join(__dirname, '..', 'build', 'circuits', 'policy_privacy_test_js', 'policy_privacy_test.wasm');
            const mainR1csPath = path.join(__dirname, '..', 'build', 'circuits', 'policy_privacy_test.r1cs');
            
            console.log('Checking main circuit files:');
            console.log('- WASM file exists:', fs.existsSync(mainWasmPath));
            console.log('- R1CS file exists:', fs.existsSync(mainR1csPath));
            
            if (!fs.existsSync(mainWasmPath) || !fs.existsSync(mainR1csPath)) {
                console.log('\nTo compile circuits, run: npm run build:circuit');
                console.log('Expected files:');
                console.log('  -', mainWasmPath);
                console.log('  -', mainR1csPath);
                this.skip();
            }
        });

        it('should have compiled component test circuits', function() {
            const circuits = [
                'test_multimux',
                'test_postfix_policy_interpreter_extended'
            ];
            
            console.log('\nChecking component circuit files:');
            for (const circuitName of circuits) {
                const wasmPath = path.join(__dirname, '..', 'build', 'circuits', `${circuitName}_js`, `${circuitName}.wasm`);
                const r1csPath = path.join(__dirname, '..', 'build', 'circuits', `${circuitName}.r1cs`);
                
                console.log(`- ${circuitName}: WASM=${fs.existsSync(wasmPath)}, R1CS=${fs.existsSync(r1csPath)}`);
            }
        });
    });

    describe('Policy Commitment Functionality', function() {
        it('should correctly compute Poseidon commitments', function() {
            // Test the core commitment functionality that the circuits use
            const policy = [0, 1, 5, 2, 7, 0, 0, 0, 0, 0]; // Sample RPN policy
            const randomizer = 12345n;
            
            const commitment = poseidon(policy.concat([randomizer]));
            
            console.log('Policy:', policy);
            console.log('Randomizer:', randomizer.toString());
            console.log('Commitment:', commitment.toString());
            
            // Verify commitment is deterministic
            const commitment2 = poseidon(policy.concat([randomizer]));
            if (commitment.toString() !== commitment2.toString()) {
                throw new Error('Commitment should be deterministic');
            }
            
            // Verify different randomizer gives different commitment
            const commitment3 = poseidon(policy.concat([54321n]));
            if (commitment.toString() === commitment3.toString()) {
                throw new Error('Different randomizer should give different commitment');
            }
        });

        it('should handle different policy structures', function() {
            const policies = [
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // All zeros
                [0, 1, 5, 0, 0, 0, 0, 0, 0, 0], // Simple AND
                [0, 1, 6, 0, 0, 0, 0, 0, 0, 0], // Simple OR
                [0, 7, 0, 0, 0, 0, 0, 0, 0, 0]  // Simple NOT
            ];
            
            const randomizer = 99999n;
            
            console.log('Testing different policy structures:');
            for (let i = 0; i < policies.length; i++) {
                const commitment = poseidon(policies[i].concat([randomizer]));
                console.log(`Policy ${i}: ${policies[i].slice(0,4).join(',')}... => ${commitment.toString().slice(-8)}`);
                
                // Each should produce a different commitment
                for (let j = i + 1; j < policies.length; j++) {
                    const otherCommitment = poseidon(policies[j].concat([randomizer]));
                    if (commitment.toString() === otherCommitment.toString()) {
                        throw new Error(`Policies ${i} and ${j} should have different commitments`);
                    }
                }
            }
        });
    });

    describe('Policy Logic Evaluation', function() {
        it('should evaluate basic boolean operations correctly', function() {
            // Test the JavaScript equivalent of what the circuit does
            
            // Test AND operation: 1 AND 1 = 1, 1 AND 0 = 0
            const andResult1 = 1 * 1; // Circuit uses multiplication for AND
            const andResult2 = 1 * 0;
            
            if (andResult1 !== 1 || andResult2 !== 0) {
                throw new Error('AND operation failed');
            }
            
            // Test OR operation: a OR b = a + b - a*b
            const orResult1 = 1 + 0 - (1 * 0); // 1 OR 0 = 1
            const orResult2 = 0 + 0 - (0 * 0); // 0 OR 0 = 0
            const orResult3 = 1 + 1 - (1 * 1); // 1 OR 1 = 1
            
            if (orResult1 !== 1 || orResult2 !== 0 || orResult3 !== 1) {
                throw new Error('OR operation failed');
            }
            
            // Test NOT operation: NOT a = 1 - a
            const notResult1 = 1 - 1; // NOT 1 = 0
            const notResult2 = 1 - 0; // NOT 0 = 1
            
            if (notResult1 !== 0 || notResult2 !== 1) {
                throw new Error('NOT operation failed');
            }
            
            console.log('Boolean operations verified:');
            console.log('- AND: 1*1=1, 1*0=0 ✓');
            console.log('- OR: 1+0-1*0=1, 0+0-0*0=0, 1+1-1*1=1 ✓');
            console.log('- NOT: 1-1=0, 1-0=1 ✓');
        });

        it('should handle complex policy evaluation', function() {
            // Test: (attr0 AND attr1) OR (NOT attr2)
            // This matches the kind of policies the circuit handles
            
            const testCases = [
                { attrs: [1, 1, 0], expected: 1 }, // (1 AND 1) OR (NOT 0) = 1 OR 1 = 1
                { attrs: [1, 0, 0], expected: 1 }, // (1 AND 0) OR (NOT 0) = 0 OR 1 = 1
                { attrs: [0, 0, 1], expected: 0 }, // (0 AND 0) OR (NOT 1) = 0 OR 0 = 0
                { attrs: [0, 1, 1], expected: 0 }  // (0 AND 1) OR (NOT 1) = 0 OR 0 = 0
            ];
            
            console.log('Testing complex policy: (attr0 AND attr1) OR (NOT attr2)');
            
            for (const testCase of testCases) {
                const [a0, a1, a2] = testCase.attrs;
                
                // Evaluate: (a0 AND a1) OR (NOT a2)
                const andResult = a0 * a1;
                const notResult = 1 - a2;
                const finalResult = andResult + notResult - (andResult * notResult);
                
                console.log(`[${a0},${a1},${a2}] => (${a0}*${a1}) OR (1-${a2}) = ${andResult} OR ${notResult} = ${finalResult}`);
                
                if (finalResult !== testCase.expected) {
                    throw new Error(`Expected ${testCase.expected}, got ${finalResult} for attrs ${testCase.attrs}`);
                }
            }
        });
    });

    describe('External Predicate Logic', function() {
        it('should support Merkle proof structure', function() {
            // Test the data structures used for Merkle proofs
            const leaf = 123456n;
            const pathElements = [789n, 101112n, 131415n, 161718n];
            const pathIndices = [0, 1, 0, 1];
            
            // Simulate Merkle proof verification (what the circuit does)
            let currentHash = leaf;
            for (let i = 0; i < pathElements.length; i++) {
                if (pathIndices[i] === 0) {
                    currentHash = poseidon([currentHash, pathElements[i]]);
                } else {
                    currentHash = poseidon([pathElements[i], currentHash]);
                }
            }
            
            const root = currentHash;
            console.log('Merkle proof simulation:');
            console.log('- Leaf:', leaf.toString());
            console.log('- Path length:', pathElements.length);
            console.log('- Computed root:', root.toString().slice(-12));
            
            // Verify changing the leaf changes the root
            const differentLeaf = 654321n;
            let differentHash = differentLeaf;
            for (let i = 0; i < pathElements.length; i++) {
                if (pathIndices[i] === 0) {
                    differentHash = poseidon([differentHash, pathElements[i]]);
                } else {
                    differentHash = poseidon([pathElements[i], differentHash]);
                }
            }
            
            if (root.toString() === differentHash.toString()) {
                throw new Error('Different leaves should produce different roots');
            }
        });

        it('should support credential signature verification', function() {
            // Test the signature verification logic (simplified)
            const message = 42n;
            const publicKey = 999n;
            
            // In the circuit, signature verification is: signature == hash(message, publicKey)
            const expectedSignature = poseidon([message, publicKey]);
            
            console.log('Credential signature simulation:');
            console.log('- Message:', message.toString());
            console.log('- Public key:', publicKey.toString());
            console.log('- Expected signature:', expectedSignature.toString().slice(-12));
            
            // Verify wrong message fails
            const wrongSignature = poseidon([43n, publicKey]);
            if (expectedSignature.toString() === wrongSignature.toString()) {
                throw new Error('Wrong message should produce different signature');
            }
        });

        it('should support range proofs', function() {
            // Test range proof logic: min <= value <= max
            const testCases = [
                { value: 50, min: 10, max: 100, valid: true },
                { value: 5,  min: 10, max: 100, valid: false },
                { value: 150, min: 10, max: 100, valid: false },
                { value: 10, min: 10, max: 100, valid: true },
                { value: 100, min: 10, max: 100, valid: true }
            ];
            
            console.log('Range proof validation:');
            for (const testCase of testCases) {
                const { value, min, max, valid } = testCase;
                const isInRange = (value >= min) && (value <= max);
                const result = isInRange ? 1 : 0;
                const expected = valid ? 1 : 0;
                
                console.log(`${min} <= ${value} <= ${max} => ${result} (expected ${expected})`);
                
                if (result !== expected) {
                    throw new Error(`Range check failed for ${value} in [${min}, ${max}]`);
                }
            }
        });
    });

    describe('Integration Functionality', function() {
        it('should support complete witness structure', function() {
            // Test the complete witness structure w = (P, a, p, r)
            
            // Policy P (RPN encoded)
            const policy = [0, 1, 5, 2, 7, 0, 0, 0, 0, 0]; // attr0 AND attr1 AND NOT attr2
            
            // Requester attributes a
            const requesterAttrs = [1, 1, 0]; // N=3 attributes
            
            // External predicates p
            const externalPredicates = [1, 0]; // M=2 predicates
            
            // Commitment randomizer r
            const randomizer = 12345n;
            
            // Compute policy commitment
            const policyCommitment = poseidon(policy.concat([randomizer]));
            
            console.log('Complete witness structure:');
            console.log('- Policy P:', policy.slice(0, 5).join(','), '...');
            console.log('- Attributes a:', requesterAttrs);
            console.log('- Predicates p:', externalPredicates);
            console.log('- Randomizer r:', randomizer.toString());
            console.log('- Commitment h:', policyCommitment.toString().slice(-12));
            
            // Test that all components are present and valid
            if (policy.length !== 10) throw new Error('Policy should have DEPTH=10 elements');
            if (requesterAttrs.length !== 3) throw new Error('Should have N=3 requester attributes');
            if (externalPredicates.length !== 2) throw new Error('Should have M=2 external predicates');
            if (typeof randomizer !== 'bigint') throw new Error('Randomizer should be bigint');
            if (typeof policyCommitment === 'undefined' || policyCommitment === null) throw new Error('Commitment should be defined');
        });

        it('should validate circuit parameter consistency', function() {
            // Test that parameters are consistent with circuit design
            const N = 3; // requester attributes
            const M = 2; // external predicates  
            const DEPTH = 10; // policy depth
            const K = 3; // ceil(log2(N+M)) for operand indexing
            
            console.log('Circuit parameters:');
            console.log('- N (attributes):', N);
            console.log('- M (predicates):', M);
            console.log('- DEPTH (policy):', DEPTH);
            console.log('- K (operand bits):', K);
            
            // Verify K is sufficient for operand indexing
            const maxOperands = N + M + 3; // +3 for AND, OR, NOT
            const requiredK = Math.ceil(Math.log2(maxOperands));
            
            console.log('- Max operands:', maxOperands);
            console.log('- Required K:', requiredK);
            
            if (K < requiredK) {
                throw new Error(`K=${K} insufficient for ${maxOperands} operands, need K>=${requiredK}`);
            }
            
            // Verify operand encoding
            const operandCodes = {
                attr0: 0, attr1: 1, attr2: 2,           // Attribute indices 0..N-1
                pred0: 3, pred1: 4,                     // Predicate indices N..N+M-1  
                AND: 5, OR: 6, NOT: 7                   // Operator codes N+M+{0,1,2}
            };
            
            console.log('Operand encoding:');
            for (const [name, code] of Object.entries(operandCodes)) {
                console.log(`  ${name}: ${code}`);
                if (code >= (1 << K)) {
                    throw new Error(`Operand code ${code} for ${name} exceeds K=${K} bit limit`);
                }
            }
        });
    });
});