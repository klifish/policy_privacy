#!/usr/bin/env python3
"""
分析PI实验中accessGasUsed的数据分布
"""
import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from collections import defaultdict
import pandas as pd

# 定义数据路径
DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "results" / "analysis"

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

def extract_access_gas_data(pairs):
    """从PI pairs中提取accessGasUsed数据"""
    data = []

    for pair in pairs:
        pair_id = pair.get("pairId", "unknown")
        pair_type = pair.get("pairType", "unknown")
        policies = pair.get("policies", [])

        for policy_idx, policy in enumerate(policies):
            executions = policy.get("features", [])
            for exec_idx, execution in enumerate(executions):
                features = execution.get("features", {})
                access_gas = features.get("accessGasUsed")

                if access_gas is not None:
                    # 转换为数值
                    if isinstance(access_gas, str) and access_gas.startswith("0x"):
                        access_gas = int(access_gas, 16)
                    else:
                        access_gas = float(access_gas)

                    data.append({
                        "pairId": pair_id,
                        "pairType": pair_type,
                        "policyIndex": policy_idx,
                        "executionIndex": exec_idx,
                        "accessGasUsed": access_gas
                    })

    return pd.DataFrame(data)

def compute_statistics(df):
    """计算统计数据"""
    stats = {
        "count": len(df),
        "mean": df["accessGasUsed"].mean(),
        "std": df["accessGasUsed"].std(),
        "min": df["accessGasUsed"].min(),
        "25%": df["accessGasUsed"].quantile(0.25),
        "50%": df["accessGasUsed"].quantile(0.50),
        "75%": df["accessGasUsed"].quantile(0.75),
        "max": df["accessGasUsed"].max(),
        "iqr": df["accessGasUsed"].quantile(0.75) - df["accessGasUsed"].quantile(0.25)
    }
    return stats

def detect_outliers(df):
    """使用IQR方法检测异常值"""
    q1 = df["accessGasUsed"].quantile(0.25)
    q3 = df["accessGasUsed"].quantile(0.75)
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    outliers = df[(df["accessGasUsed"] < lower_bound) | (df["accessGasUsed"] > upper_bound)]
    return outliers, lower_bound, upper_bound

def plot_distribution(df, output_dir):
    """绘制分布图"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. 直方图
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.hist(df["accessGasUsed"], bins=50, color="#0f766e", edgecolor="black", alpha=0.7)
    ax.set_xlabel("accessGasUsed (gas)")
    ax.set_ylabel("Frequency")
    ax.set_title("Distribution of accessGasUsed in PI Experiment")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_dir / "pi_access_gas_histogram.png", dpi=200)
    plt.close()
    print(f"[viz] Saved histogram: {output_dir / 'pi_access_gas_histogram.png'}")

    # 2. 箱线图
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.boxplot(df["accessGasUsed"], vert=True)
    ax.set_ylabel("accessGasUsed (gas)")
    ax.set_title("Boxplot of accessGasUsed in PI Experiment")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_dir / "pi_access_gas_boxplot.png", dpi=200)
    plt.close()
    print(f"[viz] Saved boxplot: {output_dir / 'pi_access_gas_boxplot.png'}")

    # 3. 按pairType分组的箱线图
    if "pairType" in df.columns and df["pairType"].nunique() > 1:
        fig, ax = plt.subplots(figsize=(12, 6))
        pair_types = sorted(df["pairType"].unique())
        data_by_type = [df[df["pairType"] == pt]["accessGasUsed"].values for pt in pair_types]

        bp = ax.boxplot(data_by_type, labels=pair_types, patch_artist=True)
        for patch in bp['boxes']:
            patch.set_facecolor("#0f766e")
            patch.set_alpha(0.6)

        ax.set_xlabel("Pair Type")
        ax.set_ylabel("accessGasUsed (gas)")
        ax.set_title("Distribution of accessGasUsed by Pair Type")
        ax.grid(True, alpha=0.3)
        plt.xticks(rotation=45, ha='right')
        plt.tight_layout()
        plt.savefig(output_dir / "pi_access_gas_by_pairtype.png", dpi=200)
        plt.close()
        print(f"[viz] Saved pair type comparison: {output_dir / 'pi_access_gas_by_pairtype.png'}")

def print_statistics(stats, title="Overall Statistics"):
    """打印统计结果"""
    print(f"\n{'='*60}")
    print(f"{title:^60}")
    print(f"{'='*60}")
    print(f"  Count:       {stats['count']:>12}")
    print(f"  Mean:        {stats['mean']:>12,.2f}")
    print(f"  Std Dev:     {stats['std']:>12,.2f}")
    print(f"  Min:         {stats['min']:>12,.2f}")
    print(f"  25%:         {stats['25%']:>12,.2f}")
    print(f"  Median:      {stats['50%']:>12,.2f}")
    print(f"  75%:         {stats['75%']:>12,.2f}")
    print(f"  Max:         {stats['max']:>12,.2f}")
    print(f"  IQR:         {stats['iqr']:>12,.2f}")
    print(f"{'='*60}\n")

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
    print(f"Loaded {len(pairs)} PI pairs")

    # 提取accessGasUsed数据
    print("\nExtracting accessGasUsed data...")
    df = extract_access_gas_data(pairs)
    print(f"Extracted {len(df)} data points")

    if df.empty:
        print("[error] No accessGasUsed data found!")
        return

    # 计算总体统计
    overall_stats = compute_statistics(df)
    print_statistics(overall_stats, "Overall accessGasUsed Statistics")

    # 按pairType分组统计
    print("\nStatistics by Pair Type:")
    print("-" * 60)
    for pair_type in sorted(df["pairType"].unique()):
        type_df = df[df["pairType"] == pair_type]
        type_stats = compute_statistics(type_df)
        print_statistics(type_stats, f"Pair Type: {pair_type}")

    # 检测异常值
    print("\nDetecting outliers...")
    outliers, lower_bound, upper_bound = detect_outliers(df)
    print(f"Lower bound (Q1 - 1.5*IQR): {lower_bound:,.2f}")
    print(f"Upper bound (Q3 + 1.5*IQR): {upper_bound:,.2f}")
    print(f"Number of outliers: {len(outliers)} ({100*len(outliers)/len(df):.2f}%)")

    if len(outliers) > 0:
        print("\nOutlier summary:")
        print(outliers[["pairId", "pairType", "policyIndex", "accessGasUsed"]].to_string(index=False))

    # 绘制分布图
    print("\nGenerating visualizations...")
    plot_distribution(df, OUTPUT_DIR)

    # 保存详细数据
    output_csv = OUTPUT_DIR / "pi_access_gas_data.csv"
    df.to_csv(output_csv, index=False)
    print(f"\n[data] Saved detailed data to: {output_csv}")

    # 保存统计报告
    report = {
        "overall_statistics": overall_stats,
        "statistics_by_pair_type": {
            pair_type: compute_statistics(df[df["pairType"] == pair_type])
            for pair_type in sorted(df["pairType"].unique())
        },
        "outliers": {
            "count": len(outliers),
            "percentage": 100 * len(outliers) / len(df),
            "lower_bound": lower_bound,
            "upper_bound": upper_bound
        }
    }

    report_json = OUTPUT_DIR / "pi_access_gas_report.json"
    with open(report_json, 'w') as f:
        json.dump(report, f, indent=2, default=float)
    print(f"[report] Saved analysis report to: {report_json}")

    print("\n✓ Analysis complete!")

if __name__ == "__main__":
    main()
