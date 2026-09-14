# DUO V3 Protocol Release

The normative machine-readable release record is
`protocol/releases/v3.0.0-rc1.json`. Historical API and workflow documents are
not protocol specifications.

## Frozen interface

- Version: `v3.0.0-rc1` (local-validation release candidate).
- Proof system: Groth16 over BN254/bn128.
- Circuit: `PolicyPrivacyMain(13, 11, 64, 5, 8, 32)`, compiled with Circom
  `--O2`.
- Public signals: `[isAuthorized, policyCommitment, paramsCommitment,
  contextHash, requestEpoch]`.
- Verifier ABI: `verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[5])`.

`idReq`, `idRes`, and `nonce` are private circuit inputs rather than separate
Groth16 public signals. They are nevertheless public calldata to
`requestAccessBound`, which recomputes `contextHash`; requester/resource and
the digest are also represented in the stored request record.

For the 64-token policy, the commitment is calculated exactly as follows:

1. `chunk[i] = Poseidon16(P[16i..16i+15])` for `i = 0..3`.
2. `policyHash = Poseidon4(chunk[0], chunk[1], chunk[2], chunk[3])`.
3. `policyCommitment = Poseidon3(policyHash, programLength, randomizer)`.

## Build and validation

Use Node `22.22.0` as pinned in `.nvmrc`.

```text
npm ci
npm run protocol:build:rc
npm run protocol:manifest
npm run protocol:validate
npm run protocol:package
```

The RC build uses the pinned PSE `ppot_0080_20.ptau`. Its complete embedded
contribution transcript was audited previously by the project owner; this
release does not repeat that expensive audit. Every build still verifies the
pinned file SHA-256 and checks the final zkey against the exact R1CS/PTAU pair.
The RC performs one local phase-2 contribution, so it is suitable for
reproducible review but is not represented as a production multi-party phase-2
ceremony.

`protocol:validate` never runs setup. CI uses a separate ephemeral setup under
`build/ci`; it must not modify the canonical release directory.

## Release scope

This RC does not claim Polygon Amoy validation and does not include a rerun of
the paper's privacy or performance experiments. Those are prerequisites for a
future final `v3.0.0`, not for this local protocol freeze.
