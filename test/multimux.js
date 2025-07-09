const path = require('path');const wasm_tester = require('circom_tester').wasm;

describe('Multimux Test', function () {
  this.timeout(100000);

  let circuit;

  before(async () => {
    circuit = await wasm_tester(path.join(__dirname, 'circuits', 'test_multimux.circom'));
  });

  it('selects the second input', async () => {
    const input = {
      in: [10, 20, 30, 40],
      sel: [1, 0]
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, { out: 20 });
  });

  it('selects the fourth input', async () => {
    const input = {
      in: [10, 20, 30, 40],
      sel: [1, 1]
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, { out: 40 });
  });
});

