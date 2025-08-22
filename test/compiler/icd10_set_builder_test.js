const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const circomlibjs = require('circomlibjs');

describe('ICD10 Set Builder', function () {
    const builderScript = path.resolve(__dirname, '../../compiler/icd10_set_builder.js');
    const testDir = path.resolve(__dirname, '../../examples/icd10_case');
    const codesFile = path.join(testDir, 'codes.txt');
    const outputFile = path.join(testDir, 'allowed_set.json');

    // Prepare test data directory and codes.txt before tests
    before(function () {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }
        // Write a small codes.txt file with a few ICD10 codes
        fs.writeFileSync(codesFile, 'A00\nB00\nC00\nD00\nE00\n');
    });

    // Clean up output file after tests
    after(function () {
        // if (fs.existsSync(outputFile)) {
        //     fs.unlinkSync(outputFile);
        // }
        // if (fs.existsSync(codesFile)) {
        //     fs.unlinkSync(codesFile);
        // }
        // if (fs.existsSync(testDir)) {
        //     fs.rmdirSync(testDir);
        // }
    });

    it('should build allowed_set.json with expected fields', function () {
        // Run the build command
        execSync(`node ${builderScript} build --codes ${codesFile} --version-root 0x1234 --out ${outputFile}`);

        // Check that allowed_set.json is created
        expect(fs.existsSync(outputFile)).to.be.true;

        // Read and parse allowed_set.json
        const content = fs.readFileSync(outputFile, 'utf8');
        const data = JSON.parse(content);

        // Check for expected keys in the JSON output
        expect(data).to.be.an('object');
        expect(data).to.have.property('root');
        expect(data).to.have.property('leaves');
        expect(data.leaves).to.be.an('array').that.is.not.empty;
    });

    it('should return a Merkle path for an existing code', function () {
        // Ensure allowed_set.json exists before running path command
        if (!fs.existsSync(outputFile)) {
            execSync(`node ${builderScript} build --codes ${codesFile} --version-root 0x1234 --out ${outputFile}`);
        }

        // Run the path command for a code that exists
        const code = 'A00';
        const output = execSync(`node ${builderScript} path --code ${code} --in ${outputFile}`, { encoding: 'utf8' });
        const pathData = JSON.parse(output);

        // Check that the path data contains expected keys
        expect(pathData).to.be.an('object');
        expect(pathData).to.have.property('code', code);
        expect(pathData).to.have.property('path');
        expect(pathData.path).to.be.an('array');
    });

    it('should recompute root from path and match stored root', async function () {
        // Ensure allowed_set.json exists
        if (!fs.existsSync(outputFile)) {
            execSync(`node ${builderScript} build --codes ${codesFile} --version-root 0x1234 --out ${outputFile}`);
        }

        // Get path for existing code
        const code = 'A00';
        const output = execSync(`node ${builderScript} path --code ${code} --in ${outputFile}`, { encoding: 'utf8' });
        const pathData = JSON.parse(output);

        // Load allowed_set.json to get root
        const setData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
        const expectedRoot = setData.root; // hex string

        // Recompute root from path using the same encoding as the builder:
        // start from leaf (hex) and fold siblings according to pathPos.
        const poseidon = await circomlibjs.buildPoseidon();
        const F = poseidon.F;
        const hexToBI = (h) => BigInt(h);

        let cur = hexToBI(pathData.leaf); // start from provided leaf (hex)
        for (let i = 0; i < pathData.path.length; i++) {
            const sib = hexToBI(pathData.path[i]);
            const isRightChild = pathData.pathPos[i] === 1; // 1 => current was right child
            const left  = isRightChild ? sib : cur;
            const right = isRightChild ? cur : sib;
            const h = poseidon([left, right]);
            cur = BigInt(F.toString(h));
        }
        const computedRootHex = '0x' + cur.toString(16);
        expect(computedRootHex).to.equal(expectedRoot);
    });

    it('should fail for non-existent code', function () {
        expect(() => {
            execSync(`node ${builderScript} path --code Z99 --in ${outputFile}`, { encoding: 'utf8' });
        }).to.throw();
    });
});
