#!/usr/bin/env python3
"""
详细分析PCH实验中的ICD10 scope聚类结果
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

from experiments.analysis.paths import CLUSTERING_RESULTS_DIR

# 读取结果
results_dir = CLUSTERING_RESULTS_DIR / "pch"
icd10_df = pd.read_csv(results_dir / "pch_icd10_clustering_summary.csv")

print("=" * 80)
print("PCH实验 - ICD10 Scope聚类分析详细报告")
print("=" * 80)
print()

print("【1. 整体统计】")
print(f"  测试层级数量: {len(icd10_df)}")
print(f"  总样本数: {icd10_df['n_samples'].sum()}")
print(
    f"  ICD10类别数范围: {icd10_df['n_classes'].min()} - {icd10_df['n_classes'].max()}")
print()

print("【2. K-Means聚类性能指标】")
print(f"  平均ARI: {icd10_df['kmeans_ari'].mean():.6f}")
print(f"  ARI标准差: {icd10_df['kmeans_ari'].std():.6f}")
print(
    f"  ARI范围: [{icd10_df['kmeans_ari'].min():.6f}, {icd10_df['kmeans_ari'].max():.6f}]")
print()
print(f"  平均NMI: {icd10_df['kmeans_nmi'].mean():.6f}")
print(f"  NMI标准差: {icd10_df['kmeans_nmi'].std():.6f}")
print(
    f"  NMI范围: [{icd10_df['kmeans_nmi'].min():.6f}, {icd10_df['kmeans_nmi'].max():.6f}]")
print()

print("【3. 各层级详细分析】")
print()

# 按ARI排序
icd10_sorted = icd10_df.sort_values('kmeans_ari', ascending=False)

for idx, row in icd10_sorted.iterrows():
    layer = row['layer']
    n_samples = int(row['n_samples'])
    n_classes = int(row['n_classes'])
    ari = row['kmeans_ari']
    nmi = row['kmeans_nmi']

    print(f"层级: {layer}")
    print(f"  样本数: {n_samples}")
    print(f"  ICD10类别数: {n_classes}")
    print(f"  K-Means ARI: {ari:.6f}")
    print(f"  K-Means NMI: {nmi:.6f}")

    # 评估隐私保护效果 - ICD10的阈值需要调整
    if abs(ari) < 0.05 and nmi < 0.2:
        privacy_level = "优秀 ✓ (接近随机猜测)"
        risk = "无风险"
    elif abs(ari) < 0.15 and nmi < 0.4:
        privacy_level = "良好 (轻微信息泄露)"
        risk = "低风险"
    elif abs(ari) < 0.3 and nmi < 0.6:
        privacy_level = "中等 ⚠ (存在一定信息泄露)"
        risk = "中等风险"
    else:
        privacy_level = "警告 ⚠⚠ (显著信息泄露)"
        risk = "需要改进"

    print(f"  隐私保护评级: {privacy_level}")
    print(f"  风险等级: {risk}")
    print()

print("【4. 与DUO结果对比】")
duo_df = pd.read_csv(results_dir / "pch_duo_clustering_summary.csv")
print(f"  DUO平均ARI: {duo_df['kmeans_ari'].mean():.6f}")
print(f"  ICD10平均ARI: {icd10_df['kmeans_ari'].mean():.6f}")
print(
    f"  差异: {abs(icd10_df['kmeans_ari'].mean() - duo_df['kmeans_ari'].mean()):.6f}")
print()
print(f"  DUO平均NMI: {duo_df['kmeans_nmi'].mean():.6f}")
print(f"  ICD10平均NMI: {icd10_df['kmeans_nmi'].mean():.6f}")
print(
    f"  差异: {abs(icd10_df['kmeans_nmi'].mean() - duo_df['kmeans_nmi'].mean()):.6f}")
print()

print("【5. 关键发现和结论】")
print()

# 分析不同风险等级的层级数量
excellent_count = len(
    icd10_df[(icd10_df['kmeans_ari'].abs() < 0.05) & (icd10_df['kmeans_nmi'] < 0.2)])
good_count = len(icd10_df[(icd10_df['kmeans_ari'].abs() < 0.15) & (
    icd10_df['kmeans_nmi'] < 0.4)]) - excellent_count
moderate_count = len(icd10_df[(icd10_df['kmeans_ari'].abs() < 0.3) & (
    icd10_df['kmeans_nmi'] < 0.6)]) - excellent_count - good_count
warning_count = len(icd10_df) - excellent_count - good_count - moderate_count

print(f"✓ 优秀层级: {excellent_count}/{len(icd10_df)}")
print(f"✓ 良好层级: {good_count}/{len(icd10_df)}")
print(f"⚠ 中等层级: {moderate_count}/{len(icd10_df)}")
print(f"⚠⚠ 需改进层级: {warning_count}/{len(icd10_df)}")
print()

if icd10_df['kmeans_nmi'].max() > 0.4:
    print("⚠️ 注意: ICD10的NMI值明显高于DUO (最高达{:.3f})".format(
        icd10_df['kmeans_nmi'].max()))
    print("   → ICD10 scope可能比DUO术语更容易从gas模式中识别")
    print()

if icd10_df['kmeans_ari'].max() > 0.2:
    print("⚠️ 注意: 存在ARI > 0.2的层级 (single_predicate_small: {:.3f})".format(
        icd10_df[icd10_df['layer'] == 'single_predicate_small']['kmeans_ari'].values[0]))
    print("   → 该层级可能存在显著的信息泄露")
    print()

print("【结论】: ICD10的聚类结果显示：")
print("  1. 相比DUO，ICD10 scope展现出更高的可区分性")
print("  2. 部分层级（如single_predicate_small）存在明显信息泄露")
print("  3. 需要针对ICD10 scope增强gas padding策略")
print()

print("=" * 80)
print()

print("【附录: 指标解释】")
print()
print("ARI (Adjusted Rand Index)")
print("  范围: [-1, 1]")
print("  - ARI ≈ 0: 聚类结果接近随机分配 (理想的隐私保护)")
print("  - ARI → 1: 聚类完美匹配真实标签 (完全信息泄露)")
print("  - ARI < 0: 聚类质量比随机猜测还差")
print()
print("NMI (Normalized Mutual Information)")
print("  范围: [0, 1]")
print("  - NMI ≈ 0: 聚类与真实标签无关 (理想的隐私保护)")
print("  - NMI → 1: 聚类完美匹配真实标签 (完全信息泄露)")
print()

# 创建统计图表
fig, axes = plt.subplots(2, 3, figsize=(18, 10))

# 1. ARI对比
ax1 = axes[0, 0]
layers = icd10_df['layer'].values
ari_values = icd10_df['kmeans_ari'].values
colors = ['green' if abs(x) < 0.05 else 'orange' if abs(
    x) < 0.15 else 'red' for x in ari_values]
ax1.barh(range(len(layers)), ari_values, color=colors, alpha=0.7)
ax1.set_yticks(range(len(layers)))
ax1.set_yticklabels(layers, fontsize=8)
ax1.set_xlabel('K-Means ARI')
ax1.set_title('ICD10: ARI by Layer\n(Closer to 0 is better)')
ax1.axvline(x=0, color='red', linestyle='--', linewidth=1)
ax1.grid(True, alpha=0.3)

# 2. NMI对比
ax2 = axes[0, 1]
nmi_values = icd10_df['kmeans_nmi'].values
colors_nmi = ['green' if x < 0.2 else 'orange' if x <
              0.4 else 'red' for x in nmi_values]
ax2.barh(range(len(layers)), nmi_values, color=colors_nmi, alpha=0.7)
ax2.set_yticks(range(len(layers)))
ax2.set_yticklabels(layers, fontsize=8)
ax2.set_xlabel('K-Means NMI')
ax2.set_title('ICD10: NMI by Layer\n(Closer to 0 is better)')
ax2.grid(True, alpha=0.3)

# 3. ICD10 vs DUO ARI对比
ax3 = axes[0, 2]
# 找到共同的layers
common_layers = set(icd10_df['layer'].values) & set(duo_df['layer'].values)
if common_layers:
    common_icd10 = icd10_df[icd10_df['layer'].isin(
        common_layers)].sort_values('layer')
    common_duo = duo_df[duo_df['layer'].isin(
        common_layers)].sort_values('layer')

    x = np.arange(len(common_layers))
    width = 0.35
    ax3.bar(x - width/2, common_duo['kmeans_ari'].values,
            width, label='DUO', alpha=0.7, color='blue')
    ax3.bar(x + width/2, common_icd10['kmeans_ari'].values,
            width, label='ICD10', alpha=0.7, color='orange')
    ax3.set_ylabel('K-Means ARI')
    ax3.set_title('DUO vs ICD10: ARI Comparison')
    ax3.set_xticks(x)
    ax3.set_xticklabels(sorted(common_layers), rotation=45,
                        ha='right', fontsize=7)
    ax3.legend()
    ax3.axhline(y=0, color='red', linestyle='--', linewidth=1)
    ax3.grid(True, alpha=0.3)

# 4. 类别数与ARI关系
ax4 = axes[1, 0]
n_classes = icd10_df['n_classes'].values
ax4.scatter(n_classes, ari_values, s=100, alpha=0.6, c='purple')
ax4.set_xlabel('ICD10 Class Count')
ax4.set_ylabel('K-Means ARI')
ax4.set_title('ICD10: Class Count vs ARI')
ax4.axhline(y=0, color='red', linestyle='--', linewidth=1)
ax4.grid(True, alpha=0.3)

# 5. 样本数与ARI关系
ax5 = axes[1, 1]
n_samples = icd10_df['n_samples'].values
ax5.scatter(n_samples, ari_values, s=100, alpha=0.6, c='brown')
ax5.set_xlabel('Sample Count')
ax5.set_ylabel('K-Means ARI')
ax5.set_title('ICD10: Sample Count vs ARI')
ax5.axhline(y=0, color='red', linestyle='--', linewidth=1)
ax5.grid(True, alpha=0.3)

# 6. ARI vs NMI关系
ax6 = axes[1, 2]
ax6.scatter(ari_values, nmi_values, s=100, alpha=0.6, c='teal')
for i, layer in enumerate(layers):
    ax6.annotate(layer, (ari_values[i], nmi_values[i]), fontsize=6, alpha=0.7)
ax6.set_xlabel('K-Means ARI')
ax6.set_ylabel('K-Means NMI')
ax6.set_title('ICD10: ARI vs NMI')
ax6.axhline(y=0.2, color='orange', linestyle='--',
            linewidth=1, alpha=0.5, label='NMI=0.2')
ax6.axvline(x=0, color='red', linestyle='--', linewidth=1, alpha=0.5)
ax6.grid(True, alpha=0.3)

plt.tight_layout()
output_path = results_dir / "pch_icd10_detailed_analysis.png"
plt.savefig(output_path, dpi=150, bbox_inches='tight')
print(f"统计图表已保存到: {output_path}")
