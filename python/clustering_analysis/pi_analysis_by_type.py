#!/usr/bin/env python3
"""
PI实验按策略对类型的详细分析
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

results_dir = Path(__file__).parents[1] / "results" / "pi_clustering_analysis"
df = pd.read_csv(results_dir / "clustering_summary.csv")

print("=" * 80)
print("PI实验 - 按策略对类型的详细分析")
print("=" * 80)
print()

if 'pair_type' not in df.columns:
    print("错误: 数据中没有pair_type列")
    exit(1)

print("【策略对类型说明】")
print()
print("1. semantic_equivalent: 语义等价策略")
print("   - 两个策略逻辑完全相同，只是表达方式不同")
print("   - 预期: 完全不可区分（ARI≈0）")
print()
print("2. weak_equivalent: 弱等价策略")
print("   - 两个策略在多数情况下等价，但存在边界差异")
print("   - 预期: 基本不可区分（ARI接近0）")
print()
print("3. structural_variant: 结构变体策略")
print("   - 结构不同但功能相似的策略")
print("   - 预期: 可能有轻微可区分性")
print()
print("4. controlled_difference: 受控差异策略")
print("   - 有意设计的不同策略，用于测试边界")
print("   - 预期: 可能可区分")
print()

print("=" * 80)
print()

# 按类型分析
for ptype in sorted(df['pair_type'].unique()):
    subset = df[df['pair_type'] == ptype]

    print(f"【{ptype}】")
    print(f"  策略对数量: {len(subset)}")
    print(f"  样本总数: {subset['n_samples'].sum()}")
    print()

    # ARI统计
    print(f"  K-Means ARI:")
    print(f"    平均值: {subset['kmeans_ari'].mean():.6f}")
    print(f"    中位数: {subset['kmeans_ari'].median():.6f}")
    print(f"    标准差: {subset['kmeans_ari'].std():.6f}")
    print(
        f"    范围: [{subset['kmeans_ari'].min():.6f}, {subset['kmeans_ari'].max():.6f}]")
    print()

    # NMI统计
    print(f"  K-Means NMI:")
    print(f"    平均值: {subset['kmeans_nmi'].mean():.6f}")
    print(f"    中位数: {subset['kmeans_nmi'].median():.6f}")
    print(f"    标准差: {subset['kmeans_nmi'].std():.6f}")
    print(
        f"    范围: [{subset['kmeans_nmi'].min():.6f}, {subset['kmeans_nmi'].max():.6f}]")
    print()

    # 风险分布
    excellent = len(subset[subset['kmeans_ari'].abs() < 0.1])
    good = len(subset[(subset['kmeans_ari'].abs() >= 0.1)
               & (subset['kmeans_ari'].abs() < 0.3)])
    moderate = len(subset[(subset['kmeans_ari'].abs() >= 0.3)
                   & (subset['kmeans_ari'].abs() < 0.7)])
    high = len(subset[subset['kmeans_ari'].abs() >= 0.7])

    print(f"  风险等级分布:")
    print(
        f"    优秀 (|ARI|<0.1): {excellent} ({excellent/len(subset)*100:.1f}%)")
    print(f"    良好 (0.1≤|ARI|<0.3): {good} ({good/len(subset)*100:.1f}%)")
    print(
        f"    中等 (0.3≤|ARI|<0.7): {moderate} ({moderate/len(subset)*100:.1f}%)")
    print(f"    高风险 (|ARI|≥0.7): {high} ({high/len(subset)*100:.1f}%)")
    print()

    # 完全泄露案例
    perfect_leak = subset[subset['kmeans_ari'] == 1.0]
    if len(perfect_leak) > 0:
        print(
            f"  ⚠️⚠️ 完全泄露案例（ARI=1.0）: {len(perfect_leak)} ({len(perfect_leak)/len(subset)*100:.1f}%)")
        print(f"    这些策略对可以被完美区分！")
        print()

    # 评估
    avg_ari = subset['kmeans_ari'].mean()
    avg_nmi = subset['kmeans_nmi'].mean()

    if ptype in ['semantic_equivalent', 'weak_equivalent']:
        # 这些类型应该不可区分
        if avg_ari < 0.1 and avg_nmi < 0.2:
            assessment = "✓✓ 优秀 - 符合预期"
        elif avg_ari < 0.2 and avg_nmi < 0.35:
            assessment = "✓ 良好 - 基本符合预期"
        else:
            assessment = "⚠️⚠️ 警告 - 不符合预期，应该不可区分"
    else:
        # 这些类型可能可区分
        if avg_ari < 0.1 and avg_nmi < 0.2:
            assessment = "✓✓ 优秀 - 达到了很好的隐私保护"
        elif avg_ari < 0.3 and avg_nmi < 0.4:
            assessment = "✓ 良好 - 隐私保护有效"
        else:
            assessment = "⚠️ 注意 - 可区分性较高"

    print(f"  评估: {assessment}")
    print()
    print("-" * 80)
    print()

# 完全泄露案例汇总
print("【完全泄露案例汇总】")
print()
perfect_leaks = df[df['kmeans_ari'] == 1.0]
print(f"总数: {len(perfect_leaks)} / {len(df)} ({len(perfect_leaks)/len(df)*100:.1f}%)")
print()

if len(perfect_leaks) > 0:
    print("按类型分布:")
    for ptype in sorted(perfect_leaks['pair_type'].unique()):
        count = len(perfect_leaks[perfect_leaks['pair_type'] == ptype])
        total_in_type = len(df[df['pair_type'] == ptype])
        print(
            f"  {ptype}: {count} / {total_in_type} ({count/total_in_type*100:.1f}%)")
    print()

    print("示例（前10个）:")
    for idx, row in perfect_leaks.head(10).iterrows():
        print(f"  {row['pair_id']} [{row['pair_type']}]")
    print()

print("=" * 80)

# 创建按类型的对比图
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 1. 各类型ARI箱线图
ax1 = axes[0, 0]
data_ari = [df[df['pair_type'] == pt]['kmeans_ari']
            for pt in sorted(df['pair_type'].unique())]
labels = sorted(df['pair_type'].unique())
bp1 = ax1.boxplot(data_ari, tick_labels=[l[:15]
                  for l in labels], patch_artist=True)
for patch in bp1['boxes']:
    patch.set_facecolor('lightblue')
ax1.set_ylabel('K-Means ARI')
ax1.set_title('ARI by Policy Pair Type')
ax1.axhline(y=0, color='red', linestyle='--', linewidth=1)
ax1.grid(True, alpha=0.3)
plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45, ha='right')

# 2. 各类型NMI箱线图
ax2 = axes[0, 1]
data_nmi = [df[df['pair_type'] == pt]['kmeans_nmi']
            for pt in sorted(df['pair_type'].unique())]
bp2 = ax2.boxplot(data_nmi, tick_labels=[l[:15]
                  for l in labels], patch_artist=True)
for patch in bp2['boxes']:
    patch.set_facecolor('lightcoral')
ax2.set_ylabel('K-Means NMI')
ax2.set_title('NMI by Policy Pair Type')
ax2.axhline(y=0.2, color='orange', linestyle='--', linewidth=1, alpha=0.5)
ax2.grid(True, alpha=0.3)
plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, ha='right')

# 3. 各类型平均ARI柱状图
ax3 = axes[1, 0]
avg_ari_by_type = [df[df['pair_type'] == pt]['kmeans_ari'].mean()
                   for pt in sorted(df['pair_type'].unique())]
colors = ['green' if abs(x) < 0.1 else 'orange' if abs(
    x) < 0.3 else 'red' for x in avg_ari_by_type]
ax3.bar(range(len(labels)), avg_ari_by_type, color=colors, alpha=0.7)
ax3.set_xticks(range(len(labels)))
ax3.set_xticklabels([l[:15] for l in labels], rotation=45, ha='right')
ax3.set_ylabel('Average K-Means ARI')
ax3.set_title('Average ARI by Type')
ax3.axhline(y=0, color='red', linestyle='--', linewidth=1)
ax3.grid(True, alpha=0.3)

# 4. 各类型风险分布堆叠图
ax4 = axes[1, 1]
risk_data = {
    'Excellent': [],
    'Good': [],
    'Moderate': [],
    'High': []
}
for pt in sorted(df['pair_type'].unique()):
    subset = df[df['pair_type'] == pt]
    risk_data['Excellent'].append(
        len(subset[subset['kmeans_ari'].abs() < 0.1]))
    risk_data['Good'].append(len(
        subset[(subset['kmeans_ari'].abs() >= 0.1) & (subset['kmeans_ari'].abs() < 0.3)]))
    risk_data['Moderate'].append(len(
        subset[(subset['kmeans_ari'].abs() >= 0.3) & (subset['kmeans_ari'].abs() < 0.7)]))
    risk_data['High'].append(len(subset[subset['kmeans_ari'].abs() >= 0.7]))

x = range(len(labels))
bottom = np.zeros(len(labels))
colors_stack = ['green', 'yellow', 'orange', 'red']
for (risk_level, counts), color in zip(risk_data.items(), colors_stack):
    ax4.bar(x, counts, bottom=bottom, label=risk_level, color=color, alpha=0.7)
    bottom += counts

ax4.set_xticks(range(len(labels)))
ax4.set_xticklabels([l[:15] for l in labels], rotation=45, ha='right')
ax4.set_ylabel('Number of Pairs')
ax4.set_title('Risk Distribution by Type')
ax4.legend()
ax4.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
output_path = results_dir / "pi_analysis_by_type.png"
plt.savefig(output_path, dpi=150, bbox_inches='tight')
print(f"按类型分析图表已保存到: {output_path}")
