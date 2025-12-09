const data = require('./experiments/policy_content_hiding/results/features.json');
const features = data.features;

console.log('=== 最新实验详细分析 ===\n');

// Group by duoTerms
const byTerm = {};
features.forEach(f => {
  const terms = Array.isArray(f.duoTerms) ? f.duoTerms : [f.duoTerm];
  terms.forEach(t => {
    if (!byTerm[t]) byTerm[t] = [];
    byTerm[t].push(f);
  });
});

console.log('样本分布:');
Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  console.log(`  Term ${term}: ${byTerm[term].length} 样本 (${(byTerm[term].length/features.length*100).toFixed(1)}%)`);
});

console.log('\nGas 统计按 Term 分类:\n');
console.log('Term | Commit Gas Mean | Commit Std | Access Gas Mean | Access Std');
console.log('-----|----------------|------------|----------------|------------');

Object.keys(byTerm).sort((a,b) => parseInt(a) - parseInt(b)).forEach(term => {
  const samples = byTerm[term];
  const commitGas = samples.map(s => s.commitGasUsed);
  const accessGas = samples.map(s => s.accessGasUsed);

  const commitMean = commitGas.reduce((a,b) => a+b, 0) / commitGas.length;
  const accessMean = accessGas.reduce((a,b) => a+b, 0) / accessGas.length;

  const commitStd = Math.sqrt(commitGas.reduce((acc, val) => acc + Math.pow(val - commitMean, 2), 0) / commitGas.length);
  const accessStd = Math.sqrt(accessGas.reduce((acc, val) => acc + Math.pow(val - accessMean, 2), 0) / accessGas.length);

  console.log(`${term.padEnd(4)} | ${commitMean.toFixed(0).padEnd(15)} | ${commitStd.toFixed(2).padEnd(10)} | ${accessMean.toFixed(0).padEnd(15)} | ${accessStd.toFixed(2)}`);
});

console.log('\n检查 Gas 范围重叠:\n');

// Check for unique gas values per term
const commitGasByTerm = {};
const accessGasByTerm = {};

Object.keys(byTerm).forEach(term => {
  commitGasByTerm[term] = new Set(byTerm[term].map(s => s.commitGasUsed));
  accessGasByTerm[term] = new Set(byTerm[term].map(s => s.accessGasUsed));
});

console.log('Commit Gas 独特值检测:');
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
    console.log(`  Term ${term}: ${uniqueToThisTerm.length} 个独特值`);
  }
});

console.log('\nAccess Gas 独特值检测:');
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
    console.log(`  Term ${term}: ${uniqueToThisTerm.length} 个独特值`);
  }
});
