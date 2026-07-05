#!/usr/bin/env python3
"""
详细分析SPP（Structure and Parameter Privacy）实验的聚类结果
"""
import argparse
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

results_dir = Path(__file__).parents[1] / "results" / "spp_clustering_analysis"
parser = argparse.ArgumentParser(description="Render the SPP clustering summary figure")
parser.add_argument("--input", type=Path,
                    default=results_dir / "spp_clustering_summary.csv")
parser.add_argument("--output", type=Path,
                    default=results_dir / "spp_detailed_analysis.png")
args = parser.parse_args()
df = pd.read_csv(args.input)

print("=" * 80)
print("SPP实验 - Structure and Parameter Privacy 聚类分析详细报告")
print("=" * 80)
print()

print("【1. 实验概览】")
print()
print("SPP实验旨在评估攻击者能否从gas成本中推断策略的结构和参数特征")
print()
print("测试目标（4个隐私属性）:")
print("  1. logicStructure: 逻辑结构（and_only, and_or_mixed, negation_heavy, or_only）")
print("  2. nestingDepth: 嵌套深度（deep, flat, medium, shallow）")
print("  3. predicateCount: 谓词数量（few, many, none, single）")
print("  4. setSize: 集合大小（large, medium, none, small）")
print()
print(f"  总测试样本: {df['n_samples'].iloc[0]}")
print(f"  测试目标数: {len(df)}")
print()

print("【2. 各目标详细分析】")
print()

# 读取PCH结果用于对比
pch_duo_file = Path(__file__).parents[1] / "results" / \
    "pch_clustering_analysis" / "pch_duo_clustering_summary.csv"
pch_icd10_file = Path(__file__).parents[1] / "results" / \
    "pch_clustering_analysis" / "pch_icd10_clustering_summary.csv"
pi_file = Path(__file__).parents[1] / "results" / \
    "pi_clustering_analysis" / "clustering_summary.csv"

pch_duo_avg_ari = None
pch_duo_avg_nmi = None
pch_icd10_avg_ari = None
pch_icd10_avg_nmi = None
pi_avg_ari = None
pi_avg_nmi = None

if pch_duo_file.exists():
    pch_duo = pd.read_csv(pch_duo_file)
    pch_duo_avg_ari = pch_duo['kmeans_ari'].mean()
    pch_duo_avg_nmi = pch_duo['kmeans_nmi'].mean()

if pch_icd10_file.exists():
    pch_icd10 = pd.read_csv(pch_icd10_file)
    pch_icd10_avg_ari = pch_icd10['kmeans_ari'].mean()
    pch_icd10_avg_nmi = pch_icd10['kmeans_nmi'].mean()

if pi_file.exists():
    pi = pd.read_csv(pi_file)
    pi_avg_ari = pi['kmeans_ari'].mean()
    pi_avg_nmi = pi['kmeans_nmi'].mean()

# 按目标分析
for idx, row in df.iterrows():
    target = row['target']
    n_samples = int(row['n_samples'])
    n_classes = int(row['n_classes'])
    ari = row['kmeans_ari']
    nmi = row['kmeans_nmi']

    print(f"目标: {target}")
    print(f"  样本数: {n_samples}")
    print(f"  类别数: {n_classes}")
    print(f"  K-Means ARI: {ari:.6f}")
    print(f"  K-Means NMI: {nmi:.6f}")

    # 评估隐私保护效果
    if abs(ari) < 0.01 and nmi < 0.01:
        privacy_level = "优秀 ✓✓ (接近完美随机)"
        risk = "无风险"
    elif abs(ari) < 0.05 and nmi < 0.05:
        privacy_level = "优秀 ✓ (接近随机猜测)"
        risk = "极低风险"
    elif abs(ari) < 0.1 and nmi < 0.1:
        privacy_level = "良好 (轻微信息泄露)"
        risk = "低风险"
    else:
        privacy_level = "警告 ⚠ (存在信息泄露)"
        risk = "需要关注"

    print(f"  隐私保护评级: {privacy_level}")
    print(f"  风险等级: {risk}")

    # 估算攻击成功率
    random_guess = 1.0 / n_classes
    # 基于ARI估算（ARI=1表示完美分类，ARI=0表示随机）
    # 简化估算：success_rate ≈ random_guess + (1-random_guess) * max(0, ARI)
    estimated_success = random_guess + (1 - random_guess) * max(0, ari)
    improvement_factor = estimated_success / \
        random_guess if random_guess > 0 else 1.0

    print(f"  随机猜测成功率: {random_guess*100:.1f}%")
    print(f"  估计攻击成功率: {estimated_success*100:.1f}%")
    print(f"  相对随机的提升: {improvement_factor:.2f}x")
    print()

print("=" * 80)
print()

print("【3. 与其他实验对比】")
print()

print(f"{'实验':<20} {'平均ARI':<15} {'平均NMI':<15} {'目标':<30}")
print("-" * 80)

if pch_duo_avg_ari is not None:
    print(f"{'PCH-DUO':<20} {pch_duo_avg_ari:<15.6f} {pch_duo_avg_nmi:<15.6f} {'隐藏DUO术语内容':<30}")

if pch_icd10_avg_ari is not None:
    print(f"{'PCH-ICD10':<20} {pch_icd10_avg_ari:<15.6f} {pch_icd10_avg_nmi:<15.6f} {'隐藏ICD10 scope内容':<30}")

if pi_avg_ari is not None:
    print(f"{'PI':<20} {pi_avg_ari:<15.6f} {pi_avg_nmi:<15.6f} {'区分两个策略':<30}")

spp_avg_ari = df['kmeans_ari'].mean()
spp_avg_nmi = df['kmeans_nmi'].mean()
print(f"{'SPP':<20} {spp_avg_ari:<15.6f} {spp_avg_nmi:<15.6f} {'推断结构和参数特征':<30}")

print()
print("对比分析:")
print()

# 与PCH-DUO对比
if pch_duo_avg_ari is not None:
    ari_ratio = abs(
        spp_avg_ari / pch_duo_avg_ari) if pch_duo_avg_ari != 0 else 0
    nmi_ratio = spp_avg_nmi / pch_duo_avg_nmi if pch_duo_avg_nmi != 0 else 0
    print(f"  SPP vs PCH-DUO:")
    print(f"    ARI比值: {ari_ratio:.2f}x")
    print(f"    NMI比值: {nmi_ratio:.2f}x")
    if abs(spp_avg_ari) < abs(pch_duo_avg_ari) and spp_avg_nmi < pch_duo_avg_nmi:
        print(f"    → SPP隐私保护优于PCH-DUO ✓")
    elif abs(spp_avg_ari) < abs(pch_duo_avg_ari) * 2 and spp_avg_nmi < pch_duo_avg_nmi * 2:
        print(f"    → SPP隐私保护与PCH-DUO相当 ✓")
    else:
        print(f"    → SPP隐私保护不如PCH-DUO ⚠️")
    print()

# 与PI对比
if pi_avg_ari is not None:
    ari_ratio = abs(spp_avg_ari / pi_avg_ari) if pi_avg_ari != 0 else 0
    nmi_ratio = spp_avg_nmi / pi_avg_nmi if pi_avg_nmi != 0 else 0
    print(f"  SPP vs PI:")
    print(f"    ARI比值: {ari_ratio:.2f}x")
    print(f"    NMI比值: {nmi_ratio:.2f}x")
    if abs(spp_avg_ari) < abs(pi_avg_ari) and spp_avg_nmi < pi_avg_nmi:
        print(f"    → SPP隐私保护远优于PI ✓✓")
    else:
        print(f"    → SPP隐私保护表现 ✓")
    print()

print("=" * 80)
print()

print("【4. 关键发现】")
print()

# 检查是否所有目标都达到优秀水平
all_excellent = all(
    (abs(row['kmeans_ari']) < 0.01 and row['kmeans_nmi'] < 0.01) for _, row in df.iterrows())
all_good = all((abs(row['kmeans_ari']) < 0.05 and row['kmeans_nmi'] < 0.05)
               for _, row in df.iterrows())

if all_excellent:
    print("✓✓ 所有4个目标都达到了优秀级别（ARI和NMI都接近0）")
    print("   → 攻击者无法从gas成本中推断任何结构或参数特征")
elif all_good:
    print("✓ 所有4个目标都达到了良好级别")
    print("   → 结构和参数隐私保护有效")
else:
    print("⚠️ 部分目标的隐私保护需要改进")

print()

# 找出表现最好和最差的目标
best_target = df.loc[df['kmeans_nmi'].idxmin()]
worst_target = df.loc[df['kmeans_nmi'].idxmax()]

print(f"表现最好的目标: {best_target['target']}")
print(
    f"  ARI: {best_target['kmeans_ari']:.6f}, NMI: {best_target['kmeans_nmi']:.6f}")
print()

print(f"表现最差的目标: {worst_target['target']}")
print(
    f"  ARI: {worst_target['kmeans_ari']:.6f}, NMI: {worst_target['kmeans_nmi']:.6f}")
if worst_target['kmeans_nmi'] < 0.05:
    print(f"  → 但仍然在优秀范围内 ✓")
elif worst_target['kmeans_nmi'] < 0.1:
    print(f"  → 在良好范围内 ✓")
else:
    print(f"  → 需要改进 ⚠️")
print()

print("=" * 80)
print()

print("【5. 结论】")
print()

avg_ari = df['kmeans_ari'].mean()
avg_nmi = df['kmeans_nmi'].mean()

if abs(avg_ari) < 0.01 and avg_nmi < 0.01:
    conclusion = "优秀 ✓✓✓"
    detail = "SPP目标完美达成！攻击者无法从gas成本推断任何结构或参数信息"
    recommendation = "保持当前padding策略"
elif abs(avg_ari) < 0.05 and avg_nmi < 0.05:
    conclusion = "优秀 ✓✓"
    detail = "SPP目标达成，结构和参数隐私得到有效保护"
    recommendation = "保持当前策略，可进行微调优化"
elif abs(avg_ari) < 0.1 and avg_nmi < 0.1:
    conclusion = "良好 ✓"
    detail = "多数结构和参数特征被隐藏，但仍有改进空间"
    recommendation = "考虑增强padding策略"
else:
    conclusion = "需要改进 ⚠️"
    detail = "部分结构或参数特征可能被推断"
    recommendation = "需要重新设计padding策略"

print(f"整体评级: {conclusion}")
print(f"  平均ARI: {avg_ari:.6f}, 平均NMI: {avg_nmi:.6f}")
print(f"  {detail}")
print()
print(f"建议: {recommendation}")
print()

print("=" * 80)
print()

print("【附录: 指标解释】")
print()
print("ARI (Adjusted Rand Index)")
print("  范围: [-1, 1]")
print("  - ARI ≈ 0: 聚类接近随机分配（理想的隐私保护）")
print("  - ARI → 1: 聚类完美匹配真实标签（完全信息泄露）")
print()
print("NMI (Normalized Mutual Information)")
print("  范围: [0, 1]")
print("  - NMI ≈ 0: 聚类与真实标签无关（理想的隐私保护）")
print("  - NMI → 1: 聚类完美匹配真实标签（完全信息泄露）")
print()

# 创建可视化
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 1. ARI对比柱状图
ax1 = axes[0, 0]
targets = df['target'].values
ari_values = df['kmeans_ari'].values
colors = ['green' if abs(x) < 0.01 else 'yellow' if abs(
    x) < 0.05 else 'orange' for x in ari_values]
ax1.bar(range(len(targets)), ari_values, color=colors, alpha=0.7)
ax1.set_xticks(range(len(targets)))
ax1.set_xticklabels(targets, rotation=45, ha='right')
ax1.set_ylabel('K-Means ARI')
ax1.set_title('SPP: ARI by Target\n(Closer to 0 is better)')
ax1.axhline(y=0, color='red', linestyle='--', linewidth=1)
ax1.grid(True, alpha=0.3, axis='y')

# 2. NMI对比柱状图
ax2 = axes[0, 1]
nmi_values = df['kmeans_nmi'].values
colors_nmi = ['green' if x < 0.01 else 'yellow' if x <
              0.05 else 'orange' for x in nmi_values]
ax2.bar(range(len(targets)), nmi_values, color=colors_nmi, alpha=0.7)
ax2.set_xticks(range(len(targets)))
ax2.set_xticklabels(targets, rotation=45, ha='right')
ax2.set_ylabel('K-Means NMI')
ax2.set_title('SPP: NMI by Target\n(Closer to 0 is better)')
ax2.grid(True, alpha=0.3, axis='y')

# 3. ARI vs NMI散点图
ax3 = axes[1, 0]
ax3.scatter(ari_values, nmi_values, s=200, alpha=0.6, c='purple')
for i, target in enumerate(targets):
    ax3.annotate(
        target, (ari_values[i], nmi_values[i]), fontsize=9, ha='right')
ax3.set_xlabel('K-Means ARI')
ax3.set_ylabel('K-Means NMI')
ax3.set_title('SPP: ARI vs NMI')
ax3.axhline(y=0.01, color='green', linestyle='--',
            linewidth=1, alpha=0.5, label='NMI=0.01')
ax3.axhline(y=0.05, color='orange', linestyle='--',
            linewidth=1, alpha=0.5, label='NMI=0.05')
ax3.axvline(x=0, color='red', linestyle='--', linewidth=1, alpha=0.5)
ax3.legend()
ax3.grid(True, alpha=0.3)

# 4. 类别数量对比
ax4 = axes[1, 1]
n_classes = df['n_classes'].values
ax4.bar(range(len(targets)), n_classes, color='steelblue', alpha=0.7)
ax4.set_xticks(range(len(targets)))
ax4.set_xticklabels(targets, rotation=45, ha='right')
ax4.set_ylabel('Number of Classes')
ax4.set_title('SPP: Class Count by Target')
ax4.grid(True, alpha=0.3, axis='y')

# 在每个柱子上标注数值
for i, (n, ari, nmi) in enumerate(zip(n_classes, ari_values, nmi_values)):
    ax4.text(i, n, str(int(n)), ha='center', va='bottom')

plt.tight_layout()
args.output.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(args.output, dpi=150, bbox_inches='tight')
plt.close()
print(f"可视化图表已保存到: {args.output}")
