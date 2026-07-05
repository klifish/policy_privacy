# ZKP 实验记录参数盘点

## 盘点日期
2026-06-25

## 目的
回答一个问题:**现在的实验数据到底记录了哪些参数,缺哪些?** 尤其是证明生成时间等性能参数。
本文只做现状盘点,不含改动建议的实施。

---

## 📂 权威数据产物在哪

| 实验 | of-record 数据文件 | 粒度 |
|---|---|---|
| PCH (policy_content_hiding) | `results/polygonAmoy/features.json` | **每实例一条**(2004 条 = 1077 policy × 多执行) |
| SPP (structure_and_parameter_privacy) | `results/polygonAmoy/report.json` | 聚合(config/dataset/diagnostics/multiseedVerdict) |
| PI (policy_indistinguishability) | `results/polygonAmoy/pi_report.json` | 聚合(pairTargets/pairCounts/diagnostics/multiseedVerdict) |

> 真正的**原始每实例特征**只在 PCH 的 `features.json` 落盘。SPP/PI 报告是聚合判据,不含逐条原始计时/规模。

---

## ✅ 每条 ZKP 实例实际记录的字段

数据生成入口:`experiments/core/data_generator.js` 的 `executePolicy()`(约 L2379)。

| 字段 | 含义 | 状态 |
|---|---|---|
| `commitGasUsed` | commit 链上 gas | ✅ 有 |
| `accessGasUsed` | access 链上 gas | ✅ 有 |
| `commitCalldataLength` | commit calldata 字符长度 | ✅ 有 |
| `accessCalldataLength` | access calldata 长度 | ⚠️ **恒为 `null`**(`data_generator.js:2417` 写死 null) |
| `proofSize` | 证明大小 | ⚠️ 是 `JSON.stringify(...)` 的**字符长度**(=800),非真实字节;Groth16 恒定大小,作为特征几乎零信息量 |
| `commitLogsCount` / `commitLogsSize` | commit 事件日志数/字节 | ✅ 有 |
| `accessLogsCount` / `accessLogsSize` | access 事件日志数/字节 | ✅ 有 |
| `blockDifference` | commit→access 区块差 | ✅ 有(但被标为 confounded,分析里排除) |
| `policyIndex` / `satisfy` | 标签 | ✅ 有 |
| `duoTerm` / `duoTermCodes` / `ontologyNamespace` / `ontologyValue` | 元数据/标签 | ✅ 有 |

---

## ✅ 已补齐(2026-06-25 instrumentation)

证明计时与运行级 provenance 现已落盘。改动只对**新的运行**(尤其消融的 B1 重跑)生效;
B2 复用的旧数据这些字段为 null(性能是副指标,不影响隐私判据)。

### 1. 证明分段计时 —— 已记录,口径已澄清
- `lib/prover.js` 的 `generateProof` 改用 split 流程(`snarkjs.wtns.calculate` + `groth16.prove`),
  分别计 `witnessMs` / `proveMs`,并默认顺带 `groth16.verify` 计 `verifyMs`(且自检证明有效)。
  split 失败时回退 `fullProve`(`witnessMs=null`),证明本身永不因计时而失败。
- 经 TPS 层透传:`tps/proofGenerator.js` → `tps/server.js` 的 prove 响应新增 `proofTimings`。
- `experiments/core/data_generator.js` 把它们落进每条 execution 的 `features`:
  `proofWitnessTime` / `proofProveTime` / `proofVerifyTime`(ms,server-side、无网络)。
- 原 `proofGenerationTime`(端到端墙钟,含 HTTP + 链上提交)保留不变,语义上是 `endToEndAccessMs`。
- `PROOF_VERIFY_TIMING=0` 可关闭 verify 计时。

### 2. 计时字段不进攻击特征(隐私不受影响)
- `feature_extractor.js` 归一化排除列表已加入三个 `proof*Time`;
- `policy_indistinguishability/feature_keys.js` 是显式白名单,本就不含它们(注释已更新)。

### 3. 运行级 provenance —— 已记录
- `experiments/unified/artifacts.js` 的 `buildProvenance()` 写进 `metadata.json` 的 `provenance` 块:
  `circuitDepth=20`、`numAttributes=6`、`numPredicates=5`、`wasmBytes`、`zkeyBytes`、`vkeyBytes`、
  `snarkjsVersion`、`nodeVersion`、`network`、`protectionProfile`、`commitHash`(git,best-effort)。

---

## ❌ 仍缺失 / 名不副实(本次未处理)

- `accessCalldataLength` 仍恒 `null`(`data_generator.js:2417`)。
- `proofSize` 仍是 `JSON.stringify` 字符数而非真实字节;Groth16 恒定大小,作为特征近乎零信息量。
- R1CS 约束数、proving key 哈希、CPU 型号/核数尚未记录(provenance 可后续扩展)。

---

## 🧭 一句话结论(更新后)

- **性能维度**:证明 witness/prove/verify 分段计时 + 电路规模/版本/commit 已记录(新运行起);
  待补真实 proofBytes 与 R1CS 约束数。
- **隐私维度**(gas、calldata、logs、区块差):记录较全,但 `accessCalldataLength` 恒 null、
  `proofSize` 是字符数而非字节,两字段名不副实(未改)。

---

## 📎 关键代码位置

- 特征收集 / 落盘字段:`experiments/core/data_generator.js:2413-2427`
- 端到端证明计时(口径不纯):`experiments/core/data_generator.js:2350-2359`
- `accessCalldataLength` 写死 null:`experiments/core/data_generator.js:2417`
- 干净但未埋点的证明调用:`test/utils/proofGenerator.js:48`
- PI 排除 proofGenerationTime:`experiments/policy_indistinguishability/feature_keys.js:10`
