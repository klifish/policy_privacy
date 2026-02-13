# Cost of Privacy Methodology

## 1. Problem Statement

This experiment suite studies privacy-utility trade-offs for DUO policy enforcement in the ZK policy-privacy protocol.

- Utility metric: Access Success Rate (ASR), denoted `ASR(P, D)`
- Privacy cost metric: composite Cost of Privacy (CoP), denoted `CoP(P)`

Given policy `P` and requester population distribution `D`, we evaluate:

- How often honest requesters can satisfy policy constraints
- How expensive privacy is in gas, proving latency, and leakage terms

Implementation anchors:

- `policy_model.py` (ASR and policy evaluation)
- `privacy_cost.py` (CoP model)
- `pareto_analysis.py` (frontier + constrained optimization)


## 2. Policy Representation and Satisfaction

Policies are represented as RPN (postfix) token sequences with max depth 20.

- Attribute tokens: `0..5` (GR, DS, RS, POA, GS, CC)
- Predicate tokens: `6..10`
- Operators: `AND=11`, `OR=12`, `NOT=13`

Let `phi_P(s)` be the Boolean evaluation of policy `P` on requester satisfaction vector `s`.
The evaluator is implemented in `evaluate_policy_tokens(...)` in `policy_model.py`.


## 3. Access Success Rate (ASR)

### 3.1 Prior ASR

Population-level ASR is:

`ASR(P, D) = sum_r D(r) * 1[phi_P(r) = 1]`

Special cases used for fast paths:

- AND policy: `ASR = prod_{i in T} p_i(W_i)`
- OR policy: `ASR = 1 - prod_{i in T}(1 - p_i(W_i))`

where:

- `T` is the active attribute set
- `W_i` is whitelist for predicate attribute `i`
- `p_i(W_i)` is attribute satisfaction probability under distribution `D`

General mixed logic falls back to enumeration of all `2^|T|` satisfaction combinations.

### 3.2 Posterior ASR

Posterior ASR models motivated requesters (after seeing policy requirements) by boosting claim probabilities:

- prior: `p_i = p_claim_i * p_match_i`
- posterior: `p_i' = min(boost * p_claim_i, 1) * p_match_i`

This is implemented through `ConditionalRequesterModel` and `compute_asr_posterior(...)`.


## 4. Cost of Privacy (CoP)

CoP combines gas, proving latency, and leakage:

`CoP(P) = alpha * G_norm(P) + beta * T_norm(P) + (1 - alpha - beta) * L_norm(P)`

Default weights:

- `alpha = 0.5` (gas)
- `beta = 0.3` (proof time)
- `1 - alpha - beta = 0.2` (leakage)

Normalization in current implementation:

- `G_norm = total_with_padding / GAS_HIGH_STORAGE_TARGET` (4,000,000)
- `T_norm = min(proof_time / 30, 1)`
- `L_norm = leakage` in `[0,1]`

Gas and timing are parameterized with constants aligned to current backend and AA settings (e.g., `GAS_PADDING_TARGET = 800000`).


## 5. Optimization Objective

Constrained policy design is formulated as:

- `min_P CoP(P)`
- subject to `ASR(P, D) >= tau`
- and `L(P) <= epsilon`

Implemented in `find_optimal_policy(...)` using random candidate search plus structured policy seeds.


## 6. Population Scenarios

Five scenario presets are used:

1. `uniform`
2. `real_world`
3. `us_centric`
4. `cancer_focused`
5. `european_ancestry`

Each scenario defines:

- `p_gr`
- attribute claim probabilities `p_claim` per ontology namespace
- ontology code distributions

Scenario definitions are in `population_model.py`.


## 7. Experiment Protocol (A-F)

`simulation_runner.py` provides six main experiments and one validation pass:

1. **A: ASR Sweep**  
   Sweeps attributes, whitelist fraction, logic type, and target populations.
2. **B: Cost Decomposition**  
   Reports gas/time/leakage and overhead for representative policies.
3. **C: Pareto Frontier**  
   Evaluates ~10k random policies and extracts non-dominated frontier.
4. **D: Population Sensitivity**  
   Compares fixed policy set across all population scenarios.
5. **E: Optimal Policy Recommendation**  
   Solves constrained optimization over `(tau, epsilon)` grid.
6. **F: Prior vs Posterior + AND vs OR**  
   Quantifies motivation effect and potential gain from richer logic.
7. **Validation**  
   Confirms analytical ASR against Monte Carlo estimates.


## 8. Reproducibility

Run validation only:

```bash
python3 submodules/policy_privacy/experiments/cost_of_privacy/simulation_runner.py --experiment validate
```

Run all experiments:

```bash
python3 submodules/policy_privacy/experiments/cost_of_privacy/simulation_runner.py --experiment all
```

Generate figures:

```bash
python3 submodules/policy_privacy/experiments/cost_of_privacy/visualization.py
```

Results are written under:

- `submodules/policy_privacy/experiments/cost_of_privacy/results/`


## 9. Threats to Validity

1. Attribute independence is assumed in analytical ASR decomposition.
2. Leakage model is heuristic (`max(gas, metadata, timing)`), not information-theoretic.
3. Fixed gas padding target can compress gas-side differentiation among policies.
4. Optimization is stochastic random search, so near-optimality depends on sample coverage.
5. Current UI primarily exposes AND policies, while protocol/circuit can support richer logic.
