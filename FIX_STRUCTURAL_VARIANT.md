# 修复Structural Variant的正确方法

## 问题诊断

你修改了 `pi_data_generator.js` 中的 `PAIR_TYPE_THRESHOLDS`：
```javascript
structural_variant: { similarity: 0.999, structureMustDiffer: true, executionMustDiffer: false }
```

但是**这个配置没有被使用**！

真正的分类逻辑在 `data_generator.js` 的 `determinePairType` 函数（第224-241行）：

```javascript
function determinePairType(policyA, policyB) {
  const similarity = computeSemanticSimilarity(policyA.semantics, policyB.semantics);
  const executionDiffs = countExecutionDifferences(policyA.executionProfile, policyB.executionProfile);
  const structureHashEqual = structuralFingerprint(policyA.structure, {}) === structuralFingerprint(policyB.structure, {});

  if (similarity >= 0.999 && !structureHashEqual) {
    if (executionDiffs > 0) {  // ❌ 这里硬编码了逻辑
      return { type: 'structural_variant', similarity };
    }
    return { type: 'semantic_equivalent', similarity };
  }

  if (similarity >= 0.95) {
    return { type: 'weak_equivalent', similarity };
  }

  return { type: 'controlled_difference', similarity };
}
```

当前逻辑：
- **有执行配置差异** → structural_variant
- **无执行配置差异** → semantic_equivalent

这就是为什么即使你改了配置，所有structural_variant还是100%执行配置不同！

## 正确的修复方案

### 选项1：改变分类逻辑（不推荐，会混乱现有定义）

修改 `data_generator.js` 第229-234行：

```javascript
if (similarity >= 0.999 && !structureHashEqual) {
  // 不再基于executionDiffs分类，改为随机或其他标准
  return { type: 'structural_variant', similarity };  // 或 semantic_equivalent
}
```

**问题**：这会改变现有的语义定义。

### 选项2：生成后过滤（推荐）⭐⭐⭐

在生成pairs之后，**交换标签**：
- 将"执行配置相同的structural_variant" 保留为 structural_variant
- 将"执行配置不同的structural_variant" 改为其他类型或删除

### 选项3：修改数据生成流程（最彻底）

问题的根源是：当前的pair生成是基于**已有的policy executions**，这些executions的执行配置是随机的。

要真正解决，需要：

1. **在policy生成阶段**就控制执行配置
2. 或者**在配对阶段**只选择执行配置相同的policies

## 🎯 实际可行的解决方案

基于当前代码结构，最实际的方案是：

### 方案A：修改pair生成，添加执行配置过滤

在 `data_generator.js` 的 `buildPairs` 函数中（第246行之后），添加执行配置匹配的逻辑：

```javascript
function buildPairs(policies, targets = DEFAULT_PAIR_TARGETS) {
  const remaining = { ...targets };
  const pairs = [];

  // 按executionProfile分组
  const byExecProfile = new Map();
  for (const policy of policies) {
    const key = JSON.stringify(policy.executionProfile);
    if (!byExecProfile.has(key)) {
      byExecProfile.set(key, []);
    }
    byExecProfile.get(key).push(policy);
  }

  // 只在相同executionProfile的policies中配对
  for (const [execKey, policyGroup] of byExecProfile) {
    if (policyGroup.length < 2) continue;  // 需要至少2个policies

    // 在这个组内配对
    for (let i = 0; i < policyGroup.length - 1; i++) {
      for (let j = i + 1; j < policyGroup.length; j++) {
        // ... 配对逻辑
      }
    }
  }
}
```

### 方案B：使用现有的policy，但在Python分析时过滤

**最简单的临时方案**：

1. 生成大量的pairs（当前已有）
2. 在Python分析脚本中，只使用执行配置相同的pairs

```python
# 在run_policy_privacy_experiments.py中

def filter_pairs_by_execution_profile(pairs, pair_type):
    """只保留执行配置相同的指定类型pairs"""
    filtered = []

    for pair in pairs:
        if pair.get('pairType') != pair_type:
            filtered.append(pair)  # 保留其他类型
            continue

        policies = pair.get('policies', [])
        if len(policies) == 2:
            exec_0 = policies[0].get('executionProfile', {})
            exec_1 = policies[1].get('executionProfile', {})

            # 只保留执行配置相同的structural_variant
            if exec_0 == exec_1:
                filtered.append(pair)

    return filtered

# 在load_pi_pairs后添加过滤
pi_pairs = load_pi_pairs(args.pi_pairs)
pi_pairs = filter_pairs_by_execution_profile(pi_pairs, 'structural_variant')
```

然后你需要重新生成更多数据，因为过滤后会剩很少。

## 🚀 我的推荐：方案C（最实际）

既然当前的架构是：
- **Semantic equivalent** = 相同语义 + 不同结构 + **相同执行配置**
- **Structural variant** = 相同语义 + 不同结构 + **不同执行配置**

那么问题的本质是：**不同执行配置导致了可学习的模式**。

**解决方案**：不要试图改变定义，而是**让structural_variant也无法被区分**。

### 具体做法：

1. **标准化执行配置的组合**

   在policy生成时，只使用几种预定义的执行配置组合：

   ```javascript
   const STANDARD_EXEC_PROFILES = [
     { path_unify: true, gas_pad: true, event_pad: true, batch_pattern: 'baseline' },
     { path_unify: false, gas_pad: true, event_pad: false, batch_pattern: 'batched' },
     // ... 少数几种
   ];
   ```

2. **确保structural_variant的两个policies使用"相近"的执行配置**

   不要完全相同，但要确保gas模式相似：
   - 同样的`gas_pad`
   - 相似的`batch_pattern`

3. **增加执行次数到10-20次**

   更多执行 → 平均值更稳定 → 减少随机变异的影响

## 立即可以做的

### 快速验证方案（不改代码）：

```bash
# 1. 创建一个过滤脚本
cat > python/filter_and_test.py << 'EOF'
#!/usr/bin/env python3
import json
from pathlib import Path
from run_policy_privacy_experiments import run_pi_experiment

# 加载pairs
pi_pairs_path = Path('data/artifacts_data testnet 02/pi_pairs.json')
with open(pi_pairs_path) as f:
    data = json.load(f)
pairs = data['pairs'] if isinstance(data, dict) else data

# 只测试执行配置相同的structural_variant
sv_same_exec = []
for pair in pairs:
    if pair.get('pairType') != 'structural_variant':
        continue

    policies = pair.get('policies', [])
    if len(policies) == 2:
        if policies[0]['executionProfile'] == policies[1]['executionProfile']:
            sv_same_exec.append(pair)

print(f"执行配置相同的structural_variant: {len(sv_same_exec)}")

if len(sv_same_exec) >= 20:  # 至少需要20个pairs
    # 运行实验
    results = run_pi_experiment(
        sv_same_exec,
        test_size=0.3,
        random_state=42
    )
    print("结果:")
    print(json.dumps(results, indent=2))
else:
    print("样本量不足，需要生成更多数据")
EOF

python3 python/filter_and_test.py
```

如果这个验证显示：执行配置相同的structural_variant确实难以区分（RF AUC < 0.55），那就证明了我们的假设。

然后你需要：
1. **重新设计实验**：要么改变structural_variant的定义，要么接受它就是"容易区分的"
2. **或者聚焦于semantic_equivalent**：证明在执行配置相同的情况下，系统确实提供了隐私保护

## 总结

你修改的配置**没有被实际使用**，因为分类逻辑是硬编码在`determinePairType`函数中的。

要真正解决，需要：
1. 修改pair生成逻辑（方案A）
2. 或者在Python中过滤（方案B）
3. 或者重新定义实验目标（方案C）

**我建议方案B**：先快速验证，如果证明了假设，再决定是否要大改代码。
