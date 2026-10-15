import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from experiments.analysis.paths import CAPTURE_DATA_DIR
from experiments.analysis.supervised.common import (
    analyze_contrast,
    find_json,
    new_split_manifest,
    outcome_strata,
    repeated_stratified_group_holdout,
    stratified_auc_pvalue,
    stratum_key,
)
from experiments.analysis.supervised import pch_supervised, spp_supervised
from experiments.analysis.clustering.clustering_stats import (
    benjamini_hochberg,
    ensemble_permutation_analysis,
)
from experiments.analysis.supervised.run_ablation_supervised import (
    _paired_pi_seed,
    _paired_seed,
    align_records,
)
from experiments.analysis.supervised.pi_supervised import load_pairs, run_pairs, split_pair


class StratifiedGroupHoldoutTests(unittest.TestCase):
    def test_policy_disjoint_stratified_and_deterministic(self):
        y = []
        groups = []
        for policy in range(40):
            for _ in range(3):
                y.append(policy % 2)
                groups.append(f"p{policy}")
        y = np.asarray(y)
        groups = np.asarray(groups)
        first = repeated_stratified_group_holdout(y, groups, 7, candidates=64)
        second = repeated_stratified_group_holdout(y, groups, 7, candidates=64)
        self.assertEqual(first["testGroups"], second["testGroups"])
        train_groups = set(groups[first["trainIndex"]])
        test_groups = set(groups[first["testIndex"]])
        self.assertFalse(train_groups & test_groups)
        self.assertAlmostEqual(float(y[first["testIndex"]].mean()), 0.5, places=6)

    def test_mixed_label_groups_are_supported(self):
        groups = np.repeat([f"p{i}" for i in range(20)], 4)
        y = np.tile([0, 0, 1, 1], 20)
        split = repeated_stratified_group_holdout(y, groups, 3, candidates=32)
        self.assertIsNotNone(split)
        self.assertEqual(set(y[split["trainIndex"]]), {0, 1})
        self.assertEqual(set(y[split["testIndex"]]), {0, 1})

    def test_impossible_split_returns_none(self):
        y = np.asarray([0, 0, 1, 1])
        groups = np.asarray(["only-zero", "only-zero", "only-one", "only-one"])
        self.assertIsNone(
            repeated_stratified_group_holdout(y, groups, 1, candidates=16)
        )

    def test_manifest_replay_and_power_warning(self):
        rng = np.random.default_rng(4)
        groups = np.repeat([f"p{i}" for i in range(30)], 2)
        y = np.repeat([i % 2 for i in range(30)], 2)
        X = rng.normal(size=(len(y), 3))
        manifest = new_split_manifest(candidates=32)
        first = analyze_contrast(
            X, y, groups, 2, ["lr"], perm_iters=5,
            task_key="demo", split_candidates=32, split_manifest_out=manifest,
        )
        replay = analyze_contrast(
            X, y, groups, 2, ["lr"], perm_iters=5,
            task_key="demo", split_candidates=32, split_manifest_in=manifest,
        )
        self.assertEqual(first["models"]["lr"]["aucMean"], replay["models"]["lr"]["aucMean"])
        self.assertIn("powerWarning", first)


class DatasetLookupTests(unittest.TestCase):
    def test_sharded_capture_is_read_from_its_root(self):
        # "shards/" sorts before "spp_dataset.json", so a plain sorted glob
        # picked shard 0's subset of a merged sharded capture.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "shards" / "shard-0").mkdir(parents=True)
            for name in ("pch_dataset.json", "pi_dataset.json", "spp_dataset.json"):
                (root / name).write_text("[]")
                (root / "shards" / "shard-0" / name).write_text("[]")
                self.assertEqual(find_json(root, name), root / name)


class TaskAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = CAPTURE_DATA_DIR
        cls.pch = json.loads((root / "pch_dataset.json").read_text())
        cls.spp = json.loads((root / "spp_dataset.json").read_text())

    def test_pch_has_js_aligned_20_tasks(self):
        tasks = pch_supervised.build_tasks(self.pch)
        keys = [task["key"] for task in tasks]
        self.assertEqual(len(tasks), 20)
        self.assertEqual(keys[-10:], [f"ICD ch{i}" for i in range(10)])

    def test_spp_has_js_aligned_21_contrasts(self):
        _, _, labels = spp_supervised.build_feature_matrix(self.spp)
        total = 0
        for target in spp_supervised.TARGET_ATTRS:
            total += len(set(labels[target].tolist())) * (len(set(labels[target].tolist())) - 1) // 2
        self.assertEqual(total, 21)
        self.assertIn("nestingDepth", spp_supervised.TARGET_ATTRS)


class ClusteringProtocolTests(unittest.TestCase):
    def test_planted_signal_is_detected(self):
        rng = np.random.default_rng(10)
        y = np.repeat([0, 1], 40)
        X = np.column_stack([y * 20 + rng.normal(0, 0.1, len(y)), rng.normal(size=len(y))])
        result = ensemble_permutation_analysis(
            X, y, 2, kmeans_seeds=3, permutations=50, random_seed=4
        )
        self.assertGreater(result["observed"]["nmi"], 0.9)
        self.assertLess(result["nullNmi"]["pValue"], 0.05)

    def test_bh_q_values_are_monotone_by_rank(self):
        p = np.array([0.03, 0.001, 0.2, 0.04])
        q = benjamini_hochberg(p)
        ranked = q[np.argsort(p)]
        self.assertTrue(np.all(ranked[:-1] <= ranked[1:]))


class AblationProtocolTests(unittest.TestCase):
    def _task(self, X):
        groups = np.repeat([f"p{i}" for i in range(40)], 2)
        y = np.repeat([i % 2 for i in range(40)], 2)
        return {"key": "demo", "X": np.asarray(X, dtype=float), "y": y, "groups": groups}

    def test_identical_profiles_have_zero_delta(self):
        rng = np.random.default_rng(2)
        X = rng.normal(size=(80, 2))
        task = self._task(X)
        result = _paired_seed(task, task, 3, "lr", 64)
        self.assertAlmostEqual(result["b1"], result["b2"], places=12)

    def test_planted_b1_signal_has_positive_delta(self):
        y = np.repeat([i % 2 for i in range(40)], 2)
        b1 = self._task(np.column_stack([y * 100.0, y * 50.0]))
        b2 = self._task(np.zeros((80, 2)))
        result = _paired_seed(b1, b2, 1, "lr", 64)
        delta = abs(result["b1"] - 0.5) - abs(result["b2"] - 0.5)
        self.assertGreater(delta, 0.4)

    def test_alignment_rejects_missing_execution(self):
        base = [{"policyId": "p0", "executionId": 0, "semantics": {}, "policy": {}}]
        with self.assertRaises(ValueError):
            align_records(base, [], "demo")


def pi_rows(n_pairs=4, k=6, shift=0.0, pair_type="semantic_equivalent", seed=0):
    """Synthetic pi_dataset rows: padded gas noise, plus a side-1 gas shift (in SD)."""
    rng = np.random.default_rng(seed)
    rows = []
    for p in range(n_pairs):
        for side in (0, 1):
            for e in range(2 * k):
                granted = e % 2 == 0
                gas = rng.uniform(945e3, 1155e3) + (2000 if granted else 0) + shift * 60620 * side
                rows.append({
                    "policyId": f"{pair_type}-{p}-{side}", "executionId": e,
                    "piPair": {"pairId": f"{pair_type}-{p}", "pairType": pair_type, "side": side},
                    "accessGranted": granted,
                    "features": {"accessGasUsed": gas, "commitGasUsed": rng.uniform(270e3, 330e3),
                                 "accessCalldataLength": 708},
                })
    return rows


class OutcomeStrataTests(unittest.TestCase):
    def test_strata_and_keys(self):
        rows = [{"accessGranted": True}, {"accessGranted": False}, {"satisfy": 1}]
        self.assertEqual([(o, len(r)) for o, r in outcome_strata(rows)], [("granted", 2), ("denied", 1)])
        self.assertEqual([o for o, _ in outcome_strata([{"satisfy": 1}])], [None])
        self.assertEqual(stratum_key(None, "DUO GR"), "DUO GR")
        self.assertEqual(stratum_key("granted", "DUO GR"), "granted | DUO GR")


class OutcomeAdjustedTests(unittest.TestCase):
    def test_single_stratum_matches_plain_analysis(self):
        rng = np.random.default_rng(3)
        groups = np.repeat([f"p{i}" for i in range(60)], 1)
        y = np.array([i % 2 for i in range(60)])
        X = rng.normal(size=(60, 2))
        plain = analyze_contrast(X, y, groups, 3, ["lr"], perm_iters=50, task_key="t")
        ones = analyze_contrast(X, y, groups, 3, ["lr"], perm_iters=50, task_key="t", strata=np.ones(60, int))
        self.assertEqual(plain["models"]["lr"]["perSeed"], ones["models"]["lr"]["perSeed"])

    def test_outcome_imbalance_is_not_leakage(self):
        # Unpadded case: o moves gas by a large constant, and the label classes
        # differ in their granted share (70% vs 30%); the policy label itself
        # has no effect on any feature.
        rng = np.random.default_rng(4)
        n = 400
        y = np.array([i % 2 for i in range(n)])
        o = np.where(y == 1, rng.random(n) < 0.7, rng.random(n) < 0.3).astype(int)
        X = np.column_stack([1e6 + 20000 * o + rng.normal(0, 15, n), rng.normal(size=n)])
        groups = np.array([f"p{i}" for i in range(n)])
        naive = analyze_contrast(X, y, groups, 5, ["lr"], perm_iters=100, task_key="t")
        adjusted = analyze_contrast(X, y, groups, 5, ["lr"], perm_iters=100, task_key="t", strata=o)
        self.assertFalse(naive["passed"])
        self.assertTrue(adjusted["passed"])

    def test_stratified_auc_detects_a_real_effect(self):
        rng = np.random.default_rng(5)
        y = np.repeat([0, 1], 50)
        o = np.tile([0, 1], 50)
        score = y + rng.normal(0, 0.5, 100)
        auc, p = stratified_auc_pvalue(y, score, o, 200, rng)
        self.assertGreater(auc, 0.8)
        self.assertLess(p, 0.01)


class WithinPairPITests(unittest.TestCase):
    def test_split_takes_half_of_every_cell(self):
        pair = load_pairs(pi_rows(n_pairs=1))["semantic_equivalent-0"]
        test = split_pair(pair["y"], pair["o"], 3, "semantic_equivalent-0")
        for side in (0, 1):
            for o in (0, 1):
                cell = (pair["y"] == side) & (pair["o"] == o)
                self.assertEqual(int(test[cell].sum()), 3)
        np.testing.assert_array_equal(test, split_pair(pair["y"], pair["o"], 3, "semantic_equivalent-0"))

    def test_null_passes_and_control_is_detected(self):
        verdict = run_pairs(pi_rows(shift=0.0), 6, ["lr"], "null", 1, perm_iters=100, control_shift=1.5)
        task = verdict["tasks"][0]
        self.assertEqual(task["status"], "PASS")
        self.assertTrue(task["positiveControl"]["detected"])
        self.assertTrue(verdict["overallPassed"])

    def test_planted_side_shift_fails(self):
        verdict = run_pairs(pi_rows(shift=1.5), 6, ["lr"], "leak", 1, perm_iters=100, control_shift=1.5)
        self.assertEqual(verdict["tasks"][0]["status"], "FAIL")
        self.assertFalse(verdict["overallPassed"])

    def test_paired_ablation_seed_is_deterministic(self):
        pairs = load_pairs(pi_rows())
        a = _paired_pi_seed(pairs, pairs, 2, "lr")
        self.assertAlmostEqual(a["b1"], a["b2"], places=12)


if __name__ == "__main__":
    unittest.main()
