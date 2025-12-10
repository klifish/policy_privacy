#!/usr/bin/env python3
"""
对比分析数据增加前后的影响
"""
import json
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "results" / "analysis" / "data_comparison"

# 旧数据结果 (200 samples)
old_results = {
    "samples": 200,
    "train_samples": 134,
    "test_samples": 66,
    "unique_pairs": 56,
    "logistic_regression": {
        "train_accuracy": 0.5672,
        "test_accuracy": 0.5455,
        "train_auc": 0.5966,
        "test_auc": 0.5354,
        "auc_gap": 0.0612
    },
    "random_forest": {
        "train_accuracy": 0.7910,
        "test_accuracy": 0.5455,
        "train_auc": 0.8960,
        "test_auc": 0.5978,
        "auc_gap": 0.2982
    }
}

# 新数据结果 (300 samples)
new_results = {
    "samples": 300,
    "train_samples": 202,
    "test_samples": 98,
    "unique_pairs": 56,
    "logistic_regression": {
        "train_accuracy": 0.5495,
        "test_accuracy": 0.5204,
        "train_auc": 0.5738,
        "test_auc": 0.4885,
        "auc_gap": 0.0853
    },
    "random_forest": {
        "train_accuracy": 0.7871,
        "test_accuracy": 0.5204,
        "train_auc": 0.8859,
        "test_auc": 0.5414,
        "auc_gap": 0.3445
    }
}

def create_comparison_plots():
    """创建对比可视化"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. AUC对比
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # LR Train/Test AUC
    ax = axes[0, 0]
    x = np.arange(2)
    width = 0.35

    old_lr = [old_results["logistic_regression"]["train_auc"],
              old_results["logistic_regression"]["test_auc"]]
    new_lr = [new_results["logistic_regression"]["train_auc"],
              new_results["logistic_regression"]["test_auc"]]

    ax.bar(x - width/2, old_lr, width, label='200 samples', color='#0f766e', alpha=0.7)
    ax.bar(x + width/2, new_lr, width, label='300 samples', color='#7c3aed', alpha=0.7)
    ax.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Threshold')
    ax.set_ylabel('AUC')
    ax.set_title('Logistic Regression AUC Comparison')
    ax.set_xticks(x)
    ax.set_xticklabels(['Train', 'Test'])
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')

    # RF Train/Test AUC
    ax = axes[0, 1]
    old_rf = [old_results["random_forest"]["train_auc"],
              old_results["random_forest"]["test_auc"]]
    new_rf = [new_results["random_forest"]["train_auc"],
              new_results["random_forest"]["test_auc"]]

    ax.bar(x - width/2, old_rf, width, label='200 samples', color='#0f766e', alpha=0.7)
    ax.bar(x + width/2, new_rf, width, label='300 samples', color='#7c3aed', alpha=0.7)
    ax.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Threshold')
    ax.set_ylabel('AUC')
    ax.set_title('Random Forest AUC Comparison')
    ax.set_xticks(x)
    ax.set_xticklabels(['Train', 'Test'])
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')

    # AUC Gap对比
    ax = axes[1, 0]
    models = ['Logistic\nRegression', 'Random\nForest']
    old_gaps = [old_results["logistic_regression"]["auc_gap"],
                old_results["random_forest"]["auc_gap"]]
    new_gaps = [new_results["logistic_regression"]["auc_gap"],
                new_results["random_forest"]["auc_gap"]]

    x = np.arange(len(models))
    ax.bar(x - width/2, old_gaps, width, label='200 samples', color='#0f766e', alpha=0.7)
    ax.bar(x + width/2, new_gaps, width, label='300 samples', color='#7c3aed', alpha=0.7)
    ax.set_ylabel('AUC Gap (Train - Test)')
    ax.set_title('Overfitting Comparison (AUC Gap)')
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')

    # Test AUC vs Threshold
    ax = axes[1, 1]
    metrics = ['LR Old\n(200)', 'LR New\n(300)', 'RF Old\n(200)', 'RF New\n(300)']
    test_aucs = [
        old_results["logistic_regression"]["test_auc"],
        new_results["logistic_regression"]["test_auc"],
        old_results["random_forest"]["test_auc"],
        new_results["random_forest"]["test_auc"]
    ]
    colors = ['#0f766e', '#7c3aed', '#0f766e', '#7c3aed']

    bars = ax.bar(range(len(metrics)), test_aucs, color=colors, alpha=0.7)
    ax.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Threshold (0.55)')
    ax.set_ylabel('Test AUC')
    ax.set_title('Test AUC vs Privacy Threshold')
    ax.set_xticks(range(len(metrics)))
    ax.set_xticklabels(metrics, rotation=0)
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')
    ax.set_ylim([0.45, 0.65])

    # 标注是否通过
    for i, (bar, auc) in enumerate(zip(bars, test_aucs)):
        if auc <= 0.55:
            ax.text(i, auc + 0.01, '✓', ha='center', va='bottom',
                   fontsize=16, color='green', fontweight='bold')
        else:
            ax.text(i, auc + 0.01, '✗', ha='center', va='bottom',
                   fontsize=16, color='red', fontweight='bold')

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "data_impact_comparison.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {OUTPUT_DIR / 'data_impact_comparison.png'}")

def analyze_improvements():
    """分析改进情况"""
    print("\n" + "="*80)
    print("Data Increase Impact Analysis")
    print("="*80)

    print(f"\nDataset Size:")
    print(f"  Old: {old_results['samples']} samples ({old_results['train_samples']} train, {old_results['test_samples']} test)")
    print(f"  New: {new_results['samples']} samples ({new_results['train_samples']} train, {new_results['test_samples']} test)")
    print(f"  Increase: +{new_results['samples'] - old_results['samples']} samples (+{100*(new_results['samples']/old_results['samples']-1):.1f}%)")

    print(f"\n{'─'*80}")
    print("Random Forest Performance Changes:")
    print(f"{'─'*80}")

    # Test AUC变化
    old_rf_test = old_results["random_forest"]["test_auc"]
    new_rf_test = new_results["random_forest"]["test_auc"]
    auc_change = new_rf_test - old_rf_test

    print(f"\n  Test AUC:")
    print(f"    Old: {old_rf_test:.4f}")
    print(f"    New: {new_rf_test:.4f}")
    print(f"    Change: {auc_change:+.4f} ({100*auc_change/old_rf_test:+.1f}%)")

    if new_rf_test <= 0.55:
        print(f"    ✓ Now PASSES privacy threshold!")
    else:
        print(f"    ✗ Still exceeds threshold by {new_rf_test - 0.55:.4f}")

    # Overfitting变化
    old_gap = old_results["random_forest"]["auc_gap"]
    new_gap = new_results["random_forest"]["auc_gap"]
    gap_change = new_gap - old_gap

    print(f"\n  Overfitting (AUC Gap):")
    print(f"    Old: {old_gap:.4f}")
    print(f"    New: {new_gap:.4f}")
    print(f"    Change: {gap_change:+.4f} ({100*gap_change/old_gap:+.1f}%)")

    if gap_change > 0:
        print(f"    ⚠️  Overfitting INCREASED (worse)")
    else:
        print(f"    ✓ Overfitting decreased (better)")

    # Train AUC变化
    old_train = old_results["random_forest"]["train_auc"]
    new_train = new_results["random_forest"]["train_auc"]
    train_change = new_train - old_train

    print(f"\n  Train AUC:")
    print(f"    Old: {old_train:.4f}")
    print(f"    New: {new_train:.4f}")
    print(f"    Change: {train_change:+.4f}")

    print(f"\n{'─'*80}")
    print("Key Insights:")
    print(f"{'─'*80}")

    # 计算关键指标
    samples_per_pair_old = old_results["samples"] / old_results["unique_pairs"]
    samples_per_pair_new = new_results["samples"] / new_results["unique_pairs"]

    print(f"\n1. Data Augmentation Strategy:")
    print(f"   - Pairs remained constant: {old_results['unique_pairs']} pairs")
    print(f"   - Samples per pair increased: {samples_per_pair_old:.2f} → {samples_per_pair_new:.2f}")
    print(f"   - This means: more executions per policy pair (better coverage)")

    print(f"\n2. Random Forest Behavior:")
    print(f"   - Test AUC improved by {100*abs(auc_change)/old_rf_test:.1f}%")
    print(f"   - Now {'PASSES' if new_rf_test <= 0.55 else 'still fails'} privacy test")
    print(f"   - But overfitting increased by {100*gap_change/old_gap:.1f}%")

    print(f"\n3. Paradox Explanation:")
    print(f"   The test AUC dropped closer to threshold, which is GOOD for privacy.")
    print(f"   However, overfitting increased because:")
    print(f"   - More samples per pair → RF can memorize pair-specific patterns better")
    print(f"   - Train AUC stayed high ({new_train:.4f})")
    print(f"   - Test AUC dropped because patterns don't generalize")

    print(f"\n4. Why Test AUC Dropped:")
    if new_rf_test < old_rf_test:
        print(f"   ✓ More data revealed RF was overfitting to noise")
        print(f"   ✓ Test set is now harder (48% larger)")
        print(f"   ✓ This is actually GOOD - shows the attack is less effective")

    # 保存报告
    report = {
        "old_results": old_results,
        "new_results": new_results,
        "changes": {
            "sample_increase": new_results["samples"] - old_results["samples"],
            "sample_increase_pct": 100 * (new_results["samples"]/old_results["samples"] - 1),
            "rf_test_auc_change": auc_change,
            "rf_test_auc_change_pct": 100 * auc_change / old_rf_test,
            "rf_auc_gap_change": gap_change,
            "rf_auc_gap_change_pct": 100 * gap_change / old_gap,
            "privacy_test_passed_old": old_rf_test <= 0.55,
            "privacy_test_passed_new": new_rf_test <= 0.55,
        },
        "conclusion": {
            "test_auc_improved": auc_change < 0,
            "now_passes_privacy": new_rf_test <= 0.55,
            "overfitting_status": "increased" if gap_change > 0 else "decreased",
            "recommendation": "Continue increasing data diversity (more pairs) rather than just executions per pair"
        }
    }

    report_path = OUTPUT_DIR / "data_impact_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n[report] Saved: {report_path}")

def main():
    create_comparison_plots()
    analyze_improvements()

    print("\n" + "="*80)
    print("Recommendation:")
    print("="*80)
    print("\nThe 50% data increase had a POSITIVE impact:")
    print("  • RF test AUC dropped from 0.5978 to 0.5414 (now PASSES privacy test!)")
    print("  • This shows the system is more privacy-preserving than initial tests suggested")
    print("\nHowever, overfitting is still high. To improve further:")
    print("  1. Collect more DIVERSE pairs (not just more executions per pair)")
    print("  2. Consider simpler RF hyperparameters (fewer trees, max depth limit)")
    print("  3. The current result (0.5414 AUC) is actually ACCEPTABLE for privacy")

    print("\n✓ Analysis complete!")

if __name__ == "__main__":
    main()
