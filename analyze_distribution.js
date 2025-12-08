const data = require('./experiments/unified/artifacts_data/spp_dataset.json');

console.log('='.repeat(60));
console.log('SPP Dataset Distribution Analysis');
console.log('='.repeat(60));
console.log();

// 基本统计
console.log('📊 Basic Statistics:');
console.log('  Total executions:', data.length);
const uniquePolicies = new Set(data.map(d => d.policyId)).size;
console.log('  Unique policies:', uniquePolicies);
console.log('  Executions per policy:', (data.length / uniquePolicies).toFixed(2));
console.log();

// 1. structureType分布
console.log('🏗️  structureType Distribution:');
const structureTypes = {};
data.forEach(d => {
  structureTypes[d.structureType] = (structureTypes[d.structureType] || 0) + 1;
});
const totalStructure = Object.values(structureTypes).reduce((a,b) => a+b, 0);
Object.entries(structureTypes).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
  const pct = (count / totalStructure * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / 20));
  console.log(`  ${type.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
});
console.log();

// 计算不平衡比例
const structValues = Object.values(structureTypes).sort((a,b) => b-a);
const structImbalance = structValues[0] / structValues[structValues.length - 1];
console.log(`  Imbalance ratio: ${structImbalance.toFixed(2)}:1 (${structImbalance < 1.5 ? '✅ Good' : structImbalance < 3 ? '⚠️  Moderate' : '❌ High'})`);
console.log();

// 2. predicateCombo分布
console.log('🔍 predicateCombo Distribution:');
const predicateCombos = {};
data.forEach(d => {
  predicateCombos[d.predicateCombo] = (predicateCombos[d.predicateCombo] || 0) + 1;
});
const totalPredicate = Object.values(predicateCombos).reduce((a,b) => a+b, 0);
Object.entries(predicateCombos).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
  const pct = (count / totalPredicate * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / 20));
  console.log(`  ${type.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
});
console.log();

const predValues = Object.values(predicateCombos).sort((a,b) => b-a);
const predImbalance = predValues[0] / predValues[predValues.length - 1];
console.log(`  Imbalance ratio: ${predImbalance.toFixed(2)}:1 (${predImbalance < 1.5 ? '✅ Good' : predImbalance < 3 ? '⚠️  Moderate' : '❌ High'})`);
console.log();

// 3. paramType分布
console.log('⚙️  paramType Distribution:');
const paramTypes = {};
data.forEach(d => {
  paramTypes[d.paramType] = (paramTypes[d.paramType] || 0) + 1;
});
const totalParam = Object.values(paramTypes).reduce((a,b) => a+b, 0);
Object.entries(paramTypes).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
  const pct = (count / totalParam * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / 20));
  console.log(`  ${type.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
});
console.log();

const paramValues = Object.values(paramTypes).sort((a,b) => b-a);
const paramImbalance = paramValues[0] / paramValues[paramValues.length - 1];
console.log(`  Imbalance ratio: ${paramImbalance.toFixed(2)}:1 (${paramImbalance < 1.5 ? '✅ Good' : paramImbalance < 3 ? '⚠️  Moderate' : '❌ High'})`);
console.log();

// 4. 交叉分布分析
console.log('🔀 Cross-Distribution Analysis:');
console.log();
console.log('structureType × predicateCombo:');
const cross1 = {};
data.forEach(d => {
  const key = `${d.structureType}|${d.predicateCombo}`;
  cross1[key] = (cross1[key] || 0) + 1;
});
const matrix1 = {};
Object.entries(cross1).forEach(([key, count]) => {
  const [st, pc] = key.split('|');
  if (!matrix1[st]) matrix1[st] = {};
  matrix1[st][pc] = count;
});
console.log('                     none  single  few   many');
Object.keys(structureTypes).sort().forEach(st => {
  const row = ['none', 'single', 'few', 'many'].map(pc =>
    (matrix1[st]?.[pc] || 0).toString().padStart(5)
  ).join('  ');
  console.log(`  ${st.padEnd(18)} ${row}`);
});
console.log();

console.log('structureType × paramType:');
const cross2 = {};
data.forEach(d => {
  const key = `${d.structureType}|${d.paramType}`;
  cross2[key] = (cross2[key] || 0) + 1;
});
const matrix2 = {};
Object.entries(cross2).forEach(([key, count]) => {
  const [st, pt] = key.split('|');
  if (!matrix2[st]) matrix2[st] = {};
  matrix2[st][pt] = count;
});
console.log('                     none  small  medium  large');
Object.keys(structureTypes).sort().forEach(st => {
  const row = ['none', 'small', 'medium', 'large'].map(pt =>
    (matrix2[st]?.[pt] || 0).toString().padStart(6)
  ).join('  ');
  console.log(`  ${st.padEnd(18)} ${row}`);
});
console.log();

// 5. 特征统计
console.log('📈 Feature Statistics:');
const features = [
  'commitGasUsed',
  'accessGasUsed',
  'proofSize',
  'commitLogsCount',
  'accessLogsCount'
];

features.forEach(feat => {
  const values = data.map(d => d.features[feat]).filter(v => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a,b) => a+b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length);
  const cv = (std / avg * 100).toFixed(1); // Coefficient of variation
  const range = max - min;
  const rangeRatio = (range / min * 100).toFixed(1);

  console.log(`  ${feat.padEnd(20)}`);
  console.log(`    Range: [${min.toLocaleString()}, ${max.toLocaleString()}] (${rangeRatio}% variation)`);
  console.log(`    Mean ± Std: ${avg.toFixed(0)} ± ${std.toFixed(0)}`);
  console.log(`    CV: ${cv}%`);
});
console.log();

// 6. 检查异常值
console.log('🚨 Outlier Detection:');
console.log();

// 对每个特征进行z-score分析
const outliers = [];
features.forEach(feat => {
  const values = data.map(d => d.features[feat]).filter(v => v != null);
  const avg = values.reduce((a,b) => a+b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length);

  data.forEach((d, idx) => {
    const val = d.features[feat];
    if (val != null) {
      const zscore = Math.abs((val - avg) / std);
      if (zscore > 3) {  // 3-sigma rule
        outliers.push({
          index: idx,
          policyId: d.policyId,
          feature: feat,
          value: val,
          zscore: zscore.toFixed(2),
          structureType: d.structureType,
          predicateCombo: d.predicateCombo,
          paramType: d.paramType
        });
      }
    }
  });
});

if (outliers.length > 0) {
  console.log(`Found ${outliers.length} outlier(s) with z-score > 3:`);

  // 按index分组
  const byIndex = {};
  outliers.forEach(o => {
    if (!byIndex[o.index]) {
      byIndex[o.index] = {
        index: o.index,
        policyId: o.policyId,
        structureType: o.structureType,
        predicateCombo: o.predicateCombo,
        paramType: o.paramType,
        features: []
      };
    }
    byIndex[o.index].features.push({
      feature: o.feature,
      value: o.value,
      zscore: o.zscore
    });
  });

  Object.values(byIndex).forEach(o => {
    console.log(`\n  Sample #${o.index} (${o.structureType} / ${o.predicateCombo} / ${o.paramType}):`);
    o.features.forEach(f => {
      console.log(`    ${f.feature.padEnd(20)}: ${f.value.toLocaleString().padStart(10)} (z=${f.zscore})`);
    });
  });
} else {
  console.log('✅ No significant outliers detected (z-score > 3)');
}
console.log();

// 7. 数据质量评估
console.log('='.repeat(60));
console.log('📋 Data Quality Assessment:');
console.log('='.repeat(60));
console.log();

// 平衡性评分
function getBalanceScore(imbalance) {
  if (imbalance < 1.5) return { score: 5, label: '✅ Excellent' };
  if (imbalance < 2.0) return { score: 4, label: '✅ Good' };
  if (imbalance < 3.0) return { score: 3, label: '⚠️  Moderate' };
  if (imbalance < 4.0) return { score: 2, label: '❌ Poor' };
  return { score: 1, label: '❌ Very Poor' };
}

const structBalance = getBalanceScore(structImbalance);
const predBalance = getBalanceScore(predImbalance);
const paramBalance = getBalanceScore(paramImbalance);

console.log('Class Balance:');
console.log(`  structureType:   ${structBalance.label} (${structImbalance.toFixed(2)}:1)`);
console.log(`  predicateCombo:  ${predBalance.label} (${predImbalance.toFixed(2)}:1)`);
console.log(`  paramType:       ${paramBalance.label} (${paramImbalance.toFixed(2)}:1)`);
console.log();

const avgBalance = (structBalance.score + predBalance.score + paramBalance.score) / 3;
console.log(`Overall Balance Score: ${avgBalance.toFixed(1)}/5.0`);
console.log();

// 样本大小评估
console.log('Sample Size:');
console.log(`  Total samples: ${data.length} ${data.length >= 500 ? '✅' : data.length >= 300 ? '⚠️' : '❌'}`);
console.log(`  Unique policies: ${uniquePolicies} ${uniquePolicies >= 100 ? '✅' : uniquePolicies >= 50 ? '⚠️' : '❌'}`);
console.log(`  Minimum class size: ${Math.min(...Object.values(structureTypes), ...Object.values(predicateCombos), ...Object.values(paramTypes))} ${Math.min(...Object.values(structureTypes), ...Object.values(predicateCombos), ...Object.values(paramTypes)) >= 100 ? '✅' : '⚠️'}`);
console.log();

console.log('='.repeat(60));
