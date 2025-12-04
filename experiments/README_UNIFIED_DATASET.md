# 统一数据集验证 - 快速开始

## 概述

这个工具帮助你在执行昂贵的链上操作之前，验证生成的数据集是否满足所有三个实验（PCH、SPP、PI）的需求。

## 快速开始

### 1. 运行验证

```bash
cd experiments
node unified_dataset_validator.js
```

### 2. 查看结果

脚本会输出：
- ✅ 或 ❌ 表示每个实验的验证状态
- 详细的分布统计
- 具体的问题说明（如果有）

### 3. 如果验证失败

#### 选项A: 调整配置后重试

```bash
# 复制示例配置
cp unified_dataset_config.example.json my_config.json

# 编辑配置（例如增加策略数量）
vim my_config.json

# 使用自定义配置重新验证
node unified_dataset_validator.js --config=my_config.json
```

#### 选项B: 接受当前数据集

如果只有少数指标略低于阈值，你可以：
1. 降低验证阈值（编辑`my_config.json`中的`validation`部分）
2. 或者接受轻微的不平衡

### 4. 一次性执行链上并生成共享数据

```bash
npx hardhat run experiments/run_unified_dataset.js --network <network> \
  --config=experiments/unified_dataset_config_optimized.json \
  --artifact-dir=experiments/unified_dataset_artifacts
```

该脚本会：
- 调用`unified_dataset_validator.js`生成并验证策略
- 自动对数据集打SPP标注，保存到`experiments/unified_dataset_artifacts/`
- 部署`PolicyPrivacy` + Verifier合约并执行全部策略一次
- 输出`executed_dataset.json / pch_dataset.json / spp_dataset.json / pi_dataset.json`

### 5. 使用共享数据运行三个实验

统一的链上结果准备好后，三个实验只需从**第2阶段**开始：

```bash
# PCH（特征提取 + 攻击 + 报告）
node experiments/policy_content_hiding/run_experiment.js --use-unified-dataset --phase 2

# SPP（攻击 + 报告，自动使用spp_dataset.json）
node experiments/structure_and_parameter_privacy/run_experiment.js --use-unified-dataset --phase 2

# PI（配对 + 攻击 + 报告）
node experiments/policy_indistinguishability/run_experiment.js --use-unified-dataset --phase 2
```

> `--use-unified-dataset` 会自动定位 `experiments/unified_dataset_artifacts/` 下的共享文件，
> 并将`startPhase`默认切换为2，确保不会重复生成/上链。

## 文件说明

| 文件 | 说明 |
|------|------|
| `unified_dataset_validator.js` | 主验证脚本 |
| `unified_dataset_config.example.json` | 配置示例 |
| `run_unified_dataset.js` | 验证 + 链上执行一体化脚本（生成共享数据） |
| `UNIFIED_DATASET_WORKFLOW.md` | 详细工作流程文档 |
| `test_validator.js` | 快速测试脚本 |
| `validation_results.json` | 验证结果输出（自动生成） |
| `unified_dataset_artifacts/` | 共享数据输出目录（policy、executed、pch/spp/pi切片） |

## 常见问题

### Q: 验证需要多长时间？
A: 2-5秒（不涉及链上操作）

### Q: 验证会消耗Gas吗？
A: 不会！验证阶段只生成策略定义，不执行链上操作

### Q: 如果一直无法通过验证怎么办？
A: 可能需要：
1. 增加`policyCount`（例如从200增加到300）
2. 调整语义层配置以增加多样性
3. 降低验证阈值（如果你可以接受略微不平衡的数据集）

### Q: 三个实验必须用完全相同的配置吗？
A: 是的，特别是`seed`参数必须相同，这样才能生成完全相同的策略定义

### Q: 可以先验证，然后分别执行三个实验吗？
A: 可以！只要使用相同的`seed`和配置参数即可

## 技术细节

### 验证的三个维度

1. **PCH验证**
   - 检查DUO术语分布
   - 确保每个术语有足够的样本
   - 计算平衡度（Min/Max比率）

2. **SPP验证**
   - 检查5个维度的分类平衡
   - 逻辑结构、嵌套深度、谓词数量、集合大小、范围宽度
   - 使用变异系数(CV)评估一致性

3. **PI验证**
   - 评估语义多样性
   - 估算配对类型分布
   - 确保有足够的不同类型策略对

### 默认配置

```json
{
  "policyCount": 200,
  "executionsPerPolicy": 5,
  "satisfyRatio": 0.5,
  "seed": "unified-validation-2024"
}
```

### 默认阈值

```json
{
  "validation": {
    "pch": {
      "minPoliciesPerDUO": 20,
      "minMaxRatio": 0.4
    },
    "spp": {
      "minPoliciesPerCategory": 15,
      "minMaxRatio": 0.3,
      "maxCV": 0.6
    },
    "pi": {
      "minPairsPerType": 30,
      "minSemanticDiversity": 0.6
    }
  }
}
```

## 示例输出

### 成功的验证

```
╔══════════════════════════════════════════════════════════════╗
║           UNIFIED DATASET VALIDATOR                         ║
╚══════════════════════════════════════════════════════════════╝

📋 Configuration:
  Policy count:              200
  Executions per policy:     5

================================================================================
PCH (Policy Content Hiding) Validation
================================================================================

📊 DUO Term Distribution:
  GR   :   35 (17.5%)
  DS   :   42 (21.0%)
  ...

✅ PCH Requirements: PASSED

================================================================================
SPP (Structure & Parameter Privacy) Validation
================================================================================

📊 5-Dimension Distributions:
  Logic Structure:
    and_only: 58 (29.0%)
    ...

✅ SPP Requirements: PASSED

================================================================================
PI (Policy Indistinguishability) Validation
================================================================================

📊 Semantic Diversity: 0.658

✅ PI Requirements: PASSED

════════════════════════════════════════════════════════════════
VALIDATION SUMMARY
════════════════════════════════════════════════════════════════

✅ ALL VALIDATIONS PASSED
✅ Dataset is ready for blockchain execution!
```

### 失败的验证（需要调整）

```
❌ SPP Requirements: FAILED
  ⚠️  Logic Structure: min/max ratio 0.037 < 0.3
  ⚠️  Nesting Depth: CV 0.729 > 0.6

Recommendations:
  1. Increase policyCount from 20 to 200
  2. Adjust semantic layers to add more complex policies
  3. Re-run validation
```

## 下一步

1. ✅ 验证通过 → 查看 [UNIFIED_DATASET_WORKFLOW.md](UNIFIED_DATASET_WORKFLOW.md) 了解如何执行链上操作
2. ❌ 验证失败 → 调整配置并重试
3. 📖 详细说明 → 查看 [UNIFIED_DATASET_WORKFLOW.md](UNIFIED_DATASET_WORKFLOW.md)

## 支持

如有问题，请查看：
- 详细工作流程：[UNIFIED_DATASET_WORKFLOW.md](UNIFIED_DATASET_WORKFLOW.md)
- 配置示例：`unified_dataset_config.example.json`
- 测试脚本：`test_validator.js`
