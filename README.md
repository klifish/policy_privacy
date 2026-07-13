# TPS-ZKPI: Enhancing Consent Policy Privacy in Blockchain-Based Healthcare Data Sharing

Reference implementation and evaluation code for the manuscript *"Enhancing Consent
Policy Privacy in Blockchain-Based Healthcare Data Sharing"* (Kun Li, Ankur Lohachab,
Michel Dumontier, Visara Urovi), submitted to MDPI *Blockchains*.

TPS-ZKPI is a Trusted Proof Service-assisted zero-knowledge policy interpreter. It
compiles heterogeneous Boolean consent policies into fixed-length programs evaluated by a
single reusable zero-knowledge circuit, binds them to on-chain commitments, and normalizes
the public-chain transcript so that verification reveals minimal policy-dependent
information.

## Repository structure

```
├── circuits/       # Circom circuits (policy interpreter, commitment, predicate gadgets)
├── contracts/      # Solidity contracts (PolicyPrivacy, Groth16 verifier)
├── compiler/       # Policy compiler: author JSON -> RPN tokens + commitment
├── lib/            # SDK entry points (compiler, prover, contract ABIs)
├── api/            # REST API server
├── tps/            # Trusted Proof Service
├── experiments/    # Attack experiments (PCH, SPP, PI) and the gas-padding ablation
├── python/         # Supervised/clustering analysis pipeline and of-record results
├── paper_mdpi/     # LaTeX manuscript
├── test/           # Mocha/Hardhat test suite
└── examples/       # Usage examples (diabetes, ICD-10 cases)
```

## Setup

```bash
npm install
npm run build:circuit        # compiles circuits into build/
```

The Python analysis layer needs its own environment:

```bash
python -m venv python/.venv
python/.venv/bin/pip install -r python/requirements.txt
```

## Reproducing the paper results

Only the first stage runs on-chain. It executes the policy corpus against the Polygon Amoy
testnet and writes the observable public-chain features to `python/data/polygonAmoy/`
(`pch_dataset.json`, `pi_dataset.json`, `spp_dataset.json`). Every attack and analysis
step after that is Python, reading those datasets.

**1. Generate the dataset (on-chain).** Requires a funded Amoy account configured in
`hardhat.config.js`.

```bash
npm run unified:testnet
```

**2. Run the supervised attacks.** Policy Content Hiding (PCH), Policy Indistinguishability
(PI), and Structure and Parameter Privacy (SPP). Each writes its verdict to
`python/results/supervised_analysis/`.

```bash
cd python/supervised_analysis
../.venv/bin/python pch_supervised.py --seeds 30 --jobs -1
../.venv/bin/python pi_supervised.py  --seeds 30 --jobs -1
../.venv/bin/python spp_supervised.py --data-dir ../data --seeds 30 --jobs -1
```

**3. Run the label-free clustering cross-check.**

```bash
python/.venv/bin/python python/clustering_analysis/run_all_clustering.py
```

**4. Gas-padding ablation.** The paired unpadded/padded comparison behind the ablation
table. The first two steps collect the padded and unpadded runs on-chain; the third scores
them.

```bash
npm run ablation:gas:prepare
npm run ablation:gas:analyze
python/.venv/bin/python python/supervised_analysis/run_ablation_supervised.py --seeds 30 --jobs -1
```

To exercise stage 1 locally without spending testnet funds, `npm run exp:full` runs the
same corpus against a local Hardhat node.

The privacy criterion is a multi-seed permutation test: per task, an attack counts as
leakage only if `AUC > 0.55` and it clears the permutation test in at least half of the 30
seeds. A run passes only if every gating task passes. `overallPassed` in each verdict file
records the outcome.

### Where the paper's numbers come from

The manuscript's result tables cite these files by path; each `paper_mdpi/tables/*.tex`
names its own source of record in a header comment.

| Paper table | Source of record |
|---|---|
| Privacy summary, PCH/PI/SPP results | `python/results/supervised_analysis/{pch,pi,spp}_supervised_verdict.json` |
| Clustering summary | `python/results/{pch,pi,spp}_clustering_analysis/*.csv` |
| Gas-padding ablation | `python/results/supervised_analysis/gas_padding_supervised_deltaLeakage.csv` |
| Corpus statistics | `experiments/policy_content_hiding/results/polygonAmoy/features.json` |

These result files are tracked in this repository, so the tables can be checked against
them without re-running the experiments. The bulky PI pair intermediates
(`pi_pairs_generated.json`, `pairs/`) are not tracked — `pi_supervised.py` regenerates
them.

## Core circuit

`PolicyPrivacyMain` proves, in zero knowledge:

- `C(P,(a,p)) = 1` — policy `P` is satisfied by requester attributes `a` and external predicates `p`
- `Com(P;r) = h` — the policy commitment matches the on-chain commitment
- validity of the external predicates

The production instance supports N=6 requester attributes (matching DUO V2), M=5 external
predicates, and DEPTH=20 policy tokens, under Groth16.

## Tests

```bash
npx hardhat test     # full suite
npm run test:all
```

## Building the manuscript

```bash
cd paper_mdpi && tectonic main.tex
```

[Tectonic](https://tectonic-typesetting.github.io/) resolves packages and runs the
bibliography and rerun passes in one command; `pdflatex`/`latexmk`/`bibtex` are not needed.

## SDK usage

The `lib/` directory exposes the compiler, prover, and contract ABIs for use as a
dependency.

```javascript
const { generatePolicyArtifacts, createCircuitInput, generateProof } = require("policy-privacy");

const artifacts = await generatePolicyArtifacts({
  attributeOrder: ["GR", "DS"],
  logic: "(GR AND DS)",
  attributes: { DS: { comparison: "IN", value: "icd10:A00" } },
}, { depth: 20 });

const input = createCircuitInput(artifacts.policyCommitment, {
  policy: artifacts.tokens,
  requesterAttrs: [1, 1, 0, 0, 0, 0],
});

const proof = await generateProof(input, {
  wasmPath: "./circuits/policy_privacy_main.wasm",
  zkeyPath: "./circuits/policy_privacy_main.zkey",
});
```

Compile a policy from the command line with:

```bash
node compiler/policy_generator.js \
  --in examples/policies/sample_policy.json \
  --out artifacts/policies/sample_policy.compiled.json \
  --depth 10 --pretty
```
