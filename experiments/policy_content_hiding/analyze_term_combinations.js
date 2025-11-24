/**
 * 分析 duoTerm vs duoTerms 的关系
 */

const data = require('./results/execution_results.json');

console.log('=== 核心发现：duoTerm vs duoTerms ===\n');

// 分析前 10 个样本
console.log('前 10 个样本的 DUO Term 信息:\n');
data.slice(0, 10).forEach((d, i) => {
  console.log(`样本 ${i+1}:`);
  console.log(`  policyId: ${d.policyId}`);
  console.log(`  duoTerm (单数): ${d.duoTerm}`);
  console.log(`  duoTerms (数组): [${d.duoTerms.join(', ')}]`);
  console.log(`  duoTermCodes: [${d.duoTermCodes.join(', ')}]`);
  console.log(`  包含的 term 数量: ${d.duoTerms.length}`);
  console.log();
});

// 统计包含多个 term 的策略
console.log('=== 统计包含多个 DUO Term 的策略 ===\n');
const termCountDist = {};
data.forEach(d => {
  const count = d.duoTerms.length;
  if (!termCountDist[count]) termCountDist[count] = 0;
  termCountDist[count]++;
});

Object.keys(termCountDist).sort((a,b) => a-b).forEach(count => {
  const num = termCountDist[count];
  const pct = (num / data.length * 100).toFixed(1);
  console.log(`包含 ${count} 个 term 的策略: ${num} 个 (${pct}%)`);
});

// 统计所有的 term 组合
console.log('\n=== DUO Term 组合分析 ===\n');
const combos = {};
data.forEach(d => {
  const combo = d.duoTerms.slice().sort().join(',');
  if (!combos[combo]) {
    combos[combo] = {
      count: 0,
      codes: d.duoTermCodes.join('+'),
      samples: []
    };
  }
  combos[combo].count++;
  combos[combo].samples.push({
    policyId: d.policyId,
    primaryTerm: d.duoTerm
  });
});

Object.entries(combos)
  .sort((a, b) => b[1].count - a[1].count)
  .forEach(([combo, info]) => {
    const pct = (info.count / data.length * 100).toFixed(1);
    console.log(`[${combo}] (${info.codes}):`);
    console.log(`  策略数: ${info.count} (${pct}%)`);

    // 检查主 term 是如何选择的
    const primaryTerms = {};
    info.samples.forEach(s => {
      if (!primaryTerms[s.primaryTerm]) primaryTerms[s.primaryTerm] = 0;
      primaryTerms[s.primaryTerm]++;
    });

    console.log(`  主 term (duoTerm) 分布:`);
    Object.keys(primaryTerms).sort().forEach(term => {
      console.log(`    Term ${term}: ${primaryTerms[term]} 次`);
    });
    console.log();
  });

// 关键问题分析
console.log('='.repeat(70));
console.log('关键问题解答');
console.log('='.repeat(70));
console.log();

console.log('问题: 为什么 200 个样本的 Term 总数刚好是 200？\n');

const singleTermPolicies = data.filter(d => d.duoTerms.length === 1).length;
const multiTermPolicies = data.filter(d => d.duoTerms.length > 1).length;

console.log('答案: 因为每个样本只计算一个主 DUO Term！\n');

console.log('数据验证:');
console.log(`  - 单 term 策略: ${singleTermPolicies} 个 (${(singleTermPolicies/data.length*100).toFixed(1)}%)`);
console.log(`  - 多 term 策略: ${multiTermPolicies} 个 (${(multiTermPolicies/data.length*100).toFixed(1)}%)`);
console.log(`  - 总样本数: ${data.length}`);
console.log();

console.log('解释:');
console.log('  1. 数据集包含两种策略:');
console.log('     - Singleton 层: 只有一个 term，如 [GR], [DS], [RS]');
console.log('     - Pair 层: 有两个 term，如 [GR, DS], [GR, RS], [DS, RS]');
console.log();
console.log('  2. 对于多 term 策略（如 [GR, DS]）:');
console.log('     - duoTerms 数组包含所有 term: [0, 1]');
console.log('     - 但 duoTerm (单数) 只选择其中一个作为"主 term"');
console.log('     - 在评估时只用这个主 term 作为标签');
console.log();
console.log('  3. 因此:');
console.log('     - 200 个策略 × 1 次执行 = 200 个样本');
console.log('     - 每个样本只有 1 个主 term 标签');
console.log('     - 所以总共计数是 200 个 term');
console.log();

// 计算如果展开所有 terms 会有多少
const totalTerms = data.reduce((sum, d) => sum + d.duoTerms.length, 0);
console.log('如果每个策略的所有 terms 都计数:');
console.log(`  总 term 出现次数应该是: ${totalTerms}`);
console.log(`  但实际只计数主 term，所以是: ${data.length}`);
console.log(`  差异: ${totalTerms - data.length} 个 term 被"忽略"了\n`);

// 分析主 term 是如何选择的
console.log('=== 主 term 选择规则分析 ===\n');

const multiTermSamples = data.filter(d => d.duoTerms.length > 1);
if (multiTermSamples.length > 0) {
  console.log('多 term 策略示例:\n');
  multiTermSamples.slice(0, 5).forEach((d, i) => {
    console.log(`示例 ${i+1}:`);
    console.log(`  策略包含: [${d.duoTerms.join(', ')}] (${d.duoTermCodes.join(', ')})`);
    console.log(`  选择的主 term: ${d.duoTerm} (${d.duoTermCodes[d.duoTerms.indexOf(d.duoTerm)]})`);
    console.log();
  });

  console.log('规律检查:');
  const isAlwaysFirst = multiTermSamples.every(d => d.duoTerm === d.duoTerms[0]);
  const isAlwaysSmallest = multiTermSamples.every(d => d.duoTerm === Math.min(...d.duoTerms));

  console.log(`  - 总是选择第一个 term? ${isAlwaysFirst ? '是' : '否'}`);
  console.log(`  - 总是选择最小的 term? ${isAlwaysSmallest ? '是' : '否'}`);
}
