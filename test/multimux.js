const path = require('path');
const wasm_tester = require("circom_tester").wasm;

describe("Multimux Test", function () {
    this.timeout(100000);

    let circuit;

    before(async () => {
        circom_path = path.join(__dirname, "circuits", "test_multimux.circom");
        console.log(`Loading circuit from: ${circom_path}`);
        circuit = await wasm_tester(path.join(__dirname, "circuits", "test_multimux.circom"));
    });

    it("should compute the correct output for a simple case", async () => {
        const input = {
            a: 1,
            b: 2,
            c: 3,
            d: 4,
            e: 5,
            f: 6,
            g: 7,
            h: 8
        };

        const witness = await circuit.calculateWitness(input);
        await circuit.checkConstraints(witness);
        const output = await circuit.getOutput(witness);

        // Check if the output is as expected
        // Replace with actual expected output based on your circuit logic
        console.log(output);
    });
});