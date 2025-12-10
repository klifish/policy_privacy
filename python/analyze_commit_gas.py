import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Load the data
data_file = Path(__file__).parent / "data" / \
    "artifacts_data testnet 02" / "executed_dataset.json"

with open(data_file, 'r') as f:
    data = json.load(f)

# Extract commitGasUsed values from transactions.commit.receipt.gasUsed
commit_gas_values = []
for entry in data:
    if ('transactions' in entry and
        entry['transactions'] and
        'commit' in entry['transactions'] and
        entry['transactions']['commit'] and
        'receipt' in entry['transactions']['commit'] and
        entry['transactions']['commit']['receipt'] and
            'gasUsed' in entry['transactions']['commit']['receipt']):
        gas_used = entry['transactions']['commit']['receipt']['gasUsed']
        if gas_used is not None:
            # Convert from hex string to integer if needed
            if isinstance(gas_used, str):
                gas_used = int(gas_used, 16) if gas_used.startswith(
                    '0x') else int(gas_used)
            commit_gas_values.append(gas_used)

# Convert to numpy array
commit_gas_values = np.array(commit_gas_values)

# === 异常值检测 ===
print("=" * 60)
print("异常值检测")
print("=" * 60)

# 方法1: IQR (Interquartile Range) 方法
Q1 = np.percentile(commit_gas_values, 25)
Q3 = np.percentile(commit_gas_values, 75)
IQR = Q3 - Q1
lower_bound_iqr = Q1 - 1.5 * IQR
upper_bound_iqr = Q3 + 1.5 * IQR
outliers_iqr = (commit_gas_values < lower_bound_iqr) | (commit_gas_values > upper_bound_iqr)

print(f"\n方法1: IQR (四分位距) 方法")
print(f"  Q1 (25%分位数): {Q1:.2f}")
print(f"  Q3 (75%分位数): {Q3:.2f}")
print(f"  IQR: {IQR:.2f}")
print(f"  下界 (Q1 - 1.5*IQR): {lower_bound_iqr:.2f}")
print(f"  上界 (Q3 + 1.5*IQR): {upper_bound_iqr:.2f}")
print(f"  检测到的异常值数量: {np.sum(outliers_iqr)}")
if np.sum(outliers_iqr) > 0:
    print(f"  异常值: {commit_gas_values[outliers_iqr]}")

# 方法2: Z-score 方法 (标准差方法)
mean = commit_gas_values.mean()
std = commit_gas_values.std()
z_scores = np.abs((commit_gas_values - mean) / std)
outliers_zscore = z_scores > 3  # 通常使用3个标准差作为阈值
print(f"\n方法2: Z-score (标准差) 方法 (阈值=3)")
print(f"  平均值: {mean:.2f}")
print(f"  标准差: {std:.2f}")
print(f"  检测到的异常值数量: {np.sum(outliers_zscore)}")
if np.sum(outliers_zscore) > 0:
    print(f"  异常值: {commit_gas_values[outliers_zscore]}")
    print(f"  对应的 Z-scores: {z_scores[outliers_zscore]}")

# 方法3: 百分位数方法
lower_percentile = np.percentile(commit_gas_values, 1)
upper_percentile = np.percentile(commit_gas_values, 99)
outliers_percentile = (commit_gas_values < lower_percentile) | (commit_gas_values > upper_percentile)
print(f"\n方法3: 百分位数方法 (1% - 99%)")
print(f"  1% 分位数: {lower_percentile:.2f}")
print(f"  99% 分位数: {upper_percentile:.2f}")
print(f"  检测到的异常值数量: {np.sum(outliers_percentile)}")
if np.sum(outliers_percentile) > 0:
    print(f"  异常值: {commit_gas_values[outliers_percentile]}")

# 方法4: MAD (Median Absolute Deviation) 方法 - 对异常值更稳健
median = np.median(commit_gas_values)
mad = np.median(np.abs(commit_gas_values - median))
modified_z_scores = 0.6745 * (commit_gas_values - median) / mad if mad > 0 else np.zeros_like(commit_gas_values)
outliers_mad = np.abs(modified_z_scores) > 3.5
print(f"\n方法4: MAD (中位数绝对偏差) 方法 (阈值=3.5)")
print(f"  中位数: {median:.2f}")
print(f"  MAD: {mad:.2f}")
print(f"  检测到的异常值数量: {np.sum(outliers_mad)}")
if np.sum(outliers_mad) > 0:
    print(f"  异常值: {commit_gas_values[outliers_mad]}")
    print(f"  对应的 Modified Z-scores: {modified_z_scores[outliers_mad]}")

# 综合判断：使用多种方法投票
outlier_votes = outliers_iqr.astype(int) + outliers_zscore.astype(int) + outliers_percentile.astype(int) + outliers_mad.astype(int)
outliers_consensus = outlier_votes >= 2  # 至少2种方法认为是异常值
print(f"\n综合判断 (至少2种方法认为是异常值):")
print(f"  检测到的异常值数量: {np.sum(outliers_consensus)}")
if np.sum(outliers_consensus) > 0:
    print(f"  异常值: {commit_gas_values[outliers_consensus]}")
    print(f"  异常值索引: {np.where(outliers_consensus)[0]}")

# 剔除异常值后的数据
commit_gas_clean = commit_gas_values[~outliers_consensus]

print("\n" + "=" * 60)
print("原始数据统计")
print("=" * 60)
print(f"\n总样本数: {len(commit_gas_values)}")
print(f"\n基本统计:")
print(f"  平均值 (Mean):        {commit_gas_values.mean():.2f}")
print(f"  中位数 (Median):      {np.median(commit_gas_values):.2f}")
print(f"  标准差 (Std Dev):     {commit_gas_values.std():.2f}")
print(f"  最小值 (Min):         {commit_gas_values.min():.2f}")
print(f"  最大值 (Max):         {commit_gas_values.max():.2f}")

print(f"\n百分位数:")
print(f"  25% 分位数:           {np.percentile(commit_gas_values, 25):.2f}")
print(f"  50% 分位数 (中位数):  {np.percentile(commit_gas_values, 50):.2f}")
print(f"  75% 分位数:           {np.percentile(commit_gas_values, 75):.2f}")
print(f"  90% 分位数:           {np.percentile(commit_gas_values, 90):.2f}")
print(f"  95% 分位数:           {np.percentile(commit_gas_values, 95):.2f}")
print(f"  99% 分位数:           {np.percentile(commit_gas_values, 99):.2f}")

# Create visualizations
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# Histogram
axes[0, 0].hist(commit_gas_values, bins=50, edgecolor='black', alpha=0.7)
axes[0, 0].set_xlabel('commitGasUsed')
axes[0, 0].set_ylabel('频数')
axes[0, 0].set_title('commitGasUsed 分布直方图')
axes[0, 0].grid(True, alpha=0.3)

# Box plot
axes[0, 1].boxplot(commit_gas_values, vert=True)
axes[0, 1].set_ylabel('commitGasUsed')
axes[0, 1].set_title('commitGasUsed 箱线图')
axes[0, 1].grid(True, alpha=0.3)

# Cumulative distribution
sorted_values = np.sort(commit_gas_values)
cumulative = np.arange(1, len(sorted_values) + 1) / len(sorted_values)
axes[1, 0].plot(sorted_values, cumulative)
axes[1, 0].set_xlabel('commitGasUsed')
axes[1, 0].set_ylabel('累积概率')
axes[1, 0].set_title('commitGasUsed 累积分布函数')
axes[1, 0].grid(True, alpha=0.3)

# Violin plot
parts = axes[1, 1].violinplot(
    [commit_gas_values], vert=True, showmeans=True, showmedians=True)
axes[1, 1].set_ylabel('commitGasUsed')
axes[1, 1].set_title('commitGasUsed 小提琴图')
axes[1, 1].grid(True, alpha=0.3)

plt.tight_layout()
output_path = Path(__file__).parent / "data" / "commit_gas_distribution.png"
plt.savefig(output_path, dpi=300, bbox_inches='tight')
print(f"\n图表已保存至: {output_path}")

# Additional analysis: frequency distribution
print(f"\n数值范围分布:")
ranges = [
    (0, 100000, "0-100k"),
    (100000, 200000, "100k-200k"),
    (200000, 300000, "200k-300k"),
    (300000, 400000, "300k-400k"),
    (400000, 500000, "400k-500k"),
    (500000, float('inf'), "500k+")
]

for min_val, max_val, label in ranges:
    count = np.sum((commit_gas_values >= min_val)
                   & (commit_gas_values < max_val))
    percentage = (count / len(commit_gas_values)) * 100
    print(f"  {label:12s}: {count:6d} ({percentage:5.2f}%)")

# === 剔除异常值后的统计 ===
if len(commit_gas_clean) < len(commit_gas_values):
    print("\n" + "=" * 60)
    print("剔除异常值后的数据统计")
    print("=" * 60)
    print(f"\n剔除的样本数: {len(commit_gas_values) - len(commit_gas_clean)}")
    print(f"剩余样本数: {len(commit_gas_clean)}")
    print(f"剔除比例: {((len(commit_gas_values) - len(commit_gas_clean)) / len(commit_gas_values) * 100):.2f}%")

    print(f"\n基本统计:")
    print(f"  平均值 (Mean):        {commit_gas_clean.mean():.2f}")
    print(f"  中位数 (Median):      {np.median(commit_gas_clean):.2f}")
    print(f"  标准差 (Std Dev):     {commit_gas_clean.std():.2f}")
    print(f"  最小值 (Min):         {commit_gas_clean.min():.2f}")
    print(f"  最大值 (Max):         {commit_gas_clean.max():.2f}")

    print(f"\n百分位数:")
    print(f"  25% 分位数:           {np.percentile(commit_gas_clean, 25):.2f}")
    print(f"  50% 分位数 (中位数):  {np.percentile(commit_gas_clean, 50):.2f}")
    print(f"  75% 分位数:           {np.percentile(commit_gas_clean, 75):.2f}")
    print(f"  90% 分位数:           {np.percentile(commit_gas_clean, 90):.2f}")
    print(f"  95% 分位数:           {np.percentile(commit_gas_clean, 95):.2f}")
    print(f"  99% 分位数:           {np.percentile(commit_gas_clean, 99):.2f}")

    print(f"\n改善指标:")
    print(f"  平均值变化:           {commit_gas_values.mean() - commit_gas_clean.mean():.2f} ({((commit_gas_values.mean() - commit_gas_clean.mean()) / commit_gas_values.mean() * 100):.2f}%)")
    print(f"  标准差减少:           {commit_gas_values.std() - commit_gas_clean.std():.2f} ({((commit_gas_values.std() - commit_gas_clean.std()) / commit_gas_values.std() * 100):.2f}%)")
else:
    print("\n未检测到异常值，数据无需剔除。")

print("=" * 60)

# === 对比可视化 (原始 vs 剔除异常值后) ===
if len(commit_gas_clean) < len(commit_gas_values):
    fig2, axes2 = plt.subplots(2, 2, figsize=(14, 10))

    # Histogram comparison
    axes2[0, 0].hist(commit_gas_values, bins=50, alpha=0.5, label='Original', edgecolor='black')
    axes2[0, 0].hist(commit_gas_clean, bins=50, alpha=0.7, label='Without Outliers', edgecolor='black')
    axes2[0, 0].set_xlabel('commitGasUsed')
    axes2[0, 0].set_ylabel('Frequency')
    axes2[0, 0].set_title('Distribution Comparison: Original vs Clean')
    axes2[0, 0].legend()
    axes2[0, 0].grid(True, alpha=0.3)

    # Box plot comparison
    axes2[0, 1].boxplot([commit_gas_values, commit_gas_clean], labels=['Original', 'Clean'])
    axes2[0, 1].set_ylabel('commitGasUsed')
    axes2[0, 1].set_title('Box Plot Comparison')
    axes2[0, 1].grid(True, alpha=0.3)

    # Statistics comparison bar chart
    stats_labels = ['Mean', 'Median', 'Std Dev']
    original_stats = [commit_gas_values.mean(), np.median(commit_gas_values), commit_gas_values.std()]
    clean_stats = [commit_gas_clean.mean(), np.median(commit_gas_clean), commit_gas_clean.std()]

    x = np.arange(len(stats_labels))
    width = 0.35
    axes2[1, 0].bar(x - width/2, original_stats, width, label='Original', alpha=0.7)
    axes2[1, 0].bar(x + width/2, clean_stats, width, label='Clean', alpha=0.7)
    axes2[1, 0].set_xlabel('Statistics')
    axes2[1, 0].set_ylabel('Value')
    axes2[1, 0].set_title('Statistics Comparison')
    axes2[1, 0].set_xticks(x)
    axes2[1, 0].set_xticklabels(stats_labels)
    axes2[1, 0].legend()
    axes2[1, 0].grid(True, alpha=0.3)

    # Cumulative distribution comparison
    sorted_original = np.sort(commit_gas_values)
    cumulative_original = np.arange(1, len(sorted_original) + 1) / len(sorted_original)
    sorted_clean = np.sort(commit_gas_clean)
    cumulative_clean = np.arange(1, len(sorted_clean) + 1) / len(sorted_clean)

    axes2[1, 1].plot(sorted_original, cumulative_original, label='Original', alpha=0.7)
    axes2[1, 1].plot(sorted_clean, cumulative_clean, label='Clean', alpha=0.7)
    axes2[1, 1].set_xlabel('commitGasUsed')
    axes2[1, 1].set_ylabel('Cumulative Probability')
    axes2[1, 1].set_title('CDF Comparison')
    axes2[1, 1].legend()
    axes2[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    comparison_path = Path(__file__).parent / "data" / "commit_gas_comparison.png"
    plt.savefig(comparison_path, dpi=300, bbox_inches='tight')
    print(f"\n对比图表已保存至: {comparison_path}")
