/****
 * Mocha test suite for compiler/duo_policy_compiler.ts
 *
 *
 * Requirements:
 *   - Node.js runtime
 *   - circomlibjs installed (dependency)
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { expect } = require("chai");

const ROOT = path.resolve(__dirname, "../..");
// Use the JS compiler now that we converted the implementation to CommonJS
const COMPILER_JS = path.join(ROOT, "compiler/duo_policy_compiler.js");
const EXAMPLES_DIR = path.join(ROOT, "examples/diabetes_case");
const IN_JSON = path.join(EXAMPLES_DIR, "policy.input.json");
const OUT_JSON = path.join(EXAMPLES_DIR, "policy.public.json");

function run(cmd, opts = {}) {
    return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function cleanOutput() {
    try { fs.unlinkSync(OUT_JSON); } catch { }
}

describe("duo_policy_compiler", function () {
    this.timeout(20000);

    before(() => {
        // Ensure example input exists
        if (!fs.existsSync(IN_JSON)) {
            throw new Error(`Missing example input: ${IN_JSON}`);
        }
    });

    it("[1] compiles example policy and encodes tokens correctly", () => {
        cleanOutput();
        const cmd = `node ${COMPILER_JS} --in ${IN_JSON} --out ${OUT_JSON}`;
        const log = run(cmd);
        console.log(log);

        expect(fs.existsSync(OUT_JSON)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));

        // Field sanity
        // expect(out.policy_id).to.be.a("string");
        // expect(out.dataset_id).to.be.a("string");
        expect(out.N).to.be.a("number").and.satisfy(n => Number.isInteger(n) && n > 0);
        expect(out.tokens).to.be.an("array");
        expect(out.policy_commitment).to.match(/^0x[0-9a-fA-F]+$/);
        expect(out.atom_meta_hash).to.match(/^0x[0-9a-fA-F]+$/);

        // Token encoding check for expr: (disease_term AND access_time) AND institution
        // nameToIdx: disease_term -> 0, access_time -> 1, institution -> 2 (N=3)
        // RPN: [0, 1, AND, 2, AND] => [0, 1, 3, 2, 3]
        const expected = [0, 1, 3, 2, 3];
        expect(out.N).to.equal(3);
        expect(out.tokens.length).to.be.at.least(expected.length);
        for (let i = 0; i < expected.length; i++) {
            expect(out.tokens[i]).to.equal(expected[i]);
        }
    });

    it("[2] produces deterministic commitments across runs", () => {
        const first = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
        const cmd = `node ${COMPILER_JS} --in ${IN_JSON} --out ${OUT_JSON}`;
        run(cmd);
        const second = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
        expect(first.policy_commitment).to.equal(second.policy_commitment);
        expect(first.atom_meta_hash).to.equal(second.atom_meta_hash);
    });

    it("[3] fails on unknown atom reference", () => {
        const bad = {
            policy_id: "pol_bad",
            dataset_id: "ds_x",
            atoms: [{ type: "EQ_HASH", params: { name: "only_one", expected_hash: "0x1" } }],
            expr: "only_one AND does_not_exist"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.bad.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.bad.public.json");
        fs.writeFileSync(tmpIn, JSON.stringify(bad, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const res = spawnSync(cmd, { shell: true, encoding: "utf8" });
        expect(res.status).to.not.equal(0);
        expect((res.stderr || "") + (res.stdout || "")).to.match(/Unknown atom reference/);
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[4] fails when missing required arguments", () => {
        // Test missing --in argument
        const cmd1 = `node ${COMPILER_JS} --out ${OUT_JSON}`;
        const res1 = spawnSync(cmd1, { shell: true, encoding: "utf8" });
        expect(res1.status).to.not.equal(0);
        expect((res1.stderr || "") + (res1.stdout || "")).to.match(/Usage:/);

        // Test missing --out argument
        const cmd2 = `node ${COMPILER_JS} --in ${IN_JSON}`;
        const res2 = spawnSync(cmd2, { shell: true, encoding: "utf8" });
        expect(res2.status).to.not.equal(0);
        expect((res2.stderr || "") + (res2.stdout || "")).to.match(/Usage:/);
    });

    it("[5] handles simple single atom expressions", () => {
        const simple = {
            policy_id: "pol_simple",
            dataset_id: "ds_simple",
            atoms: [
                { type: "EQ_HASH", params: { name: "single_atom", expected_hash: "0x123" } }
            ],
            expr: "single_atom"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.simple.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.simple.public.json");
        
        fs.writeFileSync(tmpIn, JSON.stringify(simple, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(1);
        expect(out.tokens).to.deep.equal([0]); // Single atom reference
        expect(out.atom_catalog).to.have.lengthOf(1);
        expect(out.atom_catalog[0].index).to.equal(0);
        expect(out.atom_catalog[0].type).to.equal("EQ_HASH");

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[6] handles NOT operator correctly", () => {
        const notExpr = {
            policy_id: "pol_not",
            dataset_id: "ds_not", 
            atoms: [
                { type: "EQ_HASH", params: { name: "test_atom", expected_hash: "0x456" } }
            ],
            expr: "NOT test_atom"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.not.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.not.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(notExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(1);
        // RPN: test_atom NOT => [0, NOT] => [0, N+2] => [0, 3]
        expect(out.tokens).to.deep.equal([0, 3]);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[7] handles OR operator and precedence", () => {
        const orExpr = {
            policy_id: "pol_or",
            dataset_id: "ds_or",
            atoms: [
                { type: "EQ_HASH", params: { name: "atom_a", expected_hash: "0x111" } },
                { type: "EQ_HASH", params: { name: "atom_b", expected_hash: "0x222" } },
                { type: "EQ_HASH", params: { name: "atom_c", expected_hash: "0x333" } }
            ],
            expr: "atom_a OR atom_b AND atom_c"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.or.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.or.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(orExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(3);
        // Due to precedence: atom_a OR (atom_b AND atom_c)
        // RPN: atom_a atom_b atom_c AND OR => [0, 1, 2, AND, OR] => [0, 1, 2, N+0, N+1] => [0, 1, 2, 3, 4]
        expect(out.tokens).to.deep.equal([0, 1, 2, 3, 4]);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[8] handles complex nested parentheses", () => {
        const complexExpr = {
            policy_id: "pol_complex",
            dataset_id: "ds_complex",
            atoms: [
                { type: "EQ_HASH", params: { name: "a", expected_hash: "0x111" } },
                { type: "EQ_HASH", params: { name: "b", expected_hash: "0x222" } },
                { type: "EQ_HASH", params: { name: "c", expected_hash: "0x333" } },
                { type: "EQ_HASH", params: { name: "d", expected_hash: "0x444" } }
            ],
            expr: "(a OR b) AND (c OR d)"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.complex.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.complex.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(complexExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(4);
        // RPN: (a OR b) AND (c OR d) => a b OR c d OR AND => [0, 1, OR, 2, 3, OR, AND] => [0, 1, N+1, 2, 3, N+1, N+0] => [0, 1, 5, 2, 3, 5, 4]
        expect(out.tokens).to.deep.equal([0, 1, 5, 2, 3, 5, 4]);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[9] handles atoms without explicit names (uses A0, A1, etc.)", () => {
        const noNamesExpr = {
            policy_id: "pol_no_names",
            dataset_id: "ds_no_names",
            atoms: [
                { type: "EQ_HASH", params: { expected_hash: "0x111" } },
                { type: "EQ_HASH", params: { expected_hash: "0x222" } }
            ],
            expr: "A0 AND A1"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.no_names.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.no_names.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(noNamesExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(2);
        expect(out.tokens).to.deep.equal([0, 1, 2]); // A0 A1 AND => [0, 1, N+0] => [0, 1, 2]

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[10] validates output structure completeness", () => {
        // Reuse existing output from test [1]
        const out = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));

        // Check all required fields exist (note: policy_id and dataset_id are optional passthrough)
        expect(out).to.have.property('N');
        expect(out).to.have.property('tokens');
        expect(out).to.have.property('policy_commitment');
        expect(out).to.have.property('atom_meta_hash');
        expect(out).to.have.property('atom_catalog');

        // Validate types
        expect(out.N).to.be.a('number');
        expect(out.tokens).to.be.an('array');
        expect(out.policy_commitment).to.be.a('string');
        expect(out.atom_meta_hash).to.be.a('string');
        expect(out.atom_catalog).to.be.an('array');

        // Validate atom_catalog structure
        out.atom_catalog.forEach((atom, i) => {
            expect(atom).to.have.property('index', i);
            expect(atom).to.have.property('type');
            expect(atom).to.have.property('params');
            expect(atom.type).to.be.a('string');
            expect(atom.params).to.be.an('object');
        });
    });

    it("[11] fails gracefully on malformed JSON input", () => {
        const tmpIn = path.join(EXAMPLES_DIR, "policy.malformed.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.malformed.public.json");
        
        // Write invalid JSON
        fs.writeFileSync(tmpIn, "{ invalid json content");
        
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const res = spawnSync(cmd, { shell: true, encoding: "utf8" });
        
        expect(res.status).to.not.equal(0);
        expect((res.stderr || "") + (res.stdout || "")).to.match(/(Unexpected|JSON|parse)/i);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[12] fails on empty atoms array", () => {
        const emptyAtoms = {
            policy_id: "pol_empty",
            dataset_id: "ds_empty",
            atoms: [],
            expr: "some_atom"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.empty.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.empty.public.json");
        
        fs.writeFileSync(tmpIn, JSON.stringify(emptyAtoms, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const res = spawnSync(cmd, { shell: true, encoding: "utf8" });
        
        expect(res.status).to.not.equal(0);
        expect((res.stderr || "") + (res.stdout || "")).to.match(/Unknown atom reference/);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[13] handles mismatched parentheses", () => {
        const mismatchedExpr = {
            policy_id: "pol_mismatch",
            dataset_id: "ds_mismatch",
            atoms: [
                { type: "EQ_HASH", params: { name: "test", expected_hash: "0x111" } }
            ],
            expr: "(test AND"  // Missing closing parenthesis
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.mismatch.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.mismatch.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(mismatchedExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const res = spawnSync(cmd, { shell: true, encoding: "utf8" });

        expect(res.status).to.not.equal(0);
        expect((res.stderr || "") + (res.stdout || "")).to.match(/parentheses/i);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[14] handles different atom types correctly", () => {
        const multiTypeExpr = {
            policy_id: "pol_types",
            dataset_id: "ds_types",
            atoms: [
                {
                    type: "ONT_IN_SET",
                    params: { name: "ont_atom" }
                },
                {
                    type: "TIME_WINDOW",
                    params: { name: "time_atom", t0: 1000000, t1: 2000000 },
                    publicParams: ["t0", "t1"]
                },
                {
                    type: "EQ_HASH",
                    params: { name: "hash_atom", expected_hash: "0xdeadbeef" }
                }
            ],
            expr: "ont_atom AND time_atom OR hash_atom"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.types.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.types.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(multiTypeExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(3);
        expect(out.atom_catalog).to.have.lengthOf(3);
        
        // Verify atom types are preserved
        expect(out.atom_catalog[0].type).to.equal("ONT_IN_SET");
        expect(out.atom_catalog[1].type).to.equal("TIME_WINDOW");
        expect(out.atom_catalog[2].type).to.equal("EQ_HASH");

        // Verify publicParams are preserved
        expect(out.atom_catalog[1].publicParams).to.deep.equal(["t0", "t1"]);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[15] handles nested NOT operations", () => {
        const nestedNotExpr = {
            policy_id: "pol_nested_not",
            dataset_id: "ds_nested_not",
            atoms: [
                { type: "EQ_HASH", params: { name: "a", expected_hash: "0x111" } },
                { type: "EQ_HASH", params: { name: "b", expected_hash: "0x222" } }
            ],
            expr: "NOT (NOT a AND b)"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.nested_not.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.nested_not.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(nestedNotExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(2);
        // RPN: NOT (NOT a AND b) => a NOT b AND NOT => [0, NOT, 1, AND, NOT] => [0, 4, 1, 2, 4]
        expect(out.tokens).to.deep.equal([0, 4, 1, 2, 4]);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });

    it("[16] handles atoms with complex parameter structures", () => {
        const complexParamsExpr = {
            policy_id: "pol_complex_params",
            dataset_id: "ds_complex_params",
            atoms: [
                {
                    type: "COMPLEX_ATOM",
                    params: {
                        name: "complex",
                        nested: { key: "value", number: 42 },
                        array: [1, 2, 3],
                        string: "test"
                    },
                    publicParams: ["nested", "array"]
                }
            ],
            expr: "complex"
        };
        const tmpIn = path.join(EXAMPLES_DIR, "policy.complex_params.json");
        const tmpOut = path.join(EXAMPLES_DIR, "policy.complex_params.public.json");

        fs.writeFileSync(tmpIn, JSON.stringify(complexParamsExpr, null, 2));
        const cmd = `node ${COMPILER_JS} --in ${tmpIn} --out ${tmpOut}`;
        const log = run(cmd);

        expect(fs.existsSync(tmpOut)).to.equal(true);
        const out = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

        expect(out.N).to.equal(1);
        expect(out.atom_catalog[0].params).to.deep.include({
            name: "complex",
            nested: { key: "value", number: 42 },
            array: [1, 2, 3],
            string: "test"
        });
        expect(out.atom_catalog[0].publicParams).to.deep.equal(["nested", "array"]);

        // Cleanup
        try { fs.unlinkSync(tmpIn); } catch { }
        try { fs.unlinkSync(tmpOut); } catch { }
    });
});