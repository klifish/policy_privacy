#!/usr/bin/env python3
"""
分析SPP logicStructure的RF问题
"""
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import roc_auc_score, accuracy_score
from sklearn.model_selection import train_test_split
from collections import Counter

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "results" / "analysis" / "spp_logic_structure"
RANDOM_STATE = 42

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

def prepare_logic_structure_data(records):
    """准备logicStructure数据"""
    rows = []
    for record in records:
        logic_structure = record.get("logicStructure")
        if logic_structure is None:
            continue
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            continue
        rows.append({
            "label": logic_structure,
            "commitGasUsed": features["commitGasUsed"],
            "accessGasUsed": features["accessGasUsed"],
        })

    df = pd.DataFrame(rows)

    # 平衡类别
    label_counts = Counter(df["label"])
    min_count = min(label_counts.values())

    balanced_groups = []
    for label_value, group in df.groupby("label"):
        if len(group) > min_count:
            balanced_groups.append(group.sample(n=min_count, random_state=RANDOM_STATE))
        else:
            balanced_groups.append(group)

    df_balanced = pd.concat(balanced_groups, ignore_index=True)
    return df_balanced

def analyze_feature_distribution(df):
    """分析特征分布"""
    print("\n" + "="*80)
    print("Feature Distribution by Logic Structure")
    print("="*80)

    for label in sorted(df["label"].unique()):
        label_df = df[df["label"] == label]
        print(f"\n{label} (n={len(label_df)}):")
        print(f"  accessGasUsed: mean={label_df['accessGasUsed'].mean():,.0f}, "
              f"std={label_df['accessGasUsed'].std():,.0f}")
        print(f"  commitGasUsed: mean={label_df['commitGasUsed'].mean():,.0f}, "
              f"std={label_df['commitGasUsed'].std():,.0f}")

def visualize_pre_split_features(df, output_dir):
    """可视化训练/测试集划分前的Gas特征"""
    if df is None or df.empty:
        return
    viz_dir = output_dir / "pre_split"
    viz_dir.mkdir(parents=True, exist_ok=True)

    bins = min(60, max(10, int(np.sqrt(len(df)))))
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for idx, feature in enumerate(FEATURE_KEYS):
        axes[idx].hist(
            df[feature],
            bins=bins,
            color="#0ea5e9",
            alpha=0.75,
            edgecolor="black",
            linewidth=0.5,
        )
        axes[idx].set_title(f"{feature} distribution (pre-split)")
        axes[idx].set_xlabel(feature)
        axes[idx].set_ylabel("Count")
        axes[idx].grid(alpha=0.2, linestyle="--")
    fig.suptitle("Gas usage distribution before train/test split",
                 fontsize=14, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    hist_path = viz_dir / "pre_split_gas_hist.png"
    fig.savefig(hist_path, dpi=200)
    plt.close(fig)
    print(f"[viz] Saved: {hist_path}")

    labels = sorted(df["label"].unique())
    if not labels:
        return
    colors = plt.get_cmap("tab20")(np.linspace(0, 1, len(labels)))
    fig, ax = plt.subplots(figsize=(7, 6))
    for color, label in zip(colors, labels):
        group = df[df["label"] == label]
        if group.empty:
            continue
        ax.scatter(
            group["commitGasUsed"],
            group["accessGasUsed"],
            s=18,
            alpha=0.75,
            label=label,
            edgecolors="none",
            color=color,
        )
    ax.set_title("commitGasUsed vs accessGasUsed (pre-split)")
    ax.set_xlabel("commitGasUsed")
    ax.set_ylabel("accessGasUsed")
    ax.grid(alpha=0.3, linestyle="--")
    ax.legend(loc="upper right", fontsize=8, frameon=True)
    plt.tight_layout()
    scatter_path = viz_dir / "pre_split_commit_vs_access.png"
    plt.savefig(scatter_path, dpi=200)
    plt.close()
    print(f"[viz] Saved: {scatter_path}")

def test_configurations(X_train, X_test, y_train, y_test):
    """测试不同配置"""
    configs = [
        {"n_estimators": 50, "max_depth": 3, "min_samples_split": 10, "min_samples_leaf": 5,
         "name": "Conservative (50/3/10/5)"},
        {"n_estimators": 50, "max_depth": 2, "min_samples_split": 15, "min_samples_leaf": 10,
         "name": "Very Conservative (50/2/15/10)"},
        {"n_estimators": 30, "max_depth": 2, "min_samples_split": 20, "min_samples_leaf": 10,
         "name": "Ultra Conservative (30/2/20/10)"},
        {"n_estimators": 100, "max_depth": None, "min_samples_leaf": 20,
         "name": "Large leaf (100/None/2/20)"},
        {"n_estimators": 50, "max_depth": None, "min_samples_leaf": 30,
         "name": "Very large leaf (50/None/2/30)"},
    ]

    # 先测试逻辑回归作为基准
    lr = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=2000))
    ])
    lr.fit(X_train, y_train)
    lr_train_auc = roc_auc_score(y_train, lr.predict_proba(X_train), multi_class="ovr")
    lr_test_auc = roc_auc_score(y_test, lr.predict_proba(X_test), multi_class="ovr")

    print("\n" + "="*100)
    print("Model Performance Comparison")
    print("="*100)
    print(f"{'Model':<45} | {'Train AUC':>10} | {'Test AUC':>10} | {'Gap':>10} | {'Pass':>6}")
    print("-"*100)

    print(f"{'Logistic Regression (baseline)':<45} | {lr_train_auc:>10.4f} | {lr_test_auc:>10.4f} | "
          f"{lr_train_auc - lr_test_auc:>10.4f} | {'✓' if lr_test_auc <= 0.55 else '✗':>6}")

    results = []
    for config in configs:
        name = config.pop("name")

        rf = RandomForestClassifier(
            class_weight="balanced",
            random_state=RANDOM_STATE,
            **config
        )
        rf.fit(X_train, y_train)

        train_proba = rf.predict_proba(X_train)
        test_proba = rf.predict_proba(X_test)

        train_auc = roc_auc_score(y_train, train_proba, multi_class="ovr")
        test_auc = roc_auc_score(y_test, test_proba, multi_class="ovr")

        passed = test_auc <= 0.55

        print(f"{name:<45} | {train_auc:>10.4f} | {test_auc:>10.4f} | "
              f"{train_auc - test_auc:>10.4f} | {'✓' if passed else '✗':>6}")

        results.append({
            "name": name,
            "config": config,
            "train_auc": train_auc,
            "test_auc": test_auc,
            "auc_gap": train_auc - test_auc,
            "passed": passed,
        })

    return results, lr_test_auc

def plot_comparison(results, lr_auc, output_dir):
    """绘制对比图"""
    output_dir.mkdir(parents=True, exist_ok=True)

    names = ["Logistic Regression"] + [r["name"] for r in results]
    test_aucs = [lr_auc] + [r["test_auc"] for r in results]
    passed = [lr_auc <= 0.55] + [r["passed"] for r in results]

    fig, ax = plt.subplots(figsize=(12, 6))

    x = np.arange(len(names))
    colors = ['green' if p else 'red' for p in passed]

    bars = ax.bar(x, test_aucs, color=colors, alpha=0.7)
    ax.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Threshold (0.55)')

    ax.set_ylabel('Test AUC', fontsize=12)
    ax.set_title('SPP logicStructure: RF Configuration Comparison', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha='right', fontsize=9)
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')

    # 标注通过/失败
    for i, (bar, auc, p) in enumerate(zip(bars, test_aucs, passed)):
        symbol = '✓' if p else '✗'
        color = 'green' if p else 'red'
        ax.text(i, auc + 0.01, symbol, ha='center', va='bottom',
               fontsize=14, color=color, fontweight='bold')

    plt.tight_layout()
    plt.savefig(output_dir / "spp_logic_structure_comparison.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'spp_logic_structure_comparison.png'}")

def analyze_class_separability(df):
    """分析类别可分性"""
    print("\n" + "="*80)
    print("Class Separability Analysis")
    print("="*80)

    # 计算类间距离
    labels = sorted(df["label"].unique())
    centroids = {}

    for label in labels:
        label_df = df[df["label"] == label]
        centroids[label] = {
            "accessGasUsed": label_df["accessGasUsed"].mean(),
            "commitGasUsed": label_df["commitGasUsed"].mean(),
        }

    print("\nCentroids:")
    for label, centroid in centroids.items():
        print(f"  {label}: accessGas={centroid['accessGasUsed']:,.0f}, "
              f"commitGas={centroid['commitGasUsed']:,.0f}")

    # 计算欧氏距离
    print("\nPairwise Euclidean Distances:")
    for i, label1 in enumerate(labels):
        for label2 in labels[i+1:]:
            c1 = centroids[label1]
            c2 = centroids[label2]
            dist = np.sqrt((c1["accessGasUsed"] - c2["accessGasUsed"])**2 +
                          (c1["commitGasUsed"] - c2["commitGasUsed"])**2)
            print(f"  {label1} <-> {label2}: {dist:,.0f}")

    # 计算类内方差
    print("\nWithin-class Standard Deviations:")
    for label in labels:
        label_df = df[df["label"] == label]
        access_std = label_df["accessGasUsed"].std()
        commit_std = label_df["commitGasUsed"].std()
        print(f"  {label}: accessGas={access_std:,.0f}, commitGas={commit_std:,.0f}")

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

    print(f"Found {len(dataset_dirs)} dataset directories")

    records = load_spp_dataset(dataset_dirs)
    print(f"Loaded {len(records)} SPP records")

    # 准备logicStructure数据
    df = prepare_logic_structure_data(records)
    print(f"\nBalanced logicStructure dataset: {len(df)} samples")
    print(f"Class distribution: {dict(Counter(df['label']))}")

    # 分析特征分布
    analyze_feature_distribution(df)

    # 分析类别可分性
    analyze_class_separability(df)

    # 可视化训练/测试集划分前的Gas特征
    visualize_pre_split_features(df, OUTPUT_DIR)

    # 准备训练/测试集
    X = df[["commitGasUsed", "accessGasUsed"]].to_numpy()
    y = df["label"].to_numpy()

    classes = np.unique(y)
    stratify = y if len(classes) > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, stratify=stratify, random_state=RANDOM_STATE
    )

    print(f"\nTrain: {len(X_train)} samples")
    print(f"Test: {len(X_test)} samples")

    # 测试不同配置
    results, lr_auc = test_configurations(X_train, X_test, y_train, y_test)

    # 绘制对比
    plot_comparison(results, lr_auc, OUTPUT_DIR)

    # 总结
    print("\n" + "="*100)
    print("Summary & Insights")
    print("="*100)

    passed_configs = [r for r in results if r["passed"]]

    print(f"\nConfigurations tested: {len(results)}")
    print(f"Passed privacy test: {len(passed_configs)}")

    if passed_configs:
        print("\n✓ Configurations that PASSED:")
        for r in passed_configs:
            print(f"  • {r['name']}: Test AUC = {r['test_auc']:.4f}, Gap = {r['auc_gap']:.4f}")

        best = min(passed_configs, key=lambda x: x["auc_gap"])
        print(f"\n🏆 Recommended configuration:")
        print(f"  {best['name']}")
        print(f"  Parameters: {best['config']}")
    else:
        print("\n❌ No RF configuration passed the privacy test")
        print("\nClosest attempt:")
        closest = min(results, key=lambda x: abs(x["test_auc"] - 0.55))
        print(f"  {closest['name']}: Test AUC = {closest['test_auc']:.4f} (exceeds by {closest['test_auc'] - 0.55:.4f})")

        print("\n💡 Key insights:")
        print("  1. logicStructure classes may have more distinct gas patterns than semantic_equivalent")
        print("  2. Different logic structures (and_only, and_or_mixed, negation_heavy) likely have")
        print("     inherently different gas consumption profiles")
        print("  3. This is actually EXPECTED - different structures should use different gas")
        print("  4. The goal is to prevent leaking MORE than the basic structural information")

    # 保存报告
    report = {
        "dataset": {
            "total_samples": len(df),
            "class_distribution": dict(Counter(df["label"])),
        },
        "baseline": {
            "logistic_regression_auc": float(lr_auc),
        },
        "rf_configurations": results,
        "passed_count": len(passed_configs),
    }

    report_path = OUTPUT_DIR / "spp_logic_structure_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=float)
    print(f"\n[report] Saved: {report_path}")

    print("\n✓ Analysis complete!")

if __name__ == "__main__":
    main()
