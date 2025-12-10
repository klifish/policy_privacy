#!/usr/bin/env python3
"""
详细分析SPP logicStructure的数据分布
"""
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from collections import Counter

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "results" / "analysis" / "logic_structure_data"

FEATURE_KEYS = ("commitGasUsed", "accessGasUsed")

def load_spp_dataset(dataset_dirs):
    """加载SPP数据集"""
    all_records = []
    for data_dir in dataset_dirs:
        spp_file = data_dir / "spp_dataset.json"
        if not spp_file.exists():
            continue
        with open(spp_file, 'r') as f:
            data = json.load(f)
            if isinstance(data, list):
                all_records.extend(data)
    return all_records

def extract_feature_row(feature_bag):
    """提取特征"""
    row = {}
    for key in FEATURE_KEYS:
        value = feature_bag.get(key)
        if value is None:
            return None
        if isinstance(value, str) and value.startswith("0x"):
            value = int(value, 16)
        else:
            value = float(value)
        row[key] = value
    return row

def prepare_data(records):
    """准备数据"""
    rows = []
    for record in records:
        logic_structure = record.get("logicStructure")
        if logic_structure is None:
            continue
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            continue
        rows.append({
            "logicStructure": logic_structure,
            "commitGasUsed": features["commitGasUsed"],
            "accessGasUsed": features["accessGasUsed"],
        })

    return pd.DataFrame(rows)

def analyze_distribution(df):
    """分析分布"""
    print("\n" + "="*100)
    print("DATA DISTRIBUTION ANALYSIS")
    print("="*100)

    print(f"\nTotal samples: {len(df)}")
    print(f"Class distribution:")
    for label, count in sorted(Counter(df["logicStructure"]).items()):
        print(f"  {label}: {count} ({100*count/len(df):.1f}%)")

    print("\n" + "─"*100)
    print("FEATURE STATISTICS BY CLASS")
    print("─"*100)

    for label in sorted(df["logicStructure"].unique()):
        label_df = df[df["logicStructure"] == label]
        print(f"\n{label.upper()} (n={len(label_df)}):")

        print(f"  accessGasUsed:")
        print(f"    Mean:   {label_df['accessGasUsed'].mean():>15,.2f}")
        print(f"    Std:    {label_df['accessGasUsed'].std():>15,.2f}")
        print(f"    CV:     {label_df['accessGasUsed'].std()/label_df['accessGasUsed'].mean():>15.6f}")
        print(f"    Min:    {label_df['accessGasUsed'].min():>15,.0f}")
        print(f"    Q1:     {label_df['accessGasUsed'].quantile(0.25):>15,.0f}")
        print(f"    Median: {label_df['accessGasUsed'].median():>15,.0f}")
        print(f"    Q3:     {label_df['accessGasUsed'].quantile(0.75):>15,.0f}")
        print(f"    Max:    {label_df['accessGasUsed'].max():>15,.0f}")
        print(f"    Range:  {label_df['accessGasUsed'].max() - label_df['accessGasUsed'].min():>15,.0f}")

        print(f"  commitGasUsed:")
        print(f"    Mean:   {label_df['commitGasUsed'].mean():>15,.2f}")
        print(f"    Std:    {label_df['commitGasUsed'].std():>15,.2f}")
        print(f"    CV:     {label_df['commitGasUsed'].std()/label_df['commitGasUsed'].mean():>15.6f}")
        print(f"    Min:    {label_df['commitGasUsed'].min():>15,.0f}")
        print(f"    Q1:     {label_df['commitGasUsed'].quantile(0.25):>15,.0f}")
        print(f"    Median: {label_df['commitGasUsed'].median():>15,.0f}")
        print(f"    Q3:     {label_df['commitGasUsed'].quantile(0.75):>15,.0f}")
        print(f"    Max:    {label_df['commitGasUsed'].max():>15,.0f}")
        print(f"    Range:  {label_df['commitGasUsed'].max() - label_df['commitGasUsed'].min():>15,.0f}")

def analyze_separability(df):
    """分析类别可分性"""
    print("\n" + "="*100)
    print("CLASS SEPARABILITY ANALYSIS")
    print("="*100)

    labels = sorted(df["logicStructure"].unique())

    # 计算中心点
    centroids = {}
    for label in labels:
        label_df = df[df["logicStructure"] == label]
        centroids[label] = {
            "accessGasUsed": label_df["accessGasUsed"].mean(),
            "commitGasUsed": label_df["commitGasUsed"].mean(),
        }

    print("\nClass Centroids:")
    print(f"{'Class':<20} {'accessGasUsed':>20} {'commitGasUsed':>20}")
    print("─"*65)
    for label in labels:
        c = centroids[label]
        print(f"{label:<20} {c['accessGasUsed']:>20,.2f} {c['commitGasUsed']:>20,.2f}")

    # 计算两两距离
    print("\nPairwise Centroid Distances:")
    print(f"{'Pair':<45} {'Euclidean':>15} {'accessGas Δ':>15} {'commitGas Δ':>15}")
    print("─"*95)

    for i, label1 in enumerate(labels):
        for label2 in labels[i+1:]:
            c1 = centroids[label1]
            c2 = centroids[label2]

            access_diff = abs(c1["accessGasUsed"] - c2["accessGasUsed"])
            commit_diff = abs(c1["commitGasUsed"] - c2["commitGasUsed"])
            euclidean = np.sqrt(access_diff**2 + commit_diff**2)

            pair_name = f"{label1} <-> {label2}"
            print(f"{pair_name:<45} {euclidean:>15,.2f} {access_diff:>15,.2f} {commit_diff:>15,.2f}")

    # 类内vs类间方差比较
    print("\nWithin-Class vs Between-Class Variance:")

    overall_access_mean = df["accessGasUsed"].mean()
    overall_commit_mean = df["commitGasUsed"].mean()

    # 计算类内方差
    within_access = 0
    within_commit = 0
    for label in labels:
        label_df = df[df["logicStructure"] == label]
        within_access += label_df["accessGasUsed"].var() * len(label_df)
        within_commit += label_df["commitGasUsed"].var() * len(label_df)
    within_access /= len(df)
    within_commit /= len(df)

    # 计算类间方差
    between_access = sum(
        len(df[df["logicStructure"] == label]) *
        (centroids[label]["accessGasUsed"] - overall_access_mean)**2
        for label in labels
    ) / len(df)

    between_commit = sum(
        len(df[df["logicStructure"] == label]) *
        (centroids[label]["commitGasUsed"] - overall_commit_mean)**2
        for label in labels
    ) / len(df)

    print(f"\naccessGasUsed:")
    print(f"  Within-class variance:  {within_access:>15,.2f}")
    print(f"  Between-class variance: {between_access:>15,.2f}")
    print(f"  Ratio (between/within): {between_access/within_access:>15,.4f}")
    print(f"  Interpretation: {'Highly separable' if between_access/within_access > 1 else 'Overlapping'}")

    print(f"\ncommitGasUsed:")
    print(f"  Within-class variance:  {within_commit:>15,.2f}")
    print(f"  Between-class variance: {between_commit:>15,.2f}")
    print(f"  Ratio (between/within): {between_commit/within_commit:>15,.4f}")
    print(f"  Interpretation: {'Highly separable' if between_commit/within_commit > 1 else 'Overlapping'}")

def plot_distributions(df, output_dir):
    """绘制分布图"""
    output_dir.mkdir(parents=True, exist_ok=True)

    labels = sorted(df["logicStructure"].unique())
    colors = {'and_only': '#3b82f6', 'and_or_mixed': '#10b981', 'negation_heavy': '#f59e0b'}

    # 1. 双特征散点图
    fig, ax = plt.subplots(figsize=(12, 10))

    for label in labels:
        label_df = df[df["logicStructure"] == label]
        ax.scatter(
            label_df["commitGasUsed"],
            label_df["accessGasUsed"],
            c=colors[label],
            label=label,
            s=50,
            alpha=0.6,
            edgecolors='black',
            linewidth=0.5
        )

    # 添加中心点
    for label in labels:
        label_df = df[df["logicStructure"] == label]
        ax.scatter(
            label_df["commitGasUsed"].mean(),
            label_df["accessGasUsed"].mean(),
            c=colors[label],
            s=300,
            alpha=1.0,
            edgecolors='red',
            linewidth=3,
            marker='X',
            label=f'{label} (centroid)'
        )

    ax.set_xlabel("commitGasUsed (gas)", fontsize=12)
    ax.set_ylabel("accessGasUsed (gas)", fontsize=12)
    ax.set_title("logicStructure: Gas Usage Distribution", fontsize=14, fontweight='bold')
    ax.legend(loc='best', fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_dir / "logic_structure_scatter.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'logic_structure_scatter.png'}")

    # 2. 直方图对比 - accessGasUsed
    fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True)

    for idx, label in enumerate(labels):
        label_df = df[df["logicStructure"] == label]
        axes[idx].hist(
            label_df["accessGasUsed"],
            bins=30,
            color=colors[label],
            alpha=0.7,
            edgecolor='black'
        )
        axes[idx].set_ylabel("Count", fontsize=10)
        axes[idx].set_title(f"{label} (n={len(label_df)})", fontsize=11)
        axes[idx].grid(True, alpha=0.3, axis='y')

        # 添加统计线
        mean = label_df["accessGasUsed"].mean()
        axes[idx].axvline(mean, color='red', linestyle='--', linewidth=2,
                         label=f'Mean: {mean:,.0f}')
        axes[idx].legend(fontsize=9)

    axes[2].set_xlabel("accessGasUsed (gas)", fontsize=12)
    fig.suptitle("accessGasUsed Distribution by Logic Structure", fontsize=14, fontweight='bold')

    plt.tight_layout()
    plt.savefig(output_dir / "logic_structure_access_hist.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'logic_structure_access_hist.png'}")

    # 3. 直方图对比 - commitGasUsed
    fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True)

    for idx, label in enumerate(labels):
        label_df = df[df["logicStructure"] == label]
        axes[idx].hist(
            label_df["commitGasUsed"],
            bins=30,
            color=colors[label],
            alpha=0.7,
            edgecolor='black'
        )
        axes[idx].set_ylabel("Count", fontsize=10)
        axes[idx].set_title(f"{label} (n={len(label_df)})", fontsize=11)
        axes[idx].grid(True, alpha=0.3, axis='y')

        # 添加统计线
        mean = label_df["commitGasUsed"].mean()
        axes[idx].axvline(mean, color='red', linestyle='--', linewidth=2,
                         label=f'Mean: {mean:,.0f}')
        axes[idx].legend(fontsize=9)

    axes[2].set_xlabel("commitGasUsed (gas)", fontsize=12)
    fig.suptitle("commitGasUsed Distribution by Logic Structure", fontsize=14, fontweight='bold')

    plt.tight_layout()
    plt.savefig(output_dir / "logic_structure_commit_hist.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'logic_structure_commit_hist.png'}")

    # 4. 箱线图对比
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # accessGasUsed
    access_data = [df[df["logicStructure"] == label]["accessGasUsed"].values for label in labels]
    bp1 = ax1.boxplot(access_data, labels=labels, patch_artist=True)
    for patch, label in zip(bp1['boxes'], labels):
        patch.set_facecolor(colors[label])
        patch.set_alpha(0.6)
    ax1.set_ylabel("accessGasUsed (gas)", fontsize=12)
    ax1.set_title("accessGasUsed by Logic Structure", fontsize=12, fontweight='bold')
    ax1.grid(True, alpha=0.3, axis='y')
    ax1.tick_params(axis='x', rotation=15)

    # commitGasUsed
    commit_data = [df[df["logicStructure"] == label]["commitGasUsed"].values for label in labels]
    bp2 = ax2.boxplot(commit_data, labels=labels, patch_artist=True)
    for patch, label in zip(bp2['boxes'], labels):
        patch.set_facecolor(colors[label])
        patch.set_alpha(0.6)
    ax2.set_ylabel("commitGasUsed (gas)", fontsize=12)
    ax2.set_title("commitGasUsed by Logic Structure", fontsize=12, fontweight='bold')
    ax2.grid(True, alpha=0.3, axis='y')
    ax2.tick_params(axis='x', rotation=15)

    plt.tight_layout()
    plt.savefig(output_dir / "logic_structure_boxplots.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'logic_structure_boxplots.png'}")

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 加载数据
    dataset_dirs = []
    if DATA_DIR.exists():
        for entry in sorted(DATA_DIR.iterdir()):
            if entry.is_dir() and (entry / "spp_dataset.json").exists():
                dataset_dirs.append(entry)

    if not dataset_dirs:
        print("[error] No dataset directories found")
        return

    print(f"Found {len(dataset_dirs)} dataset directories:")
    for d in dataset_dirs:
        print(f"  - {d}")

    records = load_spp_dataset(dataset_dirs)
    print(f"\nLoaded {len(records)} SPP records")

    # 准备数据
    df = prepare_data(records)
    print(f"Extracted {len(df)} logicStructure samples")

    # 分析分布
    analyze_distribution(df)

    # 分析可分性
    analyze_separability(df)

    # 绘制可视化
    print("\n" + "="*100)
    print("GENERATING VISUALIZATIONS")
    print("="*100)
    plot_distributions(df, OUTPUT_DIR)

    # 保存数据
    output_csv = OUTPUT_DIR / "logic_structure_data.csv"
    df.to_csv(output_csv, index=False)
    print(f"\n[data] Saved raw data to: {output_csv}")

    print("\n✓ Analysis complete!")

if __name__ == "__main__":
    main()
