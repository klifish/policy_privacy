# Experiments 目录重构计划

## 当前问题分析

### 1. **代码重复严重**
- `NATIVE_TOKEN_SYMBOL_BY_CHAIN`, `GAS_ESTIMATES`, `ensureSufficientBalance` 在 3 个文件中重复
- `ProgressTracker` 类在 SPP 和 PI 实验中重复
- 余额检查和gas估算逻辑重复实现

### 2. **文件组织混乱**
```
experiments/
├── 113 个文件分散在多个目录
├── 大量临时分析脚本 (analyze_*.js, test_*.js, verify_*.js)
├── 重复的 data_generator.js (3个实验各一份)
├── 过多的文档文件 (15+ markdown 文件)
└── 多个 results 目录混杂了新旧数据
```

### 3. **职责划分不清**
- `run_experiment.js` 文件过大 (500-1000行)
- 核心逻辑、工具函数、CLI解析混在一起
- 缺少统一的共享库层

### 4. **配置管理分散**
- 配置文件散落在根目录和各子目录
- 没有统一的配置加载和验证机制

---

## 推荐重构方案

### **新目录结构**

```
experiments/
│
├── core/                           # 核心共享库
│   ├── blockchain.js               # 链上交互工具
│   │   ├── deployContracts()
│   │   ├── ensureSufficientBalance()
│   │   ├── estimateGas()
│   │   └── getNativeTokenSymbol()
│   │
│   ├── progress.js                 # 统一的进度追踪
│   │   └── class ProgressTracker
│   │
│   ├── dataset-loader.js           # 数据集加载/保存
│   │   ├── loadDataset()
│   │   ├── saveDataset()
│   │   └── getArtifactPaths()
│   │
│   ├── config-manager.js           # 配置管理
│   │   ├── loadConfig()
│   │   ├── validateConfig()
│   │   └── mergeConfigs()
│   │
│   └── cli-utils.js                # CLI工具
│       ├── parseCommonArgs()
│       └── printUsage()
│
├── unified/                        # 统一数据集流程
│   ├── run.js                      # 主入口 (原 run_unified_dataset.js)
│   ├── validator.js                # 验证器
│   ├── artifacts.js                # Artifact管理
│   ├── constraint-generator.js     # 约束感知生成器
│   └── configs/                    # 所有配置文件
│       ├── default.json
│       ├── optimized.json
│       └── example.json
│
├── pch/                            # Policy Content Hiding
│   ├── run.js                      # 简化的入口
│   ├── pipeline/                   # 流程步骤
│   │   ├── phase1-generate.js
│   │   ├── phase2-extract.js
│   │   └── phase3-evaluate.js
│   ├── core/
│   │   ├── data-generator.js
│   │   ├── feature-extractor.js
│   │   ├── classifiers.js
│   │   └── evaluator.js
│   ├── analysis/                   # 保持现有分析工具
│   │   └── *.js
│   └── results/                    # 结果输出
│
├── spp/                            # Structure & Parameter Privacy
│   ├── run.js
│   ├── pipeline/
│   │   ├── phase1-generate.js
│   │   ├── phase2-attack.js
│   │   └── phase3-evaluate.js
│   ├── core/
│   │   ├── data-generator.js
│   │   └── attacks.js
│   └── results/
│
├── pi/                             # Policy Indistinguishability
│   ├── run.js
│   ├── pipeline/
│   │   ├── phase1-generate.js
│   │   ├── phase2-pairing.js
│   │   └── phase3-evaluate.js
│   ├── core/
│   │   ├── data-generator.js
│   │   ├── pi-data-generator.js
│   │   ├── attacks.js
│   │   ├── statistics.js
│   │   └── feature-extractor.js
│   └── results/
│
├── scripts/                        # 开发/测试脚本
│   ├── analyze/                    # 临时分析脚本
│   ├── test/                       # 测试脚本
│   └── verify/                     # 验证脚本
│
├── docs/                           # 文档集中管理
│   ├── README.md                   # 总览
│   ├── unified-workflow.md
│   ├── pch/
│   ├── spp/
│   └── pi/
│
└── package.json                    # NPM脚本定义
```

---

## 具体重构步骤

### **Phase 1: 提取共享代码** (优先级: HIGH)

#### 1.1 创建 `core/blockchain.js`
```javascript
// 合并重复的区块链交互逻辑
const { ethers } = require('hardhat');

const NATIVE_TOKEN_SYMBOL_BY_CHAIN = Object.freeze({ /* ... */ });
const GAS_ESTIMATES = Object.freeze({ /* ... */ });

async function deployPolicyPrivacyContracts() { /* ... */ }
async function ensureSufficientBalance({ provider, signer, executionCount }) { /* ... */ }
function estimateTotalGas(executionCount) { /* ... */ }
function getNativeTokenSymbol(chainId) { /* ... */ }

module.exports = {
  NATIVE_TOKEN_SYMBOL_BY_CHAIN,
  GAS_ESTIMATES,
  deployPolicyPrivacyContracts,
  ensureSufficientBalance,
  estimateTotalGas,
  getNativeTokenSymbol
};
```

#### 1.2 创建 `core/progress.js`
```javascript
// 统一的进度追踪器
class ProgressTracker {
  constructor(totalSteps, options = {}) { /* ... */ }
  startStep(stepName) { /* ... */ }
  completeStep() { /* ... */ }
  updateSubProgress(current, total, extraInfo = '') { /* ... */ }
  complete() { /* ... */ }
}

module.exports = { ProgressTracker };
```

#### 1.3 创建 `core/dataset-loader.js`
```javascript
// 统一的数据集加载逻辑
const fs = require('fs');
const path = require('path');

function loadDataset(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dataset not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveDataset(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 移植 unified_dataset_artifacts.js 的核心功能
function getArtifactPaths(baseDir) { /* ... */ }

module.exports = {
  loadDataset,
  saveDataset,
  getArtifactPaths
};
```

### **Phase 2: 重组目录结构** (优先级: MEDIUM)

#### 2.1 移动和重命名文件
```bash
# 统一数据集模块
mkdir -p experiments/unified/configs
mv experiments/run_unified_dataset.js experiments/unified/run.js
mv experiments/unified_dataset_validator.js experiments/unified/validator.js
mv experiments/unified_dataset_artifacts.js experiments/unified/artifacts.js
mv experiments/constraint_aware_generator.js experiments/unified/constraint-generator.js
mv experiments/*.json experiments/unified/configs/

# PCH 模块
mkdir -p experiments/pch/{pipeline,core}
mv experiments/policy_content_hiding/run_experiment.js experiments/pch/run.js
mv experiments/policy_content_hiding/data_generator.js experiments/pch/core/
mv experiments/policy_content_hiding/{feature_extractor,classifiers,evaluator}.js experiments/pch/core/

# SPP 模块
mkdir -p experiments/spp/{pipeline,core}
mv experiments/structure_and_parameter_privacy/* experiments/spp/

# PI 模块
mkdir -p experiments/pi/{pipeline,core}
mv experiments/policy_indistinguishability/* experiments/pi/
```

#### 2.2 清理分析脚本
```bash
# 移动临时脚本到 scripts/
mkdir -p experiments/scripts/{analyze,test,verify}
mv experiments/policy_content_hiding/analyze_*.js experiments/scripts/analyze/pch/
mv experiments/policy_content_hiding/test_*.js experiments/scripts/test/pch/
mv experiments/policy_content_hiding/verify_*.js experiments/scripts/verify/pch/
```

#### 2.3 整理文档
```bash
mkdir -p experiments/docs/{pch,spp,pi}
mv experiments/policy_content_hiding/*.md experiments/docs/pch/
mv experiments/structure_and_parameter_privacy/*.md experiments/docs/spp/
mv experiments/policy_indistinguishability/*.md experiments/docs/pi/
mv experiments/*.md experiments/docs/
```

### **Phase 3: 简化 run.js 入口** (优先级: HIGH)

#### 3.1 新的 `pch/run.js` 结构
```javascript
const { parseCommonArgs } = require('../core/cli-utils');
const { ensureSufficientBalance } = require('../core/blockchain');
const { ProgressTracker } = require('../core/progress');
const { getArtifactPaths } = require('../core/dataset-loader');

const phase1 = require('./pipeline/phase1-generate');
const phase2 = require('./pipeline/phase2-extract');
const phase3 = require('./pipeline/phase3-evaluate');

async function run(config) {
  const tracker = new ProgressTracker(3);

  if (config.phase <= 1) {
    tracker.startStep('Phase 1: Dataset Generation & Execution');
    await phase1.execute(config);
    tracker.completeStep();
  }

  if (config.phase <= 2) {
    tracker.startStep('Phase 2: Feature Extraction');
    await phase2.execute(config);
    tracker.completeStep();
  }

  tracker.startStep('Phase 3: Attack Modeling & Evaluation');
  await phase3.execute(config);
  tracker.completeStep();

  tracker.complete();
}

if (require.main === module) {
  const config = parseCommonArgs(process.argv.slice(2));
  run(config).catch(console.error);
}

module.exports = { run };
```

#### 3.2 拆分 pipeline 步骤
```javascript
// pch/pipeline/phase1-generate.js
const { deployPolicyPrivacyContracts, ensureSufficientBalance } = require('../../core/blockchain');
const { generateDataset, executeDataset } = require('../core/data-generator');

async function execute(config) {
  // 只负责 Phase 1 的逻辑
  const dataset = generateDataset(config);
  const contract = await deployPolicyPrivacyContracts();
  await ensureSufficientBalance({ /* ... */ });
  const results = await executeDataset(dataset, contract);
  return results;
}

module.exports = { execute };
```

### **Phase 4: 添加 NPM 脚本** (优先级: LOW)

#### 4.1 在根目录 `package.json` 添加:
```json
{
  "scripts": {
    "exp:unified": "npx hardhat run experiments/unified/run.js",
    "exp:unified:local": "npm run exp:unified -- --network localhost",
    "exp:unified:testnet": "npm run exp:unified -- --network amoy",

    "exp:pch": "node experiments/pch/run.js",
    "exp:pch:phase2": "npm run exp:pch -- --use-unified-dataset --phase 2",

    "exp:spp": "node experiments/spp/run.js",
    "exp:spp:phase2": "npm run exp:spp -- --use-unified-dataset --phase 2",

    "exp:pi": "node experiments/pi/run.js",
    "exp:pi:phase2": "npm run exp:pi -- --use-unified-dataset --phase 2",

    "exp:all:phase2": "npm run exp:pch:phase2 && npm run exp:spp:phase2 && npm run exp:pi:phase2"
  }
}
```

---

## 重构收益

### **代码质量**
- ✅ 消除 ~500 行重复代码
- ✅ 降低 `run.js` 文件大小 50%+
- ✅ 提高可维护性和可测试性

### **开发体验**
- ✅ 清晰的职责划分
- ✅ 更容易定位和修改代码
- ✅ 统一的 NPM 脚本入口

### **文件组织**
- ✅ 减少顶层文件数量 60%+
- ✅ 分离核心代码、脚本和文档
- ✅ 符合标准项目结构

---

## 实施建议

### **保守方案** (推荐,风险低)
1. ✅ 只执行 Phase 1 (提取共享代码)
2. ✅ 渐进式迁移,保留原文件作为备份
3. ✅ 先在一个实验中验证,再推广到其他

### **激进方案** (彻底重构,风险高)
1. ⚠️ 执行所有 Phase
2. ⚠️ 需要更新所有导入路径
3. ⚠️ 可能破坏现有工作流

### **最小改动方案** (快速见效)
仅执行以下步骤:
1. 创建 `core/blockchain.js` 和 `core/progress.js`
2. 更新 3 个 `run_experiment.js` 的导入
3. 移动分析脚本到 `scripts/` 目录
4. 清理重复的 results 目录

---

## 下一步行动

如果你同意重构,我可以:

1. **选项 A**: 执行"最小改动方案"(30分钟,风险最低)
2. **选项 B**: 执行"保守方案 Phase 1"(1-2小时,推荐)
3. **选项 C**: 制定详细的分步实施计划,你手动执行

请告诉我你的选择!
