# 🚀 实验快速开始指南

完整的实验运行流程说明。

---

## 📋 前置准备

### 1. 环境检查

```bash
# 检查 Node.js 版本 (需要 v18+)
node --version

# 检查 Hardhat 安装
npx hardhat --version

# 安装依赖 (如果还没安装)
npm install
```

### 2. 配置网络

#### 选项 A: 本地网络 (推荐用于开发测试)

```bash
# 启动 Hardhat 本地节点 (在新终端中运行)
npx hardhat node

# 本地节点会自动提供测试账户和ETH
```

#### 选项 B: 测试网 (Polygon Amoy)

确保 `hardhat.config.js` 中配置了测试网:

```javascript
networks: {
  amoy: {
    url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    accounts: [process.env.PRIVATE_KEY]
  }
}
```

需要准备:
- 测试网账户私钥
- 测试网 MATIC (从水龙头获取)

---

## 🎯 实验流程

实验分为两个阶段:
- **Phase 1**: 在区块链上生成和执行数据集 (需要 gas)
- **Phase 2+**: 本地分析和攻击建模 (不需要 gas)

---

## 📊 方法 1: 使用统一数据集 (推荐)

这是最高效的方法 - 只需要执行一次链上操作,然后可以运行所有三个实验。

### Step 1: 生成统一数据集 (Phase 1)

```bash
# 在本地网络运行
npx hardhat run unified/run.js --network localhost \
  --config=unified/configs/unified_dataset_config_optimized.json

# 或在测试网运行
npx hardhat run unified/run.js --network amoy \
  --config=unified/configs/unified_dataset_config_optimized.json
```

**这会执行**:
- ✅ 生成所有策略定义
- ✅ 部署智能合约 (PolicyPrivacy + Verifier)
- ✅ 执行所有策略实例 (commit + access + verify)
- ✅ 保存执行结果到 `unified/artifacts_data/`
- ✅ 自动生成三个实验的数据切片:
  - `pch_dataset.json` - PCH 实验用
  - `spp_dataset.json` - SPP 实验用
  - `pi_dataset.json` - PI 实验用

**预计时间**:
- 本地网络: 5-10 分钟 (取决于策略数量)
- 测试网: 20-30 分钟 (网络延迟)

**Gas 消耗** (测试网):
- 约 200 个策略: ~1-2 MATIC

### Step 2: 运行实验分析 (Phase 2+)

现在你可以并行运行所有三个实验的分析阶段 (完全在本地,不需要 gas):

#### 2.1 Policy Content Hiding (PCH)

```bash
node policy_content_hiding/run_experiment.js \
  --use-unified-dataset \
  --phase 2
```

**输出**:
- 特征提取结果
- 分类器训练结果 (Logistic Regression, Decision Tree, Random Forest)
- 隐私评估报告
- 保存在 `policy_content_hiding/results/`

**预计时间**: 2-5 分钟

#### 2.2 Structure & Parameter Privacy (SPP)

```bash
node structure_and_parameter_privacy/run_experiment.js \
  --use-unified-dataset \
  --phase 2
```

**输出**:
- 监督学习攻击结果
- 统计假设检验 (MMD, KS Test)
- 无监督聚类攻击
- 保存在 `structure_and_parameter_privacy/results/`

**预计时间**: 3-7 分钟

#### 2.3 Policy Indistinguishability (PI)

```bash
node policy_indistinguishability/run_experiment.js \
  --use-unified-dataset \
  --phase 2
```

**输出**:
- 策略配对结果
- 单样本和配对攻击
- 双样本统计检验
- 保存在 `policy_indistinguishability/results/`

**预计时间**: 3-6 分钟

---

## 🔬 方法 2: 独立运行单个实验

如果你只想运行某一个实验,可以独立执行 (包含 Phase 1):

### Policy Content Hiding (完整流程)

```bash
# Phase 1: 生成数据集并在链上执行
node policy_content_hiding/run_experiment.js \
  --network localhost \
  --policies 200 \
  --executions-per-policy 3

# Phase 2-3 会自动执行:特征提取、攻击建模、评估
```

### Structure & Parameter Privacy (完整流程)

```bash
node structure_and_parameter_privacy/run_experiment.js \
  --network localhost \
  --policy-count 120 \
  --executions-per-policy 3
```

### Policy Indistinguishability (完整流程)

```bash
node policy_indistinguishability/run_experiment.js \
  --network localhost \
  --policy-count 100 \
  --executions-per-policy 3
```

**注意**: 这种方式每个实验都会:
- 独立部署合约
- 独立生成和执行数据集
- 消耗更多 gas 和时间

---

## ⚙️ 配置选项

### 统一数据集配置

编辑 `unified/configs/unified_dataset_config_optimized.json`:

```json
{
  "policyCount": 200,           // 策略数量
  "executionsPerPolicy": 3,     // 每个策略的执行次数
  "satisfyRatio": 0.5,          // 满足策略的比例
  "seed": "production-v1",      // 随机种子 (可复现)

  "validation": {
    "pch": {
      "minPoliciesPerDUO": 20,  // PCH: 每个DUO术语最少策略数
      "minMaxRatio": 0.3        // PCH: 最小/最大比例
    },
    "spp": {
      "minPoliciesPerCategory": 8,  // SPP: 每个类别最少策略数
      "minMaxRatio": 0.3,
      "maxCV": 0.6                  // SPP: 最大变异系数
    },
    "pi": {
      "minPairsPerType": 30,        // PI: 每种类型最少配对数
      "minSemanticDiversity": 0.7   // PI: 最小语义多样性
    }
  }
}
```

### 常用命令行参数

```bash
# 统一数据集
--config=<path>           # 配置文件路径
--artifact-dir=<path>     # 输出目录
--spp-executions=<n>      # SPP实验使用的执行次数

# 各实验共通
--phase <1|2|3>          # 从指定阶段开始
--use-unified-dataset    # 使用统一数据集
--unified-dir=<path>     # 统一数据集目录
--network <name>         # 网络名称 (phase 1)

# PCH 特有
--policies <n>           # 策略数量
--executions-per-policy <n>  # 每个策略执行次数
--dataset-quality        # 评估数据集质量

# SPP 特有
--policy-count <n>       # 策略数量
--test-ratio <float>     # 训练/测试划分比例

# PI 特有
--pair-targets <list>    # 配对目标类型
```

---

## 📁 查看结果

### 统一数据集输出

```bash
unified/artifacts_data/
├── policy_definitions.json    # 所有策略定义
├── executed_dataset.json      # 完整执行结果
├── pch_dataset.json           # PCH 数据切片
├── spp_dataset.json           # SPP 数据切片
├── pi_dataset.json            # PI 数据切片
├── metadata.json              # 元数据
├── config.json                # 使用的配置
└── artifact_index.json        # 索引文件
```

### 实验结果

```bash
# PCH
policy_content_hiding/results/
├── execution_results.json     # 执行结果
├── features.json              # 提取的特征
├── evaluation_report.json     # 评估报告
└── evaluation_report.md       # Markdown 格式报告

# SPP
structure_and_parameter_privacy/results/
├── dataset.json               # 数据集
├── execution_results.json     # 执行结果
├── report.json                # 评估报告
└── report.md                  # Markdown 格式报告

# PI
policy_indistinguishability/results/
├── pi_dataset.json            # 数据集
├── pi_execution_results.json  # 执行结果
├── pi_pairs.json              # 配对结果
├── pi_analysis.json           # 分析结果
├── pi_report.json             # 评估报告
└── pi_report.md               # Markdown 格式报告
```

---

## 🧪 验证和测试

### 测试统一数据集验证器

```bash
# 快速测试 (小数据集)
node test_validator.js
```

### 检查数据集质量

```bash
# 在 PCH 实验中启用质量检查
node policy_content_hiding/run_experiment.js \
  --use-unified-dataset \
  --phase 2 \
  --dataset-quality
```

---

## 🔍 故障排查

### 问题 1: "Insufficient balance"

**原因**: 账户余额不足

**解决**:
- 本地网络: 确保 Hardhat 节点正在运行
- 测试网: 从水龙头获取测试币
  - Polygon Amoy: https://faucet.polygon.technology/

### 问题 2: "Module not found"

**原因**: 依赖未安装或导入路径错误

**解决**:
```bash
# 重新安装依赖
npm install

# 清理缓存
rm -rf node_modules package-lock.json
npm install
```

### 问题 3: "Validation failed"

**原因**: 数据集不满足验证条件 (常见于小数据集)

**解决**:
- 增加 `policyCount` (推荐 ≥200)
- 调整验证阈值 (在配置文件的 `validation` 部分)

### 问题 4: "Transaction reverted"

**原因**: 智能合约执行失败

**解决**:
- 检查策略定义是否有效
- 查看合约日志: `npx hardhat console --network localhost`
- 减少 gas limit 或增加账户余额

---

## 💡 最佳实践

### 1. 推荐的实验顺序

```bash
# Step 1: 先在本地测试小数据集
npx hardhat node  # 新终端

npx hardhat run unified/run.js --network localhost \
  --config=unified/configs/unified_dataset_config_optimized.json

# Step 2: 验证结果
ls -lh unified/artifacts_data/

# Step 3: 运行分析 (并行)
node policy_content_hiding/run_experiment.js --use-unified-dataset --phase 2 &
node structure_and_parameter_privacy/run_experiment.js --use-unified-dataset --phase 2 &
node policy_indistinguishability/run_experiment.js --use-unified-dataset --phase 2 &
wait

# Step 4: 查看报告
cat policy_content_hiding/results/evaluation_report.md
cat structure_and_parameter_privacy/results/report.md
cat policy_indistinguishability/results/pi_report.md
```

### 2. 节省 Gas

- ✅ 使用统一数据集方法 (只部署一次)
- ✅ 在本地网络测试配置
- ✅ 调整 `policyCount` 和 `executionsPerPolicy`

### 3. 加速实验

- ✅ Phase 2+ 并行运行多个实验
- ✅ 使用本地网络而非测试网
- ✅ 使用缓存的执行结果 (`--use-unified-dataset --phase 2`)

### 4. 可复现性

- ✅ 使用固定的 `seed` 值
- ✅ 保存配置快照 (自动保存在 `artifacts_data/config.json`)
- ✅ 版本控制实验结果

---

## 📚 进一步学习

- **详细文档**: [docs/README.md](docs/README.md)
- **统一数据集工作流**: [docs/unified/UNIFIED_DATASET_WORKFLOW.md](docs/unified/UNIFIED_DATASET_WORKFLOW.md)
- **PCH 实验**: [docs/pch/QUICKSTART.md](docs/pch/QUICKSTART.md)
- **SPP 实验**: [docs/spp/README.md](docs/spp/README.md)
- **PI 实验**: [docs/pi/README.md](docs/pi/README.md)
- **重构说明**: [docs/refactoring/REFACTORING_SUMMARY.md](docs/refactoring/REFACTORING_SUMMARY.md)

---

## 🎯 快速命令参考

```bash
# 最简单的开始方式 (本地网络 + 统一数据集)
npx hardhat node  # 终端 1

npx hardhat run unified/run.js --network localhost  # 终端 2

node policy_content_hiding/run_experiment.js --use-unified-dataset --phase 2
node structure_and_parameter_privacy/run_experiment.js --use-unified-dataset --phase 2
node policy_indistinguishability/run_experiment.js --use-unified-dataset --phase 2

# 查看结果
cat policy_content_hiding/results/evaluation_report.md
cat structure_and_parameter_privacy/results/report.md
cat policy_indistinguishability/results/pi_report.md
```

---

祝实验顺利! 🎉

如有问题,请查看 [docs/README.md](docs/README.md) 或相关实验的文档。
