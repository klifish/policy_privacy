import json
import sys
import unittest
from pathlib import Path

import numpy as np


REPO = Path(__file__).resolve().parents[2]
SUPERVISED = REPO / "python" / "supervised_analysis"
CLUSTERING = REPO / "python" / "clustering_analysis"
sys.path.insert(0, str(SUPERVISED))
sys.path.insert(0, str(CLUSTERING))

from common import (  # noqa: E402
    analyze_contrast,
    new_split_manifest,
    repeated_stratified_group_holdout,
)
import pch_supervised  # noqa: E402
import spp_supervised  # noqa: E402
from clustering_stats import benjamini_hochberg, ensemble_permutation_analysis  # noqa: E402
from run_ablation_supervised import _paired_seed, align_records  # noqa: E402


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


class TaskAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = REPO / "experiments" / "unified" / "artifacts_data" / "polygonAmoy"
        cls.pch = json.loads((root / "pch_dataset.json").read_text())
        cls.spp = json.loads((root / "spp_dataset.json").read_text())

    def test_pch_has_js_aligned_16_tasks(self):
        tasks = pch_supervised.build_tasks(self.pch)
        keys = [task["key"] for task in tasks]
        self.assertEqual(len(tasks), 16)
        self.assertEqual(keys[-10:], [f"ICD ch{i}" for i in range(10)])

    def test_spp_has_js_aligned_28_contrasts(self):
        _, _, labels = spp_supervised.build_feature_matrix(self.spp)
        total = 0
        for target in spp_supervised.TARGET_ATTRS:
            total += len(set(labels[target].tolist())) * (len(set(labels[target].tolist())) - 1) // 2
        self.assertEqual(total, 28)
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


if __name__ == "__main__":
    unittest.main()
