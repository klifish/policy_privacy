/**
 * DUO Policy Compiler – turns a human-readable policy into RPN tokens
 * and produces a stable commitment bound to the atom schema.
 *
 * Usage:
 *   node compiler/duo_policy_compiler.js \
 *     --in examples/diabetes_case/policy.input.json \
 *     --out examples/diabetes_case/policy.public.json
 *
 * Output fields (JSON):
 *   - policy_id, dataset_id
 *   - N: number of atoms
 *   - tokens: numeric RPN tokens (for development only; do not expose in prod)
 *   - policy_commitment: hex Poseidon hash binding tokens + atom schema
 *   - atom_meta_hash: hex Poseidon hash of the normalized atom schema
 *   - ontology_version_root (optional passthrough)
 *   - atom_catalog: stable index + atom metadata (dev aid)
 *
 * NOTE: This file is plain JavaScript (CommonJS). You can rename it to
 *       `duo_policy_compiler.js` and run with Node directly.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// Use CommonJS require to avoid type declaration issues
const circomlibjs = require("circomlibjs");

// ----------------------------- Poseidon helpers -----------------------------
/**
 * Build Poseidon hasher (circomlibjs). The returned function outputs a field element
 * that must be converted via poseidon.F.toString() before BigInt/hex formatting.
 */
async function getPoseidon() {
  const poseidon = await circomlibjs.buildPoseidon();
  return poseidon; // has .F.toString
}

/** Convert a Poseidon field element to BigInt. */
function poseidonOutToBigInt(poseidon, x) {
  return BigInt(poseidon.F.toString(x));
}

/** Hexify a field BigInt. */
function toHex(bi) {
  return "0x" + bi.toString(16);
}

// ----------------------------- Atom schema hashing -----------------------------
/**
 * Normalize and hash the atom schema. We:
 * 1) Serialize each atom as: "#i|TYPE|k1:v1|k2:v2|...|pub:p1,p2,..."
 * 2) SHA-256 the concatenated string -> BigInt
 * 3) Poseidon([sha256BigInt]) to remain in-field and SNARK-friendly
 */
function hashAtomSchema(poseidon, atoms) {
  const items = atoms
    .map((a, i) => {
      const keys = Object.keys(a.params || {}).sort();
      const kv = keys.map((k) => `${k}:${String(a.params[k])}`).join("|");
      const pub = (a.publicParams || []).slice().sort().join(",");
      return `#${i}|${a.type}|${kv}|pub:${pub}`;
    })
    .join(";");
  const sha = crypto.createHash("sha256").update(items).digest("hex");
  const shaBI = BigInt("0x" + sha);
  const out = poseidon([shaBI]);
  return poseidonOutToBigInt(poseidon, out);
}

// ----------------------------- Expression → RPN -----------------------------
const OP_AND = "AND";
const OP_OR = "OR";
const OP_NOT = "NOT";
const OP_EXT = "EXT";  // New extended operator for ICD_MEMBER_REQ

function tokenize(expr) {
  // tokens: parentheses, AND/OR/NOT/EXT, #idx, identifiers (A_Z,0_9,_)
  const re = /(\()|(\))|\bAND\b|\bOR\b|\bNOT\b|\bEXT\b|#[0-9]+|[A-Za-z_][A-Za-z0-9_]*|\s+/g;
  const out = [];
  const iter = expr.matchAll(re);
  for (const m of iter) {
    const t = m[0];
    if (/\s+/.test(t)) continue;
    out.push(t);
  }
  return out;
}

function infixToRPN(tokens) {
  const prec = { [OP_NOT]: 3, [OP_EXT]: 3, [OP_AND]: 2, [OP_OR]: 1 };
  const rightAssoc = { [OP_NOT]: true, [OP_EXT]: true, [OP_AND]: false, [OP_OR]: false };
  const isOp = (t) => t === OP_AND || t === OP_OR || t === OP_NOT || t === OP_EXT;

  const out = [];
  const st = [];

  for (const tok of tokens) {
    if (tok === "(") {
      st.push(tok);
      continue;
    }
    if (tok === ")") {
      while (st.length && st[st.length - 1] !== "(") out.push(st.pop());
      if (!st.length) throw new Error("Mismatched parentheses");
      st.pop();
      continue;
    }
    if (isOp(tok)) {
      while (st.length) {
        const top = st[st.length - 1];
        if (!isOp(top)) break;
        const p1 = prec[tok], p2 = prec[top];
        if ((rightAssoc[tok] && p1 < p2) || (!rightAssoc[tok] && p1 <= p2)) {
          out.push(st.pop());
        } else break;
      }
      st.push(tok);
      continue;
    }
    // operand (atom identifier or #index)
    out.push(tok);
  }

  while (st.length) {
    const t = st.pop();
    if (t === "(" || t === ")") throw new Error("Mismatched parentheses");
    out.push(t);
  }
  return out;
}

function rpnToNumericTokens(rpn, nameToIdx, N) {
  return rpn.map((tok) => {
    if (tok === OP_AND) return N + 0;
    if (tok === OP_OR) return N + 1;
    if (tok === OP_NOT) return N + 2;
    if (tok === OP_EXT) return N + 3;  // EXT operator maps to code 3
    // if (tok.startsWith("#")) return parseInt(tok.slice(1), 10);
    const idx = nameToIdx[tok];
    if (idx === undefined) throw new Error(`Unknown atom reference: ${tok}`);
    return idx;
  });
}

// ----------------------------- Main -----------------------------
async function main() {
  const inIdx = process.argv.indexOf("--in");
  const outIdx = process.argv.indexOf("--out");
  if (inIdx === -1 || outIdx === -1) {
    console.error("Usage: node compiler/duo_policy_compiler.js --in <input.json> --out <output.json>");
    process.exit(1);
  }
  const inPath = process.argv[inIdx + 1];
  const outPath = process.argv[outIdx + 1];

  const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));

  // Assign stable indices to atoms
  const atoms = raw.atoms.map((a, i) => ({ ...a, index: i }));

  const N = atoms.length;

  // Name mapping (prefer params.name if provided)
  const nameToIdx = {};
  atoms.forEach((a, i) => {
    const nm = a.params && typeof a.params["name"] === "string" ? String(a.params["name"]) : `A${i}`;
    nameToIdx[nm] = i;
  });

  // 1) Parse expression and produce RPN over identifiers
  const rpnIds = infixToRPN(tokenize(raw.expr));

  // 2) Convert to numeric tokens according to the encoding used by your circuit
  const tokens = rpnToNumericTokens(rpnIds, nameToIdx, N);

  // 3) Build Poseidon hasher
  const poseidon = await getPoseidon();

  // 4) Hash atom schema
  const atomSchemaHash = hashAtomSchema(poseidon, atoms);
  console.log("atomSchemaHash", atomSchemaHash);

  // 5) Tokens hash (fold tokens as BigInts)
  const tokensBig = tokens.map((n) => BigInt(n));

  const tokHashEl = poseidon(tokensBig);

  const tokHash = poseidonOutToBigInt(poseidon, tokHashEl);


  // 6) Final policy commitment = Poseidon([tokHash, atomSchemaHash])
  const commitEl = poseidon([tokHash, atomSchemaHash]);
  const policyCommitment = poseidonOutToBigInt(poseidon, commitEl);

  const out = {
    policy_id: raw.policy_id,
    dataset_id: raw.dataset_id,
    N,
    tokens, // include for development convenience; in production, avoid exposing
    policy_commitment: toHex(policyCommitment),
    atom_meta_hash: toHex(atomSchemaHash),
    ontology_version_root: raw.ontology_version_root,
    atom_catalog: atoms.map((a) => ({
      index: a.index,
      type: a.type,
      params: a.params,
      publicParams: a.publicParams,
    })),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  // console.log(`Wrote ${outPath}\nN=${N}\npolicy_commitment=${out.policy_commitment}\natom_meta_hash=${out.atom_meta_hash}`);
}

if (require.main === module) {
  // Run main if invoked as a script
  main();
}
