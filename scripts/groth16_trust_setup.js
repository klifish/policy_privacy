const { execSync } = require('child_process');
const axios = require('axios')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const circuitsPath = __dirname + '/../build/circuits'

async function downloadFile({ url, path }) {
    const temporaryPath = `${path}.part`;
    const writer = fs.createWriteStream(temporaryPath)

    let response;
    try {
        response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
        });
    } catch (error) {
        writer.destroy();
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        throw error;
    }

    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            try {
                if (fs.statSync(temporaryPath).size === 0) throw new Error('Downloaded ceremony file is empty');
                fs.renameSync(temporaryPath, path);
                resolve();
            } catch (error) {
                if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
                reject(error);
            }
        })
        writer.on('error', (error) => {
            if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
            reject(error);
        })
    })
}

function runCommand(command, displayCommand = command) {
    console.log(`Running: ${displayCommand}`);
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
            // DUO V3 has ~605k constraints, which requires a power-20 ceremony
            // (power-18 only supports 262,144 constraints). The historic Hermez
            // Google Cloud mirror is no longer anonymously readable. PSE hosts a
            // phase-2-ready BN254 ceremony file from the perpetual ceremony.
            const ptauUrl = process.env.PTAU_URL || "https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_20.ptau";
            const ptau_final = "ppot_0080_20.ptau";
            const ptau_path = process.env.PTAU_PATH || path.resolve(__dirname, circuitsPath, ptau_final);

            // Download ptau file if it doesn't exist
            if (fs.existsSync(ptau_path) && fs.statSync(ptau_path).size === 0) {
                fs.unlinkSync(ptau_path);
            }
            if (!fs.existsSync(ptau_path)) {
                console.log(`Downloading ptau file ...`)
                await downloadFile({
                    url: ptauUrl,
                    path: ptau_path,
                })
            } else {
                console.log(`Using existing ptau file: ${ptau_path}`)
            }

            // A full transcript verification checks every historic ceremony
            // contribution and can take hours for power-20. Enable it in a
            // dedicated ceremony-audit environment; the regular build still
            // runs `zkey verify` below against this exact circuit and PTAU.
            if (process.env.VERIFY_PTAU_TRANSCRIPT === '1') {
                console.log('Verifying Powers of Tau ceremony transcript...')
                runCommand(`npx snarkjs powersoftau verify ${ptau_path}`);
            } else {
                console.log('Skipping exhaustive PTAU transcript audit (set VERIFY_PTAU_TRANSCRIPT=1 to enable).')
            }

            console.log('Groth16 setup for PolicyPrivacyMain circuit...')

            // Phase 1: Generate proving and verification keys
            console.log('Phase 1: Generating proving and verification keys...')
            runCommand(`npx snarkjs groth16 setup build/circuits/policy_privacy_main_instance.r1cs ${ptau_path} build/circuits/policy_privacy_main_0000.zkey`);

            // Phase 2: Contribute to the ceremony (for production, this should be done by multiple parties)
            console.log('Phase 2: Contributing to ceremony...')
            // Generate fresh operating-system CSPRNG entropy for this local
            // contribution. Keep it out of source, command logs, and artifacts.
            // A production ceremony still needs independent contributions.
            const localEntropy = crypto.randomBytes(64).toString('hex');
            runCommand(
                `npx snarkjs zkey contribute build/circuits/policy_privacy_main_0000.zkey build/circuits/policy_privacy_main_0001.zkey --name="local-operator" --entropy="${localEntropy}"`,
                'npx snarkjs zkey contribute build/circuits/policy_privacy_main_0000.zkey build/circuits/policy_privacy_main_0001.zkey --name="local-operator" --entropy="[redacted]"'
            );

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
