const snarkjs = require("snarkjs");
const axios = require('axios')
const path = require('path')
const fs = require('fs')

const circuitsPath = __dirname + '/../build/circuits'
const contractsPath = __dirname + '/../build/contracts'

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

(
    async () => {
        try {
            const ptauUrl = "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau"
            const ptau_final = "powersOfTau28_hez_final_16.ptau";
            const ptau_path = path.resolve(__dirname, circuitsPath, ptau_final);
            console.log(`Downloading ptau file ...`)
            await downloadFile({
              url: ptauUrl,
              path: ptau_path,
            })
            
            console.log('Plonk setup...')
            const r1cs_file = "build/circuits/commitment.r1cs";
            await snarkjs.plonk.setup(r1cs_file, ptau_path, "build/circuits/commitment_final.zkey", console);

            process.exit(0);

        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    }
)();