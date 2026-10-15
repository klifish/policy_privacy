# Polygon Amoy B1/B2 ablation — full replay (2026-10-15)

`b2_padded/` is the whole padded capture `experiments/data/polygonAmoy-b2-padded/`
(`prepare.js --all`); `b1_unpadded/` replays the same 1977 definitions, with
the B2 randomizers and planned outcomes, without gas padding, on its own
deployment (PolicyPrivacy `0x89281182b4385AEc4634335c838e5059f4Eca1C6`), as 4
shards (2026-10-15 06:44–09:56 UTC+8). `verify.js` confirms the B1/B2
alignment for all 1977 executions.

| Field | Value |
|---|---|
| Code | `f9039e1`, clean working tree; zkey 9a018e91… |
| Executions | 1977 per profile (989 granted, 988 denied), every decision as planned |
| Tx status | 1 for all 5931 B1 txs |
| B1 access gas (min/med/max) | 723,446 / 723,530 / 741,458 |
| B1 commit gas (min/med/max) | 219,688 / 219,724 / 237,664 |

Unpadded gas decomposes exactly. For every B1 transaction, gasUsed minus
21,000 minus the calldata cost (16 gas per non-zero and 4 per zero byte)
takes one value per transaction type and decision: access 695,254 (denied,
986) or 695,264 (granted, 987), commit 196,964 (1973), registerResource 70,400
(1977). The exceptions are the first access and the first commit of each of
the 4 shard senders, which cost 17,940 more (first storage writes).
