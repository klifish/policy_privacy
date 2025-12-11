#!/usr/bin/env python3
"""检查and_only中的离群值"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

def extract_gas(feature_bag):
    commit = feature_bag.get('commitGasUsed')
    access = feature_bag.get('accessGasUsed')
    if isinstance(commit, str) and commit.startswith("0x"):
        commit = int(commit, 16)
    if isinstance(access, str) and access.startswith("0x"):
        access = int(access, 16)
    return float(commit), float(access)

# 查找第一个数据集
dataset_dir = DATA_DIR / "artifacts_data testnet 01"
spp_file = dataset_dir / "spp_dataset.json"

with open(spp_file, 'r') as f:
    records = json.load(f)

print("查找and_only中commitGas异常高的样本:")
print("=" * 100)

and_only_samples = []
for i, record in enumerate(records):
    if record.get('logicStructure') == 'and_only':
        commit_gas, access_gas = extract_gas(record.get('features', {}))
        and_only_samples.append({
            'index': i,
            'commitGas': commit_gas,
            'accessGas': access_gas,
            'logic': record.get('semantics', {}).get('logicNormalized', 'N/A'),
            'policyId': record.get('policyId', 'N/A'),
            'nestingDepth': record.get('nestingDepth', 'N/A'),
            'predicateCount': record.get('predicateCount', 'N/A'),
            'setSize': record.get('setSize', 'N/A'),
            'rangeWidth': record.get('rangeWidth', 'N/A'),
        })

# 排序找最高的
and_only_samples.sort(key=lambda x: x['commitGas'], reverse=True)

print("\n前10个最高commitGas的and_only样本:")
for i, sample in enumerate(and_only_samples[:10], 1):
    print(f"\n{i}. commitGas={sample['commitGas']:,.0f}, accessGas={sample['accessGas']:,.0f}")
    print(f"   policyId: {sample['policyId']}")
    print(f"   nestingDepth: {sample['nestingDepth']}, predicateCount: {sample['predicateCount']}")
    print(f"   setSize: {sample['setSize']}, rangeWidth: {sample['rangeWidth']}")
    print(f"   logic: {sample['logic'][:80]}...")

print("\n\n后10个最低commitGas的and_only样本:")
for i, sample in enumerate(and_only_samples[-10:], 1):
    print(f"\n{i}. commitGas={sample['commitGas']:,.0f}, accessGas={sample['accessGas']:,.0f}")
    print(f"   policyId: {sample['policyId']}")
    print(f"   nestingDepth: {sample['nestingDepth']}, predicateCount: {sample['predicateCount']}")
    print(f"   setSize: {sample['setSize']}, rangeWidth: {sample['rangeWidth']}")
    print(f"   logic: {sample['logic'][:80]}...")

# 统计分析
import numpy as np
commit_values = [s['commitGas'] for s in and_only_samples]
print(f"\n\nand_only的commitGas统计:")
print(f"  均值: {np.mean(commit_values):,.0f}")
print(f"  中位数: {np.median(commit_values):,.0f}")
print(f"  标准差: {np.std(commit_values):,.0f}")
print(f"  最小值: {np.min(commit_values):,.0f}")
print(f"  最大值: {np.max(commit_values):,.0f}")
print(f"  25%分位: {np.percentile(commit_values, 25):,.0f}")
print(f"  75%分位: {np.percentile(commit_values, 75):,.0f}")

# 找出318514这个离群值
outliers = [s for s in and_only_samples if s['commitGas'] > 310000]
print(f"\n\ncommitGas > 310,000的离群样本 (共{len(outliers)}个):")
for sample in outliers:
    print(f"  commitGas={sample['commitGas']:,.0f}, policyId={sample['policyId']}")
    print(f"    nestingDepth={sample['nestingDepth']}, predicateCount={sample['predicateCount']}")
    print(f"    setSize={sample['setSize']}, rangeWidth={sample['rangeWidth']}")
    print(f"    logic={sample['logic']}")
