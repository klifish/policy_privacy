# Policy Content Hiding - 改进建议

> ⚠️ **ARCHIVED — superseded.** This document describes the pre-multiseed, single-split
> PASS/FAIL design (a single AUC≤0.55-and-Advantage≤5% threshold check). The current
> authoritative privacy verdict is a 30-seed policy-disjoint double criterion
> (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`), implemented in
> `experiments/core/multiseed_criterion.js`. Some file/API references below (e.g.
> `evaluator.js`, `classifiers.js`, `mock_demo.js`) no longer exist as standalone files.
> Kept for historical context only — do not use as a spec of current behavior.

## 当前实验结果总结

### 🎯 实验指标
- **Accuracy**: 60-68% (目标: ~50%)
- **AUC**: 0.78-0.85 (目标: ≤0.55)
- **Advantage**: 10-18% (目标: ≤5%)
- **结论**: ❌ 未通过隐私阈值检查

### 🔍 诊断结果

通过 `diagnose_gas_padding.js` 分析发现：

1. ✅ **Gas 差异很小**: 只有 0.04% (commit) 和 0.03% (access)
2. ✅ **其他特征完美**: calldata, proof size, logs 都完全相同
3. ❌ **数据集太小**: 200个样本，测试集只有60个
4. ❌ **小的一致性差异** 仍然可以被 ML 模型学习

### 💡 关键发现

**问题不在于 gas 差异大，而在于：**
- 差异虽小但**一致**（每个 DUO term 都有固定的 gas 消耗模式）
- 数据集太小，使得小差异也能被学习
- ML 模型可以记忆这些模式

---

## 🚀 改进方案

### 方案 A: 增加数据规模 + 多样性 ⭐ **最简单**

**理由**: 更大的数据集可以稀释小差异的影响

**实施步骤**:

```bash
# 1. 运行更大规模的实验
node experiments/policy_content_hiding/run_experiment.js \
  --policy-count 1000 \
  --executions-per-policy 5 \
  --num-duo-terms 3 \
  --output experiments/policy_content_hiding/results/large_scale

# 2. 运行诊断
node experiments/policy_content_hiding/diagnose_gas_padding.js \
  experiments/policy_content_hiding/results/large_scale/features.json
```

**预期效果**:
- 测试集增加到 1500 个样本（300个测试）
- 更真实的统计显著性
- 小差异被噪声淹没

**成本**: 需要更多的 gas（在本地 hardhat 上测试是免费的）

---

### 方案 B: 添加 Gas 随机噪声 ⭐ **最有效**

**理由**: 打破 gas 消耗的一致性模式

**实施方法 1**: 修改智能合约（推荐）

在 `PolicyPrivacy.sol` 的 `_padGasToTarget()` 函数中添加随机性：

```solidity
function _padGasToTarget(uint256 startGas, uint256 targetGas) internal {
    if (targetGas == 0) {
        return;
    }

    // Add random noise (±1-2% of target)
    uint256 noise = uint256(keccak256(abi.encodePacked(
        block.timestamp,
        block.prevrandao,  // Ethereum PoS randomness
        msg.sender,
        gasleft()
    ))) % (targetGas / 50);  // ±2% random noise

    uint256 adjustedTarget = targetGas + noise - (targetGas / 100);

    // ... rest of padding logic with adjustedTarget
}
```

**实施方法 2**: 修改实验生成器（更简单）

在 `data_generator.js` 中，为每个交易添加随机的 target:

```javascript
const GAS_PAD_TARGET_GAS = Object.freeze({
  commit: 500000n,
  access: 1000000n
});

// 在 executePolicy 函数中
function addRandomNoise(baseTarget) {
  const noise = Math.floor(Math.random() * Number(baseTarget) * 0.04) - Number(baseTarget) * 0.02;
  return BigInt(Number(baseTarget) + noise);  // ±2% random
}

const commitPadTarget = addRandomNoise(GAS_PAD_TARGET_GAS.commit);
const accessPadTarget = addRandomNoise(GAS_PAD_TARGET_GAS.access);
```

**预期效果**:
- 打破 gas 消耗的一致性
- 即使平均值不同，随机性使得单个观测无法区分
- AUC 应该降至 0.52-0.55

---

### 方案 C: 调整 Gas Padding 目标 ⚠️ **治标不治本**

基于诊断建议，调整目标：

```javascript
// 在 data_generator.js 中
const GAS_PAD_TARGET_GAS = Object.freeze({
  commit: 485000n,  // 从 500000n 降低
  access: 973000n   // 从 1000000n 降低
});
```

**问题**: 这只能让所有 policy 都达到相同的目标，但无法消除到达目标之前的差异。

---

### 方案 D: 增加 ICD-10 Chapter 多样性

**当前问题**: 所有 ICD-10 values 都在同一个 chapter (6-7)

**解决方案**: 修改数据生成器，确保使用所有 10 个 ICD-10 chapters:

```javascript
// 在 generateDataset 中
const icdChapters = Object.values(ICD10_CHAPTERS); // 使用所有 10 个
const icdValue = icdChapters[Math.floor(Math.random() * icdChapters.length)];
```

**预期效果**: multi-class 分类任务更有意义

---

## 📋 推荐实施顺序

### Phase 1: 快速验证（本地测试）
1. ✅ **方案 B（方法 2）** - 添加随机噪声到实验生成器
2. ✅ **方案 A** - 在本地 hardhat 上运行大规模实验 (1000 policies × 5 executions)
3. ✅ **方案 D** - 增加 ICD-10 多样性

**时间**: 2-3 小时
**成本**: 免费（本地测试）

### Phase 2: 合约改进（如果 Phase 1 不够）
1. **方案 B（方法 1）** - 在合约中添加随机 gas padding
2. 重新部署和测试

**时间**: 半天
**成本**: 测试网 gas

### Phase 3: 长期改进
1. 实现更复杂的 padding 策略
2. 添加 differential privacy 机制
3. 考虑 proof size padding

---

## 🎯 成功标准

实验通过的标准：
- ✅ AUC ≤ 0.55
- ✅ Advantage ≤ 5%
- ✅ Accuracy 接近 random baseline (50% for binary)
- ✅ 所有 DUO term 的 gas 消耗无法区分

---

## 🛠️ 立即可执行的命令

### 1. 快速本地测试（推荐先做这个）

```bash
# 启动本地 hardhat 节点
npx hardhat node &

# 等待节点启动
sleep 5

# 运行改进的实验
node experiments/policy_content_hiding/run_experiment.js \
  --policy-count 500 \
  --executions-per-policy 3 \
  --num-duo-terms 3 \
  --output experiments/policy_content_hiding/results/improved_$(date +%s)

# 运行诊断
node experiments/policy_content_hiding/diagnose_gas_padding.js \
  experiments/policy_content_hiding/results/improved_*/features.json
```

### 2. 如果需要添加随机噪声

修改 `data_generator.js` line 1413-1456，添加:

```javascript
// 在 executePolicy 函数开头添加
function addGasNoise(baseTarget, noisePercent = 0.02) {
  const baseNum = Number(baseTarget);
  const maxNoise = Math.floor(baseNum * noisePercent);
  const noise = Math.floor(Math.random() * (2 * maxNoise + 1)) - maxNoise;
  return BigInt(baseNum + noise);
}

// 然后在调用时使用
const commitPadTarget = gasPadEnabled ? addGasNoise(GAS_PAD_TARGET_GAS.commit) : 0n;
const accessPadTarget = gasPadEnabled ? addGasNoise(GAS_PAD_TARGET_GAS.access) : 0n;
```

---

## 📊 预期结果

完成上述改进后，预期实验结果：

| 指标 | 当前 | 目标 | 改进后预期 |
|------|------|------|-----------|
| DUO Term 0 Accuracy | 60% | 50% | 52-53% |
| DUO Term 1 Accuracy | 68% | 50% | 51-54% |
| DUO Term 2 Accuracy | 68% | 50% | 51-54% |
| AUC (average) | 0.82 | ≤0.55 | 0.52-0.54 |
| Advantage (average) | 14% | ≤5% | 2-4% |
| **Overall** | **FAIL** | **PASS** | **PASS** ✅ |

---

## 📚 相关文件

- 诊断工具: `experiments/policy_content_hiding/diagnose_gas_padding.js`
- 主实验: `experiments/policy_content_hiding/run_experiment.js`
- 数据生成器: `experiments/policy_content_hiding/data_generator.js`
- 合约: `contracts/PolicyPrivacy.sol`
- Gas padding 文档: `docs/GAS_PADDING_IMPROVEMENTS.md`

---

## ❓ 需要帮助？

如果你想立即开始，我建议：

1. **先运行本地大规模测试**（方案 A）- 看看是否只是数据量问题
2. **如果还不够，添加随机噪声**（方案 B 方法 2）- 最简单的隐私增强
3. **检查结果是否通过隐私阈值**

需要我帮你执行这些步骤吗？
