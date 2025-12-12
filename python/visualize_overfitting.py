#!/usr/bin/env python3
"""
Visualize overfitting metrics from policy privacy experiments.
"""
import json
import matplotlib.pyplot as plt
import matplotlib
import numpy as np
from pathlib import Path

matplotlib.use("Agg")

RESULTS_PATH = Path(__file__).parent / "results" / "policy_privacy_report.json"
OUTPUT_DIR = Path(__file__).parent / "results" / "overfitting_analysis"


def load_results():
    with open(RESULTS_PATH) as f:
        return json.load(f)


def plot_overfitting_comparison(data, output_path):
    """Plot train vs test accuracy/AUC comparison."""
    experiments = []
    models = []
    train_acc = []
    test_acc = []
    train_auc = []
    test_auc = []

    # PCH
    for eval_result in data["pch"]["evaluations"]:
        experiments.append("PCH")
        models.append(eval_result["model"])
        train_acc.append(eval_result["train_accuracy"] * 100)
        test_acc.append(eval_result["accuracy"] * 100)
        train_auc.append(eval_result.get("train_auc", 0) * 100)
        test_auc.append(eval_result.get("auc", 0) * 100)

    # SPP
    for target in ["logicStructure", "nestingDepth", "predicateCount", "setSize"]:
        if target in data["spp"]:
            for eval_result in data["spp"][target]["evaluations"]:
                experiments.append(f"SPP-{target}")
                models.append(eval_result["model"])
                train_acc.append(eval_result["train_accuracy"] * 100)
                test_acc.append(eval_result["accuracy"] * 100)
                train_auc.append(eval_result.get("train_auc", 0) * 100)
                test_auc.append(eval_result.get("auc", 0) * 100)

    # Create figure with subplots
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    # Plot accuracy
    x = np.arange(len(experiments))
    width = 0.35

    bars1 = ax1.bar(x - width/2, train_acc, width, label='Training', alpha=0.8, color='#3b82f6')
    bars2 = ax1.bar(x + width/2, test_acc, width, label='Testing', alpha=0.8, color='#ef4444')

    ax1.set_ylabel('Accuracy (%)', fontsize=11)
    ax1.set_title('Training vs Testing Accuracy (Overfitting Detection)', fontsize=13, fontweight='bold')
    ax1.set_xticks(x)
    ax1.set_xticklabels([f"{exp}\n{model.replace('_', ' ').title()}"
                         for exp, model in zip(experiments, models)],
                         rotation=45, ha='right', fontsize=8)
    ax1.legend()
    ax1.grid(axis='y', alpha=0.3)
    ax1.axhline(y=50, color='gray', linestyle='--', alpha=0.5, linewidth=0.8)

    # Add gap annotations for RF only
    for i, (exp, model, train, test) in enumerate(zip(experiments, models, train_acc, test_acc)):
        if 'random_forest' in model:
            gap = train - test
            y_pos = max(train, test) + 2
            color = '#dc2626' if gap > 7 else '#f59e0b' if gap > 5 else '#10b981'
            ax1.annotate(f'Δ={gap:.1f}%',
                        xy=(i, y_pos),
                        fontsize=7,
                        ha='center',
                        color=color,
                        fontweight='bold')

    # Plot AUC
    bars3 = ax2.bar(x - width/2, train_auc, width, label='Training', alpha=0.8, color='#3b82f6')
    bars4 = ax2.bar(x + width/2, test_auc, width, label='Testing', alpha=0.8, color='#ef4444')

    ax2.set_ylabel('AUC (%)', fontsize=11)
    ax2.set_title('Training vs Testing AUC (Overfitting Detection)', fontsize=13, fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels([f"{exp}\n{model.replace('_', ' ').title()}"
                         for exp, model in zip(experiments, models)],
                         rotation=45, ha='right', fontsize=8)
    ax2.legend()
    ax2.grid(axis='y', alpha=0.3)
    ax2.axhline(y=50, color='gray', linestyle='--', alpha=0.5, linewidth=0.8)
    ax2.axhline(y=55, color='red', linestyle='--', alpha=0.5, linewidth=1, label='Privacy Threshold')

    # Add gap annotations for RF only
    for i, (exp, model, train, test) in enumerate(zip(experiments, models, train_auc, test_auc)):
        if 'random_forest' in model:
            gap = train - test
            y_pos = max(train, test) + 2
            color = '#dc2626' if gap > 7 else '#f59e0b' if gap > 5 else '#10b981'
            ax2.annotate(f'Δ={gap:.1f}%',
                        xy=(i, y_pos),
                        fontsize=7,
                        ha='center',
                        color=color,
                        fontweight='bold')

    plt.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"✓ Saved: {output_path}")


def plot_overfitting_heatmap(data, output_path):
    """Create a heatmap showing overfitting severity."""
    experiments = []
    acc_gaps = []
    auc_gaps = []

    # PCH
    for eval_result in data["pch"]["evaluations"]:
        model = eval_result["model"]
        experiments.append(f"PCH-{model.replace('random_', 'RF').replace('logistic_regression', 'LR')}")
        acc_gaps.append(eval_result["overfitting_gap"] * 100)
        auc_gaps.append(eval_result.get("auc_overfitting_gap", 0) * 100)

    # SPP
    for target in ["logicStructure", "nestingDepth", "predicateCount", "setSize"]:
        if target in data["spp"]:
            for eval_result in data["spp"][target]["evaluations"]:
                model = eval_result["model"]
                model_short = "RF" if "random" in model else "LR"
                experiments.append(f"SPP-{target}-{model_short}")
                acc_gaps.append(eval_result["overfitting_gap"] * 100)
                auc_gaps.append(eval_result.get("auc_overfitting_gap", 0) * 100)

    # Create heatmap data
    heatmap_data = np.array([acc_gaps, auc_gaps])

    fig, ax = plt.subplots(figsize=(14, 4))

    # Custom colormap: green (good) -> yellow -> red (bad)
    cmap = plt.cm.RdYlGn_r
    im = ax.imshow(heatmap_data, cmap=cmap, aspect='auto', vmin=0, vmax=12)

    # Set ticks and labels
    ax.set_xticks(np.arange(len(experiments)))
    ax.set_yticks(np.arange(2))
    ax.set_xticklabels(experiments, rotation=45, ha='right', fontsize=8)
    ax.set_yticklabels(['Accuracy Gap (%)', 'AUC Gap (%)'], fontsize=10)

    # Add text annotations
    for i in range(2):
        for j in range(len(experiments)):
            value = heatmap_data[i, j]
            text_color = 'white' if value > 6 else 'black'
            severity = '🚨' if value > 7 else '⚠️' if value > 5 else '✓'
            text = ax.text(j, i, f'{value:.1f}%\n{severity}',
                          ha="center", va="center", color=text_color, fontsize=7, fontweight='bold')

    ax.set_title('Overfitting Severity Heatmap (Train-Test Gap)', fontsize=13, fontweight='bold', pad=15)

    # Add colorbar
    cbar = plt.colorbar(im, ax=ax, orientation='vertical', pad=0.02)
    cbar.set_label('Overfitting Gap (%)', rotation=270, labelpad=20, fontsize=10)

    # Add severity legend
    legend_text = "✓ Healthy (<5%)  |  ⚠️ Moderate (5-7%)  |  🚨 Severe (>7%)"
    fig.text(0.5, 0.02, legend_text, ha='center', fontsize=9,
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.3))

    plt.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"✓ Saved: {output_path}")


def plot_rf_vs_lr_comparison(data, output_path):
    """Compare RF and LR overfitting side by side."""
    targets = []
    rf_acc_gap = []
    lr_acc_gap = []
    rf_auc_gap = []
    lr_auc_gap = []

    # PCH
    pch_evals = data["pch"]["evaluations"]
    targets.append("PCH")
    lr_acc_gap.append(pch_evals[0]["overfitting_gap"] * 100)
    rf_acc_gap.append(pch_evals[1]["overfitting_gap"] * 100)
    lr_auc_gap.append(pch_evals[0].get("auc_overfitting_gap", 0) * 100)
    rf_auc_gap.append(pch_evals[1].get("auc_overfitting_gap", 0) * 100)

    # SPP
    for target in ["logicStructure", "nestingDepth", "predicateCount", "setSize"]:
        if target in data["spp"]:
            evals = data["spp"][target]["evaluations"]
            targets.append(f"SPP\n{target}")
            lr_acc_gap.append(evals[0]["overfitting_gap"] * 100)
            rf_acc_gap.append(evals[1]["overfitting_gap"] * 100)
            lr_auc_gap.append(evals[0].get("auc_overfitting_gap", 0) * 100)
            rf_auc_gap.append(evals[1].get("auc_overfitting_gap", 0) * 100)

    x = np.arange(len(targets))
    width = 0.35

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # Accuracy gap comparison
    bars1 = ax1.bar(x - width/2, lr_acc_gap, width, label='Logistic Regression',
                    alpha=0.8, color='#6366f1')
    bars2 = ax1.bar(x + width/2, rf_acc_gap, width, label='Random Forest',
                    alpha=0.8, color='#f59e0b')

    ax1.axhline(y=5, color='green', linestyle='--', alpha=0.5, linewidth=1, label='Healthy (<5%)')
    ax1.axhline(y=7, color='orange', linestyle='--', alpha=0.5, linewidth=1, label='Moderate (7%)')
    ax1.set_ylabel('Overfitting Gap (%)', fontsize=11)
    ax1.set_title('Accuracy Overfitting: RF vs LR', fontsize=13, fontweight='bold')
    ax1.set_xticks(x)
    ax1.set_xticklabels(targets, fontsize=9)
    ax1.legend()
    ax1.grid(axis='y', alpha=0.3)

    # AUC gap comparison
    bars3 = ax2.bar(x - width/2, lr_auc_gap, width, label='Logistic Regression',
                    alpha=0.8, color='#6366f1')
    bars4 = ax2.bar(x + width/2, rf_auc_gap, width, label='Random Forest',
                    alpha=0.8, color='#f59e0b')

    ax2.axhline(y=5, color='green', linestyle='--', alpha=0.5, linewidth=1, label='Healthy (<5%)')
    ax2.axhline(y=7, color='orange', linestyle='--', alpha=0.5, linewidth=1, label='Moderate (7%)')
    ax2.set_ylabel('AUC Overfitting Gap (%)', fontsize=11)
    ax2.set_title('AUC Overfitting: RF vs LR', fontsize=13, fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels(targets, fontsize=9)
    ax2.legend()
    ax2.grid(axis='y', alpha=0.3)

    plt.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"✓ Saved: {output_path}")


def main():
    print("Loading results...")
    data = load_results()

    print("\nGenerating overfitting visualizations...")
    plot_overfitting_comparison(data, OUTPUT_DIR / "train_vs_test_comparison.png")
    plot_overfitting_heatmap(data, OUTPUT_DIR / "overfitting_heatmap.png")
    plot_rf_vs_lr_comparison(data, OUTPUT_DIR / "rf_vs_lr_overfitting.png")

    print(f"\n✓ All visualizations saved to: {OUTPUT_DIR}")
    print("\nKey insights:")

    # Calculate summary stats
    pch_rf_gap = data["pch"]["evaluations"][1]["overfitting_gap"] * 100
    spp_rf_gaps = []
    for target in ["logicStructure", "nestingDepth", "predicateCount", "setSize"]:
        if target in data["spp"]:
            gap = data["spp"][target]["evaluations"][1]["overfitting_gap"] * 100
            spp_rf_gaps.append((target, gap))

    print(f"  • PCH RF overfitting: {pch_rf_gap:.1f}% (✓ Healthy)")
    print(f"  • SPP RF overfitting:")
    for target, gap in sorted(spp_rf_gaps, key=lambda x: -x[1]):
        severity = "🚨 Severe" if gap > 7 else "⚠️ Moderate" if gap > 5 else "✓ Healthy"
        print(f"    - {target}: {gap:.1f}% ({severity})")


if __name__ == "__main__":
    main()
