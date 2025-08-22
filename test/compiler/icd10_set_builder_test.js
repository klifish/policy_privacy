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

    it('should build from tree + roots using closure', function () {
        const treeFile = path.join(testDir, 'icd10_tree.json');
        const closureOutputFile = path.join(testDir, 'allowed_set_closure.json');
        
        // Create a simple ICD-10 tree structure
        const treeData = {
            'E10': ['E10.0', 'E10.1', 'E10.9'],
            'E11': ['E11.0', 'E11.1', 'E11.9'],
            'E10.0': ['E10.00', 'E10.01'],
            'E10.1': ['E10.10', 'E10.11']
        };
        fs.writeFileSync(treeFile, JSON.stringify(treeData, null, 2));

        // Build using tree + roots
        execSync(`node ${builderScript} build --tree ${treeFile} --roots E10,E11 --version-root 0x5678 --out ${closureOutputFile}`);

        // Verify output file exists
        expect(fs.existsSync(closureOutputFile)).to.be.true;

        // Read and verify content
        const content = fs.readFileSync(closureOutputFile, 'utf8');
        const data = JSON.parse(content);
        
        expect(data).to.have.property('version_root', '0x5678');
        expect(data).to.have.property('root');
        expect(data).to.have.property('leaves');
        
        // Verify closure includes all descendants
        const codes = data.leaves.map(leaf => leaf.code);
        expect(codes).to.include.members(['E10', 'E11', 'E10.0', 'E10.1', 'E10.9', 'E11.0', 'E11.1', 'E11.9', 'E10.00', 'E10.01', 'E10.10', 'E10.11']);
        
        // Clean up
        if (fs.existsSync(treeFile)) fs.unlinkSync(treeFile);
        if (fs.existsSync(closureOutputFile)) fs.unlinkSync(closureOutputFile);
        if (fs.existsSync(closureOutputFile.replace('.json', '.layers.json'))) {
            fs.unlinkSync(closureOutputFile.replace('.json', '.layers.json'));
        }
    });

    it('should handle single code input', function () {
        const singleCodeFile = path.join(testDir, 'single_code.txt');
        const singleOutputFile = path.join(testDir, 'single_allowed_set.json');
        
        // Write single code file
        fs.writeFileSync(singleCodeFile, 'A00\n');
        
        // Build with single code
        execSync(`node ${builderScript} build --codes ${singleCodeFile} --version-root 0x9999 --out ${singleOutputFile}`);
        
        // Verify
        expect(fs.existsSync(singleOutputFile)).to.be.true;
        const data = JSON.parse(fs.readFileSync(singleOutputFile, 'utf8'));
        expect(data.leaves).to.have.length(1);
        expect(data.leaves[0].code).to.equal('A00');
        
        // Clean up
        if (fs.existsSync(singleCodeFile)) fs.unlinkSync(singleCodeFile);
        if (fs.existsSync(singleOutputFile)) fs.unlinkSync(singleOutputFile);
        if (fs.existsSync(singleOutputFile.replace('.json', '.layers.json'))) {
            fs.unlinkSync(singleOutputFile.replace('.json', '.layers.json'));
        }
    });

    it('should normalize ICD-10 codes correctly', function () {
        const mixedCaseFile = path.join(testDir, 'mixed_case.txt');
        const normalizedOutputFile = path.join(testDir, 'normalized_allowed_set.json');
        
        // Write codes with mixed case and extra whitespace
        fs.writeFileSync(mixedCaseFile, '  a00  \n B01\n\tc02 \n A00\n'); // Note duplicate A00
        
        // Build
        execSync(`node ${builderScript} build --codes ${mixedCaseFile} --version-root 0xABCD --out ${normalizedOutputFile}`);
        
        // Verify normalization and deduplication
        const data = JSON.parse(fs.readFileSync(normalizedOutputFile, 'utf8'));
        const codes = data.leaves.map(leaf => leaf.code).sort();
        expect(codes).to.deep.equal(['A00', 'B01', 'C02']); // Should be uppercase, trimmed, and deduplicated
        
        // Clean up
        if (fs.existsSync(mixedCaseFile)) fs.unlinkSync(mixedCaseFile);
        if (fs.existsSync(normalizedOutputFile)) fs.unlinkSync(normalizedOutputFile);
        if (fs.existsSync(normalizedOutputFile.replace('.json', '.layers.json'))) {
            fs.unlinkSync(normalizedOutputFile.replace('.json', '.layers.json'));
        }
    });

    it('should handle both hex and decimal version roots', function () {
        const hexOutputFile = path.join(testDir, 'hex_version_root.json');
        const decimalOutputFile = path.join(testDir, 'decimal_version_root.json');
        
        // Test hex version root
        execSync(`node ${builderScript} build --codes ${codesFile} --version-root 0x1234ABCD --out ${hexOutputFile}`);
        const hexData = JSON.parse(fs.readFileSync(hexOutputFile, 'utf8'));
        expect(hexData.version_root).to.equal('0x1234ABCD');
        
        // Test decimal version root
        execSync(`node ${builderScript} build --codes ${codesFile} --version-root 123456789 --out ${decimalOutputFile}`);
        const decimalData = JSON.parse(fs.readFileSync(decimalOutputFile, 'utf8'));
        expect(decimalData.version_root).to.equal('123456789');
        
        // Clean up
        if (fs.existsSync(hexOutputFile)) fs.unlinkSync(hexOutputFile);
        if (fs.existsSync(hexOutputFile.replace('.json', '.layers.json'))) {
            fs.unlinkSync(hexOutputFile.replace('.json', '.layers.json'));
        }
        if (fs.existsSync(decimalOutputFile)) fs.unlinkSync(decimalOutputFile);
        if (fs.existsSync(decimalOutputFile.replace('.json', '.layers.json'))) {
            fs.unlinkSync(decimalOutputFile.replace('.json', '.layers.json'));
        }
    });

    it('should fail with missing required arguments', function () {
        // Missing --out argument
        expect(() => {
            execSync(`node ${builderScript} build --codes ${codesFile} --version-root 0x1234`, { encoding: 'utf8' });
        }).to.throw();
        
        // Missing --version-root argument
        expect(() => {
            execSync(`node ${builderScript} build --codes ${codesFile} --out ${outputFile}`, { encoding: 'utf8' });
        }).to.throw();
        
        // Missing both --codes and --tree/--roots
        expect(() => {
            execSync(`node ${builderScript} build --version-root 0x1234 --out ${outputFile}`, { encoding: 'utf8' });
        }).to.throw();
    });

    it('should fail with invalid tree structure', function () {
        const invalidTreeFile = path.join(testDir, 'invalid_tree.json');
        const invalidOutputFile = path.join(testDir, 'invalid_output.json');
        
        // Create invalid tree (children not arrays)
        const invalidTreeData = {
            'E10': 'E10.0', // Should be array, not string
            'E11': ['E11.0', 'E11.1']
        };
        fs.writeFileSync(invalidTreeFile, JSON.stringify(invalidTreeData));
        
        expect(() => {
            execSync(`node ${builderScript} build --tree ${invalidTreeFile} --roots E10 --version-root 0x1234 --out ${invalidOutputFile}`);
        }).to.throw();
        
        // Clean up
        if (fs.existsSync(invalidTreeFile)) fs.unlinkSync(invalidTreeFile);
    });

    it('should handle empty closure from non-existent roots', function () {
        const emptyTreeFile = path.join(testDir, 'empty_tree.json');
        const emptyOutputFile = path.join(testDir, 'empty_output.json');
        
        // Create tree that doesn't contain the requested roots
        const treeData = {
            'E10': ['E10.0', 'E10.1']
        };
        fs.writeFileSync(emptyTreeFile, JSON.stringify(treeData));
        
        // Try to build with roots that don't exist in tree
        execSync(`node ${builderScript} build --tree ${emptyTreeFile} --roots Z99,Z98 --version-root 0x1234 --out ${emptyOutputFile}`);
        
        // Should create valid output with just the root codes (even if not in tree)
        expect(fs.existsSync(emptyOutputFile)).to.be.true;
        const data = JSON.parse(fs.readFileSync(emptyOutputFile, 'utf8'));
        const codes = data.leaves.map(leaf => leaf.code).sort();
        expect(codes).to.deep.equal(['Z98', 'Z99']); // Should contain the roots even if no children found
        
        // Clean up
        if (fs.existsSync(emptyTreeFile)) fs.unlinkSync(emptyTreeFile);
        if (fs.existsSync(emptyOutputFile)) fs.unlinkSync(emptyOutputFile);
        if (fs.existsSync(emptyOutputFile.replace('.json', '.layers.json'))) {
            fs.unlinkSync(emptyOutputFile.replace('.json', '.layers.json'));
        }
    });
});
