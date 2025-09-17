const { execSync } = require('child_process');
const axios = require('axios')
const path = require('path')
const fs = require('fs')

const circuitsPath = __dirname + '/../build/circuits'

async function downloadFile({ url, path }) {
    const writer = fs.createWriteStream(path)
  
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    })
  
    response.data.pipe(writer)
  
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
  }

function runCommand(command) {
    console.log(`Running: ${command}`);
    try {
        const result = execSync(command, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
        return result;
    } catch (error) {
        console.error(`Error running command: ${command}`);
        throw error;
    }
}

(
    async () => {
        try {
            const ptauUrl = "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau"
            const ptau_final = "powersOfTau28_hez_final_16.ptau";
            const ptau_path = path.resolve(__dirname, circuitsPath, ptau_final);
            
            // Download ptau file if it doesn't exist
            if (!fs.existsSync(ptau_path)) {
                console.log(`Downloading ptau file ...`)
                await downloadFile({
                  url: ptauUrl,
                  path: ptau_path,
                })
            } else {
                console.log(`Using existing ptau file: ${ptau_path}`)
            }
            
            console.log('Groth16 setup for PolicyPrivacyMain circuit...')
            
            // Phase 1: Generate proving and verification keys
            console.log('Phase 1: Generating proving and verification keys...')
            runCommand(`npx snarkjs groth16 setup build/circuits/policy_privacy_main_instance.r1cs ${ptau_path} build/circuits/policy_privacy_main_0000.zkey`);
            
            // Phase 2: Contribute to the ceremony (for production, this should be done by multiple parties)
            console.log('Phase 2: Contributing to ceremony...')
            runCommand(`npx snarkjs zkey contribute build/circuits/policy_privacy_main_0000.zkey build/circuits/policy_privacy_main_0001.zkey --name="coordinator" --entropy="entropy for coordinator"`);
            
            // Final beacon
            console.log('Phase 2: Applying final beacon...')
            runCommand(`npx snarkjs zkey beacon build/circuits/policy_privacy_main_0001.zkey build/circuits/policy_privacy_main_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 --name="Final Beacon phase2"`);
            
            // Verify the zkey
            console.log('Verifying final zkey...')
            runCommand(`npx snarkjs zkey verify build/circuits/policy_privacy_main_instance.r1cs ${ptau_path} build/circuits/policy_privacy_main_final.zkey`);
            
            console.log('Groth16 setup completed successfully!')
            process.exit(0);

        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    }
)();