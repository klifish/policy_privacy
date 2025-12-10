#!/usr/bin/env python3
"""
深入分析为什么随机森林在semantic_equivalent上表现不佳
"""
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from collections import Counter
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, confusion_matrix
import random

# 配置
DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "results" / "analysis" / "rf_semantic_analysis"
RANDOM_STATE = 42

FEATURE_KEYS = (
    "commitGasUsed",
    "commitCalldataLength",
    "accessGasUsed",
    "accessCalldataLength",
    "proofSize",
    "commitLogsCount",
    "commitLogsSize",
    "accessLogsCount",
    "accessLogsSize",
    "blockDifference",
)

def load_pi_pairs(dataset_dirs):
    """加载PI pairs"""
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
    """提取特征行"""
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

def build_pi_samples(pairs, pair_type_filter=None):
    """构建PI样本"""
    samples = []
    for pair in pairs:
        pair_id = pair.get("pairId")
        pair_type = pair.get("pairType", "unknown")

        if pair_type_filter and pair_type != pair_type_filter:
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
                    "pairType": pair_type,
                    "label": policy_index,
                    "features": features,
                })
    return samples

def split_pi_samples(samples, test_size=0.3, random_state=42):
    """按pair ID分割样本"""
    pair_ids = sorted(set(sample["pairId"] for sample in samples))
    rng = random.Random(random_state)
    rng.shuffle(pair_ids)

    split_idx = max(1, int(len(pair_ids) * (1 - test_size)))
    train_ids = set(pair_ids[:split_idx])
    test_ids = set(pair_ids[split_idx:])

    train_samples = [s for s in samples if s["pairId"] in train_ids]
    test_samples = [s for s in samples if s["pairId"] in test_ids]

    return train_samples, test_samples

def samples_to_arrays(samples):
    """将样本转换为numpy数组"""
    X = np.array([list(s["features"].values()) for s in samples])
    y = np.array([s["label"] for s in samples])
    return X, y

def analyze_feature_importance(X_train, y_train, feature_names):
    """分析特征重要性"""
    rf = RandomForestClassifier(n_estimators=400, class_weight="balanced", random_state=RANDOM_STATE)
    rf.fit(X_train, y_train)

    importances = rf.feature_importances_
    indices = np.argsort(importances)[::-1]

    return {
        "importances": importances,
        "indices": indices,
        "feature_names": feature_names
    }

def analyze_overfitting(X_train, X_test, y_train, y_test):
    """分析过拟合情况"""
    results = {}

    # Logistic Regression
    lr_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=2000, random_state=RANDOM_STATE))
    ])
    lr_pipeline.fit(X_train, y_train)

    results["logistic_regression"] = {
        "train_accuracy": accuracy_score(y_train, lr_pipeline.predict(X_train)),
        "test_accuracy": accuracy_score(y_test, lr_pipeline.predict(X_test)),
        "train_auc": roc_auc_score(y_train, lr_pipeline.predict_proba(X_train)[:, 1]),
        "test_auc": roc_auc_score(y_test, lr_pipeline.predict_proba(X_test)[:, 1]),
    }

    # Random Forest
    rf = RandomForestClassifier(n_estimators=400, class_weight="balanced", random_state=RANDOM_STATE)
    rf.fit(X_train, y_train)

    results["random_forest"] = {
        "train_accuracy": accuracy_score(y_train, rf.predict(X_train)),
        "test_accuracy": accuracy_score(y_test, rf.predict(X_test)),
        "train_auc": roc_auc_score(y_train, rf.predict_proba(X_train)[:, 1]),
        "test_auc": roc_auc_score(y_test, rf.predict_proba(X_test)[:, 1]),
    }

    return results

def analyze_prediction_confidence(X_test, y_test):
    """分析预测置信度"""
    lr_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=2000, random_state=RANDOM_STATE))
    ])

    rf = RandomForestClassifier(n_estimators=400, class_weight="balanced", random_state=RANDOM_STATE)

    # 需要先fit，这里简化处理
    return None

def plot_feature_importance(importance_data, output_dir):
    """绘制特征重要性"""
    output_dir.mkdir(parents=True, exist_ok=True)

    importances = importance_data["importances"]
    indices = importance_data["indices"]
    feature_names = importance_data["feature_names"]

    fig, ax = plt.subplots(figsize=(10, 8))

    y_pos = np.arange(len(feature_names))
    ax.barh(y_pos, importances[indices], color="#0f766e", alpha=0.7)
    ax.set_yticks(y_pos)
    ax.set_yticklabels([feature_names[i] for i in indices])
    ax.invert_yaxis()
    ax.set_xlabel("Feature Importance")
    ax.set_title("Random Forest Feature Importance (Semantic Equivalent)")
    ax.grid(True, alpha=0.3, axis='x')

    plt.tight_layout()
    plt.savefig(output_dir / "rf_feature_importance.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'rf_feature_importance.png'}")

def plot_overfitting_comparison(overfitting_data, output_dir):
    """绘制过拟合对比"""
    models = list(overfitting_data.keys())
    train_acc = [overfitting_data[m]["train_accuracy"] for m in models]
    test_acc = [overfitting_data[m]["test_accuracy"] for m in models]
    train_auc = [overfitting_data[m]["train_auc"] for m in models]
    test_auc = [overfitting_data[m]["test_auc"] for m in models]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    x = np.arange(len(models))
    width = 0.35

    # Accuracy comparison
    ax1.bar(x - width/2, train_acc, width, label='Train', color='#0f766e', alpha=0.7)
    ax1.bar(x + width/2, test_acc, width, label='Test', color='#e11d48', alpha=0.7)
    ax1.set_xlabel('Model')
    ax1.set_ylabel('Accuracy')
    ax1.set_title('Train vs Test Accuracy')
    ax1.set_xticks(x)
    ax1.set_xticklabels([m.replace('_', ' ').title() for m in models])
    ax1.legend()
    ax1.grid(True, alpha=0.3, axis='y')

    # AUC comparison
    ax2.bar(x - width/2, train_auc, width, label='Train', color='#0f766e', alpha=0.7)
    ax2.bar(x + width/2, test_auc, width, label='Test', color='#e11d48', alpha=0.7)
    ax2.set_xlabel('Model')
    ax2.set_ylabel('AUC')
    ax2.set_title('Train vs Test AUC')
    ax2.set_xticks(x)
    ax2.set_xticklabels([m.replace('_', ' ').title() for m in models])
    ax2.legend()
    ax2.grid(True, alpha=0.3, axis='y')

    # 添加threshold线
    ax2.axhline(y=0.55, color='orange', linestyle='--', linewidth=2, label='Threshold (0.55)')

    plt.tight_layout()
    plt.savefig(output_dir / "overfitting_comparison.png", dpi=200)
    plt.close()
    print(f"[viz] Saved: {output_dir / 'overfitting_comparison.png'}")

def analyze_sample_distribution(samples):
    """分析样本分布"""
    df = pd.DataFrame([
        {
            "pairId": s["pairId"],
            "label": s["label"],
            **s["features"]
        }
        for s in samples
    ])

    print("\n" + "="*80)
    print("Sample Distribution Analysis")
    print("="*80)
    print(f"Total samples: {len(df)}")
    print(f"Unique pairs: {df['pairId'].nunique()}")
    print(f"Label distribution: {dict(Counter(df['label']))}")
    print(f"Samples per pair (mean): {len(df) / df['pairId'].nunique():.2f}")

    # 检查每个pair的样本数分布
    pair_counts = df.groupby("pairId").size()
    print(f"\nSamples per pair distribution:")
    print(f"  Min: {pair_counts.min()}")
    print(f"  Max: {pair_counts.max()}")
    print(f"  Mean: {pair_counts.mean():.2f}")
    print(f"  Std: {pair_counts.std():.2f}")

    return df

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 发现数据集
    dataset_dirs = []
    if DATA_DIR.exists():
        for entry in sorted(DATA_DIR.iterdir()):
            if entry.is_dir() and (entry / "pi_pairs.json").exists():
                dataset_dirs.append(entry)

    if not dataset_dirs:
        print(f"[error] No dataset directories found")
        return

    print(f"Found {len(dataset_dirs)} dataset directories")

    # 加载数据
    pairs = load_pi_pairs(dataset_dirs)
    print(f"Loaded {len(pairs)} PI pairs")

    # 构建semantic_equivalent样本
    samples = build_pi_samples(pairs, pair_type_filter="semantic_equivalent")
    print(f"Extracted {len(samples)} semantic_equivalent samples")

    if len(samples) < 10:
        print("[error] Not enough samples")
        return

    # 分析样本分布
    df = analyze_sample_distribution(samples)

    # 分割数据
    train_samples, test_samples = split_pi_samples(samples, test_size=0.3, random_state=RANDOM_STATE)
    print(f"\nTrain samples: {len(train_samples)}")
    print(f"Test samples: {len(test_samples)}")

    X_train, y_train = samples_to_arrays(train_samples)
    X_test, y_test = samples_to_arrays(test_samples)

    print(f"X_train shape: {X_train.shape}")
    print(f"X_test shape: {X_test.shape}")

    # 分析特征重要性
    print("\n" + "="*80)
    print("Feature Importance Analysis")
    print("="*80)
    importance_data = analyze_feature_importance(X_train, y_train, list(FEATURE_KEYS))

    for idx in importance_data["indices"][:5]:
        print(f"  {importance_data['feature_names'][idx]:<25} {importance_data['importances'][idx]:.6f}")

    plot_feature_importance(importance_data, OUTPUT_DIR)

    # 分析过拟合
    print("\n" + "="*80)
    print("Overfitting Analysis")
    print("="*80)
    overfitting_data = analyze_overfitting(X_train, X_test, y_train, y_test)

    for model_name, metrics in overfitting_data.items():
        print(f"\n{model_name.replace('_', ' ').title()}:")
        print(f"  Train Accuracy: {metrics['train_accuracy']:.4f}")
        print(f"  Test Accuracy:  {metrics['test_accuracy']:.4f}")
        print(f"  Accuracy Gap:   {metrics['train_accuracy'] - metrics['test_accuracy']:.4f}")
        print(f"  Train AUC:      {metrics['train_auc']:.4f}")
        print(f"  Test AUC:       {metrics['test_auc']:.4f}")
        print(f"  AUC Gap:        {metrics['train_auc'] - metrics['test_auc']:.4f}")

    plot_overfitting_comparison(overfitting_data, OUTPUT_DIR)

    # 问题诊断
    print("\n" + "="*80)
    print("Problem Diagnosis")
    print("="*80)

    rf_metrics = overfitting_data["random_forest"]
    lr_metrics = overfitting_data["logistic_regression"]

    # 1. 检查过拟合
    rf_overfit = rf_metrics["train_auc"] - rf_metrics["test_auc"]
    lr_overfit = lr_metrics["train_auc"] - lr_metrics["test_auc"]

    print(f"\n1. Overfitting Check:")
    print(f"   Random Forest AUC gap: {rf_overfit:.4f}")
    print(f"   Logistic Reg AUC gap:  {lr_overfit:.4f}")

    if rf_overfit > 0.05:
        print("   ⚠️  Random Forest shows signs of overfitting!")

    # 2. 检查样本量
    n_train = len(train_samples)
    n_features = len(FEATURE_KEYS)
    print(f"\n2. Sample Size Check:")
    print(f"   Training samples: {n_train}")
    print(f"   Features: {n_features}")
    print(f"   Samples per feature: {n_train / n_features:.2f}")

    if n_train < n_features * 10:
        print(f"   ⚠️  Limited training data (rule of thumb: 10+ samples per feature)")

    # 3. 检查特征重要性集中度
    top3_importance = sum(sorted(importance_data["importances"], reverse=True)[:3])
    print(f"\n3. Feature Importance Concentration:")
    print(f"   Top 3 features account for: {top3_importance:.2%}")

    if top3_importance > 0.7:
        print(f"   ℹ️  High concentration in few features - RF may memorize patterns")

    # 4. 检查AUC是否超过阈值
    print(f"\n4. Privacy Threshold Check:")
    print(f"   RF Test AUC: {rf_metrics['test_auc']:.4f}")
    print(f"   Threshold: 0.55")
    print(f"   Exceeded by: {rf_metrics['test_auc'] - 0.55:.4f}")

    if rf_metrics['test_auc'] > 0.55:
        print(f"   ❌ Random Forest FAILED privacy test (AUC > 0.55)")
    else:
        print(f"   ✓ Random Forest passed privacy test")

    # 保存报告
    report = {
        "sample_distribution": {
            "total_samples": len(samples),
            "train_samples": len(train_samples),
            "test_samples": len(test_samples),
            "unique_pairs": df["pairId"].nunique(),
        },
        "feature_importance": {
            name: float(imp)
            for name, imp in zip(importance_data["feature_names"], importance_data["importances"])
        },
        "overfitting_analysis": {
            model: {k: float(v) for k, v in metrics.items()}
            for model, metrics in overfitting_data.items()
        },
        "diagnosis": {
            "rf_overfit_gap": float(rf_overfit),
            "lr_overfit_gap": float(lr_overfit),
            "samples_per_feature": float(n_train / n_features),
            "top3_feature_importance": float(top3_importance),
            "rf_test_auc": float(rf_metrics["test_auc"]),
            "threshold": 0.55,
            "privacy_passed": rf_metrics["test_auc"] <= 0.55
        }
    }

    report_path = OUTPUT_DIR / "rf_semantic_analysis_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n[report] Saved: {report_path}")

    print("\n✓ Analysis complete!")

if __name__ == "__main__":
    main()
