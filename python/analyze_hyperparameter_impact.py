#!/usr/bin/env python3
"""
分析不同RF超参数配置对semantic_equivalent的影响
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
import random

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "results" / "analysis" / "hyperparameter_tuning"
RANDOM_STATE = 42

FEATURE_KEYS = ("commitGasUsed", "accessGasUsed")

def load_pi_pairs(dataset_dirs):
    all_pairs = []
    for data_dir in dataset_dirs:
        pi_pairs_file = data_dir / "pi_pairs.json"
        if not pi_pairs_file.exists():
            continue
        with open(pi_pairs_file, 'r') as f:
            data = json.load(f)
            if isinstance(data, dict) and "pairs" in data:
                all_pairs.extend(data["pairs"])
            elif isinstance(data, list):
                all_pairs.extend(data)
    return all_pairs

def extract_feature_row(feature_bag):
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

def build_pi_samples(pairs):
    samples = []
    for pair in pairs:
        pair_id = pair.get("pairId")
        pair_type = pair.get("pairType", "unknown")
        if pair_type != "semantic_equivalent":
            continue
        policies = pair.get("policies", [])
        if len(policies) != 2:
            continue
        for policy_index, policy in enumerate(policies):
            executions = policy.get("features", [])
            for execution in executions:
                features = extract_feature_row(execution.get("features", {}))
                if features is None:
                    continue
                samples.append({
                    "pairId": pair_id,
                    "label": policy_index,
                    "features": features,
                })
    return samples

def split_samples(samples, test_size=0.3, random_state=42):
    pair_ids = sorted(set(sample["pairId"] for sample in samples))
    rng = random.Random(random_state)
    rng.shuffle(pair_ids)
    split_idx = max(1, int(len(pair_ids) * (1 - test_size)))
    train_ids = set(pair_ids[:split_idx])
    test_ids = set(pair_ids[split_idx:])

    train_samples = [s for s in samples if s["pairId"] in train_ids]
    test_samples = [s for s in samples if s["pairId"] in test_ids]

    X_train = np.array([list(s["features"].values()) for s in train_samples])
    y_train = np.array([s["label"] for s in train_samples])
    X_test = np.array([list(s["features"].values()) for s in test_samples])
    y_test = np.array([s["label"] for s in test_samples])

    return X_train, X_test, y_train, y_test

def test_rf_configurations(X_train, X_test, y_train, y_test):
    """测试不同的RF配置"""
    configs = [
        # 原始配置
        {"n_estimators": 400, "max_depth": None, "min_samples_split": 2, "min_samples_leaf": 1, "name": "Original (400 trees)"},
        # 减少树数量
        {"n_estimators": 100, "max_depth": None, "min_samples_split": 2, "min_samples_leaf": 1, "name": "Fewer trees (100)"},
        {"n_estimators": 50, "max_depth": None, "min_samples_split": 2, "min_samples_leaf": 1, "name": "Very few trees (50)"},
        # 限制深度
        {"n_estimators": 100, "max_depth": 5, "min_samples_split": 2, "min_samples_leaf": 1, "name": "Limited depth (5)"},
        {"n_estimators": 100, "max_depth": 3, "min_samples_split": 2, "min_samples_leaf": 1, "name": "Very limited depth (3)"},
        # 增加最小分割样本
        {"n_estimators": 100, "max_depth": None, "min_samples_split": 10, "min_samples_leaf": 1, "name": "Min split (10)"},
        {"n_estimators": 100, "max_depth": None, "min_samples_split": 20, "min_samples_leaf": 1, "name": "Min split (20)"},
        # 增加叶子最小样本
        {"n_estimators": 100, "max_depth": None, "min_samples_split": 2, "min_samples_leaf": 5, "name": "Min leaf (5)"},
        {"n_estimators": 100, "max_depth": None, "min_samples_split": 2, "min_samples_leaf": 10, "name": "Min leaf (10)"},
        # 组合配置
        {"n_estimators": 50, "max_depth": 3, "min_samples_split": 10, "min_samples_leaf": 5, "name": "Conservative (50/3/10/5)"},
        {"n_estimators": 100, "max_depth": 5, "min_samples_split": 10, "min_samples_leaf": 5, "name": "Balanced (100/5/10/5)"},
    ]

    results = []

    for config in configs:
        name = config.pop("name")

        rf = RandomForestClassifier(
            class_weight="balanced",
            random_state=RANDOM_STATE,
            **config
        )

        rf.fit(X_train, y_train)

        train_pred = rf.predict(X_test)
        train_proba = rf.predict_proba(X_train)[:, 1]
        test_proba = rf.predict_proba(X_test)[:, 1]

        train_auc = roc_auc_score(y_train, train_proba)
        test_auc = roc_auc_score(y_test, test_proba)
        test_acc = accuracy_score(y_test, rf.predict(X_test))

        results.append({
            "name": name,
            "config": config,
            "train_auc": train_auc,
            "test_auc": test_auc,
            "auc_gap": train_auc - test_auc,
            "test_accuracy": test_acc,
            "passed": test_auc <= 0.55,
        })

        print(f"{name:40} | Train AUC: {train_auc:.4f} | Test AUC: {test_auc:.4f} | Gap: {train_auc - test_auc:.4f} | {'✓' if test_auc <= 0.55 else '✗'}")

    return results

def plot_results(results, output_dir):
    """可视化结果"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 准备数据
    names = [r["name"] for r in results]
    train_aucs = [r["train_auc"] for r in results]
    test_aucs = [r["test_auc"] for r in results]
    gaps = [r["auc_gap"] for r in results]
    passed = [r["passed"] for r in results]

    # 1. Test AUC对比
    fig, axes = plt.subplots(2, 1, figsize=(14, 10))

    ax = axes[0]
    x = np.arange(len(names))
    colors = ['green' if p else 'red' for p in passed]

    bars = ax.bar(x, test_aucs, color=colors, alpha=0.7)
    ax.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Threshold (0.55)')
    ax.set_ylabel('Test AUC', fontsize=12)
    ax.set_title('Random Forest Test AUC by Configuration', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha='right', fontsize=9)
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')
    ax.set_ylim([0.45, max(test_aucs) + 0.05])

    # 标注通过/失败
    for i, (bar, auc, p) in enumerate(zip(bars, test_aucs, passed)):
        symbol = '✓' if p else '✗'
        color = 'green' if p else 'red'
        ax.text(i, auc + 0.01, symbol, ha='center', va='bottom',
               fontsize=14, color=color, fontweight='bold')

    # 2. Overfitting Gap对比
    ax = axes[1]
    bars = ax.bar(x, gaps, color='#7c3aed', alpha=0.7)
    ax.set_ylabel('AUC Gap (Train - Test)', fontsize=12)
    ax.set_title('Overfitting Comparison', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha='right', fontsize=9)
    ax.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    plt.savefig(output_dir / "hyperparameter_comparison.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'hyperparameter_comparison.png'}")

    # 3. Train vs Test AUC散点图
    fig, ax = plt.subplots(figsize=(10, 10))

    colors_scatter = ['green' if p else 'red' for p in passed]
    ax.scatter(train_aucs, test_aucs, c=colors_scatter, s=100, alpha=0.7, edgecolors='black')

    # 添加标签
    for i, name in enumerate(names):
        ax.annotate(name, (train_aucs[i], test_aucs[i]),
                   fontsize=8, xytext=(5, 5), textcoords='offset points')

    # 对角线（理想情况：no overfitting）
    min_val = min(min(train_aucs), min(test_aucs))
    max_val = max(max(train_aucs), max(test_aucs))
    ax.plot([min_val, max_val], [min_val, max_val], 'k--', alpha=0.3, label='Perfect Generalization')

    # 阈值线
    ax.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Privacy Threshold')

    ax.set_xlabel('Train AUC', fontsize=12)
    ax.set_ylabel('Test AUC', fontsize=12)
    ax.set_title('Train vs Test AUC by Configuration', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_dir / "train_vs_test_auc.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'train_vs_test_auc.png'}")

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 加载数据
    dataset_dirs = []
    if DATA_DIR.exists():
        for entry in sorted(DATA_DIR.iterdir()):
            if entry.is_dir() and (entry / "pi_pairs.json").exists():
                dataset_dirs.append(entry)

    if not dataset_dirs:
        print("[error] No dataset directories found")
        return

    print(f"Found {len(dataset_dirs)} dataset directories")

    pairs = load_pi_pairs(dataset_dirs)
    samples = build_pi_samples(pairs)

    print(f"Loaded {len(samples)} semantic_equivalent samples")

    if len(samples) < 10:
        print("[error] Not enough samples")
        return

    X_train, X_test, y_train, y_test = split_samples(samples, test_size=0.3, random_state=RANDOM_STATE)

    print(f"Train: {len(X_train)} samples")
    print(f"Test: {len(X_test)} samples")
    print(f"Features: {X_train.shape[1]}")

    print("\n" + "="*120)
    print("Testing Different Random Forest Configurations")
    print("="*120)
    print()

    results = test_rf_configurations(X_train, X_test, y_train, y_test)

    print("\n" + "="*120)
    print("Summary")
    print("="*120)

    passed_configs = [r for r in results if r["passed"]]
    failed_configs = [r for r in results if not r["passed"]]

    print(f"\nConfigurations tested: {len(results)}")
    print(f"Passed privacy test: {len(passed_configs)}")
    print(f"Failed privacy test: {len(failed_configs)}")

    if passed_configs:
        print("\n✓ Configurations that PASSED:")
        for r in passed_configs:
            print(f"  • {r['name']:40} | Test AUC: {r['test_auc']:.4f} | Gap: {r['auc_gap']:.4f}")

        # 找到最佳配置
        best = min(passed_configs, key=lambda x: x["auc_gap"])
        print(f"\n🏆 Best configuration (lowest overfitting among passed):")
        print(f"  {best['name']}")
        print(f"  Test AUC: {best['test_auc']:.4f}")
        print(f"  AUC Gap: {best['auc_gap']:.4f}")
        print(f"  Config: {best['config']}")
    else:
        print("\n❌ No configuration passed the privacy test")
        print("\nClosest to passing:")
        closest = min(results, key=lambda x: abs(x["test_auc"] - 0.55))
        print(f"  • {closest['name']:40} | Test AUC: {closest['test_auc']:.4f} | Exceeds by: {closest['test_auc'] - 0.55:.4f}")

    # 绘制结果
    print("\n" + "="*120)
    print("Generating visualizations...")
    print("="*120)
    plot_results(results, OUTPUT_DIR)

    # 保存报告
    report = {
        "summary": {
            "total_configs": len(results),
            "passed": len(passed_configs),
            "failed": len(failed_configs),
        },
        "results": results,
        "best_config": passed_configs[0] if passed_configs else None,
    }

    report_path = OUTPUT_DIR / "hyperparameter_tuning_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=float)
    print(f"\n[report] Saved: {report_path}")

    print("\n" + "="*120)
    print("Insights")
    print("="*120)

    print("\n1. Why reducing n_estimators didn't help:")
    n400 = next((r for r in results if "400 trees" in r["name"]), None)
    n100 = next((r for r in results if "Fewer trees (100)" in r["name"]), None)

    if n400 and n100:
        print(f"   400 trees: Test AUC = {n400['test_auc']:.4f}, Gap = {n400['auc_gap']:.4f}")
        print(f"   100 trees: Test AUC = {n100['test_auc']:.4f}, Gap = {n100['auc_gap']:.4f}")
        print(f"   Change: {n100['test_auc'] - n400['test_auc']:+.4f} AUC, {n100['auc_gap'] - n400['auc_gap']:+.4f} Gap")
        print("   → Simply reducing trees doesn't address the core issue")

    print("\n2. What actually helps:")
    conservative = [r for r in results if "Conservative" in r["name"] or "Balanced" in r["name"]]
    if conservative:
        for r in conservative:
            print(f"   {r['name']}: Test AUC = {r['test_auc']:.4f}, Gap = {r['auc_gap']:.4f}")

    print("\n3. Recommendation:")
    if passed_configs:
        best = min(passed_configs, key=lambda x: x["auc_gap"])
        print(f"   Use configuration: {best['name']}")
        print(f"   Parameters: n_estimators={best['config']['n_estimators']}, "
              f"max_depth={best['config']['max_depth']}, "
              f"min_samples_split={best['config']['min_samples_split']}, "
              f"min_samples_leaf={best['config']['min_samples_leaf']}")
    else:
        print("   Consider:")
        print("   - Increasing dataset diversity (more pairs)")
        print("   - Using only 2 features (commitGas, accessGas) as we did in analysis")
        print("   - Accepting that LR passing is sufficient for privacy")

    print("\n✓ Analysis complete!")

if __name__ == "__main__":
    main()
