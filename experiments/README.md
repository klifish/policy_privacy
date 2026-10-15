# Policy Privacy Experiments

`experiments/` 是链上数据采集、统计分析、独立复核和结果产物的统一边界。
完整的数据流和 source-of-record 规则见
[`docs/EXPERIMENT_PIPELINE.md`](../docs/EXPERIMENT_PIPELINE.md)。

## 目录职责

```text
experiments/
├── capture/                         # 统一采集入口、配置、切片和验证
├── data/polygonAmoy/                # 当前权威 Amoy capture(B1,无 padding)
├── data/polygonAmoy-b2-padded/      # 同一批执行的 padded(B2)capture,消融用
├── core/                            # capture 与 JS crosscheck 共享实现
├── analysis/
│   ├── supervised/                  # MDPI 正式 Python 监督分析
│   ├── clustering/                  # MDPI 正式 Python 聚类分析
│   ├── crosscheck/{pch,pi,spp}/     # JavaScript 独立复核
│   └── diagnostics/                 # 非正式诊断工具
├── results/
│   ├── supervised/                  # 正式监督 verdict
│   ├── clustering/                  # 聚类 CSV 和图
│   ├── crosscheck/                  # JavaScript 报告
│   ├── capture/                     # capture validator 输出
│   └── legacy/                      # 历史综合 runner 输出
├── ablation/gas_padding/            # B1/B2 capture 与消融编排
├── legacy/                          # 非论文 source-of-record 工具
├── docs/                            # 实验文档
└── requirements.txt                 # Python 分析依赖
```

`unified/archive/`、PCH 的 `results_archive/` 与
`polygonAmoy_before_groupsplit/`、以及 `multiseed_results/` 是冻结历史证据，
不属于活跃入口。

## 环境

```bash
python3 -m venv .venv
.venv/bin/pip install -r experiments/requirements.txt
```

## 常用命令

生成新的链上 capture（会与本地链或 Amoy 交互）：

```bash
npm run data:generate:local
npm run data:generate:amoy
```

从已提交 capture 重建正式分析：

```bash
npm run analysis:supervised
npm run analysis:clustering
npm run analysis:ablation
npm run analysis:all
```

运行 JavaScript 独立复核并比较 verdict：

```bash
npm run crosscheck:all
npm run analysis:compare:js
```

完整离线复现和快速 provenance 检查：

```bash
npm run evaluation:reproduce
npm run evaluation:verify
```

旧的 `analysis:python:*`、`crosscheck:js:*`、`unified*` 和 `exp:*`
npm 命令仍是兼容别名，但旧文件路径不再兼容。

## 结果权威关系

- `data/polygonAmoy/`：链上 capture source of record(2026-10-15,B1 无 padding)。
- `data/polygonAmoy-b2-padded/`：同一批 1977 条执行的 padded(B2)capture，只作消融对照。
- `results/supervised/`：MDPI 监督表格 source of record。
- `results/clustering/`：MDPI 聚类表格与图 source of record。
- `results/crosscheck/`：独立 JavaScript 复核，不覆盖正式 Python verdict。
- `ablation/gas_padding/`：B1/B2 gas-padding 消融证据。

当前 capture 生成器已经适配生产 DUO V3：13 个属性、11 个固定谓词槽、
DEPTH=64、8 层 Merkle 路径，以及 slot 10 的签名 profile credential。
DUO V3 不支持 `NOT`，所以新 capture 不再生成 `negation_heavy`；当前实验
词汇也不会产生 `predicateCount=none`。

`data/polygonAmoy/` 采自这一实现(protocol v3.0.0-rc2，代码 `f9039e1`)，
见其 README。
