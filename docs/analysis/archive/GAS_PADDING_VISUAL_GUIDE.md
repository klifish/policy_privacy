# Gas Padding Mechanism - Visual Overview

> ⚠️ **ARCHIVED — describes a superseded implementation.** This document analyzes an
> older gas-padding design with a fixed `TX_OVERHEAD` constant and 6M/7.1M gas targets.
> The current implementation (`contracts/PolicyPrivacy.sol`'s `_padGasToTarget`) already
> does dynamic per-byte calldata-cost compensation — exactly what this document proposed
> as a future fix — and the current pad targets are 750,000 (access) / 300,000 (commit)
> gas (see `experiments/core/data_generator.js` and `experiments/unified/run.js`), not the
> values quoted here. Root-cause narrative and recommendations below are historical.

## Current Implementation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      User Calls commitPolicyWithGasPad                  │
│                      or requestAccessWithGasPad                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 1: Record Starting Gas                                             │
│ ─────────────────────────────────                                       │
│   uint256 startGas = gasleft();                                        │
│   // Snapshot gas before execution                                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2: Execute Core Logic                                              │
│ ────────────────────────────                                           │
│   - Verify proof (if access request)                                    │
│   - Update state (mapping writes)                                       │
│   - Emit events                                                         │
│   - Return values                                                        │
│                                                                          │
│   ⚠️ Different policies use different gas here                          │
│      Simple policy: ~150,000 gas                                        │
│      Complex policy: ~200,000 gas                                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 3: Calculate Gas Used                                              │
│ ────────────────────────────                                           │
│   uint256 currentGas = gasleft();                                       │
│   uint256 executionGasUsed = startGas - currentGas;                    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4: Estimate Transaction Overhead (ISSUE!)                          │
│ ────────────────────────────────────────────                           │
│   uint256 TX_OVERHEAD = 65192;  // FIXED CONSTANT                      │
│   // 21,000 (base) + 44,192 (estimated calldata)                       │
│                                                                          │
│   ⚠️ PROBLEM: Actual calldata varies!                                   │
│      Simple policy calldata: ~2600 bytes = 41,600 gas                  │
│      Complex policy calldata: ~2900 bytes = 46,400 gas                 │
│      Difference: 4,800 gas                                              │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5: Calculate Padding Needed                                        │
│ ──────────────────────────────                                         │
│   uint256 targetExecutionGas = targetGas - TX_OVERHEAD;                │
│   uint256 paddingNeeded = targetExecutionGas - executionGasUsed;       │
│                                                                          │
│   Example:                                                              │
│   - targetGas = 7,100,000                                               │
│   - TX_OVERHEAD = 65,192                                                │
│   - targetExecutionGas = 7,034,808                                      │
│   - If executionGasUsed = 150,000, paddingNeeded = 6,884,808          │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 6: Burn Gas Through Computation                                    │
│ ──────────────────────────────────────                                 │
│   uint256 targetGasLeft = currentGas - paddingNeeded;                  │
│   uint256 acc = gasPadAccumulator;                                      │
│                                                                          │
│   while (gasleft() > targetGasLeft) {                                  │
│       unchecked {                                                       │
│           acc = (acc ^ 0x9e3779b97f4a7c15) * 0x1000003d;               │
│       }                                                                  │
│   }                                                                      │
│   gasPadAccumulator = acc;  // Prevent optimization                    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Result: All Policies Target Same Total Transaction Gas                  │
│ ─────────────────────────────────────────────────────────              │
│   Target: 7,100,000 gas                                                │
│   Actual: ~7,100,360 gas (with ±360 variance)                          │
│                                                                          │
│   ⚠️ Variance comes from:                                               │
│      1. Inaccurate TX_OVERHEAD estimation                               │
│      2. Variable calldata size                                          │
│      3. Variable event/log sizes                                        │
│      4. EVM metering precision limits                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Transaction Gas Breakdown

```
┌────────────────────────────────────────────────────────────────┐
│                     Total Transaction Gas                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Base Cost: 21,000 gas (fixed)                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Calldata Cost: Variable!                                │ │
│  │  ─────────────────────────                               │ │
│  │  Simple policy:  41,600 gas (2,600 bytes × 16)          │ │
│  │  Complex policy: 46,400 gas (2,900 bytes × 16)          │ │
│  │  Difference:      4,800 gas ⚠️                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Execution Cost: Variable!                               │ │
│  │  ────────────────────────                                │ │
│  │  - Proof verification: varies by proof type              │ │
│  │  - State updates: varies by complexity                   │ │
│  │  - Event logs: varies by event count/size               │ │
│  │  Simple:  150,000 gas                                    │ │
│  │  Complex: 200,000 gas                                    │ │
│  │  Difference: 50,000 gas                                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Gas Padding: Computed to reach target                   │ │
│  │  ─────────────────────────────────────                   │ │
│  │  Target - (Base + Calldata + Execution)                 │ │
│  │                                                           │ │
│  │  ⚠️ ERROR: Uses fixed TX_OVERHEAD estimate               │ │
│  │     instead of actual Base + Calldata                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Total: Should be 7,100,000 gas for all policies              │
│  Actual: 7,099,640 to 7,100,360 (±360 gas variance)           │
└────────────────────────────────────────────────────────────────┘
```

## Problem Visualization

```
                    Expected (Perfect Padding)
                    ─────────────────────────
Policy A:  Base + Calldata + Exec + Padding = 7,100,000 gas
Policy B:  Base + Calldata + Exec + Padding = 7,100,000 gas
Policy C:  Base + Calldata + Exec + Padding = 7,100,000 gas
           └────────────── All identical ─────────────────┘

                    Actual (Current Implementation)
                    ───────────────────────────────
Policy A:  21k + 41.6k + 150k + 6,887.4k = 7,100,000 gas
Policy B:  21k + 44.0k + 175k + 6,860.0k = 7,100,000 gas (target)
Policy C:  21k + 46.4k + 200k + 6,832.6k = 7,100,000 gas

But TX_OVERHEAD assumes:
           21k + 44.192k (fixed) = 65.192k

So actual calculation:
Policy A:  Target 7,034.808k exec → burns 6,884.808k → Total 7,099,640 gas ⚠️
Policy B:  Target 7,034.808k exec → burns 6,859.808k → Total 7,100,000 gas ✓
Policy C:  Target 7,034.808k exec → burns 6,834.808k → Total 7,100,360 gas ⚠️

Variance: 7,100,360 - 7,099,640 = 720 gas across extremes
Typical:  ±360 gas from target
```

## Attack Model

```
┌────────────────────────────────────────────────────────────────┐
│                         Adversary View                          │
└────────────────────────────────────────────────────────────────┘

Observable Features:
├── Gas Used (total transaction)
│   ├── Policy Type A: 7,099,640 gas
│   ├── Policy Type B: 7,100,000 gas
│   └── Policy Type C: 7,100,360 gas
│   └─→ Δ = 720 gas (detectable with ML!)
│
├── Calldata Length (bytes)
│   ├── Simple policies: ~2,600 bytes
│   └── Complex policies: ~2,900 bytes
│   └─→ Δ = 300 bytes (strong signal!)
│
├── Event Logs Size
│   ├── AccessGranted: X bytes
│   └── AccessDenied: Y bytes
│   └─→ Reveals satisfy/not-satisfy
│
└── Timing
    ├── Proof generation: varies
    └── Transaction latency: varies

┌────────────────────────────────────────────────────────────────┐
│                    Machine Learning Attack                      │
└────────────────────────────────────────────────────────────────┘

Training Data:
  Feature Vector: [gasUsed, calldataLen, logsSize, timing, ...]
  Label: DUO term (GR, DS, RS, etc.)

Classifiers:
  ├── Logistic Regression (binary per term)
  └── Random Forest (multi-class ensemble)

Results (Current):
  ✗ DUO Term 1: AUC 0.52, Advantage 0.17 (FAIL)
  ✗ DUO Term 2: AUC 0.54, Advantage 0.36 (FAIL)
  ⚠️ Threshold: AUC ≤ 0.55, Advantage ≤ 0.05

Conclusion: Gas variance enables policy inference!
```

## Proposed Solution Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   Enhanced Gas Padding Strategy                 │
└────────────────────────────────────────────────────────────────┘

1. Dynamic Overhead Calculation
   ────────────────────────────
   function _calculateActualOverhead() internal view returns (uint256) {
       uint256 calldataGas = 0;
       for (uint i = 0; i < msg.data.length; i++) {
           calldataGas += (msg.data[i] == 0) ? 4 : 16;
       }
       return 21000 + calldataGas;
   }

2. Event Padding
   ─────────────
   event PolicyCommitted(
       address indexed dataSubject,
       uint256 indexed policyId,
       uint256 commitment,
       uint256 paramsCommitment,
       bytes32 paddingData  // ← Add fixed-size padding
   );

3. Proof Padding
   ─────────────
   Enable in data_generator.js:
   proof_pad: [true],
   
   Pad all proofs to max size (e.g., 1200 bytes)

4. Multi-Tier Targets
   ──────────────────
   function _selectGasTarget(uint256 predicateCount) internal pure {
       if (predicateCount <= 1) return 6500000;
       if (predicateCount <= 3) return 7100000;
       return 7800000;
   }

Expected Result:
  ✓ Gas variance: < 100 gas (< 0.001% of total)
  ✓ AUC: ≤ 0.55
  ✓ Advantage: ≤ 0.05
  ✓ Policy content hiding: ACHIEVED
```

## Implementation Priority Matrix

```
┌──────────────────────────────────────────────────────────────────┐
│  Priority │ Impact │ Effort │ Feature                            │
├───────────┼────────┼────────┼────────────────────────────────────┤
│  ★★★★★    │  High  │  Low   │ 1. Enable proof padding            │
│  ★★★★★    │  High  │  Med   │ 2. Add event padding               │
│  ★★★★☆    │  High  │  High  │ 3. Dynamic overhead calculation    │
│  ★★★☆☆    │  Med   │  Med   │ 4. Multi-tier gas targets          │
│  ★★☆☆☆    │  Med   │  High  │ 5. Automated calibration           │
│  ★☆☆☆☆    │  Low   │  High  │ 6. Advanced hiding (L2, batching)  │
└──────────────────────────────────────────────────────────────────┘

Recommendation: Implement items 1-3 before production deployment
```

## Testing Strategy

```
┌────────────────────────────────────────────────────────────────┐
│                      Test Coverage Plan                         │
└────────────────────────────────────────────────────────────────┘

Phase 1: Unit Tests
  ├── Test dynamic overhead calculation accuracy
  ├── Test gas burning loop convergence
  ├── Test edge cases (OOG, negative padding, etc.)
  └── Test event padding size consistency

Phase 2: Integration Tests
  ├── Deploy contract with improvements
  ├── Execute 1000+ diverse policies
  ├── Measure gas distribution (mean, std, min, max)
  └── Verify variance < 100 gas

Phase 3: Privacy Evaluation
  ├── Run ML classifiers on collected data
  ├── Calculate AUC for binary tasks
  ├── Calculate Advantage for all tasks
  └── Verify thresholds met

Phase 4: Regression Tests
  ├── Test across EVM forks (London, Merge, Shanghai)
  ├── Test with different gas limits
  ├── Test with network congestion simulation
  └── Long-term monitoring (30+ days)

Success Criteria:
  ✓ All policy types within 100 gas
  ✓ AUC ≤ 0.55 for all binary tasks
  ✓ Advantage ≤ 0.05 for all tasks
  ✓ No false positive OOG errors
  ✓ Performance overhead < 20%
```

---

**Visual Guide Version**: 1.0  
**Created**: 2024-11-06  
**Purpose**: Supplement to GAS_PADDING_STRATEGY_ANALYSIS.md
