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

# Calculate statistics
print("=" * 60)
print("commitGasUsed 分布分析")
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

print("=" * 60)
