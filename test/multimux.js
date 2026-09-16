const path = require('path');
const wasm_tester = require('circom_tester').wasm;

// MultiMux4 selects in[sel] for a 2-bit selector (sel[0] is the low bit).
describe('Multimux Test', function () {
  this.timeout(100000);

  let circuit;

  before(async function () {
    circuit = await wasm_tester(path.join(__dirname, 'circuits', 'test_multimux.circom'));
  });

  it('selects the second input', async () => {
    const witness = await circuit.calculateWitness({ in: [10, 20, 30, 40], sel: [1, 0] }, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, { out: 20 });
  });

  it('selects the fourth input', async () => {
    const witness = await circuit.calculateWitness({ in: [10, 20, 30, 40], sel: [1, 1] }, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, { out: 40 });
  });
});
