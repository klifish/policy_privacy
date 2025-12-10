import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Load the data
data_file = Path(__file__).parent / "data" / \
    "artifacts_data testnet 02" / "pi_dataset.json"

with open(data_file, 'r') as f:
    data = json.load(f)

print("=" * 80)
print("PI Dataset 异常值分析")
print("=" * 80)

# Extract gas metrics from features
metrics = {
    'commitGasUsed': [],
    'accessGasUsed': [],
    'proofSize': [],
    'proofGenerationTime': [],
    'commitCalldataLength': [],
    'accessCalldataLength': []
}

for entry in data:
    if 'features' in entry and entry['features']:
        features = entry['features']
        for key in metrics.keys():
            if key in features and features[key] is not None:
                value = features[key]
                # Convert from string to int if needed
                if isinstance(value, str):
                    value = int(value, 16) if value.startswith('0x') else int(value)
                metrics[key].append(value)

# Convert to numpy arrays
for key in metrics:
    metrics[key] = np.array(metrics[key])

def detect_outliers(data, name):
    """Detect outliers using multiple methods"""
    print(f"\n{'=' * 80}")
    print(f"分析指标: {name}")
    print(f"{'=' * 80}")
    print(f"\n总样本数: {len(data)}")

    if len(data) == 0:
        print("没有数据可分析")
        return np.array([])

    # 方法1: IQR
    Q1 = np.percentile(data, 25)
    Q3 = np.percentile(data, 75)
    IQR = Q3 - Q1
    lower_bound_iqr = Q1 - 1.5 * IQR
    upper_bound_iqr = Q3 + 1.5 * IQR
    outliers_iqr = (data < lower_bound_iqr) | (data > upper_bound_iqr)

    print(f"\n方法1: IQR 方法")
    print(f"  Q1: {Q1:.2f}, Q3: {Q3:.2f}, IQR: {IQR:.2f}")
    print(f"  范围: [{lower_bound_iqr:.2f}, {upper_bound_iqr:.2f}]")
    print(f"  异常值数量: {np.sum(outliers_iqr)}")

    # 方法2: Z-score
    mean = data.mean()
    std = data.std()
    z_scores = np.abs((data - mean) / std) if std > 0 else np.zeros_like(data)
    outliers_zscore = z_scores > 3

    print(f"\n方法2: Z-score 方法 (阈值=3)")
    print(f"  平均值: {mean:.2f}, 标准差: {std:.2f}")
    print(f"  异常值数量: {np.sum(outliers_zscore)}")

    # 方法3: 百分位数
    lower_percentile = np.percentile(data, 1)
    upper_percentile = np.percentile(data, 99)
    outliers_percentile = (data < lower_percentile) | (data > upper_percentile)

    print(f"\n方法3: 百分位数方法 (1%-99%)")
    print(f"  范围: [{lower_percentile:.2f}, {upper_percentile:.2f}]")
    print(f"  异常值数量: {np.sum(outliers_percentile)}")

    # 方法4: MAD
    median = np.median(data)
    mad = np.median(np.abs(data - median))
    modified_z_scores = 0.6745 * (data - median) / mad if mad > 0 else np.zeros_like(data)
    outliers_mad = np.abs(modified_z_scores) > 3.5

    print(f"\n方法4: MAD 方法 (阈值=3.5)")
    print(f"  中位数: {median:.2f}, MAD: {mad:.2f}")
    print(f"  异常值数量: {np.sum(outliers_mad)}")

    # 综合判断
    outlier_votes = (outliers_iqr.astype(int) + outliers_zscore.astype(int) +
                     outliers_percentile.astype(int) + outliers_mad.astype(int))
    outliers_consensus = outlier_votes >= 2

    print(f"\n综合判断 (至少2种方法认同):")
    print(f"  异常值数量: {np.sum(outliers_consensus)} ({np.sum(outliers_consensus)/len(data)*100:.2f}%)")

    if np.sum(outliers_consensus) > 0:
        outlier_values = data[outliers_consensus]
        outlier_indices = np.where(outliers_consensus)[0]
        print(f"  异常值: {outlier_values[:10]}" + (" ..." if len(outlier_values) > 10 else ""))
        print(f"  异常值索引: {outlier_indices[:10]}" + (" ..." if len(outlier_indices) > 10 else ""))

    # 原始数据统计
    print(f"\n原始数据统计:")
    print(f"  平均值: {mean:.2f}")
    print(f"  中位数: {median:.2f}")
    print(f"  标准差: {std:.2f}")
    print(f"  最小值: {data.min():.2f}")
    print(f"  最大值: {data.max():.2f}")
    print(f"  变异系数 (CV): {(std/mean*100):.2f}%")

    # 剔除异常值后的统计
    if np.sum(outliers_consensus) > 0:
        data_clean = data[~outliers_consensus]
        mean_clean = data_clean.mean()
        std_clean = data_clean.std()

        print(f"\n剔除异常值后的统计:")
        print(f"  剩余样本数: {len(data_clean)}")
        print(f"  平均值: {mean_clean:.2f} (变化: {mean - mean_clean:.2f}, {(mean - mean_clean)/mean*100:.2f}%)")
        print(f"  中位数: {np.median(data_clean):.2f}")
        print(f"  标准差: {std_clean:.2f} (减少: {std - std_clean:.2f}, {(std - std_clean)/std*100:.2f}%)")
        print(f"  最小值: {data_clean.min():.2f}")
        print(f"  最大值: {data_clean.max():.2f}")
        print(f"  变异系数 (CV): {(std_clean/mean_clean*100):.2f}%")

    return outliers_consensus

# Analyze each metric
outliers_by_metric = {}
for metric_name, metric_data in metrics.items():
    if len(metric_data) > 0:
        outliers_by_metric[metric_name] = detect_outliers(metric_data, metric_name)

# Create comprehensive visualization
print(f"\n{'=' * 80}")
print("生成可视化图表...")
print(f"{'=' * 80}")

# Determine grid size based on number of metrics
n_metrics = len([m for m in metrics.values() if len(m) > 0])
n_rows = (n_metrics + 1) // 2
n_cols = 2

fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 5 * n_rows))
axes = axes.flatten() if n_metrics > 1 else [axes]

plot_idx = 0
for metric_name, metric_data in metrics.items():
    if len(metric_data) == 0:
        continue

    ax = axes[plot_idx]

    # Box plot with outliers highlighted
    outliers = outliers_by_metric[metric_name]
    data_clean = metric_data[~outliers]

    positions = [1, 2]
    bp = ax.boxplot([metric_data, data_clean], positions=positions,
                     tick_labels=['Original', 'Clean'],
                     widths=0.6, patch_artist=True)

    # Color the boxes
    bp['boxes'][0].set_facecolor('lightblue')
    bp['boxes'][1].set_facecolor('lightgreen')

    ax.set_ylabel(metric_name)
    ax.set_title(f'{metric_name}\n(Outliers: {np.sum(outliers)}, {np.sum(outliers)/len(metric_data)*100:.1f}%)')
    ax.grid(True, alpha=0.3, axis='y')

    plot_idx += 1

# Hide unused subplots
for idx in range(plot_idx, len(axes)):
    axes[idx].set_visible(False)

plt.tight_layout()
output_path = Path(__file__).parent / "data" / "pi_dataset_outliers_analysis.png"
plt.savefig(output_path, dpi=300, bbox_inches='tight')
print(f"\n箱线图已保存至: {output_path}")

# Create detailed comparison plots for key metrics
key_metrics = ['commitGasUsed', 'accessGasUsed']
for metric_name in key_metrics:
    if metric_name not in metrics or len(metrics[metric_name]) == 0:
        continue

    metric_data = metrics[metric_name]
    outliers = outliers_by_metric[metric_name]
    data_clean = metric_data[~outliers]

    if np.sum(outliers) == 0:
        continue

    fig2, axes2 = plt.subplots(2, 2, figsize=(14, 10))

    # Histogram comparison
    axes2[0, 0].hist(metric_data, bins=50, alpha=0.5, label='Original', edgecolor='black')
    axes2[0, 0].hist(data_clean, bins=50, alpha=0.7, label='Without Outliers', edgecolor='black')
    axes2[0, 0].set_xlabel(metric_name)
    axes2[0, 0].set_ylabel('Frequency')
    axes2[0, 0].set_title(f'{metric_name} Distribution Comparison')
    axes2[0, 0].legend()
    axes2[0, 0].grid(True, alpha=0.3)

    # Box plot comparison
    axes2[0, 1].boxplot([metric_data, data_clean], tick_labels=['Original', 'Clean'])
    axes2[0, 1].set_ylabel(metric_name)
    axes2[0, 1].set_title('Box Plot Comparison')
    axes2[0, 1].grid(True, alpha=0.3)

    # Statistics comparison
    stats_labels = ['Mean', 'Median', 'Std Dev']
    original_stats = [metric_data.mean(), np.median(metric_data), metric_data.std()]
    clean_stats = [data_clean.mean(), np.median(data_clean), data_clean.std()]

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

    # CDF comparison
    sorted_original = np.sort(metric_data)
    cumulative_original = np.arange(1, len(sorted_original) + 1) / len(sorted_original)
    sorted_clean = np.sort(data_clean)
    cumulative_clean = np.arange(1, len(sorted_clean) + 1) / len(sorted_clean)

    axes2[1, 1].plot(sorted_original, cumulative_original, label='Original', alpha=0.7)
    axes2[1, 1].plot(sorted_clean, cumulative_clean, label='Clean', alpha=0.7)
    axes2[1, 1].set_xlabel(metric_name)
    axes2[1, 1].set_ylabel('Cumulative Probability')
    axes2[1, 1].set_title('CDF Comparison')
    axes2[1, 1].legend()
    axes2[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    comparison_path = Path(__file__).parent / "data" / f"pi_dataset_{metric_name}_comparison.png"
    plt.savefig(comparison_path, dpi=300, bbox_inches='tight')
    print(f"\n{metric_name} 详细对比图已保存至: {comparison_path}")

print(f"\n{'=' * 80}")
print("分析完成！")
print(f"{'=' * 80}")
