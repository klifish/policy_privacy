# 断点续传功能改进

## 问题描述

在之前的实现中，当执行策略时被中断后，使用 `--resume` 参数恢复时会重新生成数据集。这导致：
1. 浪费时间重新生成相同的数据集
2. 可能生成不同的数据集（如果没有使用 `--seed`）
3. 无法保证完全恢复到中断前的状态

## 解决方案

修改了断点续传机制，使其完全保存和恢复中断前的上下文：

### 1. Checkpoint 中保存数据集

在 `executeDatasetWithProgress` 函数中，每 10 次执行保存 checkpoint 时，现在会包含完整的数据集：

```javascript
// 保存 checkpoint 时包含数据集
saveCheckpoint(checkpointPath, 'execution', 'executing_dataset', {
  lastIndex: i,
  results,
  dataset  // 保存数据集以便完全恢复上下文
});
```

### 2. 恢复时的三级策略

Phase 1 现在使用三级策略来获取数据集：

1. **优先级 1**: 从 checkpoint 中恢复数据集
   ```javascript
   if (config.resume && checkpointPath) {
     const checkpoint = loadCheckpoint(checkpointPath);
     if (checkpoint && checkpoint.data && checkpoint.data.dataset) {
       dataset = checkpoint.data.dataset;
       console.log(`Resuming with dataset from checkpoint`);
     }
   }
   ```

2. **优先级 2**: 从已保存的数据集文件加载
   ```javascript
   if (!dataset && fs.existsSync(datasetOutputPath)) {
     dataset = JSON.parse(fs.readFileSync(datasetOutputPath, 'utf8'));
     console.log(`Loaded existing dataset from ${datasetOutputPath}`);
   }
   ```

3. **优先级 3**: 生成新数据集（仅在前两者都不可用时）
   ```javascript
   if (!dataset) {
     dataset = await generateDataset(datasetConfig);
     console.log(`Dataset saved to: ${datasetOutputPath}`);
   }
   ```

## 使用示例

### 场景 1: 中断后恢复

```bash
# 首次运行，在执行过程中被中断
node run_experiment.js --policy-count 10 --executions-per-policy 2

# 使用 --resume 恢复，将使用相同的数据集
node run_experiment.js --policy-count 10 --executions-per-policy 2 --resume
```

### 场景 2: 使用自定义 checkpoint 路径

```bash
# 首次运行
node run_experiment.js --checkpoint ./my_checkpoint.json

# 恢复时指定相同的 checkpoint 路径
node run_experiment.js --checkpoint ./my_checkpoint.json --resume
```

## 优势

1. **完全的上下文恢复**: 使用中断前完全相同的数据集
2. **节省时间**: 不需要重新生成数据集
3. **确定性**: 保证恢复后的行为与中断前一致
4. **灵活性**: 即使 checkpoint 不存在，也会尝试从数据集文件加载

## 注意事项

- Checkpoint 文件会在成功完成后自动删除
- 如果想从头开始重新运行，删除 checkpoint 文件和数据集文件即可
- 建议在长时间运行的实验中始终使用 `--resume` 参数
