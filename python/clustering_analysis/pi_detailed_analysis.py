#!/usr/bin/env python3
"""
详细分析PI（Policy Indistinguishability）实验的聚类结果
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# 读取结果
results_dir = Path(__file__).parents[1] / "results" / "pi_clustering_analysis"
df = pd.read_csv(results_dir / "clustering_summary.csv")

print("=" * 80)
print("PI实验 - Policy Indistinguishability 聚类分析详细报告")
print("=" * 80)
print()

print("【1. 实验概览】")
print(f"  测试策略对数量: {len(df)}")
print(f"  总执行次数: {df['n_samples'].sum()}")
print(f"  每对平均样本数: {df['n_samples'].mean():.1f}")
print()

# 统计pair_type分布
if 'pair_type' in df.columns:
    pair_types = df['pair_type'].value_counts()
    print("  策略对类型分布:")
    for ptype, count in pair_types.items():
        print(f"    {ptype}: {count} 对 ({count/len(df)*100:.1f}%)")
    print()

print("【2. K-Means聚类性能 (K=2)】")
print()
print("K-Means旨在将数据强制分为2个簇（对应两个策略）")
print("如果ARI接近0，说明聚类结果与真实标签无关 → 隐私保护好")
print("如果ARI接近1，说明聚类完美匹配真实标签 → 策略可区分")
print()

kmeans_ari = df['kmeans_ari']
kmeans_nmi = df['kmeans_nmi']

print(f"  平均ARI: {kmeans_ari.mean():.6f}")
print(f"  ARI中位数: {kmeans_ari.median():.6f}")
print(f"  ARI标准差: {kmeans_ari.std():.6f}")
print(f"  ARI范围: [{kmeans_ari.min():.6f}, {kmeans_ari.max():.6f}]")
print()
print(f"  平均NMI: {kmeans_nmi.mean():.6f}")
print(f"  NMI中位数: {kmeans_nmi.median():.6f}")
print(f"  NMI标准差: {kmeans_nmi.std():.6f}")
print(f"  NMI范围: [{kmeans_nmi.min():.6f}, {kmeans_nmi.max():.6f}]")
print()

# 按ARI区间统计
print("  ARI分布:")
ari_excellent = len(df[df['kmeans_ari'].abs() < 0.1])
ari_good = len(df[(df['kmeans_ari'].abs() >= 0.1)
               & (df['kmeans_ari'].abs() < 0.3)])
ari_moderate = len(df[(df['kmeans_ari'].abs() >= 0.3)
                   & (df['kmeans_ari'].abs() < 0.7)])
ari_warning = len(df[df['kmeans_ari'].abs() >= 0.7])

print(
    f"    |ARI| < 0.1 (优秀): {ari_excellent} 对 ({ari_excellent/len(df)*100:.1f}%)")
print(
    f"    0.1 ≤ |ARI| < 0.3 (良好): {ari_good} 对 ({ari_good/len(df)*100:.1f}%)")
print(
    f"    0.3 ≤ |ARI| < 0.7 (中等): {ari_moderate} 对 ({ari_moderate/len(df)*100:.1f}%)")
print(
    f"    |ARI| ≥ 0.7 (警告): {ari_warning} 对 ({ari_warning/len(df)*100:.1f}%)")
print()

# NMI分布
print("  NMI分布:")
nmi_excellent = len(df[df['kmeans_nmi'] < 0.2])
nmi_good = len(df[(df['kmeans_nmi'] >= 0.2) & (df['kmeans_nmi'] < 0.4)])
nmi_moderate = len(df[(df['kmeans_nmi'] >= 0.4) & (df['kmeans_nmi'] < 0.7)])
nmi_warning = len(df[df['kmeans_nmi'] >= 0.7])

print(
    f"    NMI < 0.2 (优秀): {nmi_excellent} 对 ({nmi_excellent/len(df)*100:.1f}%)")
print(f"    0.2 ≤ NMI < 0.4 (良好): {nmi_good} 对 ({nmi_good/len(df)*100:.1f}%)")
print(
    f"    0.4 ≤ NMI < 0.7 (中等): {nmi_moderate} 对 ({nmi_moderate/len(df)*100:.1f}%)")
print(f"    NMI ≥ 0.7 (警告): {nmi_warning} 对 ({nmi_warning/len(df)*100:.1f}%)")
print()

print("【3. DBSCAN聚类分析】")
print()
print("DBSCAN是密度聚类算法，无需指定簇数量")
print("如果只发现1个簇（或0簇），说明两个策略的gas成本模式无法区分")
print()

if 'dbscan_n_clusters' in df.columns:
    dbscan_clusters = df['dbscan_n_clusters']
    print(f"  平均簇数量: {dbscan_clusters.mean():.2f}")
    print(f"  簇数量分布:")
    cluster_dist = dbscan_clusters.value_counts().sort_index()
    for n_clusters, count in cluster_dist.items():
        status = "优秀 ✓" if int(n_clusters) <= 1 else "可区分 ⚠️" if int(
            n_clusters) == 2 else "异常"
        print(
            f"    {int(n_clusters)}簇: {count} 对 ({count/len(df)*100:.1f}%) - {status}")
    print()

if 'dbscan_ari' in df.columns:
    dbscan_ari = df['dbscan_ari']
    print(f"  DBSCAN ARI统计:")
    print(f"    平均: {dbscan_ari.mean():.6f}")
    print(f"    中位数: {dbscan_ari.median():.6f}")
    print(f"    范围: [{dbscan_ari.min():.6f}, {dbscan_ari.max():.6f}]")
    print()

print("【4. 风险评估】")
print()

# 综合评估：ARI和NMI都要考虑
high_risk = df[(df['kmeans_ari'].abs() >= 0.7) | (df['kmeans_nmi'] >= 0.7)]
medium_risk = df[((df['kmeans_ari'].abs() >= 0.3) & (df['kmeans_ari'].abs() < 0.7)) |
                 ((df['kmeans_nmi'] >= 0.4) & (df['kmeans_nmi'] < 0.7))]
low_risk = df[((df['kmeans_ari'].abs() >= 0.1) & (df['kmeans_ari'].abs() < 0.3)) |
              ((df['kmeans_nmi'] >= 0.2) & (df['kmeans_nmi'] < 0.4))]
no_risk = df[(df['kmeans_ari'].abs() < 0.1) & (df['kmeans_nmi'] < 0.2)]

print(f"综合风险评估（基于ARI和NMI）:")
print(f"  🟢 无风险: {len(no_risk)} 对 ({len(no_risk)/len(df)*100:.1f}%)")
print(f"  🟡 低风险: {len(low_risk)} 对 ({len(low_risk)/len(df)*100:.1f}%)")
print(f"  🟠 中等风险: {len(medium_risk)} 对 ({len(medium_risk)/len(df)*100:.1f}%)")
print(f"  🔴 高风险: {len(high_risk)} 对 ({len(high_risk)/len(df)*100:.1f}%)")
print()

if len(high_risk) > 0:
    print("  ⚠️⚠️ 高风险策略对示例（前5个）:")
    for idx, row in high_risk.head(5).iterrows():
        print(
            f"    {row['pair_id']}: ARI={row['kmeans_ari']:.3f}, NMI={row['kmeans_nmi']:.3f}")
    print()

print("【5. 与PCH实验对比】")
print()

# 读取PCH结果用于对比
pch_duo_file = Path(__file__).parents[1] / "results" / \
    "pch_clustering_analysis" / "pch_duo_clustering_summary.csv"
pch_icd10_file = Path(__file__).parents[1] / "results" / \
    "pch_clustering_analysis" / "pch_icd10_clustering_summary.csv"

if pch_duo_file.exists():
    pch_duo = pd.read_csv(pch_duo_file)
    print(f"  PCH-DUO平均ARI: {pch_duo['kmeans_ari'].mean():.6f}")
    print(f"  PCH-DUO平均NMI: {pch_duo['kmeans_nmi'].mean():.6f}")

if pch_icd10_file.exists():
    pch_icd10 = pd.read_csv(pch_icd10_file)
    print(f"  PCH-ICD10平均ARI: {pch_icd10['kmeans_ari'].mean():.6f}")
    print(f"  PCH-ICD10平均NMI: {pch_icd10['kmeans_nmi'].mean():.6f}")

print(f"  PI平均ARI: {kmeans_ari.mean():.6f}")
print(f"  PI平均NMI: {kmeans_nmi.mean():.6f}")
print()

print("【6. 关键发现】")
print()

# 计算百分比
indistinguishable_pct = (ari_excellent / len(df)) * 100
distinguishable_pct = ((ari_moderate + ari_warning) / len(df)) * 100

if indistinguishable_pct > 70:
    print(f"✓ {indistinguishable_pct:.1f}%的策略对具有优秀的不可区分性（|ARI|<0.1）")
    print("  → 大多数情况下，攻击者无法通过gas成本区分策略对")
elif indistinguishable_pct > 50:
    print(f"✓ {indistinguishable_pct:.1f}%的策略对具有良好的不可区分性")
    print("  → 多数情况下隐私保护有效")
else:
    print(f"⚠️ 仅{indistinguishable_pct:.1f}%的策略对不可区分")
    print("  → 需要改进padding策略")

print()

if distinguishable_pct > 30:
    print(f"⚠️ {distinguishable_pct:.1f}%的策略对可能被区分（|ARI|≥0.3）")
    print("  → 这些策略对需要增强padding")
else:
    print(f"✓ 仅{distinguishable_pct:.1f}%的策略对可能被区分")
    print("  → 整体隐私保护良好")

print()

# ARI=1的完全泄露案例
perfect_leak = df[df['kmeans_ari'] == 1.0]
if len(perfect_leak) > 0:
    print(f"⚠️⚠️ 发现{len(perfect_leak)}个完全泄露的案例（ARI=1.0）")
    print("  这些策略对可以被完美区分，需要立即修复")
    print()

print("【7. 结论】")
print()

avg_ari = kmeans_ari.mean()
avg_nmi = kmeans_nmi.mean()

if avg_ari < 0.1 and avg_nmi < 0.2:
    conclusion = "优秀 ✓✓"
    detail = "PI目标基本达成，gas padding机制有效保护了策略的不可区分性"
elif avg_ari < 0.2 and avg_nmi < 0.35:
    conclusion = "良好 ✓"
    detail = "多数策略对不可区分，但仍有改进空间"
elif avg_ari < 0.4 and avg_nmi < 0.5:
    conclusion = "中等 ⚠️"
    detail = "部分策略对可被区分，需要增强padding策略"
else:
    conclusion = "需要改进 ⚠️⚠️"
    detail = "策略可区分性较高，padding机制需要重大改进"

print(f"整体评级: {conclusion}")
print(f"  平均ARI: {avg_ari:.3f}, 平均NMI: {avg_nmi:.3f}")
print(f"  {detail}")
print()

print("=" * 80)

# 创建可视化
fig, axes = plt.subplots(2, 3, figsize=(18, 12))

# 1. ARI分布直方图
ax1 = axes[0, 0]
ax1.hist(kmeans_ari, bins=50, color='skyblue', alpha=0.7, edgecolor='black')
ax1.axvline(x=0, color='red', linestyle='--',
            linewidth=2, label='Perfect privacy')
ax1.axvline(x=kmeans_ari.mean(), color='green', linestyle='--',
            linewidth=2, label=f'Mean={kmeans_ari.mean():.3f}')
ax1.set_xlabel('K-Means ARI')
ax1.set_ylabel('Frequency')
ax1.set_title('PI: ARI Distribution')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 2. NMI分布直方图
ax2 = axes[0, 1]
ax2.hist(kmeans_nmi, bins=50, color='lightcoral', alpha=0.7, edgecolor='black')
ax2.axvline(x=0, color='red', linestyle='--',
            linewidth=2, label='Perfect privacy')
ax2.axvline(x=kmeans_nmi.mean(), color='green', linestyle='--',
            linewidth=2, label=f'Mean={kmeans_nmi.mean():.3f}')
ax2.set_xlabel('K-Means NMI')
ax2.set_ylabel('Frequency')
ax2.set_title('PI: NMI Distribution')
ax2.legend()
ax2.grid(True, alpha=0.3)

# 3. ARI vs NMI散点图
ax3 = axes[0, 2]
scatter = ax3.scatter(kmeans_ari, kmeans_nmi,
                      c=kmeans_ari.abs(), cmap='RdYlGn_r', alpha=0.6, s=20)
ax3.set_xlabel('K-Means ARI')
ax3.set_ylabel('K-Means NMI')
ax3.set_title('PI: ARI vs NMI')
ax3.axhline(y=0.2, color='orange', linestyle='--', alpha=0.5, label='NMI=0.2')
ax3.axvline(x=0, color='red', linestyle='--', alpha=0.5)
plt.colorbar(scatter, ax=ax3, label='|ARI|')
ax3.grid(True, alpha=0.3)

# 4. ARI箱线图
ax4 = axes[1, 0]
bp = ax4.boxplot([kmeans_ari], labels=['K-Means ARI'], patch_artist=True)
bp['boxes'][0].set_facecolor('lightblue')
ax4.axhline(y=0, color='red', linestyle='--', linewidth=1)
ax4.set_ylabel('ARI Value')
ax4.set_title('PI: ARI Box Plot')
ax4.grid(True, alpha=0.3)

# 5. 风险等级饼图
ax5 = axes[1, 1]
risk_counts = [len(no_risk), len(low_risk), len(medium_risk), len(high_risk)]
risk_labels = ['No Risk', 'Low Risk', 'Medium Risk', 'High Risk']
colors = ['green', 'yellow', 'orange', 'red']
ax5.pie(risk_counts, labels=risk_labels, colors=colors,
        autopct='%1.1f%%', startangle=90)
ax5.set_title('PI: Risk Level Distribution')

# 6. DBSCAN簇数量分布
ax6 = axes[1, 2]
if 'dbscan_n_clusters' in df.columns:
    cluster_counts = df['dbscan_n_clusters'].value_counts().sort_index()
    ax6.bar(cluster_counts.index, cluster_counts.values,
            color='purple', alpha=0.7)
    ax6.set_xlabel('Number of Clusters')
    ax6.set_ylabel('Frequency')
    ax6.set_title('PI: DBSCAN Cluster Count Distribution')
    ax6.grid(True, alpha=0.3)

plt.tight_layout()
output_path = results_dir / "pi_detailed_analysis.png"
plt.savefig(output_path, dpi=150, bbox_inches='tight')
print(f"\n可视化图表已保存到: {output_path}")
