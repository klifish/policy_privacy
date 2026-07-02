# Gas 消耗和数据分布分析工具

> ⚠️ **ARCHIVED — superseded.** This document describes the pre-multiseed, single-split
> PASS/FAIL design (a single AUC≤0.55-and-Advantage≤5% threshold check). The current
> authoritative privacy verdict is a 30-seed policy-disjoint double criterion
> (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`), implemented in
> `experiments/core/multiseed_criterion.js`. Some file/API references below (e.g.
> `evaluator.js`, `classifiers.js`, `mock_demo.js`) no longer exist as standalone files.
> Kept for historical context only — do not use as a spec of current behavior.

本目录包含用于分析 Policy Content Hiding 实验结果的工具和报告。

## 📁 文件说明

### 分析脚本

- **[analyze_gas_patterns.js](./analyze_gas_patterns.js)** - 完整的 gas 消耗模式和数据分布分析
  - 分析 DUO term 分布
  - 分析 gas 消耗模式（按 term 分组）
  - 检测隐私泄露点
  - 生成修复建议

- **[analyze_outlier.js](./analyze_outlier.js)** - 异常值深度分析
  - 识别高 gas 消耗样本
  - 分析冷启动效应
  - 对比有/无 ontology 的 gas 模式

### 分析报告

- **[QUICK_SUMMARY.txt](./QUICK_SUMMARY.txt)** - 快速总结（文本格式，适合终端查看）
- **[ANALYSIS_SUMMARY_CN.md](./ANALYSIS_SUMMARY_CN.md)** - 详细中文分析报告
- **[PRIVACY_LEAK_ANALYSIS.md](./PRIVACY_LEAK_ANALYSIS.md)** - 技术细节和英文报告

## 🚀 使用方法

### 1. 运行完整分析

```bash
cd experiments/policy_content_hiding
node analyze_gas_patterns.js
```

**输出示例**:
```
================================================================================
DATA DISTRIBUTION ANALYSIS
================================================================================
DUO Term 0: 97/200 (48.5%)
  - 无 ontology: 37 (38.1%)
  - ICD10: 30 (30.9%)
  - OBI: 30 (30.9%)
...

================================================================================
GAS CONSUMPTION PATTERN ANALYSIS
================================================================================
Commit Gas Comparison:
  Term 0: mean=501566, std=1727.78
  Term 1: mean=501387, std=18.08
🔴 Term 0 has much higher variance!
...
```

### 2. 分析异常值

```bash
node analyze_outlier.js
```

**输出示例**:
```
🔍 Outlier Sample Analysis:
  Feature Index: 0
  Commit Gas: 518494
  Difference from normal: 17100 gas

💡 CRITICAL INSIGHT: This is the FIRST sample (index 0)!
   ⚠️  This matches the SSTORE cold start pattern!
```

### 3. 查看快速总结

```bash
cat QUICK_SUMMARY.txt
```

这会显示格式化的表格和关键发现，适合快速了解结果。

## 📊 分析内容

### 数据分布分析

1. **DUO Term 频率分布**
   - 各个 term 的样本数量
   - Ontology namespace 分布
   - 类别平衡检查

2. **Ontology 模式**
   - 哪些 term 总是有/没有 ontology
   - 识别独特签名

### Gas 消耗分析

1. **Commit Gas**
   - 按 term 分组的统计（mean, std, min, max）
   - 检测异常值
   - 方差差异分析

2. **Access Gas**
   - 验证 access 阶段的一致性
   - 检查是否存在泄露

3. **总 Gas (Commit + Access)**
   - 端到端的 gas 消耗模式

### 泄露点检测

1. **Feature 唯一性**
   - 识别只在特定 term 出现的 gas 值
   - 计算可识别样本的比例

2. **相关性分析**
   - Ontology 与 gas 的关联
   - 冷启动效应识别

### 修复建议

- 针对每个泄露点的具体修复方案
- 预期改进效果评估
- 优先级排序

## 📈 关键指标

### 隐私评估指标

- **AUC (Area Under ROC Curve)**
  - ≤ 0.55: 隐私保护良好
  - > 0.55: 存在泄露风险

- **Advantage (对抗优势)**
  - ≤ 5%: 可接受
  - > 5%: 需要改进

### Gas 统计指标

- **Mean (平均值)**: 不同 term 之间应该接近
- **Std Dev (标准差)**: 应该 < 100 gas
- **Range (范围)**: 应该尽可能小
- **Outliers (异常值)**: 应该识别并处理

## 🔍 示例：解读分析结果

### 示例 1: 发现 Ontology 泄露

```
ONTOLOGY NAMESPACE DISTRIBUTION
  DUO Term 0:
    null: 37 (38.1%)   ← 🔴 只有 Term 0 可以是 null
    ICD10: 30 (30.9%)
    OBI: 30 (30.9%)
  DUO Term 1:
    ICD10: 67 (100%)   ← Term 1 总是 ICD10
```

**解读**: Term 0 是唯一可以没有 ontology 的条款，这是一个强特征，对抗模型可以利用。

### 示例 2: Gas 方差泄露

```
Commit Gas Comparison:
  Term 0: std=1727.78 🔴
  Term 1: std=18.08   ✅
  Term 2: std=19.73   ✅
```

**解读**: Term 0 的方差比其他 term 高两个数量级，逻辑回归可以利用这个特征区分 Term 0。

### 示例 3: 冷启动检测

```
Outlier Sample Analysis:
  Feature Index: 0        ← 第一个样本
  Commit Gas: 518494
  Difference: 17100 gas   ← 约等于 SSTORE 成本
```

**解读**: 这是区块链的固有特性，不是真正的隐私泄露，可以通过预热合约解决。

## 🛠️ 自定义分析

### 修改分析脚本

你可以编辑 `analyze_gas_patterns.js` 来添加自定义分析：

```javascript
// 例如：添加新的统计指标
function analyzeCustomMetric(features) {
  // 你的自定义逻辑
}

// 在 main() 函数中调用
function main() {
  // ... 现有代码 ...
  analyzeCustomMetric(features);
}
```

### 导出数据到 CSV

```javascript
const fs = require('fs');

function exportToCSV(features) {
  const header = 'duoTerm,commitGas,accessGas,ontology\n';
  const rows = features.map(f =>
    `${f.duoTerm},${f.commitGasUsed},${f.accessGasUsed},${f.ontologyNamespace || 'null'}`
  ).join('\n');

  fs.writeFileSync('analysis.csv', header + rows);
}
```

## 📝 生成新报告

在运行新的实验后，重新生成分析：

```bash
# 1. 运行实验
npm run experiment:testnet -- --policy-count 500

# 2. 运行分析
node analyze_gas_patterns.js > new_analysis.txt

# 3. 分析异常值
node analyze_outlier.js > outlier_details.txt

# 4. 对比结果
diff old_analysis.txt new_analysis.txt
```

## 🎯 常见问题

### Q: 为什么 Term 0 的 AUC 高于其他 term？

A: 主要原因是 ontology namespace 的独特性。Term 0 是唯一可以没有 ontology 的条款，这创造了一个 100% 准确的识别特征。

### Q: 冷启动 gas 异常值需要担心吗？

A: 不需要太担心。这是区块链的固有特性（SSTORE 从零到非零的额外成本）。可以通过以下方式处理：
- 实验前预热合约
- 分析时排除第一个样本
- 在合约中添加冷启动补偿

### Q: 如何验证修复效果？

A:
1. 实施修复方案
2. 重新运行实验
3. 运行分析脚本
4. 检查新的 AUC 和 Advantage 是否达标
5. 验证 gas std 是否降低

### Q: 为什么 ICD-10 预测完全失败？

A: 这是好事！说明加密方案成功隐藏了医疗敏感信息。对抗模型无法从 gas 消耗或其他特征推断出疾病类别。

## 📚 相关资源

- [实验主脚本](./run_experiment.js)
- [数据生成器](./data_generator.js)
- [特征提取器](./feature_extractor.js)
- [评估器](./evaluator.js)
- [实验结果](./results/evaluation_report.json)

## 🤝 贡献

如果你开发了新的分析工具或发现了新的隐私泄露模式，欢迎：

1. 添加新的分析脚本
2. 更新文档
3. 分享发现

## 📄 许可

与主项目相同的许可证。

---

**最后更新**: 2025-11-08
**维护者**: Policy Privacy 团队
