# Policy Privacy Experiments

隐私保护策略的区块链实验框架,包含三个核心隐私实验。

## 快速导航

### 🚀 运行实验

#### 1. 生成统一数据集 (Phase 1)
```bash
# 在本地网络运行
npx hardhat run unified/run.js --network localhost \
  --config=unified/configs/unified_dataset_config_optimized.json

# 在测试网运行
npx hardhat run unified/run.js --network amoy \
  --config=unified/configs/unified_dataset_config_optimized.json
```

#### 2. 运行实验分析 (Phase 2+)
```bash
# Policy Content Hiding
node policy_content_hiding/run_experiment.js --use-unified-dataset --phase 2

# Structure & Parameter Privacy
node structure_and_parameter_privacy/run_experiment.js --use-unified-dataset --phase 2

# Policy Indistinguishability
node policy_indistinguishability/run_experiment.js --use-unified-dataset --phase 2
```

---

## 目录结构

```
experiments/
├── core/                              # 共享核心库
│   ├── blockchain.js                  # 区块链交互工具
│   ├── cli.js                         # 公共 CLI 参数解析与入口样板（parseCommonArgs, printCommonHelp, runMain）
│   ├── dataset.js                     # 统一数据集路径解析（resolveDatasetPaths）
│   ├── execution.js                   # 链上逐条执行循环（executeDatasetWithProgress，含 checkpoint 支持）
│   └── progress.js                    # 进度追踪器
│
├── scripts/                           # 开发/分析脚本
│   ├── analyze/                       # 数据分析脚本
│   │   └── pch/                       # PCH 专用分析脚本
│   ├── test/                          # 测试脚本
│   └── verify/                        # 验证脚本
│
├── docs/                              # 文档中心
│   ├── README.md                      # 文档索引
│   ├── archive/                       # 历史文档归档
│   ├── unified/                       # 统一数据集文档
│   ├── pch/                           # PCH 实验文档
│   ├── spp/                           # SPP 实验文档
│   └── pi/                            # PI 实验文档
│
├── unified/                           # 统一数据集模块
│   ├── run.js                         # 统一数据集生成入口
│   ├── validator.js                   # 数据集验证器
│   ├── artifacts.js                   # Artifact 管理
│   ├── constraint-generator.js        # 约束感知生成器
│   ├── configs/                       # 配置文件
│   │   ├── unified_dataset_config_optimized.json
│   │   ├── unified_dataset_config_smoke.json
│   │   └── spp_pi_optimized_config.js # SPP/PI 专项优化配置
│   ├── artifacts_data/                # 当前默认数据（最新一次运行）
│   └── archive/                       # 历史运行数据归档
│       ├── artifacts_data_testnet_01/ # testnet 01~05
│       ├── ...
│       ├── artifacts_data_testnet_random/
│       └── artifacts_data_testnet_random_2/
│
├── policy_content_hiding/             # PCH 实验
│   ├── run_experiment.js              # 实验入口
│   ├── data_generator.js              # 数据生成（基础生成器，其他实验复用）
│   ├── feature_extractor.js           # 特征提取
│   ├── classifiers.js                 # 分类器（其他实验复用）
│   ├── evaluator.js                   # 评估器（其他实验复用）
│   ├── results/                       # 实验结果
│   └── results_archive/               # 历史结果快照
│
├── structure_and_parameter_privacy/   # SPP 实验
│   ├── run_experiment.js              # 实验入口
│   ├── data_generator.js              # 数据生成（含 5 维度标注）
│   ├── attacks.js                     # 攻击模型
│   └── results/                       # 实验结果
│
└── policy_indistinguishability/       # PI 实验
    ├── run_experiment.js              # 实验入口
    ├── data_generator.js              # 数据生成
    ├── pi_data_generator.js           # PI 专用生成器
    ├── attacks.js                     # 攻击模型
    ├── statistics.js                  # 统计工具
    └── results/                       # 实验结果
```

---

## 三个核心实验

### 1. Policy Content Hiding (PCH)
**目标**: 验证策略内容(如 DUO 术语、本体值)是否能通过侧信道泄漏

**方法**:
- 使用机器学习分类器(逻辑回归、决策树、随机森林)
- 基于 gas 消耗、执行时间等特征进行攻击
- 评估隐私保护效果

**文档**: [docs/pch/README.md](docs/pch/README.md)

### 2. Structure & Parameter Privacy (SPP)
**目标**: 验证策略结构(逻辑结构、嵌套深度)和参数(范围宽度、集合大小)是否泄漏

**方法**:
- 监督学习攻击(分类器)
- 统计假设检验(MMD、KS 检验)
- 无监督聚类攻击(K-means)

**文档**: [docs/spp/README.md](docs/spp/README.md)

### 3. Policy Indistinguishability (PI)
**目标**: 验证语义不同但相似的策略对是否可区分

**方法**:
- 单样本攻击(分类不同策略)
- 配对攻击(区分策略对)
- 双样本统计检验

**文档**: [docs/pi/README.md](docs/pi/README.md)

---

## 统一数据集工作流

实验采用**统一数据集**方法,避免重复的链上执行:

```
┌─────────────────────────────────────┐
│  Phase 1: 统一数据集生成             │
│  run_unified_dataset.js             │
│  • 生成策略定义                      │
│  • 部署合约 (一次)                   │
│  • 执行所有策略 (一次)               │
│  • 生成实验切片                      │
└─────────────────────────────────────┘
                 │
                 ├─► pch_dataset.json
                 ├─► spp_dataset.json
                 └─► pi_dataset.json

┌─────────────────────────────────────┐
│  Phase 2+: 并行运行实验分析          │
│  • PCH: 特征提取 + 攻击建模          │
│  • SPP: 攻击建模 + 统计检验          │
│  • PI: 策略配对 + 攻击建模           │
└─────────────────────────────────────┘
```

**优势**:
- ✅ 避免重复部署和执行,节省 gas
- ✅ 确保实验数据一致性
- ✅ 支持并行分析,提高效率

**详细说明**: [docs/unified/UNIFIED_DATASET_WORKFLOW.md](docs/unified/UNIFIED_DATASET_WORKFLOW.md)

---

## 最近更新

### 2026-06-10 - 目录整理与代码重构
- ✅ 新增 `core/cli.js`：提取三个实验公共 CLI 参数解析逻辑
- ✅ 新增 `core/dataset.js`：提取统一数据集路径解析逻辑
- ✅ 新增 `core/execution.js`：提取链上执行循环（含 checkpoint 支持）
- ✅ 删除三个实验的 Phase 1 直接链上执行路径（仅保留 unified 流程）
- ✅ `unified/run.js` 改用 `core/execution.js`，统一执行实现
- ✅ 清理 `package.json` 中旧的 `experiment:policy:*` 脚本（均替换为 `exp:*`）
- ✅ 移动 `spp_pi_optimized_config.js` → `unified/configs/`
- ✅ 将 PCH analysis 脚本整合到 `scripts/analyze/pch/`
- ✅ 将 7 个历史 `artifacts_data testnet *` 目录归档到 `unified/archive/`（去除路径空格）
- ✅ 历史文档归档到 `docs/archive/`

### 2025-12-04 - 代码重构
- ✅ 提取共享核心库 (`core/blockchain.js`, `core/progress.js`)
- ✅ 消除 ~410 行重复代码
- ✅ 整理临时脚本到 `scripts/` 目录
- ✅ 整理所有文档到 `docs/` 目录

**详情**: [docs/archive/refactoring/REFACTORING_SUMMARY.md](docs/archive/refactoring/REFACTORING_SUMMARY.md)

---

## 文档

完整的文档索引和指南请查看: **[docs/README.md](docs/README.md)**

### 快速链接
- [重构总结](docs/refactoring/REFACTORING_SUMMARY.md)
- [统一数据集工作流](docs/unified/UNIFIED_DATASET_WORKFLOW.md)
- [PCH 快速开始](docs/pch/QUICKSTART.md)
- [SPP 设计评估](docs/spp/SPP_DESIGN_EVALUATION.md)
- [PI 攻击层级报告](docs/pi/ATTACK_LEVELS_REPORT.md)

---

## 开发工具

### 分析脚本
位于 `scripts/analyze/`:
- 数据分布分析
- Gas 模式分析
- 隐私泄漏诊断
- 本体泄漏解释

### 测试脚本
位于 `scripts/test/`:
- Gas 修复测试
- PI 生成器测试

### 验证脚本
位于 `scripts/verify/`:
- 二分类验证
- 特征验证

---

## 技术栈

- **智能合约**: Solidity + Hardhat
- **零知识证明**: Circom + SnarkJS
- **机器学习**: 自实现分类器(逻辑回归、决策树、随机森林)
- **统计分析**: MMD、KS 检验、排列检验
- **测试网络**: Polygon Amoy Testnet

---

## 许可证

[项目许可证信息]
