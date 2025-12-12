#!/usr/bin/env python3
"""
Print a summary of overfitting metrics from the experiment results.
"""
import json
from pathlib import Path
from typing import Dict, Any

RESULTS_PATH = Path(__file__).parent / "results" / "policy_privacy_report.json"


def load_results() -> Dict[str, Any]:
    with open(RESULTS_PATH) as f:
        return json.load(f)


def print_header(text: str, char: str = "="):
    print(f"\n{char * 70}")
    print(f" {text}")
    print(f"{char * 70}\n")


def interpret_gap(gap: float) -> tuple[str, str]:
    """Return (emoji, description) for overfitting gap."""
    gap_pct = gap * 100
    if gap_pct < 5:
        return "✅", "Healthy"
    elif gap_pct < 7:
        return "⚠️", "Moderate"
    else:
        return "🚨", "Severe"


def print_experiment_results(name: str, evaluations: list):
    """Print results for a single experiment."""
    print(f"\n{name}:")
    print("-" * 70)

    for eval_result in evaluations:
        model = eval_result["model"]
        model_name = "Logistic Regression" if "logistic" in model else "Random Forest"

        test_acc = eval_result["accuracy"] * 100
        train_acc = eval_result["train_accuracy"] * 100
        acc_gap = eval_result["overfitting_gap"] * 100

        test_auc = eval_result.get("auc", 0) * 100
        train_auc = eval_result.get("train_auc", 0) * 100
        auc_gap = eval_result.get("auc_overfitting_gap", 0) * 100

        acc_emoji, acc_status = interpret_gap(eval_result["overfitting_gap"])
        auc_emoji, auc_status = interpret_gap(eval_result.get("auc_overfitting_gap", 0))

        passed = "✅ PASS" if eval_result.get("passed", False) else "❌ FAIL"

        print(f"\n  {model_name}:")
        print(f"    Privacy Test: {passed}")
        print(f"    Test Accuracy:  {test_acc:5.1f}%  |  Train Accuracy:  {train_acc:5.1f}%")
        print(f"    Overfitting Gap: {acc_gap:5.1f}% {acc_emoji} ({acc_status})")
        print(f"    Test AUC:       {test_auc:5.1f}%  |  Train AUC:       {train_auc:5.1f}%")
        print(f"    AUC Gap:        {auc_gap:5.1f}% {auc_emoji} ({auc_status})")


def main():
    print_header("🔍 RANDOM FOREST OVERFITTING ANALYSIS REPORT")

    data = load_results()

    # PCH
    print_header("Policy Content Hiding (PCH)", "-")
    print(f"Samples: {data['pch']['samples']}")
    print_experiment_results("PCH", data["pch"]["evaluations"])

    # SPP
    print_header("Structure & Parameter Privacy (SPP)", "-")

    spp_targets = ["logicStructure", "nestingDepth", "predicateCount", "setSize"]
    for target in spp_targets:
        if target in data["spp"]:
            target_data = data["spp"][target]
            if not target_data.get("skipped"):
                print(f"\nSamples: {target_data['samples']}")
                print_experiment_results(f"SPP - {target}", target_data["evaluations"])

    # Summary
    print_header("📊 KEY FINDINGS", "=")

    # PCH Summary
    pch_rf = data["pch"]["evaluations"][1]
    pch_gap = pch_rf["overfitting_gap"] * 100
    pch_emoji, pch_status = interpret_gap(pch_rf["overfitting_gap"])

    print(f"\n1. PCH Random Forest:")
    print(f"   • Overfitting: {pch_gap:.1f}% {pch_emoji} ({pch_status})")
    print(f"   • Test AUC: {pch_rf['auc']:.3f} (threshold: 0.55)")
    print(f"   • Diagnosis: {'Not overfitting' if pch_gap < 5 else 'Overfitting'}")
    if pch_gap < 5:
        print(f"   • Conclusion: FAILURE is due to REAL gas leakage, not overfitting")
    else:
        print(f"   • Conclusion: Overfitting contributes to failure")

    # SPP Summary
    print(f"\n2. SPP Random Forest:")
    spp_gaps = []
    for target in spp_targets:
        if target in data["spp"] and not data["spp"][target].get("skipped"):
            rf_eval = data["spp"][target]["evaluations"][1]
            gap = rf_eval["overfitting_gap"] * 100
            emoji, status = interpret_gap(rf_eval["overfitting_gap"])
            spp_gaps.append((target, gap, emoji, status))

    for target, gap, emoji, status in sorted(spp_gaps, key=lambda x: -x[1]):
        print(f"   • {target:15} {gap:5.1f}% {emoji} ({status})")

    max_gap = max(g[1] for g in spp_gaps)
    if max_gap >= 7:
        print(f"\n   ⚠️  WARNING: Severe overfitting detected in SPP")
        print(f"   → Consider reducing RF complexity (see OVERFITTING_DIAGNOSIS.md)")
    elif max_gap >= 5:
        print(f"\n   ⚠️  CAUTION: Moderate overfitting detected in SPP")
        print(f"   → Monitor closely, consider parameter tuning")
    else:
        print(f"\n   ✅ SPP overfitting is within healthy range")

    # LR vs RF Comparison
    print(f"\n3. Logistic Regression vs Random Forest:")

    pch_lr = data["pch"]["evaluations"][0]
    print(f"   PCH:")
    print(f"   • LR overfitting: {pch_lr['overfitting_gap']*100:.1f}%")
    print(f"   • RF overfitting: {pch_rf['overfitting_gap']*100:.1f}%")
    print(f"   • LR test AUC: {pch_lr['auc']:.3f}, RF test AUC: {pch_rf['auc']:.3f}")

    if pch_lr['auc'] > 0.55 and pch_rf['auc'] > 0.55:
        print(f"   → Both models fail → REAL gas leakage problem")
    elif pch_rf['auc'] > 0.55 and pch_lr['auc'] <= 0.55:
        if pch_gap < 5:
            print(f"   → RF fails but not overfitting → RF better at learning gas patterns")
        else:
            print(f"   → RF fails due to overfitting → Simplify RF")

    # Recommendations
    print_header("💡 RECOMMENDATIONS", "=")

    if pch_gap >= 5 or max_gap >= 7:
        print("\n🔧 SHORT-TERM (Reduce Overfitting):")
        print("   1. Tune RF hyperparameters:")
        print("      • n_estimators: 100 → 50")
        print("      • min_samples_split: 10 → 20")
        print("      • min_samples_leaf: 5 → 10")
        print("      • Add: max_features='sqrt'")
        print("\n   2. Use cross-validation instead of single train-test split")
        print("\n   3. Increase outlier filtering (OUTLIER_THRESHOLD_MULTIPLIER: 1.5 → 1.0)")

    print("\n🏗️  LONG-TERM (Root Cause):")
    print("   1. Add gas padding in smart contracts (PolicyPrivacyManager.sol)")
    print("      • Random padding: 0-2000 gas")
    print("      • Use block.timestamp, msg.sender for randomness")
    print("\n   2. This will solve BOTH overfitting AND real gas leakage")

    print_header("📁 OUTPUT FILES", "=")
    print("\nGenerated files:")
    print("  • results/overfitting_analysis.md - Detailed analysis")
    print("  • results/OVERFITTING_DIAGNOSIS.md - Complete guide")
    print("  • results/overfitting_analysis/*.png - Visualizations")
    print("\nView visualizations:")
    print("  open results/overfitting_analysis/train_vs_test_comparison.png")
    print("  open results/overfitting_analysis/overfitting_heatmap.png")
    print("  open results/overfitting_analysis/rf_vs_lr_overfitting.png")

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
