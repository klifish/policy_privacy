const path = require('path');
const fs = require('fs');
const snarkjs = require('snarkjs');

describe('Multimux Test', function () {
  this.timeout(100000);

  let wasmPath, r1csPath;

  before(async () => {
    wasmPath = path.join(__dirname, '..', 'build', 'circuits', 'test_multimux_js', 'test_multimux.wasm');
    r1csPath = path.join(__dirname, '..', 'build', 'circuits', 'test_multimux.r1cs');
    
    if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
      console.log("Circuit files not found. Run 'npm run build:circuit' first.");
      console.log("Expected files:");
      console.log("  -", wasmPath);
      console.log("  -", r1csPath);
      this.skip();
    }
  });

  it('selects the second input', async () => {
    const input = {
      in: [10, 20, 30, 40],
      sel: [1, 0]
    };

    const witness = await snarkjs.wtns.calculate(input, wasmPath);
    
    // Output should be the second input (20)
    const output = witness[1]; 
    if (Number(output) !== 20) {
      throw new Error(`Expected output 20, got ${output}`);
    }
  });

  it('selects the fourth input', async () => {
    const input = {
      in: [10, 20, 30, 40],
      sel: [1, 1]
    };

    const witness = await snarkjs.wtns.calculate(input, wasmPath);
    
    // Output should be the fourth input (40)
    const output = witness[1];
    if (Number(output) !== 40) {
      throw new Error(`Expected output 40, got ${output}`);
    }
  });
});

