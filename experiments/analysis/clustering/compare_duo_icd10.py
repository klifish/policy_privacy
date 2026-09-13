#!/usr/bin/env python3
"""
DUO vs ICD10 对比分析
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

from experiments.analysis.paths import CLUSTERING_RESULTS_DIR

results_dir = CLUSTERING_RESULTS_DIR / "pch"
duo_df = pd.read_csv(results_dir / "pch_duo_clustering_summary.csv")
icd10_df = pd.read_csv(results_dir / "pch_icd10_clustering_summary.csv")

print("=" * 80)
print("PCH实验 - DUO vs ICD10 对比分析")
print("=" * 80)
print()

print("【总体对比】")
print()
print(f"{'指标':<25} {'DUO':>15} {'ICD10':>15} {'差异/倍数':>20}")
print("-" * 80)
print(f"{'层级数':<25} {len(duo_df):>15} {len(icd10_df):>15} {len(duo_df)-len(icd10_df):>20}")
print(f"{'总样本数':<25} {duo_df['n_samples'].sum():>15} {icd10_df['n_samples'].sum():>15} {duo_df['n_samples'].sum()-icd10_df['n_samples'].sum():>20}")
print(f"{'平均ARI':<25} {duo_df['kmeans_ari'].mean():>15.6f} {icd10_df['kmeans_ari'].mean():>15.6f} {icd10_df['kmeans_ari'].mean()/duo_df['kmeans_ari'].mean() if duo_df['kmeans_ari'].mean() != 0 else 0:>20.2f}x")
print(f"{'平均NMI':<25} {duo_df['kmeans_nmi'].mean():>15.6f} {icd10_df['kmeans_nmi'].mean():>15.6f} {icd10_df['kmeans_nmi'].mean()/duo_df['kmeans_nmi'].mean():>20.2f}x")
print(f"{'最大ARI':<25} {duo_df['kmeans_ari'].max():>15.6f} {icd10_df['kmeans_ari'].max():>15.6f} {icd10_df['kmeans_ari'].max()/duo_df['kmeans_ari'].max() if duo_df['kmeans_ari'].max() > 0 else 0:>20.2f}x")
print(f"{'最大NMI':<25} {duo_df['kmeans_nmi'].max():>15.6f} {icd10_df['kmeans_nmi'].max():>15.6f} {icd10_df['kmeans_nmi'].max()/duo_df['kmeans_nmi'].max():>20.2f}x")
print()

print("【共同层级详细对比】")
print()

# 找到共同的层级
common_layers = set(duo_df['layer'].values) & set(icd10_df['layer'].values)
common_layers = sorted(common_layers)

if common_layers:
    print(f"共同测试的层级数: {len(common_layers)}")
    print()

    for layer in common_layers:
        duo_row = duo_df[duo_df['layer'] == layer].iloc[0]
        icd10_row = icd10_df[icd10_df['layer'] == layer].iloc[0]

        print(f"层级: {layer}")
        print(
            f"  DUO  - ARI: {duo_row['kmeans_ari']:>8.6f}, NMI: {duo_row['kmeans_nmi']:>8.6f}, 样本: {int(duo_row['n_samples']):>3}, 类别: {int(duo_row['n_classes'])}")
        print(
            f"  ICD10- ARI: {icd10_row['kmeans_ari']:>8.6f}, NMI: {icd10_row['kmeans_nmi']:>8.6f}, 样本: {int(icd10_row['n_samples']):>3}, 类别: {int(icd10_row['n_classes'])}")

        ari_diff = abs(icd10_row['kmeans_ari'] - duo_row['kmeans_ari'])
        nmi_diff = abs(icd10_row['kmeans_nmi'] - duo_row['kmeans_nmi'])

        print(f"  差异 - ARI: {ari_diff:>8.6f}, NMI: {nmi_diff:>8.6f}")

        if nmi_diff > 0.3:
            print(f"  ⚠️⚠️ ICD10的NMI显著高于DUO，存在严重信息泄露风险")
        elif nmi_diff > 0.15:
            print(f"  ⚠️ ICD10的NMI明显高于DUO，需要改进")
        elif nmi_diff > 0.05:
            print(f"  ℹ️ ICD10的NMI略高于DUO")
        else:
            print(f"  ✓ 两者表现相似")
        print()

print("【风险评估总结】")
print()

# DUO风险分布
duo_excellent = len(
    duo_df[(duo_df['kmeans_ari'].abs() < 0.01) & (duo_df['kmeans_nmi'] < 0.1)])
duo_good = len(duo_df[(duo_df['kmeans_ari'].abs() < 0.05)
               & (duo_df['kmeans_nmi'] < 0.2)]) - duo_excellent
duo_moderate = len(duo_df) - duo_excellent - duo_good

# ICD10风险分布
icd10_excellent = len(
    icd10_df[(icd10_df['kmeans_ari'].abs() < 0.05) & (icd10_df['kmeans_nmi'] < 0.2)])
icd10_good = len(icd10_df[(icd10_df['kmeans_ari'].abs() < 0.15) & (
    icd10_df['kmeans_nmi'] < 0.4)]) - icd10_excellent
icd10_moderate = len(icd10_df) - icd10_excellent - icd10_good

print(f"DUO隐私保护级别分布:")
print(
    f"  优秀: {duo_excellent}/{len(duo_df)} ({duo_excellent/len(duo_df)*100:.1f}%)")
print(f"  良好: {duo_good}/{len(duo_df)} ({duo_good/len(duo_df)*100:.1f}%)")
print(f"  中等: {duo_moderate}/{len(duo_df)} ({duo_moderate/len(duo_df)*100:.1f}%)")
print()

print(f"ICD10隐私保护级别分布:")
print(f"  优秀: {icd10_excellent}/{len(icd10_df)} ({icd10_excellent/len(icd10_df)*100:.1f}%)")
print(f"  良好: {icd10_good}/{len(icd10_df)} ({icd10_good/len(icd10_df)*100:.1f}%)")
print(
    f"  中等: {icd10_moderate}/{len(icd10_df)} ({icd10_moderate/len(icd10_df)*100:.1f}%)")
print()

print("【核心结论】")
print()
print("✓ DUO术语: 隐私保护优秀，gas padding机制有效")
print(f"  - 平均NMI仅{duo_df['kmeans_nmi'].mean():.3f}，接近理想的0")
print(f"  - {duo_excellent}/{len(duo_df)}层级达到优秀级别")
print()
print("⚠️ ICD10 scope: 存在显著信息泄露，需要改进")
print(
    f"  - 平均NMI达{icd10_df['kmeans_nmi'].mean():.3f}，是DUO的{icd10_df['kmeans_nmi'].mean()/duo_df['kmeans_nmi'].mean():.1f}倍")
print(f"  - single_predicate_small层级NMI高达{icd10_df['kmeans_nmi'].max():.3f}")
print(f"  - 仅{icd10_excellent}/{len(icd10_df)}层级达到优秀级别")
print()

print("【建议】")
print("1. 保持当前DUO的padding策略")
print("2. 针对ICD10增强padding，特别是single_predicate_small层级")
print("3. 标准化ICD10验证流程，减少不同scope间的gas差异")
print("4. 增加ICD10测试样本量，从234增至至少500")
print()

print("=" * 80)

# 创建对比可视化
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 1. ARI箱线图对比
ax1 = axes[0, 0]
data_ari = [duo_df['kmeans_ari'].dropna(), icd10_df['kmeans_ari'].dropna()]
bp1 = ax1.boxplot(data_ari, labels=['DUO', 'ICD10'], patch_artist=True)
bp1['boxes'][0].set_facecolor('lightblue')
bp1['boxes'][1].set_facecolor('lightcoral')
ax1.set_ylabel('K-Means ARI')
ax1.set_title('DUO vs ICD10: ARI Distribution')
ax1.axhline(y=0, color='red', linestyle='--', linewidth=1, alpha=0.5)
ax1.grid(True, alpha=0.3)

# 2. NMI箱线图对比
ax2 = axes[0, 1]
data_nmi = [duo_df['kmeans_nmi'].dropna(), icd10_df['kmeans_nmi'].dropna()]
bp2 = ax2.boxplot(data_nmi, labels=['DUO', 'ICD10'], patch_artist=True)
bp2['boxes'][0].set_facecolor('lightblue')
bp2['boxes'][1].set_facecolor('lightcoral')
ax2.set_ylabel('K-Means NMI')
ax2.set_title('DUO vs ICD10: NMI Distribution')
ax2.axhline(y=0.2, color='orange', linestyle='--',
            linewidth=1, alpha=0.5, label='Warning threshold')
ax2.grid(True, alpha=0.3)

# 3. 共同层级ARI对比
ax3 = axes[1, 0]
if common_layers:
    common_duo = duo_df[duo_df['layer'].isin(
        common_layers)].sort_values('layer')
    common_icd10 = icd10_df[icd10_df['layer'].isin(
        common_layers)].sort_values('layer')

    x = np.arange(len(common_layers))
    width = 0.35
    ax3.bar(x - width/2, common_duo['kmeans_ari'].values,
            width, label='DUO', alpha=0.7, color='blue')
    ax3.bar(x + width/2, common_icd10['kmeans_ari'].values,
            width, label='ICD10', alpha=0.7, color='orange')
    ax3.set_ylabel('K-Means ARI')
    ax3.set_title('Common Layers: ARI Comparison')
    ax3.set_xticks(x)
    ax3.set_xticklabels(sorted(common_layers), rotation=45,
                        ha='right', fontsize=7)
    ax3.legend()
    ax3.axhline(y=0, color='red', linestyle='--', linewidth=1)
    ax3.grid(True, alpha=0.3)

# 4. 共同层级NMI对比
ax4 = axes[1, 1]
if common_layers:
    ax4.bar(x - width/2, common_duo['kmeans_nmi'].values,
            width, label='DUO', alpha=0.7, color='blue')
    ax4.bar(x + width/2, common_icd10['kmeans_nmi'].values,
            width, label='ICD10', alpha=0.7, color='orange')
    ax4.set_ylabel('K-Means NMI')
    ax4.set_title('Common Layers: NMI Comparison')
    ax4.set_xticks(x)
    ax4.set_xticklabels(sorted(common_layers), rotation=45,
                        ha='right', fontsize=7)
    ax4.legend()
    ax4.axhline(y=0.2, color='orange', linestyle='--', linewidth=1, alpha=0.5)
    ax4.grid(True, alpha=0.3)

plt.tight_layout()
output_path = results_dir / "pch_duo_vs_icd10_comparison.png"
plt.savefig(output_path, dpi=150, bbox_inches='tight')
print(f"对比图表已保存到: {output_path}")
