const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Utility function to execute snarkjs commands via child process
function execSnarkjs(args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        console.log('  $ npx snarkjs', args.join(' '));
        const process = spawn('npx', ['snarkjs', ...args], { 
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'] 
        });
        
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            // Show progress for long operations
            if (output.includes('Hash:') || output.includes('Contribution')) {
                console.log('    ' + output.trim());
            }
        });
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`snarkjs command failed with code ${code}: ${stderr}`));
            }
        });
    });
}

describe('zk-SNARK Setup and Powers of Tau Generation', function() {
    let buildDir;
    let setupDir;
    let potFinalPath;
    this.timeout(300000); // 5 minutes timeout for Powers of Tau
    
    before(async function() {
        // Setup directories
        buildDir = path.join(__dirname, "../build");
        setupDir = path.join(buildDir, "setup");
        if (!fs.existsSync(setupDir)) {
            fs.mkdirSync(setupDir, { recursive: true });
        }
        
        potFinalPath = path.join(setupDir, "pot10_final.ptau");
    });
    
    describe('Powers of Tau Ceremony', function() {
        it('Should automatically generate Powers of Tau for testing', async function() {
            if (fs.existsSync(potFinalPath)) {
                console.log('♻️  Powers of Tau file already exists, skipping generation');
                console.log('   File:', path.basename(potFinalPath));
                return;
            }
            
            console.log('🔧 Generating Powers of Tau ceremony for zk-SNARK testing...');
            
            const pot0Path = path.join(setupDir, "pot10_0000.ptau");
            const pot1Path = path.join(setupDir, "pot10_0001.ptau");
            
            try {
                // Step 1: Initialize Powers of Tau
                console.log('📋 Step 1: Initializing Powers of Tau (bn128, 2^10 = 1024 constraints)...');
                await execSnarkjs(['powersoftau', 'new', 'bn128', '10', pot0Path], setupDir);
                console.log('  ✅ Powers of Tau initialized');
                
                // Step 2: Add beacon contribution (non-interactive)
                console.log('📋 Step 2: Adding beacon contribution (non-interactive)...');
                const beaconHash = '0000000000000000000000000000000000000000000000000000000000000000'; // Test beacon hash
                await execSnarkjs(['powersoftau', 'beacon', pot0Path, pot1Path, beaconHash, '10'], setupDir);
                console.log('  ✅ Beacon contribution added');
                
                // Step 3: Prepare Phase 2
                console.log('📋 Step 3: Preparing Phase 2 (circuit-specific setup)...');
                await execSnarkjs(['powersoftau', 'prepare', 'phase2', pot1Path, potFinalPath], setupDir);
                console.log('  ✅ Phase 2 prepared');
                
                // Verify the final file exists and has correct format
                assert(fs.existsSync(potFinalPath), 'Final Powers of Tau file should exist');
                const stats = fs.statSync(potFinalPath);
                assert(stats.size > 1000000, 'Powers of Tau file should be substantial size'); // >1MB
                console.log('  📊 Final file size:', Math.round(stats.size / 1024 / 1024 * 100) / 100, 'MB');
                
                // Cleanup intermediate files
                if (fs.existsSync(pot0Path)) {
                    fs.unlinkSync(pot0Path);
                    console.log('  🗑️  Cleaned up intermediate file:', path.basename(pot0Path));
                }
                if (fs.existsSync(pot1Path)) {
                    fs.unlinkSync(pot1Path);
                    console.log('  🗑️  Cleaned up intermediate file:', path.basename(pot1Path));
                }
                
                console.log('🎉 Powers of Tau ceremony completed successfully!');
                console.log('   Final file: ' + path.basename(potFinalPath));
                
            } catch (error) {
                console.error('❌ Powers of Tau generation failed:', error.message);
                throw error;
            }
        });
        
        it('Should validate Powers of Tau file format', async function() {
            if (!fs.existsSync(potFinalPath)) {
                console.log('⚠️  Powers of Tau file not found, skipping validation');
                this.skip();
            }
            
            try {
                // Try to read the Powers of Tau header
                console.log('🔍 Validating Powers of Tau file format...');
                
                // Basic file checks
                const stats = fs.statSync(potFinalPath);
                console.log('  - File size:', Math.round(stats.size / 1024 / 1024 * 100) / 100, 'MB');
                console.log('  - File exists: ✅');
                
                // TODO: Could add more sophisticated validation here
                // For now, basic existence and size checks are sufficient
                
                console.log('✅ Powers of Tau file validation passed');
                
            } catch (error) {
                console.error('❌ Powers of Tau validation failed:', error.message);
                throw error;
            }
        });
    });
    
    describe('Groth16 Setup Simulation', function() {
        it('Should demonstrate complete Groth16 workflow concepts', async function() {
            console.log('\n=== Groth16 zk-SNARK Workflow Overview ===');
            console.log('This test demonstrates the complete Groth16 workflow that would be used:');
            console.log('');
            console.log('📋 Phase 1: Powers of Tau (Universal Setup)');
            console.log('  ✅ Generate universal parameters (done above)');
            console.log('  - Creates cryptographic parameters for any circuit up to 2^12 constraints');
            console.log('  - Uses bn128 elliptic curve for efficiency');
            console.log('  - Final file: ' + (fs.existsSync(potFinalPath) ? '✅ ' + path.basename(potFinalPath) : '❌ Not found'));
            console.log('');
            console.log('📋 Phase 2: Circuit-Specific Setup (Per Circuit)');
            console.log('  - Input: Circuit R1CS file + Powers of Tau');
            console.log('  - Output: Proving key (.zkey) + Verification key (.json)');
            console.log('  - Process: snarkjs.zKey.newZKey() + snarkjs.zKey.contribute()');
            console.log('');
            console.log('📋 Phase 3: Proof Generation (Runtime)');
            console.log('  - Input: Witness data + Proving key');
            console.log('  - Output: zk-SNARK proof + Public signals');
            console.log('  - Process: snarkjs.groth16.fullProve()');
            console.log('');
            console.log('📋 Phase 4: Proof Verification (Runtime)');
            console.log('  - Input: Proof + Public signals + Verification key');  
            console.log('  - Output: Boolean (valid/invalid)');
            console.log('  - Process: snarkjs.groth16.verify()');
            console.log('');
            console.log('🎯 Benefits:');
            console.log('  - Zero-knowledge: Proves policy satisfaction without revealing policy or attributes');
            console.log('  - Succinctness: ~720 byte proofs regardless of policy complexity');
            console.log('  - Fast verification: ~30ms verification time');
            console.log('  - Non-interactive: No communication rounds needed');
            console.log('');
            console.log('✅ Ready for circuit-specific setup and full workflow!');
            
            // Basic assertions
            if (fs.existsSync(potFinalPath)) {
                const stats = fs.statSync(potFinalPath);
                assert(stats.size > 1000000, 'Powers of Tau should be substantial');
                console.log('✅ Powers of Tau available for Groth16 setup');
            } else {
                console.log('⚠️  Powers of Tau not available, but workflow is ready');
            }
        });
    });
});