#!/usr/bin/env python3
"""
分析各个数据集对SPP logicStructure差异的贡献
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path
from collections import Counter

DATA_DIR = Path(__file__).parent / "data"
FEATURE_KEYS = ("commitGasUsed", "accessGasUsed")

def extract_feature_row(feature_bag):
    """提取特征"""
    row = {}
    for key in FEATURE_KEYS:
        value = feature_bag.get(key)
        if value is None:
            return None
        if isinstance(value, str) and value.startswith("0x"):
            value = int(value, 16)
        else:
            value = float(value)
        row[key] = value
    return row

def analyze_dataset_dir(dataset_dir):
    """分析单个数据集目录"""
    spp_file = dataset_dir / "spp_dataset.json"
    if not spp_file.exists():
        return None

    with open(spp_file, 'r') as f:
        records = json.load(f)

    # 按logicStructure分组
    by_structure = {
        'and_only': [],
        'and_or_mixed': [],
        'negation_heavy': []
    }

    for record in records:
        logic_structure = record.get('logicStructure')
        if logic_structure not in by_structure:
            continue

        features = extract_feature_row(record.get('features', {}))
        if features is None:
            continue

        by_structure[logic_structure].append({
            'commitGasUsed': features['commitGasUsed'],
            'accessGasUsed': features['accessGasUsed']
        })

    # 计算统计
    stats = {}
    for structure, samples in by_structure.items():
        if not samples:
            continue

        df = pd.DataFrame(samples)
        stats[structure] = {
            'count': len(samples),
            'commitGas_mean': df['commitGasUsed'].mean(),
            'commitGas_std': df['commitGasUsed'].std(),
            'commitGas_min': df['commitGasUsed'].min(),
            'commitGas_max': df['commitGasUsed'].max(),
            'accessGas_mean': df['accessGasUsed'].mean(),
            'accessGas_std': df['accessGasUsed'].std(),
        }

    return {
        'dataset_name': dataset_dir.name,
        'total_samples': len(records),
        'by_structure': stats
    }

def main():
    # 查找所有数据集目录
    dataset_dirs = []
    if DATA_DIR.exists():
        for entry in sorted(DATA_DIR.iterdir()):
            if entry.is_dir() and (entry / "spp_dataset.json").exists():
                dataset_dirs.append(entry)

    if not dataset_dirs:
        print("[error] No dataset directories found")
        return

    print("=" * 100)
    print("分析各数据集对SPP logicStructure的贡献")
    print("=" * 100)
    print()

    all_results = []

    for dataset_dir in dataset_dirs:
        result = analyze_dataset_dir(dataset_dir)
        if result:
            all_results.append(result)

    # 打印每个数据集的统计
    for result in all_results:
        print(f"\n数据集: {result['dataset_name']}")
        print(f"总样本数: {result['total_samples']}")
        print("-" * 100)

        for structure in ['and_only', 'and_or_mixed', 'negation_heavy']:
            if structure not in result['by_structure']:
                print(f"  {structure}: 无数据")
                continue

            stats = result['by_structure'][structure]
            print(f"  {structure} (n={stats['count']}):")
            print(f"    commitGas: mean={stats['commitGas_mean']:>10,.0f}  "
                  f"std={stats['commitGas_std']:>8,.0f}  "
                  f"range=[{stats['commitGas_min']:,.0f}, {stats['commitGas_max']:,.0f}]")
            print(f"    accessGas: mean={stats['accessGas_mean']:>10,.0f}  "
                  f"std={stats['accessGas_std']:>8,.0f}")

    # 计算整体统计（跨数据集）
    print("\n" + "=" * 100)
    print("跨数据集整体统计")
    print("=" * 100)

    # 合并所有数据集
    combined_by_structure = {
        'and_only': {'commitGas': [], 'accessGas': []},
        'and_or_mixed': {'commitGas': [], 'accessGas': []},
        'negation_heavy': {'commitGas': [], 'accessGas': []}
    }

    for result in all_results:
        for structure in ['and_only', 'and_or_mixed', 'negation_heavy']:
            if structure not in result['by_structure']:
                continue
            stats = result['by_structure'][structure]
            # 注意：这里我们只有统计值，没有原始数据，所以近似计算
            # 实际应该重新读取原始数据

    # 重新读取所有原始数据进行整体统计
    print("\n重新计算整体统计（从原始数据）:")
    all_samples_by_structure = {
        'and_only': [],
        'and_or_mixed': [],
        'negation_heavy': []
    }

    for dataset_dir in dataset_dirs:
        spp_file = dataset_dir / "spp_dataset.json"
        with open(spp_file, 'r') as f:
            records = json.load(f)

        for record in records:
            logic_structure = record.get('logicStructure')
            if logic_structure not in all_samples_by_structure:
                continue

            features = extract_feature_row(record.get('features', {}))
            if features is None:
                continue

            all_samples_by_structure[logic_structure].append({
                'commitGasUsed': features['commitGasUsed'],
                'accessGasUsed': features['accessGasUsed'],
                'dataset': dataset_dir.name
            })

    for structure in ['and_only', 'and_or_mixed', 'negation_heavy']:
        samples = all_samples_by_structure[structure]
        if not samples:
            print(f"\n{structure}: 无数据")
            continue

        df = pd.DataFrame(samples)
        print(f"\n{structure} (总计 n={len(samples)}):")
        print(f"  commitGas: mean={df['commitGasUsed'].mean():>10,.0f}  "
              f"std={df['commitGasUsed'].std():>8,.0f}  "
              f"range=[{df['commitGasUsed'].min():,.0f}, {df['commitGasUsed'].max():,.0f}]")
        print(f"  accessGas: mean={df['accessGasUsed'].mean():>10,.0f}  "
              f"std={df['accessGasUsed'].std():>8,.0f}")

        # 按数据集统计
        dataset_counts = Counter(df['dataset'])
        print(f"  数据集分布: {dict(dataset_counts)}")

    # 分析类间差异
    print("\n" + "=" * 100)
    print("类间差异分析")
    print("=" * 100)

    means = {}
    for structure in ['and_only', 'and_or_mixed', 'negation_heavy']:
        samples = all_samples_by_structure[structure]
        if samples:
            df = pd.DataFrame(samples)
            means[structure] = {
                'commitGas': df['commitGasUsed'].mean(),
                'accessGas': df['accessGasUsed'].mean()
            }

    print("\ncommitGas类间距离:")
    structures = ['and_only', 'and_or_mixed', 'negation_heavy']
    for i, s1 in enumerate(structures):
        for s2 in structures[i+1:]:
            if s1 in means and s2 in means:
                diff = abs(means[s1]['commitGas'] - means[s2]['commitGas'])
                print(f"  {s1} <-> {s2}: {diff:,.0f} gas")

    # 分析方差差异来源
    print("\n" + "=" * 100)
    print("方差差异来源分析")
    print("=" * 100)

    for structure in ['and_only', 'and_or_mixed', 'negation_heavy']:
        samples = all_samples_by_structure[structure]
        if not samples:
            continue

        df = pd.DataFrame(samples)
        print(f"\n{structure}:")

        # 按数据集分组计算方差
        by_dataset = df.groupby('dataset')['commitGasUsed']
        print("  各数据集内的commitGas统计:")
        for dataset_name, group_values in by_dataset:
            print(f"    {dataset_name}: n={len(group_values)}, "
                  f"mean={group_values.mean():,.0f}, std={group_values.std():,.0f}")

        # 计算组间和组内方差
        overall_var = df['commitGasUsed'].var()
        within_var = by_dataset.var().mean()
        between_var = overall_var - within_var

        print(f"  总方差: {overall_var:,.0f}")
        print(f"  组内方差(平均): {within_var:,.0f}")
        print(f"  组间方差: {between_var:,.0f}")
        print(f"  组间方差占比: {between_var/overall_var*100:.1f}%")

if __name__ == "__main__":
    main()
