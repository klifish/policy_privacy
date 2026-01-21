/**
 * 分析 DUO Term 在生成的数据集中的分布
 */

const fs = require('fs');

// 读取最新的数据集
const files = fs.readdirSync('./results')
  .filter(f => f.startsWith('dataset_') && f.endsWith('.json'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.log('没有找到数据集文件');
  process.exit(1);
}

const latestFile = files[0];
console.log('分析数据集:', latestFile);
console.log('='.repeat(70));
console.log();

const dataset = JSON.parse(fs.readFileSync(`./results/${latestFile}`, 'utf8'));

console.log(`总策略数: ${dataset.length}`);
console.log();

// 统计每个策略的 DUO Term
const duoTermCounts = {};
const duoTermsByPolicy = [];

dataset.forEach((policy, idx) => {
  // 从策略的属性中提取 DUO Terms
  const duoTerms = new Set();

  // 查找策略中包含的 DUO attributes
  if (policy.duoAttributes) {
    policy.duoAttributes.forEach(attr => {
      if (attr.code === 'GR') duoTerms.add(0);
      if (attr.code === 'DS') duoTerms.add(1);
      if (attr.code === 'RS') duoTerms.add(2);
      if (attr.code === 'POA') duoTerms.add(3);
      if (attr.code === 'GS') duoTerms.add(4);
      if (attr.code === 'CC') duoTerms.add(5);
    });
  }

  duoTermsByPolicy.push({
    policyIndex: idx,
    duoTerms: Array.from(duoTerms).sort(),
    duoAttributes: policy.duoAttributes
  });

  // 统计每个 term 出现的次数
  duoTerms.forEach(term => {
    if (!duoTermCounts[term]) duoTermCounts[term] = 0;
    duoTermCounts[term]++;
  });
});

console.log('='.repeat(70));
console.log('DUO Term 分布统计');
console.log('='.repeat(70));
console.log();

const termNames = {
  0: 'Term 0 (GR - General Research)',
  1: 'Term 1 (DS - Disease Specific)',
  2: 'Term 2 (RS - Research Specific)',
  3: 'Term 3 (POA - Population Ancestry)',
  4: 'Term 4 (GS - Geographical Restriction)',
  5: 'Term 5 (CC - Clinical Care)'
};

Object.keys(duoTermCounts).sort().forEach(term => {
  const count = duoTermCounts[term];
  const percentage = (count / dataset.length * 100).toFixed(1);
  console.log(`${termNames[term]}`);
  console.log(`  出现次数: ${count}/${dataset.length} (${percentage}%)`);
  console.log();
});

console.log('='.repeat(70));
console.log('策略组合模式分析');
console.log('='.repeat(70));
console.log();

const comboCounts = {};
duoTermsByPolicy.forEach(({ duoTerms }) => {
  const comboKey = duoTerms.join(',') || 'empty';
  if (!comboCounts[comboKey]) comboCounts[comboKey] = 0;
  comboCounts[comboKey]++;
});

console.log('策略中的 DUO Term 组合分布：\n');
Object.entries(comboCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([combo, count]) => {
    const percentage = (count / dataset.length * 100).toFixed(1);
    const terms = combo === 'empty' ? '(无 DUO terms)' :
                  combo.split(',').map(t => termNames[t]).join(' + ');
    console.log(`${terms}`);
    console.log(`  策略数: ${count} (${percentage}%)`);
    console.log();
  });

console.log('='.repeat(70));
console.log('前5个策略示例');
console.log('='.repeat(70));
console.log();

duoTermsByPolicy.slice(0, 5).forEach(({ policyIndex, duoTerms, duoAttributes }) => {
  console.log(`策略 ${policyIndex + 1}:`);
  console.log(`  DUO Terms: ${duoTerms.map(t => termNames[t]).join(', ') || '无'}`);
  if (duoAttributes && duoAttributes.length > 0) {
    console.log(`  属性详情:`);
    duoAttributes.forEach(attr => {
      console.log(`    - ${attr.code}: ${JSON.stringify(attr)}`);
    });
  }
  console.log();
});

console.log('='.repeat(70));
console.log('结论');
console.log('='.repeat(70));
console.log();

console.log('数据生成策略分析：');
console.log('  1. 策略总数:', dataset.length);
console.log('  2. 是否均匀分布?',
  Math.max(...Object.values(duoTermCounts)) - Math.min(...Object.values(duoTermCounts)) < 20 ? '是' : '否');
console.log('  3. 最常见组合:',
  Object.entries(comboCounts).sort((a, b) => b[1] - a[1])[0][0]);
console.log();
