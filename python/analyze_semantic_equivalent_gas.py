#!/usr/bin/env python3
"""
分析PI实验中semantic_equivalent类型的accessGasUsed和commitGasUsed分布
"""
import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import pandas as pd

# 定义数据路径
DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "results" / "analysis" / "semantic_equivalent"

def load_pi_pairs(dataset_dirs):
    """加载所有PI pairs数据"""
    all_pairs = []
    for data_dir in dataset_dirs:
        pi_pairs_file = data_dir / "pi_pairs.json"
        if not pi_pairs_file.exists():
            print(f"[warn] {pi_pairs_file} not found, skipping")
            continue

        with open(pi_pairs_file, 'r') as f:
            data = json.load(f)
            if isinstance(data, dict) and "pairs" in data:
                all_pairs.extend(data["pairs"])
            elif isinstance(data, list):
                all_pairs.extend(data)

    return all_pairs

def extract_gas_data_for_semantic_equivalent(pairs):
    """从semantic_equivalent类型的PI pairs中提取gas数据"""
    data = []

    for pair in pairs:
        pair_id = pair.get("pairId")
        pair_type = pair.get("pairType", "unknown")

        # 只处理semantic_equivalent类型
        if pair_type != "semantic_equivalent":
            continue

        policies = pair.get("policies", [])

        for policy_idx, policy in enumerate(policies):
            executions = policy.get("features", [])
            for exec_idx, execution in enumerate(executions):
                features = execution.get("features", {})
                access_gas = features.get("accessGasUsed")
                commit_gas = features.get("commitGasUsed")

                # 转换为数值
                if access_gas is not None:
                    if isinstance(access_gas, str) and access_gas.startswith("0x"):
                        access_gas = int(access_gas, 16)
                    else:
                        access_gas = float(access_gas)

                if commit_gas is not None:
                    if isinstance(commit_gas, str) and commit_gas.startswith("0x"):
                        commit_gas = int(commit_gas, 16)
                    else:
                        commit_gas = float(commit_gas)

                if access_gas is not None and commit_gas is not None:
                    data.append({
                        "pairId": pair_id,
                        "pairType": pair_type,
                        "policyIndex": policy_idx,
                        "executionIndex": exec_idx,
                        "accessGasUsed": access_gas,
                        "commitGasUsed": commit_gas
                    })

    return pd.DataFrame(data)

def compute_statistics(series, name):
    """计算统计数据"""
    stats = {
        "feature": name,
        "count": len(series),
        "mean": series.mean(),
        "std": series.std(),
        "cv": series.std() / series.mean() if series.mean() != 0 else 0,  # 变异系数
        "min": series.min(),
        "25%": series.quantile(0.25),
        "50%": series.quantile(0.50),
        "75%": series.quantile(0.75),
        "max": series.max(),
        "iqr": series.quantile(0.75) - series.quantile(0.25)
    }
    return stats

def plot_histograms(df, output_dir):
    """绘制直方图对比"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. accessGasUsed直方图
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.hist(df["accessGasUsed"], bins=30, color="#0f766e", edgecolor="black", alpha=0.7)
    ax.set_xlabel("accessGasUsed (gas)")
    ax.set_ylabel("Frequency")
    ax.set_title("Semantic Equivalent: accessGasUsed Distribution")
    ax.grid(True, alpha=0.3)

    # 添加统计信息
    mean_val = df["accessGasUsed"].mean()
    median_val = df["accessGasUsed"].median()
    ax.axvline(mean_val, color='red', linestyle='--', linewidth=2, label=f'Mean: {mean_val:,.0f}')
    ax.axvline(median_val, color='orange', linestyle='--', linewidth=2, label=f'Median: {median_val:,.0f}')
    ax.legend()

    plt.tight_layout()
    plt.savefig(output_dir / "semantic_eq_access_gas_hist.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'semantic_eq_access_gas_hist.png'}")

    # 2. commitGasUsed直方图
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.hist(df["commitGasUsed"], bins=30, color="#7c3aed", edgecolor="black", alpha=0.7)
    ax.set_xlabel("commitGasUsed (gas)")
    ax.set_ylabel("Frequency")
    ax.set_title("Semantic Equivalent: commitGasUsed Distribution")
    ax.grid(True, alpha=0.3)

    mean_val = df["commitGasUsed"].mean()
    median_val = df["commitGasUsed"].median()
    ax.axvline(mean_val, color='red', linestyle='--', linewidth=2, label=f'Mean: {mean_val:,.0f}')
    ax.axvline(median_val, color='orange', linestyle='--', linewidth=2, label=f'Median: {median_val:,.0f}')
    ax.legend()

    plt.tight_layout()
    plt.savefig(output_dir / "semantic_eq_commit_gas_hist.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'semantic_eq_commit_gas_hist.png'}")

    # 3. 双图对比
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # accessGasUsed
    axes[0].hist(df["accessGasUsed"], bins=30, color="#0f766e", edgecolor="black", alpha=0.7)
    axes[0].set_xlabel("Gas")
    axes[0].set_ylabel("Frequency")
    axes[0].set_title("accessGasUsed")
    axes[0].grid(True, alpha=0.3)

    # commitGasUsed
    axes[1].hist(df["commitGasUsed"], bins=30, color="#7c3aed", edgecolor="black", alpha=0.7)
    axes[1].set_xlabel("Gas")
    axes[1].set_ylabel("Frequency")
    axes[1].set_title("commitGasUsed")
    axes[1].grid(True, alpha=0.3)

    fig.suptitle("Semantic Equivalent: Gas Distribution Comparison", fontsize=14, y=1.00)
    plt.tight_layout()
    plt.savefig(output_dir / "semantic_eq_gas_comparison.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'semantic_eq_gas_comparison.png'}")

def plot_boxplots(df, output_dir):
    """绘制箱线图对比"""
    fig, ax = plt.subplots(figsize=(10, 6))

    data_to_plot = [df["accessGasUsed"], df["commitGasUsed"]]
    bp = ax.boxplot(data_to_plot, labels=["accessGasUsed", "commitGasUsed"], patch_artist=True)

    colors = ["#0f766e", "#7c3aed"]
    for patch, color in zip(bp['boxes'], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)

    ax.set_ylabel("Gas")
    ax.set_title("Semantic Equivalent: Gas Usage Comparison")
    ax.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    plt.savefig(output_dir / "semantic_eq_gas_boxplot.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'semantic_eq_gas_boxplot.png'}")

def plot_scatter(df, output_dir):
    """绘制accessGasUsed vs commitGasUsed散点图"""
    fig, ax = plt.subplots(figsize=(10, 8))

    # 按policyIndex着色
    colors = ['#0f766e' if idx == 0 else '#e11d48' for idx in df["policyIndex"]]

    ax.scatter(df["commitGasUsed"], df["accessGasUsed"],
               c=colors, s=50, alpha=0.6, edgecolors='black', linewidth=0.5)

    ax.set_xlabel("commitGasUsed (gas)")
    ax.set_ylabel("accessGasUsed (gas)")
    ax.set_title("Semantic Equivalent: commit vs access Gas")
    ax.grid(True, alpha=0.3)

    # 添加图例
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor='#0f766e', label='Policy 0'),
        Patch(facecolor='#e11d48', label='Policy 1')
    ]
    ax.legend(handles=legend_elements, loc='best')

    # 计算相关系数
    corr = df["commitGasUsed"].corr(df["accessGasUsed"])
    ax.text(0.05, 0.95, f'Correlation: {corr:.4f}',
            transform=ax.transAxes, fontsize=12, verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    plt.tight_layout()
    plt.savefig(output_dir / "semantic_eq_commit_vs_access_scatter.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'semantic_eq_commit_vs_access_scatter.png'}")

def analyze_by_policy(df):
    """按policy分析"""
    print("\n" + "="*80)
    print("Analysis by Policy Index")
    print("="*80)

    for policy_idx in sorted(df["policyIndex"].unique()):
        policy_df = df[df["policyIndex"] == policy_idx]
        print(f"\n{'─'*80}")
        print(f"Policy {policy_idx} (n={len(policy_df)})")
        print(f"{'─'*80}")

        access_stats = compute_statistics(policy_df["accessGasUsed"], "accessGasUsed")
        commit_stats = compute_statistics(policy_df["commitGasUsed"], "commitGasUsed")

        print(f"\n  accessGasUsed:")
        print(f"    Mean:   {access_stats['mean']:>15,.2f} ± {access_stats['std']:,.2f}")
        print(f"    Median: {access_stats['50%']:>15,.2f}")
        print(f"    Range:  [{access_stats['min']:,.0f}, {access_stats['max']:,.0f}]")
        print(f"    CV:     {access_stats['cv']:>15.4f}")

        print(f"\n  commitGasUsed:")
        print(f"    Mean:   {commit_stats['mean']:>15,.2f} ± {commit_stats['std']:,.2f}")
        print(f"    Median: {commit_stats['50%']:>15,.2f}")
        print(f"    Range:  [{commit_stats['min']:,.0f}, {commit_stats['max']:,.0f}]")
        print(f"    CV:     {commit_stats['cv']:>15.4f}")

def analyze_pair_differences(df):
    """分析每对策略之间的gas差异"""
    print("\n" + "="*80)
    print("Pair-wise Gas Difference Analysis")
    print("="*80)

    differences = []

    for pair_id in df["pairId"].unique():
        pair_df = df[df["pairId"] == pair_id]

        policy0 = pair_df[pair_df["policyIndex"] == 0]
        policy1 = pair_df[pair_df["policyIndex"] == 1]

        if len(policy0) > 0 and len(policy1) > 0:
            # 使用平均值计算差异
            access_diff = abs(policy0["accessGasUsed"].mean() - policy1["accessGasUsed"].mean())
            commit_diff = abs(policy0["commitGasUsed"].mean() - policy1["commitGasUsed"].mean())

            differences.append({
                "pairId": pair_id,
                "access_gas_diff": access_diff,
                "commit_gas_diff": commit_diff
            })

    if differences:
        diff_df = pd.DataFrame(differences)

        print(f"\nAccess Gas Differences between paired policies:")
        print(f"  Mean difference:   {diff_df['access_gas_diff'].mean():>12,.2f}")
        print(f"  Median difference: {diff_df['access_gas_diff'].median():>12,.2f}")
        print(f"  Min difference:    {diff_df['access_gas_diff'].min():>12,.2f}")
        print(f"  Max difference:    {diff_df['access_gas_diff'].max():>12,.2f}")
        print(f"  Std Dev:           {diff_df['access_gas_diff'].std():>12,.2f}")

        print(f"\nCommit Gas Differences between paired policies:")
        print(f"  Mean difference:   {diff_df['commit_gas_diff'].mean():>12,.2f}")
        print(f"  Median difference: {diff_df['commit_gas_diff'].median():>12,.2f}")
        print(f"  Min difference:    {diff_df['commit_gas_diff'].min():>12,.2f}")
        print(f"  Max difference:    {diff_df['commit_gas_diff'].max():>12,.2f}")
        print(f"  Std Dev:           {diff_df['commit_gas_diff'].std():>12,.2f}")

        return diff_df
    return None

def print_statistics(stats):
    """打印统计结果"""
    print(f"\n{stats['feature']}:")
    print(f"  Count:       {stats['count']:>12}")
    print(f"  Mean:        {stats['mean']:>12,.2f}")
    print(f"  Std Dev:     {stats['std']:>12,.2f}")
    print(f"  CV:          {stats['cv']:>12.4f}")
    print(f"  Min:         {stats['min']:>12,.2f}")
    print(f"  25%:         {stats['25%']:>12,.2f}")
    print(f"  Median:      {stats['50%']:>12,.2f}")
    print(f"  75%:         {stats['75%']:>12,.2f}")
    print(f"  Max:         {stats['max']:>12,.2f}")
    print(f"  IQR:         {stats['iqr']:>12,.2f}")

def main():
    # 发现数据集目录
    dataset_dirs = []
    if DATA_DIR.exists():
        for entry in sorted(DATA_DIR.iterdir()):
            if entry.is_dir() and (entry / "pi_pairs.json").exists():
                dataset_dirs.append(entry)

    if not dataset_dirs:
        print(f"[error] No dataset directories with pi_pairs.json found in {DATA_DIR}")
        return

    print(f"Found {len(dataset_dirs)} dataset directories:")
    for d in dataset_dirs:
        print(f"  - {d}")

    # 加载PI pairs
    print("\nLoading PI pairs...")
    pairs = load_pi_pairs(dataset_dirs)
    print(f"Loaded {len(pairs)} total PI pairs")

    # 提取semantic_equivalent的gas数据
    print("\nExtracting semantic_equivalent gas data...")
    df = extract_gas_data_for_semantic_equivalent(pairs)

    if df.empty:
        print("[error] No semantic_equivalent data found!")
        return

    print(f"Extracted {len(df)} data points from semantic_equivalent pairs")
    print(f"Number of unique pairs: {df['pairId'].nunique()}")

    # 计算总体统计
    print("\n" + "="*80)
    print("Overall Statistics for Semantic Equivalent")
    print("="*80)

    access_stats = compute_statistics(df["accessGasUsed"], "accessGasUsed")
    commit_stats = compute_statistics(df["commitGasUsed"], "commitGasUsed")

    print_statistics(access_stats)
    print_statistics(commit_stats)

    # 按policy分析
    analyze_by_policy(df)

    # 分析配对差异
    diff_df = analyze_pair_differences(df)

    # 绘制可视化图表
    print("\n" + "="*80)
    print("Generating visualizations...")
    print("="*80)
    plot_histograms(df, OUTPUT_DIR)
    plot_boxplots(df, OUTPUT_DIR)
    plot_scatter(df, OUTPUT_DIR)

    # 保存详细数据
    output_csv = OUTPUT_DIR / "semantic_equivalent_gas_data.csv"
    df.to_csv(output_csv, index=False)
    print(f"\n[data] Saved detailed data to: {output_csv}")

    if diff_df is not None:
        diff_csv = OUTPUT_DIR / "semantic_equivalent_pair_differences.csv"
        diff_df.to_csv(diff_csv, index=False)
        print(f"[data] Saved pair differences to: {diff_csv}")

    # 保存统计报告
    report = {
        "overall_statistics": {
            "accessGasUsed": access_stats,
            "commitGasUsed": commit_stats
        },
        "by_policy": {
            str(policy_idx): {
                "accessGasUsed": compute_statistics(
                    df[df["policyIndex"] == policy_idx]["accessGasUsed"],
                    "accessGasUsed"
                ),
                "commitGasUsed": compute_statistics(
                    df[df["policyIndex"] == policy_idx]["commitGasUsed"],
                    "commitGasUsed"
                )
            }
            for policy_idx in sorted(df["policyIndex"].unique())
        },
        "pair_differences": {
            "accessGasUsed": {
                "mean": float(diff_df["access_gas_diff"].mean()) if diff_df is not None else None,
                "median": float(diff_df["access_gas_diff"].median()) if diff_df is not None else None,
                "std": float(diff_df["access_gas_diff"].std()) if diff_df is not None else None
            },
            "commitGasUsed": {
                "mean": float(diff_df["commit_gas_diff"].mean()) if diff_df is not None else None,
                "median": float(diff_df["commit_gas_diff"].median()) if diff_df is not None else None,
                "std": float(diff_df["commit_gas_diff"].std()) if diff_df is not None else None
            }
        } if diff_df is not None else None
    }

    report_json = OUTPUT_DIR / "semantic_equivalent_gas_report.json"
    with open(report_json, 'w') as f:
        json.dump(report, f, indent=2, default=float)
    print(f"[report] Saved analysis report to: {report_json}")

    print("\n✓ Semantic equivalent analysis complete!")

if __name__ == "__main__":
    main()
