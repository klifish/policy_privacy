# PostfixPolicyInterpreter 工作示例

## 配置参数
- **N = 3**: 3个私有属性
- **M = 2**: 2个外部谓词
- **DEPTH = 10**: 最大表达式长度
- **K = 3**: log2(N+M) = log2(5) ≈ 3

## Token 编码表

| Token 值 | 含义 |
|---------|------|
| 0 | requesterPolicy[0] - 属性0 |
| 1 | requesterPolicy[1] - 属性1 |
| 2 | requesterPolicy[2] - 属性2 |
| 3 | predicateValues[0] - 谓词0 (例如:年龄>18) |
| 4 | predicateValues[1] - 谓词1 (例如:有医生执照) |
| 5 | AND 操作 (N+M+0 = 3+2+0) |
| 6 | OR 操作 (N+M+1 = 3+2+1) |
| 7 | NOT 操作 (N+M+2 = 3+2+2) |

## 示例 1: 简单 AND 操作
**策略**: "属性0 AND 谓词1" → `attr0 ∧ hasLicense`

### 输入
```json
{
  "postfixExpr": [0, 4, 5, 0, 0, 0, 0, 0, 0, 0],
  "numOperations": 3,
  "requesterPolicy": [1, 0, 1],  // attr0=true, attr1=false, attr2=true
  "predicateValues": [0, 1]       // pred0=false, pred1=true
}
```

### 执行过程

| 步骤 | Token | 类型 | 操作 | 栈内容 | sp |
|-----|-------|------|------|--------|-----|
| 初始 | - | - | - | [] | 0 |
| 0 | 0 | 操作数 | push requesterPolicy[0]=1 | [1] | 1 |
| 1 | 4 | 操作数 | push predicateValues[1]=1 | [1, 1] | 2 |
| 2 | 5 | AND | pop 两个值, 1∧1=1, push | [1] | 1 |

**输出**: `isValid = 1` ✅

---

## 示例 2: 复杂表达式
**策略**: "(属性0 OR 属性1) AND NOT(谓词0)"

中缀表达式: `(attr0 ∨ attr1) ∧ ¬pred0`
后缀表达式: `attr0 attr1 OR pred0 NOT AND`

### 输入
```json
{
  "postfixExpr": [0, 1, 6, 3, 7, 5, 0, 0, 0, 0],
  "numOperations": 6,
  "requesterPolicy": [0, 1, 0],  // attr0=false, attr1=true, attr2=false
  "predicateValues": [0, 1]       // pred0=false, pred1=true
}
```

### 执行过程

| 步骤 | Token | 类型 | 操作 | 栈内容 | sp | 说明 |
|-----|-------|------|------|--------|-----|------|
| 初始 | - | - | - | [] | 0 | |
| 0 | 0 | 操作数 | push attr0=0 | [0] | 1 | |
| 1 | 1 | 操作数 | push attr1=1 | [0, 1] | 2 | |
| 2 | 6 | OR | pop 2, 0∨1=1, push | [1] | 1 | |
| 3 | 3 | 操作数 | push pred0=0 | [1, 0] | 2 | |
| 4 | 7 | NOT | pop 1, ¬0=1, push | [1, 1] | 2 | sp不变(一元) |
| 5 | 5 | AND | pop 2, 1∧1=1, push | [1] | 1 | |

**输出**: `isValid = 1` ✅

**解释**:
- attr0=false, attr1=true → (0 ∨ 1) = 1
- pred0=false → ¬0 = 1
- 最终: 1 ∧ 1 = 1

---

## 示例 3: 结果为 False
**策略**: "属性0 AND 属性2"

### 输入
```json
{
  "postfixExpr": [0, 2, 5, 0, 0, 0, 0, 0, 0, 0],
  "numOperations": 3,
  "requesterPolicy": [1, 0, 0],  // attr0=true, attr1=false, attr2=false
  "predicateValues": [0, 0]
}
```

### 执行过程

| 步骤 | Token | 类型 | 操作 | 栈内容 | sp |
|-----|-------|------|------|--------|-----|
| 初始 | - | - | - | [] | 0 |
| 0 | 0 | 操作数 | push attr0=1 | [1] | 1 |
| 1 | 2 | 操作数 | push attr2=0 | [1, 0] | 2 |
| 2 | 5 | AND | pop 2, 1∧0=0, push | [0] | 1 |

**输出**: `isValid = 0` ❌

---

## 示例 4: 嵌套 NOT 操作
**策略**: "NOT(NOT(属性0))" → 双重否定

后缀表达式: `attr0 NOT NOT`

### 输入
```json
{
  "postfixExpr": [0, 7, 7, 0, 0, 0, 0, 0, 0, 0],
  "numOperations": 3,
  "requesterPolicy": [1, 0, 0],
  "predicateValues": [0, 0]
}
```

### 执行过程

| 步骤 | Token | 类型 | 操作 | 栈内容 | sp |
|-----|-------|------|------|--------|-----|
| 初始 | - | - | - | [] | 0 |
| 0 | 0 | 操作数 | push attr0=1 | [1] | 1 |
| 1 | 7 | NOT | pop 1, ¬1=0, push | [0] | 1 |
| 2 | 7 | NOT | pop 1, ¬0=1, push | [1] | 1 |

**输出**: `isValid = 1` ✅ (双重否定还原)

---

## 栈操作详解

### 操作数 (Push)
- **目标索引**: `destIdx = sp` (当前栈顶)
- **栈指针变化**: `sp' = sp + 1`
- **写入值**: 从 `operandPad[token]` 读取

### AND/OR (二元操作)
- **读取**: `topA = stack[sp-2]`, `topB = stack[sp-1]`
- **计算**:
  - AND: `topA * topB`
  - OR: `topA + topB - topA*topB`
- **目标索引**: `destIdx = sp - 2`
- **栈指针变化**: `sp' = sp - 1` (两个值合并为一个)

### NOT (一元操作)
- **读取**: `topB = stack[sp-1]`
- **计算**: `1 - topB`
- **目标索引**: `destIdx = sp - 1`
- **栈指针变化**: `sp' = sp` (原地替换)

---

## 不变量检查示例

### ❌ 错误示例 1: 栈下溢
```json
{
  "postfixExpr": [5, 0, 0, ...],  // 直接 AND,但栈为空
  "numOperations": 1
}
```
**违反**: `isBinary[0] * (1 - have2[0]) === 0` (需要 depth≥2)

### ❌ 错误示例 2: 最终栈深度错误
```json
{
  "postfixExpr": [0, 1, 0, ...],  // 只 push 了两个值,没有操作
  "numOperations": 2
}
```
**违反**: `sp[DEPTH] === 1` (最终 sp=2, 不等于1)

### ❌ 错误示例 3: 保留操作码
```json
{
  "postfixExpr": [0, 1, 8, ...],  // token 8 = N+M+3 = 保留码
  "numOperations": 3
}
```
**违反**: `active[i] * code3Flag[i] === 0` (禁用操作码3)

---

## 实际应用场景

### 医疗数据访问控制
```
策略: (是医生 OR 是护士) AND (有特定科室权限) AND NOT(患者拉黑)

属性:
- attr0: 是医生 (私有)
- attr1: 是护士 (私有)
- pred0: 有心内科权限 (本体论检查)
- pred1: 在患者黑名单 (外部数据库)

后缀表达式: [0, 1, 6, 3, 5, 4, 7, 5]
解释: attr0 attr1 OR pred0 AND pred1 NOT AND
```

### 完整示例输入
```json
{
  "postfixExpr": [0, 1, 6, 3, 5, 4, 7, 5, 0, 0],
  "numOperations": 8,
  "requesterPolicy": [1, 0, 1],  // 是医生, 不是护士, (attr2未使用)
  "predicateValues": [1, 0]       // 有权限, 不在黑名单
}
```

### 执行结果
```
步骤0: push 1 → [1]
步骤1: push 0 → [1,0]
步骤2: OR → [1]           (1∨0=1)
步骤3: push 1 → [1,1]
步骤4: AND → [1]          (1∧1=1)
步骤5: push 0 → [1,0]
步骤6: NOT → [1,1]        (¬0=1)
步骤7: AND → [1]          (1∧1=1)

isValid = 1 ✅ 允许访问
```

---

## 电路约束数量估算

对于 N=3, M=2, DEPTH=10:
- 每步约 50-100 个约束 (比较器、多路复用器、算术)
- 总约束数: ~500-1000 个约束
- 证明时间: <1秒 (取决于曲线和硬件)
