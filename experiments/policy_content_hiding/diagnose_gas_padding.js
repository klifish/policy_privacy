/**
 * Diagnose Gas Padding Issues
 *
 * Checks if gas padding is working correctly by analyzing:
 * 1. Whether target gas is being reached
 * 2. Variance between different policy types
 * 3. Recommendations for target adjustments
 */

const fs = require('fs');
const path = require('path');

function diagnoseGasPadding(featuresPath) {
  const data = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  const features = data.features || data;

  console.log('='.repeat(70));
  console.log('Gas Padding Diagnostic Report');
  console.log('='.repeat(70));
  console.log();

  // Expected targets from data_generator.js
  const expectedTargets = {
    commit: 500000,
    access: 1000000
  };

  console.log('Expected Gas Targets:');
  console.log(`  Commit: ${expectedTargets.commit.toLocaleString()}`);
  console.log(`  Access: ${expectedTargets.access.toLocaleString()}`);
  console.log();

  // Analyze actual consumption
  const stats = {
    commit: {
      min: Infinity,
      max: -Infinity,
      values: []
    },
    access: {
      min: Infinity,
      max: -Infinity,
      values: []
    }
  };

  const byDuoTerm = {};

  features.forEach(f => {
    // Overall stats
    stats.commit.values.push(f.commitGasUsed);
    stats.access.values.push(f.accessGasUsed);
    stats.commit.min = Math.min(stats.commit.min, f.commitGasUsed);
    stats.commit.max = Math.max(stats.commit.max, f.commitGasUsed);
    stats.access.min = Math.min(stats.access.min, f.accessGasUsed);
    stats.access.max = Math.max(stats.access.max, f.accessGasUsed);

    // By DUO term
    if (!byDuoTerm[f.duoTerm]) {
      byDuoTerm[f.duoTerm] = {
        commit: [],
        access: []
      };
    }
    byDuoTerm[f.duoTerm].commit.push(f.commitGasUsed);
    byDuoTerm[f.duoTerm].access.push(f.accessGasUsed);
  });

  const calcStats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: mean,
      median: sorted[Math.floor(sorted.length / 2)],
      std: std,
      cv: (std / mean) * 100 // Coefficient of variation (%)
    };
  };

  const commitStats = calcStats(stats.commit.values);
  const accessStats = calcStats(stats.access.values);

  console.log('Actual Gas Consumption (Overall):');
  console.log('  Commit:');
  console.log(`    Range: [${commitStats.min.toLocaleString()}, ${commitStats.max.toLocaleString()}]`);
  console.log(`    Mean: ${commitStats.mean.toFixed(0)}`);
  console.log(`    Std Dev: ${commitStats.std.toFixed(2)}`);
  console.log(`    CV: ${commitStats.cv.toFixed(2)}%`);
  console.log('  Access:');
  console.log(`    Range: [${accessStats.min.toLocaleString()}, ${accessStats.max.toLocaleString()}]`);
  console.log(`    Mean: ${accessStats.mean.toFixed(0)}`);
  console.log(`    Std Dev: ${accessStats.std.toFixed(2)}`);
  console.log(`    CV: ${accessStats.cv.toFixed(2)}%`);
  console.log();

  // Check if targets are being reached
  const commitShortfall = expectedTargets.commit - commitStats.max;
  const accessShortfall = expectedTargets.access - accessStats.max;

  console.log('Target Achievement:');
  if (commitShortfall > 0) {
    console.log(`  ❌ Commit: ${commitShortfall.toLocaleString()} gas SHORT of target`);
  } else {
    console.log(`  ✅ Commit: ${Math.abs(commitShortfall).toLocaleString()} gas OVER target`);
  }

  if (accessShortfall > 0) {
    console.log(`  ❌ Access: ${accessShortfall.toLocaleString()} gas SHORT of target`);
  } else {
    console.log(`  ✅ Access: ${Math.abs(accessShortfall).toLocaleString()} gas OVER target`);
  }
  console.log();

  // Analyze by DUO term
  console.log('Per-DUO Term Analysis:');
  console.log('-'.repeat(70));

  const duoTerms = Object.keys(byDuoTerm).map(Number).sort((a, b) => a - b);
  duoTerms.forEach(duo => {
    const duoCommitStats = calcStats(byDuoTerm[duo].commit);
    const duoAccessStats = calcStats(byDuoTerm[duo].access);

    console.log(`\nDUO Term ${duo}:`);
    console.log(`  Commit: mean=${duoCommitStats.mean.toFixed(0)}, std=${duoCommitStats.std.toFixed(2)}, range=${duoCommitStats.max - duoCommitStats.min}`);
    console.log(`  Access: mean=${duoAccessStats.mean.toFixed(0)}, std=${duoAccessStats.std.toFixed(2)}, range=${duoAccessStats.max - duoAccessStats.min}`);
  });
  console.log();

  // Calculate distinguishability
  console.log('Distinguishability Analysis:');
  console.log('-'.repeat(70));

  for (let i = 0; i < duoTerms.length; i++) {
    for (let j = i + 1; j < duoTerms.length; j++) {
      const duo1 = duoTerms[i];
      const duo2 = duoTerms[j];

      const mean1Commit = calcStats(byDuoTerm[duo1].commit).mean;
      const mean2Commit = calcStats(byDuoTerm[duo2].commit).mean;
      const mean1Access = calcStats(byDuoTerm[duo1].access).mean;
      const mean2Access = calcStats(byDuoTerm[duo2].access).mean;

      const commitDiff = Math.abs(mean1Commit - mean2Commit);
      const accessDiff = Math.abs(mean1Access - mean2Access);

      console.log(`\nDUO ${duo1} vs DUO ${duo2}:`);
      console.log(`  Commit difference: ${commitDiff.toFixed(0)} gas (${(commitDiff / mean1Commit * 100).toFixed(2)}%)`);
      console.log(`  Access difference: ${accessDiff.toFixed(0)} gas (${(accessDiff / mean1Access * 100).toFixed(2)}%)`);

      // Highlight if difference is significant (>1%)
      if (commitDiff / mean1Commit > 0.01 || accessDiff / mean1Access > 0.01) {
        console.log(`  ⚠️  Significant difference detected - may enable ML attacks`);
      }
    }
  }
  console.log();

  // Recommendations
  console.log('='.repeat(70));
  console.log('RECOMMENDATIONS:');
  console.log('='.repeat(70));

  // Calculate recommended targets (max + buffer)
  const commitBuffer = Math.ceil(commitStats.std * 3); // 3-sigma buffer
  const accessBuffer = Math.ceil(accessStats.std * 3);

  const recommendedCommitTarget = commitStats.max + commitBuffer;
  const recommendedAccessTarget = accessStats.max + accessBuffer;

  console.log();
  console.log('1. Adjust Gas Padding Targets:');
  console.log('   Update GAS_PAD_TARGET_GAS in data_generator.js:');
  console.log();
  console.log('   const GAS_PAD_TARGET_GAS = Object.freeze({');
  console.log(`     commit: ${recommendedCommitTarget}n,  // Was: 500000n`);
  console.log(`     access: ${recommendedAccessTarget}n   // Was: 1000000n`);
  console.log('   });');
  console.log();

  console.log('2. Verification Steps:');
  console.log('   - Re-run experiment with updated targets');
  console.log('   - Check that all policies reach the new targets');
  console.log('   - Verify CV < 1% for both commit and access');
  console.log();

  if (commitShortfall > 10000 || accessShortfall > 10000) {
    console.log('3. Investigate Padding Implementation:');
    console.log('   - Large shortfall suggests padding may not be executing');
    console.log('   - Check _padGasToTarget() in PolicyPrivacy.sol');
    console.log('   - Verify targetGas parameter is being passed correctly');
    console.log();
  }

  console.log('4. Additional Improvements:');
  console.log('   - Consider adding random noise (±1-2%) to each transaction');
  console.log('   - Implement proof size padding to normalize proof lengths');
  console.log('   - Add event log padding if not already implemented');
  console.log();

  // Privacy assessment
  console.log('='.repeat(70));
  console.log('PRIVACY ASSESSMENT:');
  console.log('='.repeat(70));
  console.log();

  const maxCommitDiff = Math.max(...duoTerms.flatMap((d1, i) =>
    duoTerms.slice(i + 1).map(d2 =>
      Math.abs(calcStats(byDuoTerm[d1].commit).mean - calcStats(byDuoTerm[d2].commit).mean)
    )
  ));

  const maxAccessDiff = Math.max(...duoTerms.flatMap((d1, i) =>
    duoTerms.slice(i + 1).map(d2 =>
      Math.abs(calcStats(byDuoTerm[d1].access).mean - calcStats(byDuoTerm[d2].access).mean)
    )
  ));

  const commitPrivacyLeak = (maxCommitDiff / commitStats.mean) * 100;
  const accessPrivacyLeak = (maxAccessDiff / accessStats.mean) * 100;

  console.log(`Max inter-DUO commit difference: ${maxCommitDiff.toFixed(0)} gas (${commitPrivacyLeak.toFixed(2)}%)`);
  console.log(`Max inter-DUO access difference: ${maxAccessDiff.toFixed(0)} gas (${accessPrivacyLeak.toFixed(2)}%)`);
  console.log();

  if (commitPrivacyLeak < 0.1 && accessPrivacyLeak < 0.1) {
    console.log('✅ EXCELLENT: Gas leakage < 0.1% - strong privacy guarantee');
  } else if (commitPrivacyLeak < 1 && accessPrivacyLeak < 1) {
    console.log('✅ GOOD: Gas leakage < 1% - acceptable privacy');
  } else if (commitPrivacyLeak < 3 && accessPrivacyLeak < 3) {
    console.log('⚠️  MODERATE: Gas leakage < 3% - some information leakage');
  } else {
    console.log('❌ POOR: Gas leakage > 3% - significant information leakage');
  }
  console.log();
  console.log('='.repeat(70));
}

// Run if called directly
if (require.main === module) {
  const featuresPath = process.argv[2] || path.join(__dirname, 'results', 'features.json');

  if (!fs.existsSync(featuresPath)) {
    console.error(`Error: Features file not found at ${featuresPath}`);
    console.error('Usage: node diagnose_gas_padding.js [path/to/features.json]');
    process.exit(1);
  }

  diagnoseGasPadding(featuresPath);
}

module.exports = { diagnoseGasPadding };
