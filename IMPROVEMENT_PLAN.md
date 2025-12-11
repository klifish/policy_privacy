# Structural Variant 实验改进方案

## 问题诊断

当前 `structural_variant` 的PI实验结果不理想（RF AUC=0.622，容易被攻击），而 `semantic_equivalent` 结果很好（RF AUC=0.471，难以攻击）。

**根本原因**：`structural_variant` 的配置要求 `executionMustDiffer: true`，导致同一pair内的两个policies使用不同的执行配置，从而产生可被机器学习模型学习的模式。

## 改进方案（按优先级排序）

### 🥇 方案1：修改Pair生成配置（最推荐）

**目标**：让structural_variant只关注结构差异，而不是执行配置差异

**具体步骤**：

1. 修改 `experiments/policy_indistinguishability/pi_data_generator.js` 第38行：

   ```javascript
   // 之前（错误）：
   structural_variant: {
     similarity: 0.999,
     structureMustDiffer: true,
     executionMustDiffer: true  // ❌ 这是问题所在
   },

   // 之后（正确）：
   structural_variant: {
     similarity: 0.999,
     structureMustDiffer: true,
     executionMustDiffer: false  // ✅ 只要求结构不同
   },
   ```

2. 重新生成PI pairs：

   ```bash
   # 删除现有的pi_pairs.json
   rm python/data/*/pi_pairs.json

   # 重新运行实验
   npm run experiment:policy:unified
   ```

3. 验证改进效果：

   ```bash
   python python/run_policy_privacy_experiments.py
   ```

**预期结果**：
- Structural variant的RF AUC应该降到 ~0.47-0.50（接近semantic_equivalent）
- 执行配置相同 → gas模式统一 → 难以区分

**优点**：
- ✅ 从源头解决问题
- ✅ 符合"structural variant"的语义（只改变结构）
- ✅ 一劳永逸

**缺点**：
- ⚠️ 需要修改代码
- ⚠️ 需要重新生成所有数据

---

### 🥈 方案2：后处理过滤（不修改原始代码）

**目标**：只使用执行配置相同的structural_variant pairs

**具体步骤**：

1. 运行过滤脚本：

   ```bash
   python python/filter_structural_variant_by_execution.py
   ```

   这会生成 `pi_pairs_filtered.json`，只包含执行配置相同的pairs。

2. 修改 `run_policy_privacy_experiments.py`，使用过滤后的文件：

   ```python
   # 在aggregate_pi_pairs函数中
   file_path = directory / "pi_pairs_filtered.json"  # 使用过滤后的文件
   ```

3. 重新运行实验：

   ```bash
   python python/run_policy_privacy_experiments.py --pi-pairs python/data/pi_pairs_filtered.json
   ```

**预期结果**：
- 过滤后可能只剩下很少的structural_variant pairs（因为当前生成逻辑要求executionMustDiffer）
- 但这些pairs的结果应该会好得多

**优点**：
- ✅ 不需要修改原始代码
- ✅ 可以快速验证假设

**缺点**：
- ⚠️ 可能过滤掉太多pairs，样本量不足
- ⚠️ 不是长期解决方案

---

### 🥉 方案3：增加执行次数（辅助方案）

**目标**：减少单次执行的随机变异，获得更稳定的gas统计

**具体步骤**：

1. 检查当前执行次数：

   ```bash
   python python/analyze_execution_count_impact.py
   ```

2. 如果平均执行次数 < 5，修改实验配置增加执行次数：

   ```javascript
   // 在policy生成配置中
   executionsPerPolicy: 10  // 增加到10次
   ```

3. 重新生成数据并运行实验

**预期效果**：
- 减少gas值的方差
- 更稳定的平均值
- 但**不能解决执行配置不同导致的系统性偏差**

**优点**：
- ✅ 提高数据质量
- ✅ 对所有实验都有帮助

**缺点**：
- ⚠️ 需要重新生成数据
- ⚠️ 增加计算成本
- ⚠️ 不能单独解决structural_variant的问题

---

## 组合方案（最佳实践）

**推荐同时实施方案1 + 方案3**：

1. 首先修改配置，让structural_variant不要求executionMustDiffer
2. 增加执行次数到5-10次（如果当前 < 5）
3. 重新生成数据
4. 运行实验验证

## 验证检查清单

改进后，应该验证以下指标：

### ✅ 执行配置统一性
```python
# 在分析中确认
print(f"执行配置相同的pairs: 应该是100%")
```

### ✅ Gas可分性
```python
# Between-class vs Within-class ratio 应该很低
print(f"Commit SNR: 应该 < 0.05")
print(f"Access SNR: 应该 < 0.05")
```

### ✅ 系统性偏差
```python
# Policy 0 vs Policy 1 的相对关系应该平衡
print(f"系统性偏差: 应该 < 0.10")
```

### ✅ 攻击准确率
```python
# RF准确率应该接近50%（随机猜测）
print(f"RF Accuracy: 应该在45-55%之间")
print(f"RF AUC: 应该在0.45-0.55之间")
```

## 额外改进建议

### 1. 标准化执行策略配置

考虑创建预定义的执行策略"profiles"：

```javascript
const EXECUTION_PROFILES = {
  STANDARD: {
    path_unify: true,
    gas_pad: true,
    event_pad: true,
    proof_pad: false,
    batch_pattern: 'baseline'
  },
  EFFICIENT: {
    path_unify: false,
    gas_pad: true,
    event_pad: false,
    proof_pad: false,
    batch_pattern: 'batched'
  }
};
```

然后在生成structural_variant时，确保同一pair使用相同的profile。

### 2. 添加执行配置的单元测试

```javascript
describe('PI Pair Generation', () => {
  it('structural_variant pairs should have same execution profile', () => {
    const pairs = generatePairs(dataset, 'structural_variant');

    pairs.forEach(pair => {
      const [policy0, policy1] = pair.policies;
      expect(policy0.executionProfile).toEqual(policy1.executionProfile);
    });
  });
});
```

### 3. 分析报告中添加执行配置统计

在 `run_policy_privacy_experiments.py` 中添加：

```python
def analyze_execution_profile_consistency(pairs):
    """检查pairs的执行配置一致性"""
    same_exec = 0
    diff_exec = 0

    for pair in pairs:
        policies = pair.get('policies', [])
        if len(policies) == 2:
            if policies[0]['executionProfile'] == policies[1]['executionProfile']:
                same_exec += 1
            else:
                diff_exec += 1

    return {
        'same_execution_profile': same_exec,
        'different_execution_profile': diff_exec,
        'consistency_rate': same_exec / (same_exec + diff_exec)
    }
```

## 预期改进效果

| 指标 | 改进前 | 改进后（预期） |
|------|--------|---------------|
| RF Accuracy | 59.2% | ~47-50% |
| RF AUC | 0.622 | ~0.47-0.50 |
| 执行配置一致性 | 0% | 100% |
| 系统性偏差 | 0.130 | <0.10 |
| Commit SNR | 0.0377 | <0.03 |
| Access SNR | 0.0107 | <0.01 |

## 实施时间线

1. **短期（1-2天）**：
   - 实施方案2（过滤），快速验证假设
   - 分析过滤后的结果

2. **中期（3-5天）**：
   - 实施方案1（修改配置）
   - 重新生成数据
   - 完整实验验证

3. **长期（1-2周）**：
   - 实施方案3（增加执行次数）
   - 添加单元测试
   - 更新文档

## 总结

**核心问题**：structural_variant不应该要求executionMustDiffer

**核心解决方案**：修改配置 `executionMustDiffer: true → false`

**为什么有效**：
1. 执行配置统一 → gas消耗模式统一
2. 消除系统性偏差
3. 结构差异被gas padding等机制隐藏
4. RF无法学习到可区分的模式

**关键教训**：
> 在隐私保护系统中，"indistinguishable"不仅要求语义相同和结构不同，还要求**执行路径和策略统一**。即使gas padding等技术可以隐藏结构差异，但如果执行策略不同，仍会产生微妙的、可被ML模型学习的模式。
