# Term 计数的最终答案

## 🎯 你的观察是完全正确的！

> "就比如 DS+RS，那么统计的时候，应该在 DS 中统计一次，在 RS 中也要统计一次，才对啊"

**答案：是的！代码已经这样做了！**

---

## ✅ 实际情况验证

### 代码实现（正确）

在 `run_experiment.js` 的第 463-475 行：

```javascript
// Fixed: Use duoTermCodes array to check if term is present (not just primary term)
const duoCode = DUO_TO_ATTRIBUTE_CODE[duoTermId];
const trainY = trainData.map(f => {
  // Check if this term is in the duoTermCodes array
  const hasTerm = f.duoTerm === duoTermId ||
    (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(duoCode));
  return hasTerm ? 1 : 0;
});
```

**关键**：代码检查 `f.duoTermCodes.includes(duoCode)`，而不只是看 `f.duoTerm`！

### 实际数据验证

从 `features.json` 的数据分析：

```
Term 0 (GR):
  错误方法（只看主 term）: 96 个样本
  正确方法（检查数组）:   96 个样本
  差异: +0 个 ← 但这不是因为方法错误！

Term 1 (DS):
  错误方法: 67 个样本
  正确方法: 97 个样本
  差异: +30 个 ← 来自 [DS+RS] 和 [GR+DS] 组合 ✓

Term 2 (RS):
  错误方法: 36 个样本
  正确方法: 96 个样本
  差异: +60 个 ← 来自 [DS+RS] 和 [GR+RS] 组合 ✓
```

### 为什么 Term 0 没有差异？

**因为所有包含 GR 的策略都把 GR 设为主 term！**

```
组合策略的主 term 选择规则: 选择最小的 term ID

[GR+DS] (Term 0 + Term 1) → 主 term = 0 (GR)
[GR+RS] (Term 0 + Term 2) → 主 term = 0 (GR)
[DS+RS] (Term 1 + Term 2) → 主 term = 1 (DS)
```

所以：
- **GR (Term 0)**: 在所有包含它的组合中都是主 term
  - `f.duoTerm === 0` 已经覆盖了所有情况
  - `duoTermCodes.includes('GR')` 没有额外贡献

- **DS (Term 1)**: 在 [DS+RS] 中是主 term，但在 [GR+DS] 中不是
  - `f.duoTerm === 1` 只覆盖 [DS] 和 [DS+RS]
  - `duoTermCodes.includes('DS')` 额外贡献了 [GR+DS] 的 30 个

- **RS (Term 2)**: 在所有包含它的组合中都不是主 term
  - `f.duoTerm === 2` 只覆盖 [RS] 单独的 36 个
  - `duoTermCodes.includes('RS')` 额外贡献了 [GR+RS] 和 [DS+RS] 的 60 个

---

## 📊 正确的 Term 分布

### 每个 Term 的二分类样本数

```
总样本数: 199 (去除了 1 个冷启动)

Term 0 (GR) 二分类:
  正例（包含 GR）: 96 个
    - [GR] 单独: 36 个
    - [GR+DS]: 30 个
    - [GR+RS]: 30 个
  负例（不包含 GR）: 103 个

Term 1 (DS) 二分类:
  正例（包含 DS）: 97 个
    - [DS] 单独: 37 个
    - [GR+DS]: 30 个
    - [DS+RS]: 30 个
  负例（不包含 DS）: 102 个

Term 2 (RS) 二分类:
  正例（包含 RS）: 96 个
    - [RS] 单独: 36 个
    - [GR+RS]: 30 个
    - [DS+RS]: 30 个
  负例（不包含 RS）: 103 个
```

### 完美的均衡！

三个 term 的分布几乎完全相同：
- Term 0: 96/103 (48.2% 正例)
- Term 1: 97/102 (48.7% 正例)
- Term 2: 96/103 (48.2% 正例)

**这才是数据生成器的真正意图**！

---

## 🎓 关键洞察

### 为什么之前我们看到的分布是 97/67/36？

那是**主 term 的分布**，不是**term 出现的分布**！

```
主 term 分布（错误的视角）:
  Term 0 作为主 term: 96 次 (48.2%)
  Term 1 作为主 term: 67 次 (33.7%)
  Term 2 作为主 term: 36 次 (18.1%)

Term 出现分布（正确的视角）:
  Term 0 出现: 96 次 (48.2%)
  Term 1 出现: 97 次 (48.7%)
  Term 2 出现: 96 次 (48.2%)
```

### 为什么评估使用的是"term 出现"？

因为隐私评估的问题是：

> "攻击者能否推断策略**是否包含**某个 term？"

而不是：

> "攻击者能否推断策略的**主要** term 是什么？"

对于 [DS+RS] 策略：
- **包含 DS？** → 是
- **包含 RS？** → 是
- 所以在 DS 和 RS 的二分类中都应该是正例 ✓

---

## 💯 结论

### 你的理解是对的

"DS+RS 应该在 DS 中统计一次，在 RS 中也统计一次" ← **完全正确！**

### 代码已经正确实现了

```javascript
const hasTerm = f.duoTerm === duoTermId ||
  (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(duoCode));
```

这个逻辑确保了：
- [DS+RS] 在 DS 的评估中: `duoTermCodes.includes('DS')` → 正例 ✓
- [DS+RS] 在 RS 的评估中: `duoTermCodes.includes('RS')` → 正例 ✓

### 评估结果是可靠的

从最新的 `evaluation_report.md`：

```
Term 0 (GR):  AUC 0.6289, Advantage 10.00%  (96 正例 / 199 样本)
Term 1 (DS):  AUC 0.4216, Advantage 1.67%   (97 正例 / 199 样本)
Term 2 (RS):  AUC 0.6244, Advantage 8.33%   (96 正例 / 199 样本)
```

**所有 term 的样本数都接近 50%，完全均衡！**

如果用错误的方法（只看主 term），Term 2 只有 36 个正例（18%），评估会非常不公平。

---

## 🎯 最终要点

1. ✅ **代码是正确的** - 使用了二分类 + `duoTermCodes.includes()` 检查
2. ✅ **你的理解是正确的** - 组合策略在多个 term 中都应该计数
3. ✅ **分布是均衡的** - 96/97/96，几乎完美
4. ✅ **评估是可靠的** - 每个 term 都有足够且均衡的样本

### 之前的困惑来源

我们之前看到的 97/67/36 分布是**主 term 分布**，而不是**term 出现分布**。

评估使用的是后者，所以结果是可靠的！

---

## 📝 数据验证脚本

运行 `verify_binary_classification.js` 可以看到：

```
Term 1 (DS):
  只看主 term: 67 个样本
  检查 duoTermCodes: 97 个样本
  差异: +30 个样本 (来自 [GR+DS] 组合)

Term 2 (RS):
  只看主 term: 36 个样本
  检查 duoTermCodes: 96 个样本
  差异: +60 个样本 (来自 [GR+RS] 和 [DS+RS] 组合)
```

这证明了：
- [GR+DS] 在 DS 中被计数了 ✓
- [DS+RS] 在 DS 和 RS 中都被计数了 ✓
- [GR+RS] 在 RS 中被计数了 ✓

**完美！**
