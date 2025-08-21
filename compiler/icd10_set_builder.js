/**
 * ICD-10 Allowed-Set Builder (closure + Poseidon Merkle)
 *
 * Modes:
 *  A) Build from explicit codes list (one per line)
 *     node compiler/icd10_set_builder.js build \
 *       --codes examples/icd10_case/codes.txt \
 *       --version-root 0xICD10_V2025_08 \
 *       --out examples/icd10_case/allowed_set.json
 *
 *  B) Build from tree + roots (do closure)
 *     node compiler/icd10_set_builder.js build \
 *       --tree  examples/icd10_case/icd10_tree.json \
 *       --roots E10,E11 \
 *       --version-root 0xICD10_V2025_08 \
 *       --out   examples/icd10_case/allowed_set.json
 *
 *  C) Generate Merkle path for one code
 *     node compiler/icd10_set_builder.js path \
 *       --code E11.9 \
 *       --in   examples/icd10_case/allowed_set.json
 *
 * Output files:
 *   - allowed_set.json:
 *        {
 *          "version_root": "0x....",
 *          "depth": <number>,
 *          "root": "0x....",
 *          "leaves": [ { "code": "E11.9", "index": <i> }, ... ]
 *        }
 *   - allowed_set.layers.json (dev aid):
 *        Poseidon layers as hex arrays for path generation
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const circomlibjs = require("circomlibjs");

// ------------------------ CLI helpers ------------------------
function argVal(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
function must(val, what) {
    if (!val) {
        console.error(`Missing required ${what}`);
        process.exit(1);
    }
    return val;
}

// ------------------------ Poseidon helpers ------------------------
async function getPoseidon() {
    const poseidon = await circomlibjs.buildPoseidon();
    return poseidon; // has .F.toString
}
function FtoBig(poseidon, x) {
    return BigInt(poseidon.F.toString(x));
}
function toHex(bi) {
    return "0x" + bi.toString(16);
}
function sha256BigInt(s) {
    const h = crypto.createHash("sha256").update(s, "utf8").digest("hex");
    return BigInt("0x" + h);
}

// ------------------------ Encoding & Merkle ------------------------
/**
 * Encode leaf as Poseidon( sha256(code), version_root )
 * - code: string like "E11.9"
 * - version_root: hex string or decimal string that fits BigInt
 */
function encodeLeaf(poseidon, code, version_root_big) {
    const codeBI = sha256BigInt(code);
    const leaf = poseidon([codeBI, version_root_big]);
    return FtoBig(poseidon, leaf);
}

/** Next power of two >= n */
function nextPow2(n) {
    return 1 << Math.ceil(Math.log2(Math.max(1, n)));
}

function buildMerkle(poseidon, leavesBigInts) {
    const n = nextPow2(leavesBigInts.length);
    const base = new Array(n).fill(0n);
    for (let i = 0; i < leavesBigInts.length; i++) base[i] = leavesBigInts[i];

    const layers = [];
    layers.push(base);
    let cur = base;
    while (cur.length > 1) {
        const nxt = [];
        for (let i = 0; i < cur.length; i += 2) {
            const a = cur[i];
            const b = cur[i + 1] ?? 0n;
            const h = poseidon([a, b]);
            nxt.push(FtoBig(poseidon, h));
        }
        layers.push(nxt);
        cur = nxt;
    }
    return { root: cur[0], depth: Math.log2(n) | 0, layers };
}

function merklePath(layers, index) {
    const path = [];
    const pos = [];
    let idx = index;
    for (let d = 0; d < layers.length - 1; d++) {
        const layer = layers[d];
        const sib = idx ^ 1;
        path.push(layer[sib] ?? 0n);
        pos.push(idx & 1);
        idx >>= 1;
    }
    return { path, pathPos: pos };
}

// ------------------------ ICD-10 closure utilities ------------------------
/**
 * Load a minimal ICD-10 tree file:
 *  {
 *    "E10": ["E10.0", "E10.1", ...],
 *    "E10.1": ["E10.10", "E10.11", ...],
 *    ...
 *  }
 * Only one direction (parent -> children) is required.
 */
function loadTree(treePath) {
    const raw = JSON.parse(fs.readFileSync(treePath, "utf8"));
    // Ensure arrays
    for (const k of Object.keys(raw)) {
        if (!Array.isArray(raw[k])) throw new Error(`Tree children of ${k} must be array`);
    }
    return raw;
}

/** DFS downwards from roots, collect all descendants including the root code itself */
function closureFromRoots(tree, roots) {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
        const cur = stack.pop();
        if (seen.has(cur)) continue;
        seen.add(cur);
        const ch = tree[cur] || [];
        for (const c of ch) stack.push(c);
    }
    return Array.from(seen).sort();
}

/** Simple normalization: uppercase letters, trim spaces */
function normCode(s) {
    return String(s || "").trim().toUpperCase();
}

// ------------------------ Main ------------------------
async function main() {
    const cmd = process.argv[2];
    if (!cmd || !["build", "path"].includes(cmd)) {
        console.log(`Usage:
  # Build from codes list
  node compiler/icd10_set_builder.js build --codes <codes.txt> --version-root <0xHEX or decimal> --out <allowed_set.json>

  # Build from tree + roots (closure)
  node compiler/icd10_set_builder.js build --tree <icd10_tree.json> --roots <E10,E11,...> --version-root <0xHEX or decimal> --out <allowed_set.json>

  # Get Merkle path for one code
  node compiler/icd10_set_builder.js path --code <ICD10> --in <allowed_set.json>
`);
        process.exit(0);
    }

    if (cmd === "build") {
        const codesPath = argVal("--codes");
        const treePath = argVal("--tree");
        const rootsCsv = argVal("--roots");
        const versionRootStr = must(argVal("--version-root"), "--version-root");
        const outPath = must(argVal("--out"), "--out");

        if (!codesPath && !(treePath && rootsCsv)) {
            console.error("Provide either --codes OR (--tree AND --roots)");
            process.exit(1);
        }

        // Parse version root
        const versionRootBig =
            versionRootStr.startsWith("0x") || versionRootStr.startsWith("0X")
                ? BigInt(versionRootStr)
                : BigInt(versionRootStr);

        // Load codes (either explicit file or closure from tree+roots)
        let codes = [];
        if (codesPath) {
            codes = fs
                .readFileSync(codesPath, "utf8")
                .split(/\r?\n/)
                .map(normCode)
                .filter(Boolean);
        } else {
            const tree = loadTree(treePath);
            const roots = rootsCsv.split(",").map(normCode).filter(Boolean);
            codes = closureFromRoots(tree, roots);
        }

        // De-duplicate and sort for determinism
        codes = Array.from(new Set(codes)).sort();

        const poseidon = await getPoseidon();

        // Encode leaves
        const leavesBig = codes.map((code) => encodeLeaf(poseidon, code, versionRootBig));

        // Build Merkle
        const { root, depth, layers } = buildMerkle(poseidon, leavesBig);

        // Metadata file for prover/verifier
        const meta = {
            version_root: versionRootStr,
            depth,
            root: toHex(root),
            leaves: codes.map((code, i) => ({ code, index: i })),
        };

        // Persist
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(meta, null, 2));
        fs.writeFileSync(
            outPath.replace(/\.json$/i, ".layers.json"),
            JSON.stringify(layers.map((arr) => arr.map(toHex)), null, 2)
        );

        console.log(`Built allowed_set:
  codes=${codes.length}
  depth=${depth}
  root=${meta.root}
  out=${outPath}
  layers=${outPath.replace(/\\.json$/i, ".layers.json")}
`);
        return;
    }

    if (cmd === "path") {
        const code = must(argVal("--code"), "--code");
        const inPath = must(argVal("--in"), "--in");
        const meta = JSON.parse(fs.readFileSync(inPath, "utf8"));
        const layersHex = JSON.parse(
            fs.readFileSync(inPath.replace(/\.json$/i, ".layers.json"), "utf8")
        );
        // Convert hex strings back to BigInt
        const layers = layersHex.map((arr) => arr.map((h) => BigInt(h)));

        const found = meta.leaves.find((x) => normCode(x.code) === normCode(code));
        if (!found) {
            console.error(`Code ${code} not in allowed set`);
            process.exit(2);
        }

        // Reconstruct leaf (need version_root)
        const poseidon = await getPoseidon();
        const versionRootStr = meta.version_root;
        const versionRootBig =
            versionRootStr.startsWith("0x") || versionRootStr.startsWith("0X")
                ? BigInt(versionRootStr)
                : BigInt(versionRootStr);
        const leaf = encodeLeaf(poseidon, normCode(code), versionRootBig);

        const { path: siblings, pathPos } = merklePath(layers, found.index);
        const out = {
            code: normCode(code),
            leaf: toHex(leaf),
            path: siblings.map(toHex),
            pathPos,
        };
        console.log(JSON.stringify(out, null, 2));
        return;
    }
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    main();
}