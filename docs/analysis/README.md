# Analysis Documents

This directory previously contained early-stage analysis documents (project snapshots
from before the `experiments/` attack-simulation tree and `paper/` manuscript existed,
and gas-padding analyses describing a since-replaced fixed-overhead design).

## Archive

All prior documents have been moved to [`archive/`](archive/) with staleness warnings,
since they describe implementation states or repository structures that no longer match
the current codebase:

- `GAS_PADDING_README.md`, `GAS_PADDING_STRATEGY_ANALYSIS(.zh).md`,
  `GAS_PADDING_STRATEGY_ANALYSIS_SUMMARY.md`, `GAS_PADDING_VISUAL_GUIDE.md` — describe a
  fixed-`TX_OVERHEAD` gas-padding design later replaced by dynamic per-byte calldata-cost
  compensation in `contracts/PolicyPrivacy.sol`.
- `PAPER_IMPLEMENTATION_GAP_ANALYSIS.md`, `REPOSITORY_ANALYSIS_REPORT.md` — describe an
  early project snapshot predating the `experiments/` and `paper/` directories and the
  unified main circuit (`circuits/policy_privacy_main.circom`).
- `MISSING_FUNCTIONALITY_ANALYSIS.md` — a generic consent-management feature brainstorm
  out of scope for this repository's actual paper/codebase.

For current documentation, see:
- `experiments/docs/` — attack methodology, dataset generation, and per-experiment
  (PCH/PI/SPP) design docs
- `experiments/core/multiseed_criterion.js` — the authoritative privacy verdict logic
- `experiments/ablation/gas_padding/` — the current gas-padding ablation design
- `paper/` — the manuscript, including `sec_ablation.tex` for the gas-padding validity
  argument
