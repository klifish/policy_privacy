const fs = require('fs');
const snarkjs = require("snarkjs");
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');



// Function to download file from URL
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`  - Downloading: ${url}`);
        const file = fs.createWriteStream(filePath);
        
        https.get(url, (response) => {
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.pipe(file);
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                process.stdout.write(`\r    Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB/${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
            });
            
            file.on('finish', () => {
                file.close();
                console.log('\n  ✅ Download completed');
                resolve();
            });
            
            file.on('error', (err) => {
                fs.unlink(filePath, () => {}); // Delete the file on error
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

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

async function setupZkSnarkKeys(wasmPath, r1csPath, zkeyPath, vkeyPath) {
    // Check if keys already exist
    if (fs.existsSync(zkeyPath) && fs.existsSync(vkeyPath)) {
        console.log('zk-SNARK keys already exist, skipping setup');
        return;
    }

    if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
        console.log('Circuit files not found, skipping zk-SNARK setup');
        return;
    }

    console.log('🔧 Generating zk-SNARK setup automatically...');

    try {
        // Create build directories
        const buildDir = path.join(__dirname, "../build");
        const setupDir = path.join(buildDir, "setup");
        if (!fs.existsSync(setupDir)) {
            fs.mkdirSync(setupDir, { recursive: true });
        }

        // Powers of Tau file paths
        const pot0Path = path.join(setupDir, "pot10_0000.ptau");
        const pot1Path = path.join(setupDir, "pot10_0001.ptau");
        const potFinalPath = path.join(setupDir, "pot10_final.ptau");
        const zkey0Path = zkeyPath.replace('_final.zkey', '_0000.zkey');

        // Step 1: Download Powers of Tau if not exists
        if (!fs.existsSync(potFinalPath)) {
            console.log('📋 Step 1: Downloading Powers of Tau trusted setup...');
            
            const powersOfTauUrl = 'https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau';
            await downloadFile(powersOfTauUrl, potFinalPath);
            
            console.log('  ✅ Powers of Tau trusted setup downloaded');
        } else {
            console.log('📋 Step 1: Powers of Tau file already exists, skipping download...');
        }

        // Step 2: Generate circuit-specific keys
        console.log('📋 Step 2: Generating circuit-specific keys...');

        // Initialize zkey with Powers of Tau
        console.log('  - Creating initial zkey...');
        await execSnarkjs(['zkey', 'new', r1csPath, potFinalPath, zkey0Path]);
        console.log('  ✅ Initial zkey created');

        // Contribute to zkey using non-interactive beacon approach
        console.log('  - Contributing to zkey (non-interactive beacon)...');
        const zkeyBeaconHash = '0000000000000000000000000000000000000000000000000000000000000001'; // Test beacon hash for zkey
        await execSnarkjs(['zkey', 'beacon', zkey0Path, zkeyPath, zkeyBeaconHash, '16']);
        console.log('  ✅ Final zkey created');

        // Export verification key
        console.log('  - Exporting verification key...');
        await execSnarkjs(['zkey', 'export', 'verificationkey', zkeyPath, vkeyPath]);
        console.log('  ✅ Verification key exported');

        // Cleanup intermediate zkey
        // if (fs.existsSync(zkey0Path)) fs.unlinkSync(zkey0Path);

        console.log('🎉 Complete zk-SNARK setup finished successfully!');
        console.log('  - Powers of Tau: ' + path.basename(potFinalPath) + ' (downloaded from trusted setup)');
        console.log('  - Proving key: ' + path.basename(zkeyPath));
        console.log('  - Verification key: ' + path.basename(vkeyPath));

    } catch (error) {
        console.error('❌ zk-SNARK setup failed:', error.message);
        console.log('Falling back to witness-only testing');
        // Don't throw - allow tests to continue with witness generation only
    }
}

module.exports = { execSnarkjs, setupZkSnarkKeys, downloadFile };