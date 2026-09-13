# 统一数据集验证与采集

这个入口在执行昂贵的链上操作前，离线生成 policy blueprint，并检查 PCH、
SPP 和 PI 的采样条件。当前生成器遵循生产 DUO V3 电路：
`PolicyPrivacyMain(13, 11, 64, 5, 8, 32)`。

## 离线验证

在仓库根目录运行：

```bash
npm run unified:validate
```

等价的显式命令是：

```bash
node experiments/capture/validator.js \
  --config=experiments/capture/configs/unified_dataset_config_optimized.json
```

validator 只生成策略定义并检查分布，不部署合约、不发送交易。它会检查：

- PCH：DUO 术语覆盖与分布；
- SPP：逻辑结构、嵌套深度、谓词数量、集合大小和范围宽度；
- PI：语义多样性和可形成的配对类型。

DUO V3 明确禁止 `NOT`，所以新配置不生成 `negation_heavy`。当前实验词汇的
每个政策都会绑定 ontology 或 profile 谓词，因此 `predicateCount=none` 也
不可达；这两个类别通过配置中的 `excludedCategories` 明确排除，而不是用零
样本参与平衡计算。ontology Merkle 路径固定为 8 层，不能把树深当作新的
自由采样参数。

## 本地 smoke

```bash
node experiments/capture/validator.js \
  --config=experiments/capture/configs/unified_dataset_config_smoke.json \
  --dataset-out=experiments/.work/duo_v3_smoke.json
```

`experiments/.work/` 已忽略，适合可再生的临时数据。validator 的正式报告路径
是 `experiments/results/capture/validation_results.json`；不要用 smoke 输出
覆盖已提交的权威历史报告。

## 生成 capture

以下命令会与链交互，只有在明确准备采集时才运行：

```bash
npm run data:generate:local
npm run data:generate:amoy
```

采集流程会完成 policy commit、resource registration、TPS provision、proof
生成与 access submission，然后切出：

```text
executed_dataset.json
policy_definitions.json
pch_dataset.json
spp_dataset.json
pi_dataset.json
metadata.json
artifact_index.json
```

## 分析现有 capture

分析不会发起交易：

```bash
npm run analysis:all
npm run crosscheck:all
npm run analysis:compare:js
npm run evaluation:verify
```

已提交的 `experiments/data/polygonAmoy/` 是当前论文 source of record，但它
早于 DUO V3 adapter。生成器验证通过不等于该历史 capture 已升级；只有新的
Amoy 采集完成、哈希和 provenance 校验通过并被显式提升后，才能修改版本声明。
