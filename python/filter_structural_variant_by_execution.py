#!/usr/bin/env python3
"""
方案2: 后处理 - 只保留执行配置相同的structural_variant pairs
然后重新运行实验
"""

import json
from pathlib import Path
from collections import defaultdict

def filter_pairs_by_execution_profile(pairs):
    """只保留执行配置相同的pairs"""
    filtered = []

    for pair in pairs:
        policies = pair.get('policies', [])
        if len(policies) != 2:
            continue

        exec_0 = policies[0].get('executionProfile', {})
        exec_1 = policies[1].get('executionProfile', {})

        # 只保留执行配置完全相同的
        if exec_0 == exec_1:
            filtered.append(pair)

    return filtered

def main():
    data_dir = Path(__file__).parent / "data"

    for subdir in data_dir.iterdir():
        if not subdir.is_dir():
            continue

        pi_file = subdir / "pi_pairs.json"
        if not pi_file.exists():
            continue

        print(f"\n处理: {subdir.name}")

        with open(pi_file, 'r') as f:
            data = json.load(f)

        if isinstance(data, dict) and 'pairs' in data:
            pairs = data['pairs']
        else:
            pairs = data

        # 分组
        by_type = defaultdict(list)
        for pair in pairs:
            by_type[pair.get('pairType')].append(pair)

        # 只过滤structural_variant
        original_count = len(by_type['structural_variant'])
        by_type['structural_variant'] = filter_pairs_by_execution_profile(
            by_type['structural_variant']
        )
        filtered_count = len(by_type['structural_variant'])

        print(f"  Structural variant: {original_count} → {filtered_count} pairs")
        print(f"  保留率: {100*filtered_count/original_count:.1f}%")

        # 重新组合
        all_pairs = []
        for pair_type, type_pairs in by_type.items():
            all_pairs.extend(type_pairs)

        # 保存到新文件
        output_file = subdir / "pi_pairs_filtered.json"
        with open(output_file, 'w') as f:
            json.dump({'pairs': all_pairs}, f, indent=2)

        print(f"  已保存到: {output_file}")

if __name__ == "__main__":
    main()
