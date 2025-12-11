#!/usr/bin/env python3
"""
分析为什么semantic_equivalent效果好，而structural_variant效果差
Analyze why semantic_equivalent performs well but structural_variant performs poorly
"""

import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from collections import defaultdict, Counter
from scipy import stats

def load_pi_pairs(data_dir):
    """Load all PI pairs from data directories"""
    pairs_by_type = defaultdict(list)

    data_path = Path(data_dir)
    for subdir in data_path.iterdir():
        if not subdir.is_dir():
            continue

        pi_pairs_file = subdir / "pi_pairs.json"
        if not pi_pairs_file.exists():
            continue

        with open(pi_pairs_file, 'r') as f:
            data = json.load(f)

        if isinstance(data, dict) and 'pairs' in data:
            pairs = data['pairs']
        else:
            pairs = data

        for pair in pairs:
            pair_type = pair.get('pairType', 'unknown')
            pairs_by_type[pair_type].append(pair)

    return pairs_by_type

def extract_gas_features(pair):
    """Extract gas features from a pair"""
    features = []

    policies = pair.get('policies', [])
    if len(policies) != 2:
        return None

    for policy_idx, policy in enumerate(policies):
        executions = policy.get('features', [])

        for exec_data in executions:
            feat = exec_data.get('features', {})
            commit_gas = feat.get('commitGasUsed')
            access_gas = feat.get('accessGasUsed')

            if commit_gas is not None and access_gas is not None:
                features.append({
                    'pair_id': pair.get('pairId'),
                    'policy_idx': policy_idx,
                    'commit_gas': commit_gas,
                    'access_gas': access_gas,
                    'total_gas': commit_gas + access_gas,
                    'policy_id': policy.get('policyId'),
                    'structure': policy.get('structure', {}),
                    'execution_profile': policy.get('executionProfile', {}),
                    'semantics': policy.get('semantics', {})
                })

    return features

def analyze_pair_differences(pairs_by_type):
    """分析每种类型pairs内部的差异性"""

    analysis = {}

    for pair_type, pairs in pairs_by_type.items():
        print(f"\n{'='*60}")
        print(f"分析 {pair_type} ({len(pairs)} pairs)")
        print(f"{'='*60}")

        # 收集特征
        commit_gas_diffs = []
        access_gas_diffs = []
        total_gas_diffs = []

        structure_diffs = []
        execution_profile_diffs = []

        for pair in pairs:
            features = extract_gas_features(pair)
            if not features or len(features) < 2:
                continue

            # 按policy分组
            policy_0_features = [f for f in features if f['policy_idx'] == 0]
            policy_1_features = [f for f in features if f['policy_idx'] == 1]

            if not policy_0_features or not policy_1_features:
                continue

            # 计算平均gas
            avg_commit_0 = np.mean([f['commit_gas'] for f in policy_0_features])
            avg_commit_1 = np.mean([f['commit_gas'] for f in policy_1_features])
            avg_access_0 = np.mean([f['access_gas'] for f in policy_0_features])
            avg_access_1 = np.mean([f['access_gas'] for f in policy_1_features])
            avg_total_0 = np.mean([f['total_gas'] for f in policy_0_features])
            avg_total_1 = np.mean([f['total_gas'] for f in policy_1_features])

            # 计算差异（绝对值）
            commit_diff = abs(avg_commit_0 - avg_commit_1)
            access_diff = abs(avg_access_0 - avg_access_1)
            total_diff = abs(avg_total_0 - avg_total_1)

            commit_gas_diffs.append(commit_diff)
            access_gas_diffs.append(access_diff)
            total_gas_diffs.append(total_diff)

            # 检查结构差异
            struct_0 = policy_0_features[0]['structure']
            struct_1 = policy_1_features[0]['structure']

            struct_diff_count = 0
            key_diffs = []
            for key in ['whitelistSize', 'merkleDepth', 'proofType']:
                if struct_0.get(key) != struct_1.get(key):
                    struct_diff_count += 1
                    key_diffs.append(key)

            structure_diffs.append({
                'count': struct_diff_count,
                'keys': key_diffs
            })

            # 检查执行配置差异
            exec_0 = policy_0_features[0]['execution_profile']
            exec_1 = policy_1_features[0]['execution_profile']

            exec_diff_count = 0
            for key in exec_0.keys():
                if exec_0.get(key) != exec_1.get(key):
                    exec_diff_count += 1

            execution_profile_diffs.append(exec_diff_count)

        # 统计
        print(f"\nGas差异统计:")
        print(f"  Commit Gas差异: mean={np.mean(commit_gas_diffs):.2f}, std={np.std(commit_gas_diffs):.2f}, median={np.median(commit_gas_diffs):.2f}")
        print(f"  Access Gas差异: mean={np.mean(access_gas_diffs):.2f}, std={np.std(access_gas_diffs):.2f}, median={np.median(access_gas_diffs):.2f}")
        print(f"  Total Gas差异:  mean={np.mean(total_gas_diffs):.2f}, std={np.std(total_gas_diffs):.2f}, median={np.median(total_gas_diffs):.2f}")

        print(f"\n结构差异统计:")
        struct_diff_counts = [d['count'] for d in structure_diffs]
        print(f"  平均结构字段差异数: {np.mean(struct_diff_counts):.2f}")
        print(f"  有结构差异的pairs: {sum(1 for c in struct_diff_counts if c > 0)}/{len(struct_diff_counts)}")

        # 统计哪些字段最常不同
        all_diff_keys = []
        for d in structure_diffs:
            all_diff_keys.extend(d['keys'])
        if all_diff_keys:
            print(f"  最常不同的结构字段: {Counter(all_diff_keys).most_common()}")

        print(f"\n执行配置差异统计:")
        print(f"  平均执行配置字段差异数: {np.mean(execution_profile_diffs):.2f}")
        print(f"  有执行配置差异的pairs: {sum(1 for c in execution_profile_diffs if c > 0)}/{len(execution_profile_diffs)}")

        analysis[pair_type] = {
            'commit_gas_diffs': commit_gas_diffs,
            'access_gas_diffs': access_gas_diffs,
            'total_gas_diffs': total_gas_diffs,
            'structure_diffs': structure_diffs,
            'execution_profile_diffs': execution_profile_diffs
        }

    return analysis

def calculate_gas_variance_within_pairs(pairs_by_type):
    """计算每个pair内部的gas方差（可区分性的指标）"""

    print(f"\n{'='*60}")
    print(f"Pair内部Gas方差分析 (可区分性指标)")
    print(f"{'='*60}")

    variance_analysis = {}

    for pair_type, pairs in pairs_by_type.items():
        within_pair_commit_variance = []
        within_pair_access_variance = []
        between_policy_commit_diff = []
        between_policy_access_diff = []

        for pair in pairs:
            features = extract_gas_features(pair)
            if not features or len(features) < 2:
                continue

            # 按policy分组
            policy_0_features = [f for f in features if f['policy_idx'] == 0]
            policy_1_features = [f for f in features if f['policy_idx'] == 1]

            if not policy_0_features or not policy_1_features:
                continue

            # Policy 0的内部方差
            commit_0 = [f['commit_gas'] for f in policy_0_features]
            access_0 = [f['access_gas'] for f in policy_0_features]

            # Policy 1的内部方差
            commit_1 = [f['commit_gas'] for f in policy_1_features]
            access_1 = [f['access_gas'] for f in policy_1_features]

            # 计算内部方差（越小越稳定）
            if len(commit_0) > 1:
                within_pair_commit_variance.append(np.var(commit_0))
            if len(commit_1) > 1:
                within_pair_commit_variance.append(np.var(commit_1))
            if len(access_0) > 1:
                within_pair_access_variance.append(np.var(access_0))
            if len(access_1) > 1:
                within_pair_access_variance.append(np.var(access_1))

            # 计算两个policy之间的差异（越大越容易区分）
            mean_commit_0 = np.mean(commit_0)
            mean_commit_1 = np.mean(commit_1)
            mean_access_0 = np.mean(access_0)
            mean_access_1 = np.mean(access_1)

            between_policy_commit_diff.append(abs(mean_commit_0 - mean_commit_1))
            between_policy_access_diff.append(abs(mean_access_0 - mean_access_1))

        print(f"\n{pair_type}:")
        print(f"  Policy内部Commit Gas方差: mean={np.mean(within_pair_commit_variance):.2f}, std={np.std(within_pair_commit_variance):.2f}")
        print(f"  Policy内部Access Gas方差: mean={np.mean(within_pair_access_variance):.2f}, std={np.std(within_pair_access_variance):.2f}")
        print(f"  Policy之间Commit Gas差异: mean={np.mean(between_policy_commit_diff):.2f}, std={np.std(between_policy_commit_diff):.2f}")
        print(f"  Policy之间Access Gas差异: mean={np.mean(between_policy_access_diff):.2f}, std={np.std(between_policy_access_diff):.2f}")

        # 计算信噪比 (SNR) - between差异 / within方差
        if np.mean(within_pair_commit_variance) > 0:
            commit_snr = np.mean(between_policy_commit_diff) / np.sqrt(np.mean(within_pair_commit_variance))
            print(f"  Commit Gas 信噪比 (SNR): {commit_snr:.4f}")

        if np.mean(within_pair_access_variance) > 0:
            access_snr = np.mean(between_policy_access_diff) / np.sqrt(np.mean(within_pair_access_variance))
            print(f"  Access Gas 信噪比 (SNR): {access_snr:.4f}")

        variance_analysis[pair_type] = {
            'within_commit_var': within_pair_commit_variance,
            'within_access_var': within_pair_access_variance,
            'between_commit_diff': between_policy_commit_diff,
            'between_access_diff': between_policy_access_diff
        }

    return variance_analysis

def visualize_comparison(analysis, variance_analysis, output_dir):
    """可视化对比分析"""

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 1. Gas差异对比
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    pair_types = ['semantic_equivalent', 'structural_variant']
    colors = {'semantic_equivalent': '#10b981', 'structural_variant': '#ef4444'}

    # Commit gas差异
    ax = axes[0, 0]
    for pt in pair_types:
        if pt in analysis:
            data = analysis[pt]['commit_gas_diffs']
            ax.hist(data, bins=30, alpha=0.6, label=pt, color=colors[pt])
    ax.set_xlabel('Commit Gas Difference (absolute)')
    ax.set_ylabel('Frequency')
    ax.set_title('Commit Gas Differences between Policies in Pairs')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # Access gas差异
    ax = axes[0, 1]
    for pt in pair_types:
        if pt in analysis:
            data = analysis[pt]['access_gas_diffs']
            ax.hist(data, bins=30, alpha=0.6, label=pt, color=colors[pt])
    ax.set_xlabel('Access Gas Difference (absolute)')
    ax.set_ylabel('Frequency')
    ax.set_title('Access Gas Differences between Policies in Pairs')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 结构差异
    ax = axes[1, 0]
    struct_data = []
    labels = []
    for pt in pair_types:
        if pt in analysis:
            counts = [d['count'] for d in analysis[pt]['structure_diffs']]
            struct_data.append(counts)
            labels.append(pt)

    bp = ax.boxplot(struct_data, labels=labels, patch_artist=True)
    for patch, pt in zip(bp['boxes'], pair_types):
        patch.set_facecolor(colors[pt])
    ax.set_ylabel('Number of Different Structure Fields')
    ax.set_title('Structural Differences between Policies')
    ax.grid(True, alpha=0.3)

    # 执行配置差异
    ax = axes[1, 1]
    exec_data = []
    labels = []
    for pt in pair_types:
        if pt in analysis:
            exec_data.append(analysis[pt]['execution_profile_diffs'])
            labels.append(pt)

    bp = ax.boxplot(exec_data, labels=labels, patch_artist=True)
    for patch, pt in zip(bp['boxes'], pair_types):
        patch.set_facecolor(colors[pt])
    ax.set_ylabel('Number of Different Execution Profile Fields')
    ax.set_title('Execution Profile Differences between Policies')
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path / 'semantic_vs_structural_comparison.png', dpi=200)
    plt.close()

    # 2. 信噪比对比
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # Commit Gas SNR
    ax = axes[0]
    snr_data = {}
    for pt in pair_types:
        if pt in variance_analysis:
            va = variance_analysis[pt]
            between = np.mean(va['between_commit_diff'])
            within = np.sqrt(np.mean(va['within_commit_var']))
            if within > 0:
                snr_data[pt] = between / within

    ax.bar(range(len(snr_data)), list(snr_data.values()),
           color=[colors[pt] for pt in snr_data.keys()])
    ax.set_xticks(range(len(snr_data)))
    ax.set_xticklabels(list(snr_data.keys()), rotation=45, ha='right')
    ax.set_ylabel('Signal-to-Noise Ratio')
    ax.set_title('Commit Gas SNR (higher = easier to distinguish)')
    ax.grid(True, alpha=0.3)
    ax.axhline(y=1.0, color='red', linestyle='--', alpha=0.5, label='SNR=1')
    ax.legend()

    # Access Gas SNR
    ax = axes[1]
    snr_data = {}
    for pt in pair_types:
        if pt in variance_analysis:
            va = variance_analysis[pt]
            between = np.mean(va['between_access_diff'])
            within = np.sqrt(np.mean(va['within_access_var']))
            if within > 0:
                snr_data[pt] = between / within

    ax.bar(range(len(snr_data)), list(snr_data.values()),
           color=[colors[pt] for pt in snr_data.keys()])
    ax.set_xticks(range(len(snr_data)))
    ax.set_xticklabels(list(snr_data.keys()), rotation=45, ha='right')
    ax.set_ylabel('Signal-to-Noise Ratio')
    ax.set_title('Access Gas SNR (higher = easier to distinguish)')
    ax.grid(True, alpha=0.3)
    ax.axhline(y=1.0, color='red', linestyle='--', alpha=0.5, label='SNR=1')
    ax.legend()

    plt.tight_layout()
    plt.savefig(output_path / 'snr_comparison.png', dpi=200)
    plt.close()

    print(f"\n可视化已保存到: {output_path}")

def main():
    data_dir = Path(__file__).parent / "data"
    output_dir = Path(__file__).parent / "results" / "analysis" / "semantic_vs_structural"

    print("加载PI pairs数据...")
    pairs_by_type = load_pi_pairs(data_dir)

    print(f"\n找到的pair类型:")
    for pair_type, pairs in pairs_by_type.items():
        print(f"  {pair_type}: {len(pairs)} pairs")

    # 分析差异
    analysis = analyze_pair_differences(pairs_by_type)

    # 方差分析
    variance_analysis = calculate_gas_variance_within_pairs(pairs_by_type)

    # 可视化
    visualize_comparison(analysis, variance_analysis, output_dir)

    # 保存结果
    report = {
        'summary': {
            pair_type: {
                'num_pairs': len(pairs_by_type[pair_type]),
                'mean_commit_diff': float(np.mean(analysis[pair_type]['commit_gas_diffs'])),
                'mean_access_diff': float(np.mean(analysis[pair_type]['access_gas_diffs'])),
                'mean_structure_diffs': float(np.mean([d['count'] for d in analysis[pair_type]['structure_diffs']])),
                'mean_exec_profile_diffs': float(np.mean(analysis[pair_type]['execution_profile_diffs']))
            }
            for pair_type in ['semantic_equivalent', 'structural_variant']
            if pair_type in analysis
        }
    }

    output_path = Path(output_dir)
    with open(output_path / 'comparison_report.json', 'w') as f:
        json.dump(report, f, indent=2)

    print(f"\n分析报告已保存到: {output_path / 'comparison_report.json'}")

if __name__ == "__main__":
    main()
