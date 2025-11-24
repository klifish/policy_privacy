/**
 * 分析策略数量 vs 执行样本数量的关系
 */

const execData = require('./results/execution_results.json');

console.log('=== 策略 vs 执行样本关系分析 ===\n');
console.log('总执行样本数:', execData.length);

// 检查是否有 policyId 或 policyIndex
const firstSample = execData[0];
console.log('\n第一个样本的完整结构:');
console.log(JSON.stringify(firstSample, null, 2));

// 尝试找出策略标识符
const hasPolicyId = 'policyId' in firstSample;
const hasPolicyIndex = 'policyIndex' in firstSample;
const hasExecutionIndex = 'executionIndex' in firstSample;

console.log('\n样本字段检查:');
console.log('  policyId:', hasPolicyId);
console.log('  policyIndex:', hasPolicyIndex);
console.log('  executionIndex:', hasExecutionIndex);

// 统计 DUO Term
const termCounts = {};
execData.forEach(d => {
  const term = d.duoTerm;
  if (term !== undefined && term !== null) {
    if (!termCounts[term]) termCounts[term] = 0;
    termCounts[term]++;
  }
});

console.log('\n=== DUO Term 分布 ===');
Object.keys(termCounts).sort((a,b) => a-b).forEach(term => {
  const count = termCounts[term];
  const pct = (count / execData.length * 100).toFixed(1);
  console.log(`Term ${term}: ${count} 个样本 (${pct}%)`);
});

// 分析样本来源
console.log('\n=== 关键问题分析 ===\n');

console.log('问题: 为什么 200 个样本的 Term 总数刚好是 200？\n');

console.log('可能的情况：\n');

console.log('【情况 1】每个样本 = 一个策略的一次执行');
console.log('  - 200 个样本 = 200 个不同的策略，每个执行 1 次');
console.log('  - 或者 N 个策略，每个执行 M 次，N × M = 200\n');

console.log('【情况 2】每个样本只计算一个主 DUO Term');
console.log('  - 即使策略包含多个 terms (如 [GR, DS])');
console.log('  - 评估时只选择其中一个作为主 term');
console.log('  - 所以 200 个样本 → 200 个 term 标签\n');

console.log('【情况 3】特征提取时展开了策略');
console.log('  - 一个包含 [GR, DS] 的策略');
console.log('  - 被拆分成两个样本：一个标记为 Term 0，一个标记为 Term 1');
console.log('  - 但这样的话 term 总数应该 > 样本数\n');

// 尝试验证
console.log('=== 验证 ===\n');

if (hasPolicyId || hasPolicyIndex) {
  const policyKey = hasPolicyId ? 'policyId' : 'policyIndex';
  const policyIds = execData.map(d => d[policyKey]);
  const uniquePolicies = new Set(policyIds);

  console.log(`唯一策略数 (通过 ${policyKey}):`, uniquePolicies.size);
  console.log('总样本数:', execData.length);
  console.log('每个策略平均执行次数:', (execData.length / uniquePolicies.size).toFixed(1));

  // 统计每个策略的执行次数
  const policyExecCounts = {};
  policyIds.forEach(id => {
    if (!policyExecCounts[id]) policyExecCounts[id] = 0;
    policyExecCounts[id]++;
  });

  const execCountDist = {};
  Object.values(policyExecCounts).forEach(count => {
    if (!execCountDist[count]) execCountDist[count] = 0;
    execCountDist[count]++;
  });

  console.log('\n每个策略的执行次数分布:');
  Object.keys(execCountDist).sort((a,b) => a-b).forEach(count => {
    const numPolicies = execCountDist[count];
    console.log(`  执行 ${count} 次: ${numPolicies} 个策略`);
  });
} else {
  console.log('样本中没有 policyId 或 policyIndex 字段');
  console.log('无法区分不同的策略');
}

// 检查是否所有样本的 duoTerm 都不同
const uniqueTerms = new Set(execData.map(d => d.duoTerm));
console.log('\n唯一的 DUO Term 值:', Array.from(uniqueTerms).sort());
console.log('是否每个样本都有不同的 term?', uniqueTerms.size === execData.length ? '是' : '否');
