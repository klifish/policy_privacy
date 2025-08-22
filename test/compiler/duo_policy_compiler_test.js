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
});