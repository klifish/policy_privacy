const fs = require('fs');

console.log('=== Policy Content Hiding Gas 分析 ===\n');

// Load dataset
const dataset = JSON.parse(fs.readFileSync('experiments/unified/artifacts_data/pch_dataset.json', 'utf8'));

console.log(`总样本数: ${dataset.length}\n`);

// Group by DUO term
const byTerm = {};
dataset.forEach(d => {
  const term = d.duoTerm;
  if (!byTerm[term]) byTerm[term] = [];
  byTerm[term].push(d);
});

console.log('=== 样本分布 ===\n');
Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const count = byTerm[term].length;
  const pct = (count / dataset.length * 100).toFixed(1);
  console.log(`Term ${term}: ${count.toString().padStart(3)} 样本 (${pct.padStart(5)}%)`);
});

// Analyze gas by term
console.log('\n=== Gas 统计 (按 Term 分类) ===\n');

function calculateStats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    range: sorted[sorted.length - 1] - sorted[0],
    mean: mean,
    median: sorted[Math.floor(sorted.length / 2)],
    std: std,
    count: values.length
  };
}

console.log('Commit Gas:');
console.log('Term | Count | Mean      | Std       | Min       | Max       | Range');
console.log('-----|-------|-----------|-----------|-----------|-----------|----------');

const commitStats = {};
Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const samples = byTerm[term];
  const commitGas = samples.map(s => parseInt(s.features?.commitGasUsed)).filter(x => x && !isNaN(x));
  const stats = calculateStats(commitGas);
  commitStats[term] = stats;

  if (stats) {
    console.log(
      `${term.padStart(4)} | ${stats.count.toString().padStart(5)} | ` +
      `${stats.mean.toFixed(0).padStart(9)} | ${stats.std.toFixed(2).padStart(9)} | ` +
      `${stats.min.toLocaleString().padStart(9)} | ${stats.max.toLocaleString().padStart(9)} | ` +
      `${stats.range.toLocaleString().padStart(9)}`
    );
  }
});

console.log('\nAccess Gas:');
console.log('Term | Count | Mean      | Std       | Min       | Max       | Range');
console.log('-----|-------|-----------|-----------|-----------|-----------|----------');

const accessStats = {};
Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const samples = byTerm[term];
  const accessGas = samples.map(s => parseInt(s.features?.accessGasUsed)).filter(x => x && !isNaN(x));
  const stats = calculateStats(accessGas);
  accessStats[term] = stats;

  if (stats) {
    console.log(
      `${term.padStart(4)} | ${stats.count.toString().padStart(5)} | ` +
      `${stats.mean.toFixed(0).padStart(9)} | ${stats.std.toFixed(2).padStart(9)} | ` +
      `${stats.min.toLocaleString().padStart(9)} | ${stats.max.toLocaleString().padStart(9)} | ` +
      `${stats.range.toLocaleString().padStart(9)}`
    );
  }
});

// Check for unique gas values
console.log('\n=== 独特 Gas 值检测 ===\n');

const commitGasByTerm = {};
const accessGasByTerm = {};

Object.keys(byTerm).forEach(term => {
  commitGasByTerm[term] = new Set(
    byTerm[term].map(s => parseInt(s.features?.commitGasUsed)).filter(x => x && !isNaN(x))
  );
  accessGasByTerm[term] = new Set(
    byTerm[term].map(s => parseInt(s.features?.accessGasUsed)).filter(x => x && !isNaN(x))
  );
});

console.log('Commit Gas 独特值:');
let foundCommitUnique = false;
Object.keys(commitGasByTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const uniqueToThisTerm = [];
  commitGasByTerm[term].forEach(gas => {
    let isUnique = true;
    Object.keys(commitGasByTerm).forEach(otherTerm => {
      if (otherTerm !== term && commitGasByTerm[otherTerm].has(gas)) {
        isUnique = false;
      }
    });
    if (isUnique) uniqueToThisTerm.push(gas);
  });

  if (uniqueToThisTerm.length > 0) {
    foundCommitUnique = true;
    console.log(`  Term ${term}: ${uniqueToThisTerm.length} 个独特值`);
    const sorted = uniqueToThisTerm.sort((a,b) => a-b);
    console.log(`    范围: ${sorted[0].toLocaleString()} - ${sorted[sorted.length-1].toLocaleString()}`);
    if (uniqueToThisTerm.length <= 5) {
      console.log(`    值: ${sorted.map(v => v.toLocaleString()).join(', ')}`);
    }
  }
});
if (!foundCommitUnique) {
  console.log('  (所有 Term 的 Commit Gas 值都有重叠)');
}

console.log('\nAccess Gas 独特值:');
let foundAccessUnique = false;
Object.keys(accessGasByTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const uniqueToThisTerm = [];
  accessGasByTerm[term].forEach(gas => {
    let isUnique = true;
    Object.keys(accessGasByTerm).forEach(otherTerm => {
      if (otherTerm !== term && accessGasByTerm[otherTerm].has(gas)) {
        isUnique = false;
      }
    });
    if (isUnique) uniqueToThisTerm.push(gas);
  });

  if (uniqueToThisTerm.length > 0) {
    foundAccessUnique = true;
    console.log(`  Term ${term}: ${uniqueToThisTerm.length} 个独特值`);
    const sorted = uniqueToThisTerm.sort((a,b) => a-b);
    console.log(`    范围: ${sorted[0].toLocaleString()} - ${sorted[sorted.length-1].toLocaleString()}`);
    if (uniqueToThisTerm.length <= 5) {
      console.log(`    值: ${sorted.map(v => v.toLocaleString()).join(', ')}`);
    }
  }
});
if (!foundAccessUnique) {
  console.log('  (所有 Term 的 Access Gas 值都有重叠)');
}

// Outlier detection
console.log('\n=== 异常值检测 (±2σ) ===\n');

Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const samples = byTerm[term];
  const commitGas = samples.map(s => parseInt(s.features?.commitGasUsed)).filter(x => x && !isNaN(x));
  const stats = commitStats[term];

  if (!stats || stats.std < 100) return;

  const outliers = commitGas.filter(g => Math.abs(g - stats.mean) > 2 * stats.std);
  if (outliers.length > 0) {
    console.log(`Term ${term} Commit Gas 异常值: ${outliers.length} 个 (${(outliers.length/commitGas.length*100).toFixed(1)}%)`);
    const sorted = outliers.sort((a,b) => a-b);
    console.log(`  范围: ${sorted[0].toLocaleString()} - ${sorted[sorted.length-1].toLocaleString()}`);
    console.log(`  正常范围: ${(stats.mean - 2*stats.std).toFixed(0)} - ${(stats.mean + 2*stats.std).toFixed(0)}`);
  }
});

// Distribution overlap analysis
console.log('\n=== Gas 分布重叠分析 ===\n');

function calculateOverlap(set1, set2) {
  const vals1 = Array.from(set1);
  const vals2 = Array.from(set2);

  const min1 = Math.min(...vals1);
  const max1 = Math.max(...vals1);
  const min2 = Math.min(...vals2);
  const max2 = Math.max(...vals2);

  const overlapStart = Math.max(min1, min2);
  const overlapEnd = Math.min(max1, max2);

  if (overlapStart >= overlapEnd) return 0;

  const overlap = overlapEnd - overlapStart;
  const union = Math.max(max1, max2) - Math.min(min1, min2);

  return overlap / union;
}

console.log('Commit Gas 范围重叠率 (Term 对比):');
const terms = Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b));
for (let i = 0; i < terms.length; i++) {
  for (let j = i + 1; j < terms.length; j++) {
    const t1 = terms[i];
    const t2 = terms[j];
    const overlap = calculateOverlap(commitGasByTerm[t1], commitGasByTerm[t2]);
    if (overlap < 0.9) {  // Only show if overlap is less than 90%
      console.log(`  Term ${t1} vs Term ${t2}: ${(overlap * 100).toFixed(1)}% ${overlap < 0.5 ? '🔴' : overlap < 0.8 ? '⚠️' : ''}`);
    }
  }
}

// Separability analysis
console.log('\n=== 可分离性分析 ===\n');

// Calculate coefficient of variation (CV) for each term
console.log('变异系数 (CV = Std/Mean):');
console.log('Term | Commit CV | Access CV | 评估');
console.log('-----|-----------|-----------|------');

Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const cStats = commitStats[term];
  const aStats = accessStats[term];

  if (cStats && aStats) {
    const commitCV = cStats.std / cStats.mean;
    const accessCV = aStats.std / aStats.mean;

    let assessment = '✅ 优秀';
    if (commitCV > 0.02 || accessCV > 0.02) assessment = '⚠️ 一般';
    if (commitCV > 0.05 || accessCV > 0.05) assessment = '🔴 较差';

    console.log(
      `${term.padStart(4)} | ${(commitCV * 100).toFixed(3)}%`.padEnd(13) +
      `| ${(accessCV * 100).toFixed(3)}%`.padEnd(13) +
      `| ${assessment}`
    );
  }
});

// Summary
console.log('\n=== 总结 ===\n');

const allCommitStd = Object.values(commitStats).filter(s => s).map(s => s.std);
const allAccessStd = Object.values(accessStats).filter(s => s).map(s => s.std);

const avgCommitStd = allCommitStd.reduce((a,b) => a+b, 0) / allCommitStd.length;
const avgAccessStd = allAccessStd.reduce((a,b) => a+b, 0) / allAccessStd.length;
const maxCommitStd = Math.max(...allCommitStd);
const maxAccessStd = Math.max(...allAccessStd);

console.log(`平均 Commit Gas Std: ${avgCommitStd.toFixed(2)}`);
console.log(`最大 Commit Gas Std: ${maxCommitStd.toFixed(2)}`);
console.log(`平均 Access Gas Std: ${avgAccessStd.toFixed(2)}`);
console.log(`最大 Access Gas Std: ${maxAccessStd.toFixed(2)}`);

console.log('\n隐私保护评估:');
if (maxCommitStd < 50 && maxAccessStd < 50) {
  console.log('✅ Gas 方差控制优秀 (所有 Term 的 Std < 50)');
} else if (maxCommitStd < 100 && maxAccessStd < 100) {
  console.log('⚠️ Gas 方差控制一般 (部分 Term 的 Std > 50)');
} else {
  console.log('🔴 Gas 方差控制较差 (部分 Term 的 Std > 100)');
  console.log('   建议: 检查 Gas padding 机制是否正常工作');
}

// Check if there are unique gas values
const hasUniqueCommit = Object.keys(commitGasByTerm).some(term => {
  let hasUnique = false;
  commitGasByTerm[term].forEach(gas => {
    let isUnique = true;
    Object.keys(commitGasByTerm).forEach(otherTerm => {
      if (otherTerm !== term && commitGasByTerm[otherTerm].has(gas)) {
        isUnique = false;
      }
    });
    if (isUnique) hasUnique = true;
  });
  return hasUnique;
});

const hasUniqueAccess = Object.keys(accessGasByTerm).some(term => {
  let hasUnique = false;
  accessGasByTerm[term].forEach(gas => {
    let isUnique = true;
    Object.keys(accessGasByTerm).forEach(otherTerm => {
      if (otherTerm !== term && accessGasByTerm[otherTerm].has(gas)) {
        isUnique = false;
      }
    });
    if (isUnique) hasUnique = true;
  });
  return hasUnique;
});

if (hasUniqueCommit || hasUniqueAccess) {
  console.log('🔴 存在独特 Gas 值，可能导致隐私泄露');
  console.log('   建议: 增强 Gas padding 或增加随机噪声');
} else {
  console.log('✅ 没有检测到独特 Gas 值');
}
