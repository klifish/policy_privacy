#!/usr/bin/env python3
"""
深入分析：为什么只用commitGas和accessGas，semantic_equivalent难以区分，而structural_variant容易区分？
"""

import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from collections import defaultdict
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier

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

def extract_gas_data_for_pair(pair):
    """Extract gas data for both policies in a pair"""
    policies = pair.get('policies', [])
    if len(policies) != 2:
        return None

    policy_0_gas = []
    policy_1_gas = []

    for policy_idx, policy in enumerate(policies):
        executions = policy.get('features', [])

        for exec_data in executions:
            feat = exec_data.get('features', {})
            commit_gas = feat.get('commitGasUsed')
            access_gas = feat.get('accessGasUsed')

            if commit_gas is not None and access_gas is not None:
                if policy_idx == 0:
                    policy_0_gas.append((commit_gas, access_gas))
                else:
                    policy_1_gas.append((commit_gas, access_gas))

    return {
        'pair_id': pair.get('pairId'),
        'pair_type': pair.get('pairType'),
        'policy_0': policy_0_gas,
        'policy_1': policy_1_gas,
        'exec_profile_0': policies[0].get('executionProfile', {}),
        'exec_profile_1': policies[1].get('executionProfile', {}),
    }

def analyze_gas_separability(pairs_by_type):
    """分析每种类型pairs的gas可分性"""

    print(f"\n{'='*70}")
    print(f"Gas可分性详细分析")
    print(f"{'='*70}")

    results = {}

    for pair_type in ['semantic_equivalent', 'structural_variant']:
        if pair_type not in pairs_by_type:
            continue

        pairs = pairs_by_type[pair_type]

        print(f"\n\n{'='*70}")
        print(f"{pair_type} ({len(pairs)} pairs)")
        print(f"{'='*70}")

        # 收集所有样本
        all_samples = []
        pair_level_stats = []

        for pair in pairs:
            gas_data = extract_gas_data_for_pair(pair)
            if not gas_data or not gas_data['policy_0'] or not gas_data['policy_1']:
                continue

            # Policy 0的gas值
            for commit, access in gas_data['policy_0']:
                all_samples.append({
                    'pair_id': gas_data['pair_id'],
                    'label': 0,
                    'commit_gas': commit,
                    'access_gas': access,
                })

            # Policy 1的gas值
            for commit, access in gas_data['policy_1']:
                all_samples.append({
                    'pair_id': gas_data['pair_id'],
                    'label': 1,
                    'commit_gas': commit,
                    'access_gas': access,
                })

            # Pair级别的统计
            commit_0 = [c for c, a in gas_data['policy_0']]
            access_0 = [a for c, a in gas_data['policy_0']]
            commit_1 = [c for c, a in gas_data['policy_1']]
            access_1 = [a for c, a in gas_data['policy_1']]

            pair_level_stats.append({
                'pair_id': gas_data['pair_id'],
                'commit_mean_0': np.mean(commit_0),
                'commit_mean_1': np.mean(commit_1),
                'commit_std_0': np.std(commit_0),
                'commit_std_1': np.std(commit_1),
                'access_mean_0': np.mean(access_0),
                'access_mean_1': np.mean(access_1),
                'access_std_0': np.std(access_0),
                'access_std_1': np.std(access_1),
                'commit_diff': abs(np.mean(commit_0) - np.mean(commit_1)),
                'access_diff': abs(np.mean(access_0) - np.mean(access_1)),
                'exec_same': gas_data['exec_profile_0'] == gas_data['exec_profile_1'],
            })

        df = pd.DataFrame(all_samples)
        df_pair_stats = pd.DataFrame(pair_level_stats)

        print(f"\n总样本数: {len(df)}")
        print(f"Pair数: {len(df_pair_stats)}")

        # 1. 查看两个类别的gas分布
        print(f"\n--- Policy 0 (label=0) Gas统计 ---")
        policy_0_df = df[df['label'] == 0]
        print(f"Commit Gas: mean={policy_0_df['commit_gas'].mean():.2f}, std={policy_0_df['commit_gas'].std():.2f}")
        print(f"Access Gas: mean={policy_0_df['access_gas'].mean():.2f}, std={policy_0_df['access_gas'].std():.2f}")

        print(f"\n--- Policy 1 (label=1) Gas统计 ---")
        policy_1_df = df[df['label'] == 1]
        print(f"Commit Gas: mean={policy_1_df['commit_gas'].mean():.2f}, std={policy_1_df['commit_gas'].std():.2f}")
        print(f"Access Gas: mean={policy_1_df['access_gas'].mean():.2f}, std={policy_1_df['access_gas'].std():.2f}")

        # 2. Between-class vs Within-class variance
        # Between-class: 两个label之间的差异
        commit_between = abs(policy_0_df['commit_gas'].mean() - policy_1_df['commit_gas'].mean())
        access_between = abs(policy_0_df['access_gas'].mean() - policy_1_df['access_gas'].mean())

        # Within-class: 同一label内的方差
        commit_within = np.sqrt((policy_0_df['commit_gas'].var() + policy_1_df['commit_gas'].var()) / 2)
        access_within = np.sqrt((policy_0_df['access_gas'].var() + policy_1_df['access_gas'].var()) / 2)

        print(f"\n--- 可分性指标 ---")
        print(f"Commit Gas:")
        print(f"  Between-class差异: {commit_between:.2f}")
        print(f"  Within-class标准差: {commit_within:.2f}")
        print(f"  可分性比率 (between/within): {commit_between/commit_within if commit_within > 0 else 'inf':.4f}")

        print(f"Access Gas:")
        print(f"  Between-class差异: {access_between:.2f}")
        print(f"  Within-class标准差: {access_within:.2f}")
        print(f"  可分性比率 (between/within): {access_between/access_within if access_within > 0 else 'inf':.4f}")

        # 3. Pair级别的分析
        print(f"\n--- Pair级别统计 ---")
        print(f"平均Commit Gas差异: {df_pair_stats['commit_diff'].mean():.2f}")
        print(f"平均Access Gas差异: {df_pair_stats['access_diff'].mean():.2f}")
        print(f"Commit差异中位数: {df_pair_stats['commit_diff'].median():.2f}")
        print(f"Access差异中位数: {df_pair_stats['access_diff'].median():.2f}")

        # 有多少pairs的gas差异明显（>5%）
        pairs_with_commit_diff = (df_pair_stats['commit_diff'] > 0.05 * df_pair_stats['commit_mean_0']).sum()
        pairs_with_access_diff = (df_pair_stats['access_diff'] > 0.05 * df_pair_stats['access_mean_0']).sum()
        print(f"Commit Gas差异>5%的pairs: {pairs_with_commit_diff}/{len(df_pair_stats)} ({100*pairs_with_commit_diff/len(df_pair_stats):.1f}%)")
        print(f"Access Gas差异>5%的pairs: {pairs_with_access_diff}/{len(df_pair_stats)} ({100*pairs_with_access_diff/len(df_pair_stats):.1f}%)")

        # 4. 执行配置相同vs不同的对比
        exec_same_pairs = df_pair_stats[df_pair_stats['exec_same'] == True]
        exec_diff_pairs = df_pair_stats[df_pair_stats['exec_same'] == False]

        print(f"\n--- 执行配置影响分析 ---")
        print(f"执行配置相同的pairs: {len(exec_same_pairs)}/{len(df_pair_stats)}")
        if len(exec_same_pairs) > 0:
            print(f"  这些pairs的平均Commit差异: {exec_same_pairs['commit_diff'].mean():.2f}")
            print(f"  这些pairs的平均Access差异: {exec_same_pairs['access_diff'].mean():.2f}")

        print(f"执行配置不同的pairs: {len(exec_diff_pairs)}/{len(df_pair_stats)}")
        if len(exec_diff_pairs) > 0:
            print(f"  这些pairs的平均Commit差异: {exec_diff_pairs['commit_diff'].mean():.2f}")
            print(f"  这些pairs的平均Access差异: {exec_diff_pairs['access_diff'].mean():.2f}")

        # 5. 检查gas值的聚类情况
        # 如果两个policy的gas值有系统性差异，就容易被ML模型学到
        print(f"\n--- Gas值分布特征 ---")

        # 计算每个unique的(commit, access)组合
        unique_combos_0 = set(zip(policy_0_df['commit_gas'], policy_0_df['access_gas']))
        unique_combos_1 = set(zip(policy_1_df['commit_gas'], policy_1_df['access_gas']))
        overlap = unique_combos_0.intersection(unique_combos_1)

        print(f"Policy 0的unique gas组合数: {len(unique_combos_0)}")
        print(f"Policy 1的unique gas组合数: {len(unique_combos_1)}")
        print(f"重叠的gas组合数: {len(overlap)}")
        print(f"重叠率: {100*len(overlap)/(len(unique_combos_0)+len(unique_combos_1)-len(overlap)):.1f}%")

        # 6. T-test检验
        from scipy.stats import ttest_ind
        commit_ttest = ttest_ind(policy_0_df['commit_gas'], policy_1_df['commit_gas'])
        access_ttest = ttest_ind(policy_0_df['access_gas'], policy_1_df['access_gas'])

        print(f"\n--- 统计显著性检验 (t-test) ---")
        print(f"Commit Gas: t={commit_ttest.statistic:.4f}, p={commit_ttest.pvalue:.6f}")
        print(f"Access Gas: t={access_ttest.statistic:.4f}, p={access_ttest.pvalue:.6f}")
        print(f"Commit Gas显著不同: {'是' if commit_ttest.pvalue < 0.05 else '否'}")
        print(f"Access Gas显著不同: {'是' if access_ttest.pvalue < 0.05 else '否'}")

        results[pair_type] = {
            'df': df,
            'df_pair_stats': df_pair_stats,
            'commit_between': commit_between,
            'access_between': access_between,
            'commit_within': commit_within,
            'access_within': access_within,
        }

    return results

def visualize_gas_distributions(results, output_dir):
    """可视化gas分布"""

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    fig, axes = plt.subplots(2, 2, figsize=(16, 12))

    colors = {'semantic_equivalent': ['#86efac', '#22c55e'],
              'structural_variant': ['#fca5a5', '#ef4444']}

    for idx, pair_type in enumerate(['semantic_equivalent', 'structural_variant']):
        if pair_type not in results:
            continue

        df = results[pair_type]['df']

        # Commit Gas分布
        ax = axes[idx, 0]
        policy_0 = df[df['label'] == 0]['commit_gas']
        policy_1 = df[df['label'] == 1]['commit_gas']

        ax.hist(policy_0, bins=50, alpha=0.6, label='Policy 0', color=colors[pair_type][0], density=True)
        ax.hist(policy_1, bins=50, alpha=0.6, label='Policy 1', color=colors[pair_type][1], density=True)
        ax.set_xlabel('Commit Gas Used')
        ax.set_ylabel('Density')
        ax.set_title(f'{pair_type}\nCommit Gas Distribution')
        ax.legend()
        ax.grid(True, alpha=0.3)

        # 添加均值线
        ax.axvline(policy_0.mean(), color=colors[pair_type][0], linestyle='--', linewidth=2, alpha=0.8)
        ax.axvline(policy_1.mean(), color=colors[pair_type][1], linestyle='--', linewidth=2, alpha=0.8)

        # Access Gas分布
        ax = axes[idx, 1]
        policy_0 = df[df['label'] == 0]['access_gas']
        policy_1 = df[df['label'] == 1]['access_gas']

        ax.hist(policy_0, bins=50, alpha=0.6, label='Policy 0', color=colors[pair_type][0], density=True)
        ax.hist(policy_1, bins=50, alpha=0.6, label='Policy 1', color=colors[pair_type][1], density=True)
        ax.set_xlabel('Access Gas Used')
        ax.set_ylabel('Density')
        ax.set_title(f'{pair_type}\nAccess Gas Distribution')
        ax.legend()
        ax.grid(True, alpha=0.3)

        # 添加均值线
        ax.axvline(policy_0.mean(), color=colors[pair_type][0], linestyle='--', linewidth=2, alpha=0.8)
        ax.axvline(policy_1.mean(), color=colors[pair_type][1], linestyle='--', linewidth=2, alpha=0.8)

    plt.tight_layout()
    plt.savefig(output_path / 'gas_distributions_by_policy.png', dpi=200)
    plt.close()

    # 2D scatter plot
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))

    for idx, pair_type in enumerate(['semantic_equivalent', 'structural_variant']):
        if pair_type not in results:
            continue

        df = results[pair_type]['df']
        ax = axes[idx]

        policy_0 = df[df['label'] == 0]
        policy_1 = df[df['label'] == 1]

        ax.scatter(policy_0['commit_gas'], policy_0['access_gas'],
                  alpha=0.4, s=20, label='Policy 0', color=colors[pair_type][0])
        ax.scatter(policy_1['commit_gas'], policy_1['access_gas'],
                  alpha=0.4, s=20, label='Policy 1', color=colors[pair_type][1])

        ax.set_xlabel('Commit Gas Used')
        ax.set_ylabel('Access Gas Used')
        ax.set_title(f'{pair_type}\n2D Gas Distribution')
        ax.legend()
        ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path / 'gas_2d_scatter.png', dpi=200)
    plt.close()

    print(f"\n可视化已保存到: {output_path}")

def main():
    data_dir = Path(__file__).parent / "data"
    output_dir = Path(__file__).parent / "results" / "analysis" / "gas_separability"

    print("加载PI pairs数据...")
    pairs_by_type = load_pi_pairs(data_dir)

    print(f"\n找到的pair类型:")
    for pair_type, pairs in pairs_by_type.items():
        print(f"  {pair_type}: {len(pairs)} pairs")

    # 分析gas可分性
    results = analyze_gas_separability(pairs_by_type)

    # 可视化
    visualize_gas_distributions(results, output_dir)

    # 保存总结
    summary = {}
    for pair_type in ['semantic_equivalent', 'structural_variant']:
        if pair_type in results:
            summary[pair_type] = {
                'commit_between': float(results[pair_type]['commit_between']),
                'access_between': float(results[pair_type]['access_between']),
                'commit_within': float(results[pair_type]['commit_within']),
                'access_within': float(results[pair_type]['access_within']),
                'commit_separability': float(results[pair_type]['commit_between'] / results[pair_type]['commit_within']) if results[pair_type]['commit_within'] > 0 else None,
                'access_separability': float(results[pair_type]['access_between'] / results[pair_type]['access_within']) if results[pair_type]['access_within'] > 0 else None,
            }

    output_path = Path(output_dir)
    with open(output_path / 'separability_report.json', 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"\n分析报告已保存到: {output_path / 'separability_report.json'}")

if __name__ == "__main__":
    main()
