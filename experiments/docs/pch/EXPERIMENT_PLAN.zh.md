# Policy Content Hiding 实验方案梳理

## 实验目标
- 评估 Policy Privacy 系统是否实现 Policy Content Hiding：观察者仅凭上链交易元数据无法优于随机猜测地恢复政策内容（DUO 条款、ICD-10 范围）。
- 在真实 Hardhat 执行环境中端到端跑通政策生成、合约交互、零知识证明以及攻击建模，量化潜在信息泄露。

## 系统组件概览
- 智能合约：`contracts/PolicyPrivacy.sol` 与 `PolicyPrivacyMainVerifier.sol`，负责承载政策承诺、访问证明与事件输出。
- 数据生成：`experiments/policy_content_hiding/data_generator.js` 构造政策蓝图、属性组合、外部本体白名单，并按满足/不满足情况生成请求者属性。
- 执行与采集：同文件中的 `executeDataset` 部署合约、生成 Groth16 证明、提交交易并收集链上可见特征。
- 特征工程：`experiments/policy_content_hiding/feature_extractor.js` 提取并归一化特征，准备训练/测试集与统计量。
- 攻击建模：`experiments/policy_content_hiding/classifiers.js` 实现轻量版逻辑回归、决策树、随机森林。
- 评估与报告：`experiments/policy_content_hiding/evaluator.js` 计算准确率、AUC、Advantage 等指标，`run_experiment.js` 汇总 JSON/Markdown 报告。

## 实验流程（五个阶段）

| 阶段 | 名称 | 关键操作 | 主要产物 |
| ---- | ---- | -------- | -------- |
| 1 | 数据生成与执行 | 生成政策数据集、部署合约、执行满足/不满足请求并记录链上特征 | `dataset_*.json`、`execution_results.json` |
| 2 | 特征提取 | 提取交易、日志、证明等可观测特征并计算统计信息 | `features.json` |
| 3 | 攻击建模 | 划分训练/测试集，训练逻辑回归与树模型以推断 DUO/ICD-10 标签 | 内存态 `classificationResults` |
| 4 | 评估 | 计算 Accuracy、AUC、Advantage、Macro F1 等指标并进行隐私阈值校验 | `evaluation`、`privacyCheck` |
| 5 | 报告 | 生成结构化 JSON 与人类可读 Markdown 报告 | `evaluation_report.json`、`evaluation_report.md` |

可通过 `--phase` 或 `--start-phase` 参数跳过已完成阶段，配合 `--execution-results` 与 `--features` 复用中间产物。

## 数据生成与执行策略
- 默认设置：`policyCount=200`、`executionsPerPolicy=20`（主脚本覆盖为 5）、`satisfyRatio=0.5`，语义层级包含 `singleton` 与 `pair` 组合，覆盖 {GR, DS, RS} 及其配对。
- 语义蓝图：依据 `semanticLayers` 与冲突规则生成政策逻辑表达式，限制策略深度不超过 circom 主电路支持的 10。
- 外部本体：若政策涉及 DS/RS，会按 namespace（ICD-10 / OBI）生成白名单根并在执行时注入对应值。
- 执行策略：每个政策按满足/不满足计划执行多次，请求者属性通过 `generateRequesterAttrs` 随机引入部分失败维度。
- 链上特征采集：真实部署并调用 `commitPolicy` 与 `requestAccess`，统计 gas、calldata、事件、区块差异与证明生成耗时。

## 观测特征与标签
- 交易：`commitGasUsed`、`commitCalldataLength`、`accessGasUsed`、`accessCalldataLength`。
- 证明：`proofSize`、`proofGenerationTime`。
- 事件：`commitLogsCount`、`commitLogsSize`、`accessLogsCount`、`accessLogsSize`。
- 时序：`blockDifference`（访问/提交区块差）。
- 标签：`duoTerm`（主 DUO 条款）、`ontologyNamespace`、`ontologyValue`、`satisfy`（是否满足政策）。

## 攻击建模与评估指标
- DUO 条款推断（多二分类）：针对观察到的每个 DUO 编号训练一版逻辑回归，衡量观察者能否判定该条款是否出现。
- ICD-10 章节推断（多分类）：使用决策树与随机森林预测 `icd10Chapter`。
- 评估指标：Accuracy、Precision/Recall/F1（仅二分类）与 Macro F1（多分类）、AUC（带概率输出时计算）、Advantage = Accuracy - 随机基线。

## 隐私阈值判定
- AUC 阈值：≤ 0.55（越接近 0.5 越安全，只对二分类任务生效）。
- Advantage 阈值：≤ 0.05，表示攻击者准确率相对随机猜测提升不超过 5%。
- 若任一任务越界则判定隐私失败，`run_experiment.js` 最终会返回非零退出码。

## 最新一次运行结果（2025-10-14）
- 配置摘要：`numDuoTerms=3`、`executionsPerPolicy=5`、总执行 1000 次，测试集比例 30%。
- DUO Term 1 与 DUO Term 2 的 Advantage 分别达到 0.1667 与 0.3567，超出 0.05 阈值，虽然 AUC 仍接近随机。
- ICD-10 任务由于仅观察到 1 个章节而退化（准确率与优势均为 0，宏 F1 0）。
- 总体结论：`privacyCheck.overallPassed=false`，提示系统可能泄露政策内容，需要进一步加固（详见 `experiments/policy_content_hiding/results/evaluation_report.json`）。

## 运行与复现步骤
1. 准备环境：确保 Hardhat 与 circom 相关依赖已安装，合同与电路已编译。
2. 启动本地 Hardhat 网络（`npx hardhat node`）或使用 Hardhat 内置网络。
3. 运行实验：`npx hardhat run experiments/policy_content_hiding/run_experiment.js --network hardhat -- --output experiments/policy_content_hiding/results --executions-per-policy 5 --num-duo-terms 3`.
4. 如需从中间阶段恢复，可追加 `--phase 2 --execution-results <path>` 或 `--phase 3 --features <path>`。
5. 检查输出：查看 `results` 目录下的 JSON/Markdown 报告及中间产物。

## 输出产物
- `dataset_*.json`：政策蓝图与执行计划（含元数据 `__meta` 用于覆盖率分析）。
- `execution_results.json`：每次合约执行的请求者属性、证明与可观测特征。
- `features.json`：归一化特征矩阵与统计量，便于外部分析或复现攻击。
- `evaluation_report.json` / `evaluation_report.md`：指标、阈值判定与结论。

## 风险与下一步建议
- 当前 DUO 分类任务优势值较高，可能源于特征差异（例如 gas 或日志长度）与政策内容直接相关；可进一步启用更多对策（gas/event padding）或增加随机化。
- 特征统计显示部分字段方差极低（如 `commitGasUsed`），建议扩展语义层或引入更多执行扰动以提升实验辨识力。
- 增加多轮随机种子、扩展攻击模型（如梯度提升或神经网络）以验证结论稳健性，并考虑引入显著性检验。
