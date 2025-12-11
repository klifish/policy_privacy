#!/usr/bin/env python3
"""
方案3: 分析当前每个policy有多少次执行，以及增加执行次数是否有帮助
"""

import json
from pathlib import Path
from collections import Counter
import numpy as np

def analyze_execution_counts(data_dir):
    """分析执行次数分布"""

    data_path = Path(data_dir)

    for subdir in data_path.iterdir():
        if not subdir.is_dir():
            continue

        pi_file = subdir / "pi_pairs.json"
        if not pi_file.exists():
            continue

        print(f"\n{'='*60}")
        print(f"分析: {subdir.name}")
        print(f"{'='*60}")

        with open(pi_file, 'r') as f:
            data = json.load(f)

        if isinstance(data, dict) and 'pairs' in data:
            pairs = data['pairs']
        else:
            pairs = data

        by_type = {'semantic_equivalent': [], 'structural_variant': []}

        for pair in pairs:
            pair_type = pair.get('pairType')
            if pair_type not in by_type:
                continue

            policies = pair.get('policies', [])
            if len(policies) != 2:
                continue

            # 统计每个policy的执行次数
            exec_counts = []
            for policy in policies:
                features = policy.get('features', [])
                exec_counts.append(len(features))

            by_type[pair_type].append(exec_counts)

        for pair_type, exec_data in by_type.items():
            if not exec_data:
                continue

            print(f"\n--- {pair_type} ---")

            all_counts = [count for pair in exec_data for count in pair]
            print(f"执行次数统计:")
            print(f"  总样本数: {len(all_counts)}")
            print(f"  平均: {np.mean(all_counts):.2f}")
            print(f"  中位数: {np.median(all_counts):.0f}")
            print(f"  最小: {np.min(all_counts)}")
            print(f"  最大: {np.max(all_counts)}")

            # 每个policy的gas方差分析
            # 更多执行次数 → 更小的方差 → 更稳定的平均值
            print(f"\n建议:")
            avg = np.mean(all_counts)
            if avg < 5:
                print(f"  ⚠️  当前平均执行次数较少 ({avg:.1f}次)")
                print(f"  建议增加到至少5-10次，以获得更稳定的gas统计")
            else:
                print(f"  ✓ 当前执行次数足够 ({avg:.1f}次)")

def main():
    data_dir = Path(__file__).parent / "data"
    analyze_execution_counts(data_dir)

    print(f"\n{'='*60}")
    print("总结")
    print(f"{'='*60}")
    print("\n增加执行次数的好处:")
    print("1. 减少单次执行的随机变异影响")
    print("2. 获得更稳定的平均gas值")
    print("3. 减少outliers的影响")
    print("\n但注意:")
    print("- 如果执行配置不同导致的系统性偏差，增加次数也无法解决")
    print("- 仍然需要首先统一执行配置")

if __name__ == "__main__":
    main()
