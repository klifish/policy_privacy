# 📦 NPM 命令快速参考

所有实验命令已集成到 `package.json` 中,使用 `npm run` 即可执行。

---

## 🚀 快速开始 (最简单的方式)

### 一键运行所有实验

```bash
# 1. 启动本地节点 (新终端)
npx hardhat node

# 2. 在另一个终端运行
npm run exp:quick
```

这会:
1. 生成统一数据集 (Phase 1, ~5-10分钟)
2. 顺序运行三个实验分析 (Phase 2, ~10-15分钟)
3. 生成所有报告

---

## 📊 分步运行 (推荐)

### Step 1: 生成统一数据集

```bash
# 本地网络 (推荐)
npm run unified

# 测试网
npm run unified:testnet

# 使用自定义配置
npm run unified:config
```

### Step 2: 运行实验分析 (Phase 2)

```bash
# Policy Content Hiding
npm run exp:pch

# Structure & Parameter Privacy
npm run exp:spp

# Policy Indistinguishability
npm run exp:pi

# 或运行所有实验 (顺序执行)
npm run exp:all
```

---

## 🔧 统一数据集命令

| 命令 | 说明 |
|------|------|
| `npm run unified` | 在本地网络生成统一数据集 |
| `npm run unified:testnet` | 在测试网 (Amoy) 生成 |
| `npm run unified:config` | 使用优化配置 |
| `npm run unified:validate` | 验证数据集生成器 (快速测试) |

**输出位置**: `experiments/unified/artifacts_data/`

---

## 🎯 实验命令 (Phase 2 - 使用统一数据集)

| 命令 | 实验 | 预计时间 |
|------|------|----------|
| `npm run exp:pch` | Policy Content Hiding | 2-5 分钟 |
| `npm run exp:spp` | Structure & Parameter Privacy | 3-7 分钟 |
| `npm run exp:pi` | Policy Indistinguishability | 3-6 分钟 |
| `npm run exp:all` | 运行所有三个实验 | ~10-15 分钟 |
| `npm run exp:quick` | 完整流程 (Phase 1 + 2) | ~15-25 分钟 |

**前置条件**: 需要先运行 `npm run unified` 生成数据集

**输出位置**:
- PCH: `experiments/policy_content_hiding/results/`
- SPP: `experiments/structure_and_parameter_privacy/results/`
- PI: `experiments/policy_indistinguishability/results/`

---

## 📝 旧版实验命令 (独立运行,含 Phase 1)

这些命令会独立生成和执行数据集,**不推荐使用**,因为会重复部署合约和执行。

### Policy Content Hiding

```bash
npm run experiment:policy:pch                # 完整流程
npm run experiment:policy:pch:phase1         # 仅 Phase 1
npm run experiment:policy:pch:phase2         # 仅 Phase 2
npm run experiment:policy:pch:phase3         # 仅 Phase 3
npm run experiment:policy:pch:amoy           # 在测试网运行
```

### Structure & Parameter Privacy

```bash
npm run experiment:policy:spp                # 完整流程
npm run experiment:policy:spp:phase1         # 仅 Phase 1
npm run experiment:policy:spp:phase2         # 仅 Phase 2
npm run experiment:policy:spp:test           # 快速测试 (小数据集)
```

### Policy Indistinguishability

```bash
npm run experiment:policy:pi                 # 完整流程
npm run experiment:policy:pi:phase1          # 仅 Phase 1
npm run experiment:policy:pi:phase2          # 仅 Phase 2
npm run experiment:policy:pi:phase3          # 仅 Phase 3
npm run experiment:policy:pi:nohup           # 后台运行
```

---

## 🎨 命令对比

### 推荐方式 vs 旧方式

| 方面 | 推荐方式 (统一数据集) | 旧方式 (独立运行) |
|------|----------------------|------------------|
| **命令** | `npm run unified` + `npm run exp:all` | `npm run experiment:policy:pch` 等 |
| **部署次数** | 1 次 | 3 次 (每个实验一次) |
| **执行次数** | 1 次 | 3 次 |
| **Gas 消耗** | ~200 策略 × 1 = 200 | ~200 策略 × 3 = 600 |
| **总时间** | ~15-25 分钟 | ~30-50 分钟 |
| **数据一致性** | ✅ 完全一致 | ⚠️ 可能不一致 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

## 💡 使用场景

### 场景 1: 第一次运行实验

```bash
# 1. 启动本地节点
npx hardhat node

# 2. 生成数据并运行所有实验
npm run exp:quick

# 3. 查看结果
cat experiments/policy_content_hiding/results/evaluation_report.md
cat experiments/structure_and_parameter_privacy/results/report.md
cat experiments/policy_indistinguishability/results/pi_report.md
```

### 场景 2: 只想重新分析 (已有数据)

```bash
# 只运行 Phase 2,使用已有数据
npm run exp:pch   # 或 exp:spp, exp:pi
```

### 场景 3: 只测试某个实验

```bash
# 方法 1: 使用统一数据集 (如果已生成)
npm run exp:pch

# 方法 2: 独立运行小数据集 (快速测试)
npm run experiment:policy:spp:test
```

### 场景 4: 在测试网运行

```bash
# 确保配置了私钥和测试币
npm run unified:testnet

# 等待完成后运行分析 (本地)
npm run exp:all
```

### 场景 5: 验证数据生成器

```bash
# 快速测试验证器 (小数据集,不上链)
npm run unified:validate
```

---

## 🔍 故障排查

### "Insufficient balance"
```bash
# 本地网络: 确保 Hardhat 节点在运行
npx hardhat node

# 测试网: 获取测试币
# Polygon Amoy: https://faucet.polygon.technology/
```

### "Cannot find module"
```bash
# 重新安装依赖
npm install
```

### "Port already in use"
```bash
# 检查端口占用
lsof -i :8545

# 关闭旧进程或使用其他端口
```

### 查看详细日志
```bash
# 添加 --verbose 标志 (如果命令支持)
# 或查看输出文件
tail -f experiments/*/results/*.log
```

---

## 📚 更多信息

- **完整指南**: [QUICK_START.md](QUICK_START.md)
- **文档中心**: [docs/README.md](docs/README.md)
- **实验总览**: [README.md](README.md)

---

## 🎯 推荐工作流

```bash
# 开发/测试
npx hardhat node                    # 终端 1
npm run unified:validate            # 快速验证
npm run unified                     # 生成数据
npm run exp:all                     # 运行分析

# 生产/发布
npm run unified:config              # 使用优化配置
npm run exp:all                     # 运行分析
# 提交结果到版本控制
```

---

**提示**: 使用 `npm run` 查看所有可用命令
