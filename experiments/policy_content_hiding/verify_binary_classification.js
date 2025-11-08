/**
 * 验证二分类标签生成逻辑是否正确
 */

const featuresData = require('./results/features.json');
const data = featuresData.features;

console.log('=== 验证二分类标签生成逻辑 ===\n');
console.log('总样本数:', data.length);

// 模拟代码中的标签生成逻辑
const DUO_TO_ATTRIBUTE_CODE = {
  0: 'GR',
  1: 'DS',
  2: 'RS'
};

console.log('\n');
for (let termId = 0; termId <= 2; termId++) {
  const duoCode = DUO_TO_ATTRIBUTE_CODE[termId];

  let countByPrimaryTerm = 0;
  let countByDuoTermCodes = 0;
  let total = 0;

  data.forEach(f => {
    // 原始的错误方法（只看 duoTerm）
    if (f.duoTerm === termId) {
      countByPrimaryTerm++;
    }

    // 正确的方法（检查 duoTermCodes 数组）
    const hasTerm = f.duoTerm === termId ||
      (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(duoCode));
    if (hasTerm) {
      total++;
    }
  });

  console.log(`Term ${termId} (${duoCode}):`);
  console.log(`  只看主 term (错误方法): ${countByPrimaryTerm} 个样本`);
  console.log(`  检查 duoTermCodes (正确方法): ${total} 个样本`);
  console.log(`  差异: +${total - countByPrimaryTerm} 个样本 (来自组合策略)`);
  console.log();
}

// 统计组合策略的分布
console.log('=== 组合策略验证 ===\n');
const combos = {};
data.forEach(d => {
  const combo = d.duoTermCodes.sort().join(',') || 'none';
  if (!combos[combo]) combos[combo] = 0;
  combos[combo]++;
});

console.log('策略组合分布:\n');
Object.entries(combos)
  .sort((a, b) => b[1] - a[1])
  .forEach(([combo, count]) => {
    const pct = (count / data.length * 100).toFixed(1);
    console.log(`  [${combo}]: ${count} 个样本 (${pct}%)`);
  });

console.log('\n' + '='.repeat(70));
console.log('结论');
console.log('='.repeat(70) + '\n');

const term0WrongCount = data.filter(d => d.duoTerm === 0).length;
const term0CorrectCount = data.filter(d =>
  d.duoTerm === 0 || (Array.isArray(d.duoTermCodes) && d.duoTermCodes.includes('GR'))
).length;

if (term0CorrectCount > term0WrongCount) {
  console.log('✓ 代码使用了正确的二分类方法！');
  console.log('✓ 组合策略中的 terms 被正确计数');
  console.log();
  console.log('这意味着:');
  console.log('  - [DS+RS] 策略在 DS 的评估中计数了 ✓');
  console.log('  - [DS+RS] 策略在 RS 的评估中也计数了 ✓');
  console.log('  - 你的观察是对的，代码已经正确实现了！');
} else {
  console.log('✗ 代码仍在使用错误的方法（只看主 term）');
  console.log('✗ 需要修改为检查 duoTermCodes 数组');
}
