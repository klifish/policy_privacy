# Policy Privacy Experiments - 文档中心

实验系统的完整文档索引。

---

## 📚 快速导航

### 🔧 重构文档
了解代码库结构和最近的改进

- [重构总结](refactoring/REFACTORING_SUMMARY.md) - 最近的重构改动和收益
- [重构计划](refactoring/REFACTORING_PLAN.md) - 完整的重构方案和未来优化建议

### 🔄 统一数据集流程
理解统一数据集的生成和使用

- [统一数据集 README](unified/README_UNIFIED_DATASET.md) - 总览
- [工作流程详解](unified/UNIFIED_DATASET_WORKFLOW.md) - 详细流程
- [生成策略](unified/GENERATION_STRATEGIES.md) - 数据生成策略
- [SPP & PI 挑战](unified/SPP_PI_CHALLENGE.md) - 特殊挑战说明

### 🎯 实验文档

#### Policy Content Hiding (PCH)
策略内容隐藏实验

**核心文档:**
- [README](pch/README.md) - 实验总览
- [快速开始](pch/QUICKSTART.md) - 快速入门指南
- [实验计划](pch/EXPERIMENT_PLAN.zh.md) - 详细实验计划
- [总结](pch/SUMMARY.md) - 实验结果总结

**技术文档:**
- [数据集生成工作流](pch/dataset_generation_workflow.md)
- [指标说明](pch/METRICS_EXPLANATION.md)
- [Dashboard 使用](pch/DASHBOARD_README.md)
- [改进建议](pch/IMPROVEMENT_RECOMMENDATIONS.md)
- [术语计数修正](pch/correct_term_counting.md)
- [ICD10 修复总结](pch/ICD10_FIX_SUMMARY.md)

**分析报告:**
- [隐私泄漏分析](pch/analysis/PRIVACY_LEAK_ANALYSIS.md)
- [最终分析报告](pch/analysis/FINAL_ANALYSIS_REPORT.md)
- [分析总结 (中文)](pch/analysis/ANALYSIS_SUMMARY_CN.md)
- [分析 README](pch/analysis/README_ANALYSIS.md)

#### Structure & Parameter Privacy (SPP)
结构和参数隐私实验

**核心文档:**
- [README](spp/README.md) - 实验总览
- [总结](spp/SUMMARY.md) - 实验结果总结
- [设计评估](spp/SPP_DESIGN_EVALUATION.md) - 设计评估报告

**技术文档:**
- [数据集生成工作流 (英文)](spp/dataset_generation_workflow_en.md)
- [数据集生成工作流 (中文)](spp/dataset_generation_workflow_zh.md)

#### Policy Indistinguishability (PI)
策略不可区分性实验

**核心文档:**
- [README](pi/README.md) - 实验总览
- [攻击层级报告](pi/ATTACK_LEVELS_REPORT.md) - 攻击分析报告

**技术文档:**
- [数据集生成工作流](pi/dataset_generation_workflow.md)

---

## 📖 文档组织结构

```
docs/
├── README.md                    # 本文件 - 文档索引
│
├── refactoring/                 # 重构相关文档
│   ├── REFACTORING_SUMMARY.md   # 重构总结
│   └── REFACTORING_PLAN.md      # 重构计划
│
├── unified/                     # 统一数据集文档
│   ├── README_UNIFIED_DATASET.md
│   ├── UNIFIED_DATASET_WORKFLOW.md
│   ├── GENERATION_STRATEGIES.md
│   └── SPP_PI_CHALLENGE.md
│
├── pch/                         # Policy Content Hiding
│   ├── README.md
│   ├── QUICKSTART.md
│   ├── SUMMARY.md
│   ├── ... (更多技术文档)
│   └── analysis/                # 分析报告
│       ├── PRIVACY_LEAK_ANALYSIS.md
│       └── ... (更多分析文档)
│
├── spp/                         # Structure & Parameter Privacy
│   ├── README.md
│   ├── SUMMARY.md
│   └── ... (技术文档)
│
└── pi/                          # Policy Indistinguishability
    ├── README.md
    ├── ATTACK_LEVELS_REPORT.md
    └── ... (技术文档)
```

---

## 🚀 快速开始路径

### 新用户入门
1. 阅读 [统一数据集 README](unified/README_UNIFIED_DATASET.md)
2. 查看 [工作流程详解](unified/UNIFIED_DATASET_WORKFLOW.md)
3. 选择感兴趣的实验:
   - PCH: [快速开始](pch/QUICKSTART.md)
   - SPP: [README](spp/README.md)
   - PI: [README](pi/README.md)

### 代码维护者
1. 了解 [重构总结](refactoring/REFACTORING_SUMMARY.md)
2. 参考 [重构计划](refactoring/REFACTORING_PLAN.md) 了解未来优化方向
3. 查看各实验的技术文档和工作流

### 研究人员
1. 阅读实验总结:
   - [PCH 总结](pch/SUMMARY.md)
   - [SPP 总结](spp/SUMMARY.md)
2. 查看详细分析报告:
   - [PCH 隐私泄漏分析](pch/analysis/PRIVACY_LEAK_ANALYSIS.md)
   - [SPP 设计评估](spp/SPP_DESIGN_EVALUATION.md)
   - [PI 攻击层级报告](pi/ATTACK_LEVELS_REPORT.md)

---

## 📝 文档更新日志

### 2025-12-04
- ✅ 整理所有文档到 `docs/` 目录
- ✅ 按实验类型分类组织
- ✅ 创建统一文档索引
- ✅ 添加快速导航和入门路径

---

## 🤝 贡献指南

### 添加新文档
1. 将文档放在对应的子目录:
   - 重构相关 → `refactoring/`
   - 统一数据集 → `unified/`
   - PCH 实验 → `pch/`
   - SPP 实验 → `spp/`
   - PI 实验 → `pi/`
   - 分析报告 → `pch/analysis/` 或相应实验的 `analysis/`

2. 更新本 README 的相关章节

3. 使用清晰的文件命名:
   - 总览类: `README.md`, `SUMMARY.md`
   - 指南类: `QUICKSTART.md`, `*_WORKFLOW.md`
   - 报告类: `*_REPORT.md`, `*_ANALYSIS.md`
   - 技术文档: `*_EXPLANATION.md`, `*_DESIGN.md`

---

## 📞 需要帮助?

- 查看相应实验的 README
- 参考工作流文档了解流程
- 阅读分析报告了解实验结果
