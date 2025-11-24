/**
 * 解释 Ontology Namespace 模式泄露
 */

const data = require('./results/execution_results_200_testnet.json');

console.log('总样本数:', data.length);
console.log('\n' + '='.repeat(70));
console.log('示例：前5个样本的数据');
console.log('='.repeat(70) + '\n');

// 显示前5个样本的关键信息
data.slice(0, 5).forEach((sample, idx) => {
  console.log(`样本 ${idx + 1}:`);
  console.log(`  DUO Term: ${sample.duoTerm}`);
  console.log(`  Ontology Namespace: ${sample.ontologyNamespace || 'null'}`);
  console.log(`  Ontology Value: ${sample.ontologyValue || 'null'}`);
  console.log(`  Commit Gas: ${sample.commitGasUsed}`);
  console.log(`  Access Gas: ${sample.accessGasUsed}`);
  console.log();
});

console.log('='.repeat(70));
console.log('关键统计：Ontology Namespace 分布');
console.log('='.repeat(70) + '\n');

// 统计各个 term 的 ontology 分布
const stats = {};
data.forEach(sample => {
  const term = sample.duoTerm;
  const ont = sample.ontologyNamespace || 'null';
  if (!stats[term]) stats[term] = {};
  if (!stats[term][ont]) stats[term][ont] = 0;
  stats[term][ont]++;
});

Object.keys(stats).sort().forEach(term => {
  const termTotal = Object.values(stats[term]).reduce((a,b) => a+b, 0);
  console.log(`Term ${term}: 共 ${termTotal} 个样本`);
  Object.keys(stats[term]).forEach(ont => {
    const count = stats[term][ont];
    const pct = (count / termTotal * 100).toFixed(1);
    console.log(`  ${ont.padEnd(10)}: ${count.toString().padStart(3)} 样本 (${pct.padStart(5)}%)`);
  });
  console.log();
});

console.log('='.repeat(70));
console.log('泄露分析');
console.log('='.repeat(70) + '\n');

console.log('【问题】：为什么这是隐私泄露？\n');

console.log('观察到的模式：');
console.log('  1. Term 0 可以有 null、ICD10 或 OBI（混合）');
console.log('  2. Term 1 只能有 ICD10（100%）');
console.log('  3. Term 2 只能有 OBI（100%）\n');

console.log('攻击者的推理：');
console.log('  如果观察到 ontologyNamespace = null:');
console.log('    → 100% 确定是 Term 0');
console.log('  如果观察到 ontologyNamespace = ICD10:');
console.log('    → 可能是 Term 0 或 Term 1');
console.log('  如果观察到 ontologyNamespace = OBI:');
console.log('    → 可能是 Term 0 或 Term 2\n');

console.log('【关键问题】：攻击者能否观察到 ontologyNamespace？\n');

console.log('答案：不能直接观察，但可以间接推断！\n');

console.log('间接泄露渠道：');
console.log('  1. Gas 消耗模式：不同 ontology 类型可能导致不同的 gas 使用');
console.log('  2. Proof 大小：有 ontology 的 proof 可能与没有 ontology 的不同');
console.log('  3. 调用数据大小：calldata 可能有微小差异');
console.log('  4. 事件日志：不同 ontology 可能触发不同的链上事件\n');

// 分析 gas 模式
console.log('='.repeat(70));
console.log('Gas 消耗分析：验证间接泄露');
console.log('='.repeat(70) + '\n');

const gasStats = {};
data.forEach(sample => {
  const term = sample.duoTerm;
  const ont = sample.ontologyNamespace || 'null';
  const key = `Term ${term} - ${ont}`;
  if (!gasStats[key]) gasStats[key] = [];
  gasStats[key].push(sample.commitGasUsed);
});

Object.keys(gasStats).sort().forEach(key => {
  const values = gasStats[key];
  const mean = values.reduce((a,b) => a+b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);

  console.log(`${key}:`);
  console.log(`  样本数: ${values.length}`);
  console.log(`  平均 Gas: ${mean.toFixed(0)}`);
  console.log(`  标准差: ${std.toFixed(2)}`);
  console.log(`  范围: ${Math.min(...values)} - ${Math.max(...values)}`);
  console.log();
});

console.log('='.repeat(70));
console.log('结论');
console.log('='.repeat(70) + '\n');

console.log('1. 虽然 ontologyNamespace 没有直接暴露在区块链上');
console.log('2. 但不同的 ontology 类型导致了可观察的行为差异');
console.log('3. 机器学习模型可以学习这些模式来推断 DUO Term');
console.log('4. 这就是"间接侧信道攻击"或"模式泄露"\n');

console.log('修复方向：');
console.log('  - 让所有 term 都有相同的 ontology 分布');
console.log('  - 或者消除不同 ontology 类型之间的可观察差异');
console.log('  - 增强 gas padding 使得 null/ICD10/OBI 的 gas 消耗完全相同\n');
