/**
 * Unified Dataset Validator
 *
 * Validates that a generated dataset satisfies the requirements of all three experiments:
 * 1. PCH (Policy Content Hiding) - DUO term distribution
 * 2. SPP (Structure & Parameter Privacy) - 5-dimension balance
 * 3. PI (Policy Indistinguishability) - Semantic diversity for pairing
 *
 * Usage:
 *   node unified_dataset_validator.js [--generate] [--config=path/to/config.json]
 *
 * Process:
 *   1. Generate policy definitions (without blockchain execution)
 *   2. Check PCH requirements
 *   3. Check SPP requirements
 *   4. Check PI requirements
 *   5. Report overall validation status
 */

const fs = require('fs');
const path = require('path');

const {
  aggregatePoliciesByDefinition,
  annotateDatasetForSPP,
  writeDatasetArtifacts
} = require('./artifacts');

// Import generators and analyzers
const {
  generateDataset: generatePCHDataset,
  DUO_TERMS
} = require('../core/data_generator');

const {
  annotatePolicy,
  summarizeDataset,
  calculateBalanceMetrics,
  LOGIC_STRUCTURES,
  NESTING_DEPTHS,
  PREDICATE_COUNTS,
  SET_SIZES,
  RANGE_WIDTHS
} = require('../analysis/crosscheck/spp/data_generator');

const {
  computeSemanticSimilarity
} = require('../analysis/crosscheck/pi/data_generator');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hasStructuralDifference(policyA, policyB) {
  if (!policyA?.structure || !policyB?.structure) {
    return false;
  }
  const keys = ['policyHash', 'policyDepth', 'whitelistSize', 'merkleDepth', 'proofType'];
  return keys.some((key) => {
    const valueA = policyA.structure?.[key];
    const valueB = policyB.structure?.[key];
    return valueA !== valueB;
  });
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const UNIFIED_CONFIG = {
  policyCount: 200,
  executionsPerPolicy: 5,
  satisfyRatio: 0.5,
  seed: 'unified-validation-2024',

  // Validation thresholds
  validation: {
    pch: {
      minPoliciesPerDUO: 20,        // Minimum policies per DUO term
      minMaxRatio: 0.4,             // Minimum samples / maximum samples
    },
    spp: {
      minPoliciesPerCategory: 15,   // Minimum policies per category in each dimension
      minMaxRatio: 0.3,             // Balance ratio threshold
      maxCV: 0.6,                   // Maximum coefficient of variation
    },
    pi: {
      minPairsPerType: 30,          // Minimum pairs per type
      minSemanticDiversity: 0.6,    // Minimum average semantic distance
    }
  }
};

function cloneSemanticLayer(layer) {
  return {
    ...layer
  };
}

function normalizePolicyCountConfig(baseConfig = {}) {
  const normalized = {
    ...baseConfig,
    semanticLayers: Array.isArray(baseConfig.semanticLayers)
      ? baseConfig.semanticLayers.map(cloneSemanticLayer)
      : []
  };

  const targetFromConfig = Number(normalized.policyCountTarget ?? normalized.maxPolicyCount ?? 0);
  const targetFromEnv = Number(process.env.UNIFIED_POLICY_TARGET ?? 0);
  const candidates = [targetFromConfig, targetFromEnv].filter(
    (value) => Number.isFinite(value) && value > 0
  );

  if (candidates.length === 0) {
    return { config: normalized, scaleInfo: null };
  }

  const desired = Math.min(...candidates, normalized.policyCount ?? Infinity);
  if (!Number.isFinite(desired) || !normalized.policyCount || desired >= normalized.policyCount) {
    return { config: normalized, scaleInfo: null };
  }

  const targetPolicyCount = Math.max(1, Math.floor(desired));
  const originalPolicyCount = normalized.policyCount;
  const scale = targetPolicyCount / originalPolicyCount;

  normalized.semanticLayers.forEach((layer) => {
    if (typeof layer.minPolicies === 'number') {
      layer.minPolicies = Math.max(1, Math.floor(layer.minPolicies * scale));
    }
    if (typeof layer.maxPolicies === 'number' && Number.isFinite(layer.maxPolicies)) {
      const scaledMax = Math.max(layer.minPolicies ?? 1, Math.floor(layer.maxPolicies * scale));
      layer.maxPolicies = Math.max(layer.minPolicies ?? 1, scaledMax);
    }
  });

  let totalMin = normalized.semanticLayers.reduce(
    (sum, layer) => sum + (typeof layer.minPolicies === 'number' ? layer.minPolicies : 0),
    0
  );

  if (totalMin > targetPolicyCount) {
    let overflow = totalMin - targetPolicyCount;
    const adjustableLayers = normalized.semanticLayers.filter(
      (layer) => typeof layer.minPolicies === 'number' && layer.minPolicies > 1
    );

    while (overflow > 0 && adjustableLayers.length > 0) {
      adjustableLayers.sort((a, b) => (b.minPolicies ?? 0) - (a.minPolicies ?? 0));
      let progressed = false;
      for (const layer of adjustableLayers) {
        if (overflow === 0) {
          break;
        }
        if (layer.minPolicies > 1) {
          layer.minPolicies -= 1;
          if (typeof layer.maxPolicies === 'number' && Number.isFinite(layer.maxPolicies)) {
            layer.maxPolicies = Math.max(layer.maxPolicies, layer.minPolicies);
          }
          overflow -= 1;
          progressed = true;
        }
      }
      if (!progressed) {
        break;
      }
    }
    totalMin = normalized.semanticLayers.reduce(
      (sum, layer) => sum + (typeof layer.minPolicies === 'number' ? layer.minPolicies : 0),
      0
    );

    if (overflow > 0) {
      console.warn(
        `Requested target of ${targetPolicyCount} policies is below the feasible minimum. ` +
        `Using ${totalMin} policies instead.`
      );
      normalized.policyCount = totalMin;
    } else {
      normalized.policyCount = targetPolicyCount;
    }
  } else {
    normalized.policyCount = targetPolicyCount;
  }
  normalized.policyCountTarget = targetPolicyCount;

  normalized.policyCountScaleInfo = {
    originalPolicyCount,
    requestedPolicyCount: targetPolicyCount,
    effectivePolicyCount: normalized.policyCount,
    scaleFactor: Number((normalized.policyCount / originalPolicyCount).toFixed(3)),
    totalLayerMinimum: totalMin
  };

  return { config: normalized, scaleInfo: normalized.policyCountScaleInfo };
}

// ============================================================================
// PCH VALIDATION
// ============================================================================

/**
 * Check if dataset satisfies PCH requirements
 */
function validatePCHRequirements(dataset, config) {
  console.log('\n' + '='.repeat(80));
  console.log('PCH (Policy Content Hiding) Validation');
  console.log('='.repeat(80));

  // Aggregate by policy (not execution)
  const policies = aggregatePoliciesByDefinition(dataset);

  // Count DUO term distribution
  const duoDistribution = {};
  const duoNames = {
    [DUO_TERMS.GENERAL_RESEARCH]: 'GR',
    [DUO_TERMS.DISEASE_SPECIFIC]: 'DS',
    [DUO_TERMS.RESEARCH_SPECIFIC]: 'RS',
    [DUO_TERMS.POPULATION_ANCESTRY]: 'POA',
    [DUO_TERMS.GEOGRAPHICAL_RESTRICTION]: 'GS',
    [DUO_TERMS.CLINICAL_CARE]: 'CC',
    [DUO_TERMS.COMMERCIAL_USE]: 'CU'
  };

  policies.forEach(policy => {
    const duoTerms = policy.semantics?.duoTerms || [];
    duoTerms.forEach(term => {
      const name = duoNames[term] || `DUO_${term}`;
      duoDistribution[name] = (duoDistribution[name] || 0) + 1;
    });
  });

  // Calculate balance metrics
  const counts = Object.values(duoDistribution);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const minMaxRatio = min / max;

  console.log('\n📊 DUO Term Distribution:');
  Object.entries(duoDistribution).forEach(([duo, count]) => {
    const pct = ((count / policies.length) * 100).toFixed(1);
    console.log(`  ${duo.padEnd(5)}: ${count.toString().padStart(4)} (${pct}%)`);
  });

  console.log('\n📈 Balance Metrics:');
  console.log(`  Min:         ${min}`);
  console.log(`  Max:         ${max}`);
  console.log(`  Mean:        ${mean.toFixed(1)}`);
  console.log(`  Min/Max:     ${minMaxRatio.toFixed(3)}`);

  // Validation
  const issues = [];
  const threshold = config.validation.pch.minPoliciesPerDUO;
  const ratioThreshold = config.validation.pch.minMaxRatio;

  Object.entries(duoDistribution).forEach(([duo, count]) => {
    if (count < threshold) {
      issues.push(`${duo} has only ${count} policies (< ${threshold})`);
    }
  });

  if (minMaxRatio < ratioThreshold) {
    issues.push(`Min/Max ratio ${minMaxRatio.toFixed(3)} is below threshold ${ratioThreshold}`);
  }

  if (issues.length === 0) {
    console.log('\n✅ PCH Requirements: PASSED');
    return { passed: true, issues: [] };
  } else {
    console.log('\n❌ PCH Requirements: FAILED');
    issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    return { passed: false, issues };
  }
}

// ============================================================================
// SPP VALIDATION
// ============================================================================

/**
 * Check if dataset satisfies SPP requirements
 */
function validateSPPRequirements(dataset, config) {
  console.log('\n' + '='.repeat(80));
  console.log('SPP (Structure & Parameter Privacy) Validation');
  console.log('='.repeat(80));

  // Aggregate by policy and annotate with SPP dimensions
  const policies = aggregatePoliciesByDefinition(dataset);
  policies.forEach(policy => annotatePolicy(policy));

  // Summarize distributions
  const summary = summarizeDataset(policies);

  console.log('\n📊 5-Dimension Distributions:');

  const dimensions = [
    { name: 'Logic Structure', key: 'logicStructures', values: LOGIC_STRUCTURES },
    { name: 'Nesting Depth', key: 'nestingDepths', values: NESTING_DEPTHS },
    { name: 'Predicate Count', key: 'predicateCounts', values: PREDICATE_COUNTS },
    { name: 'Set Size', key: 'setSizes', values: SET_SIZES },
    { name: 'Range Width', key: 'rangeWidths', values: RANGE_WIDTHS }
  ];

  const allBalanceMetrics = {};
  const issues = [];

  // Dimensions listed here are reported but not validated (e.g. rangeWidths
  // when the config exercises no range predicates).
  const skipDimensions = config.validation.spp.skipDimensions ?? ['rangeWidths'];
  const excludedCategories = config.validation.spp.excludedCategories ?? {};

  dimensions.forEach(dim => {
    console.log(`\n  ${dim.name}:`);

    // Zero-fill from the category enum so empty categories are visible and
    // counted — a missing category must fail the min-count check.
    const observed = summary[dim.key] || {};
    const distribution = {};
    Object.values(dim.values)
      .filter((category) => !(excludedCategories[dim.key] || []).includes(category))
      .forEach(category => {
        distribution[category] = observed[category] || 0;
      });

    Object.entries(distribution).forEach(([category, count]) => {
      const pct = ((count / policies.length) * 100).toFixed(1);
      console.log(`    ${category.padEnd(20)}: ${count.toString().padStart(4)} (${pct}%)`);
    });

    // Calculate balance metrics
    const metrics = calculateBalanceMetrics(distribution);
    allBalanceMetrics[dim.key] = metrics;

    console.log(`    Balance: min/max=${metrics.minMaxRatio}, CV=${metrics.coefficientOfVariation}`);

    if (skipDimensions.includes(dim.key)) {
      console.log(`    (validation skipped for this dimension)`);
      return;
    }

    // Validation
    const minThreshold = config.validation.spp.minPoliciesPerCategory;
    const ratioThreshold = config.validation.spp.minMaxRatio;
    const cvThreshold = config.validation.spp.maxCV;

    if (metrics.min < minThreshold) {
      issues.push(`${dim.name}: min count ${metrics.min} < ${minThreshold}`);
    }
    if (parseFloat(metrics.minMaxRatio) < ratioThreshold) {
      issues.push(`${dim.name}: min/max ratio ${metrics.minMaxRatio} < ${ratioThreshold}`);
    }
    if (parseFloat(metrics.coefficientOfVariation) > cvThreshold) {
      issues.push(`${dim.name}: CV ${metrics.coefficientOfVariation} > ${cvThreshold}`);
    }
  });

  if (issues.length === 0) {
    console.log('\n✅ SPP Requirements: PASSED');
    return { passed: true, issues: [], metrics: allBalanceMetrics };
  } else {
    console.log('\n❌ SPP Requirements: FAILED');
    issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    return { passed: false, issues, metrics: allBalanceMetrics };
  }
}

// ============================================================================
// PI VALIDATION
// ============================================================================

/**
 * Check if dataset satisfies PI requirements
 */
function validatePIRequirements(dataset, config) {
  console.log('\n' + '='.repeat(80));
  console.log('PI (Policy Indistinguishability) Validation');
  console.log('='.repeat(80));

  // Aggregate by policy
  const policies = aggregatePoliciesByDefinition(dataset);

  // Sample subset of policies (without replacement) to estimate pair distribution.
  // Use a seeded RNG (derived from the config seed) so validation is deterministic
  // — otherwise the pair-type estimate (and hence pass/fail) varies run to run.
  const sampleSize = Math.min(80, policies.length);
  let piSeed = 0;
  const seedStr = String(config.seed ?? 'pi-validation');
  for (let k = 0; k < seedStr.length; k++) {
    piSeed = (piSeed * 31 + seedStr.charCodeAt(k)) >>> 0;
  }
  const piRng = () => {
    piSeed = (piSeed * 1103515245 + 12345) & 0x7fffffff;
    return piSeed / 0x7fffffff;
  };
  const shuffled = policies.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(piRng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sampledPolicies = shuffled.slice(0, sampleSize);

  const similarities = [];
  const pairTypes = {
    semantic_equivalent: 0,
    weak_equivalent: 0,
    controlled_difference: 0
  };

  for (let i = 0; i < sampledPolicies.length; i++) {
    for (let j = i + 1; j < sampledPolicies.length; j++) {
      const policyA = sampledPolicies[i];
      const policyB = sampledPolicies[j];
      if (!policyA || !policyB) continue;

      const similarity = computeSemanticSimilarity(policyA.semantics, policyB.semantics);
      similarities.push(similarity);

      const structuralDiff = hasStructuralDifference(policyA, policyB);

      if (similarity >= 0.999) {
        if (structuralDiff) {
          pairTypes.semantic_equivalent += 1;
        } else {
          pairTypes.weak_equivalent += 1;
        }
      } else if (similarity >= 0.95) {
        pairTypes.weak_equivalent += 1;
      } else {
        pairTypes.controlled_difference += 1;
      }
    }
  }

  const totalPairsSampled = similarities.length;
  const avgSimilarity = totalPairsSampled > 0
    ? similarities.reduce((a, b) => a + b, 0) / totalPairsSampled
    : 1;
  const avgDiversity = 1 - avgSimilarity;

  console.log('\n📊 Semantic Diversity (sampled):');
  console.log(`  Average similarity:  ${avgSimilarity.toFixed(3)}`);
  console.log(`  Average diversity:   ${avgDiversity.toFixed(3)}`);
  console.log(`  Sampled pairs:       ${totalPairsSampled}`);

  console.log('\n📊 Estimated Pair Type Distribution:');
  Object.entries(pairTypes).forEach(([type, count]) => {
    const pct = totalPairsSampled > 0 ? ((count / totalPairsSampled) * 100).toFixed(1) : '0.0';
    console.log(`  ${type.padEnd(25)}: ${count.toString().padStart(4)} (${pct}%)`);
  });

  const totalPossiblePairs = (policies.length * (policies.length - 1)) / 2;
  const estimatedTotals = {};
  console.log('\n📈 Estimated Total Pairs (scaled):');
  Object.entries(pairTypes).forEach(([type, count]) => {
    const estimated = totalPairsSampled > 0
      ? Math.round((count / totalPairsSampled) * totalPossiblePairs)
      : 0;
    estimatedTotals[type] = estimated;
    console.log(`  ${type.padEnd(25)}: ~${estimated.toLocaleString()}`);
  });

  const issues = [];
  const diversityThreshold = config.validation.pi.minSemanticDiversity;
  if (avgDiversity < diversityThreshold) {
    issues.push(`Average diversity ${avgDiversity.toFixed(3)} < ${diversityThreshold}`);
  }

  const minPairsPerType = config.validation.pi.minPairsPerType;
  ['semantic_equivalent'].forEach((type) => {
    if ((estimatedTotals[type] || 0) < minPairsPerType) {
      issues.push(`Estimated ${type} pairs (${estimatedTotals[type] || 0}) < ${minPairsPerType}`);
    }
  });

  if (issues.length === 0) {
    console.log('\n✅ PI Requirements: PASSED');
    return { passed: true, issues: [], pairTypes, avgDiversity, estimatedTotals };
  } else {
    console.log('\n❌ PI Requirements: FAILED');
    issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    return { passed: false, issues, pairTypes, avgDiversity, estimatedTotals };
  }
}

// ============================================================================
// MAIN VALIDATION WORKFLOW
// ============================================================================

async function validateUnifiedDataset(config = UNIFIED_CONFIG, options = {}) {
  const {
    saveDatasetPath = null,
    writeArtifacts = false,
    artifactDir = null,
    sourceConfigPath = null
  } = options;

  const { config: normalizedConfig, scaleInfo } = normalizePolicyCountConfig(config);

  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + 'UNIFIED DATASET VALIDATOR' + ' '.repeat(33) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');

  console.log('\n📋 Configuration:');
  console.log(`  Policy count:              ${normalizedConfig.policyCount}`);
  if (scaleInfo) {
    console.log(
      `  Target override:           ${scaleInfo.requestedPolicyCount} ` +
      `(scale ${scaleInfo.scaleFactor})`
    );
  }
  console.log(`  Executions per policy:     ${normalizedConfig.executionsPerPolicy}`);
  console.log(`  Seed:                      ${normalizedConfig.seed}`);

  // Step 1: Generate dataset (without blockchain execution)
  console.log('\n' + '='.repeat(80));
  console.log('Step 1: Generating Policy Definitions (no blockchain execution)');
  console.log('='.repeat(80));

  const startTime = Date.now();

  // Generate dataset - this creates policy definitions WITHOUT blockchain execution
  // The PCH generateDataset only creates policy artifacts and metadata
  // Actual blockchain execution is done separately via executePolicy()
  const dataset = await generatePCHDataset({
    policyCount: normalizedConfig.policyCount,
    executionsPerPolicy: normalizedConfig.executionsPerPolicy,
    coverageExecutions: normalizedConfig.coverageExecutions ?? null,
    depthExecutions: normalizedConfig.depthExecutions ?? null,
    depthSubsetPerStructure: normalizedConfig.depthSubsetPerStructure ?? 8,
    depthStructures: normalizedConfig.depthStructures,
    satisfyRatio: normalizedConfig.satisfyRatio,
    seed: normalizedConfig.seed,
    semanticLayers: normalizedConfig.semanticLayers,
    whitelistBuckets: normalizedConfig.whitelistBuckets,
    merkleDepthOptions: normalizedConfig.merkleDepthOptions,
    logicOptions: normalizedConfig.logicOptions,
    duoConflicts: normalizedConfig.duoConflicts,
    icd10Scopes: normalizedConfig.icd10Scopes,
    obiScopes: normalizedConfig.obiScopes,
    hancestroScopes: normalizedConfig.hancestroScopes,
    iso3166Scopes: normalizedConfig.iso3166Scopes,
    snomedScopes: normalizedConfig.snomedScopes,
    maxPolicyInstances: normalizedConfig.maxPolicyInstances ?? null
  });

  const generationTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Generated ${dataset.length} policy instances in ${generationTime}s`);

  // Step 2-4: Validate against all three experiments
  const results = {
    pch: validatePCHRequirements(dataset, normalizedConfig),
    spp: validateSPPRequirements(dataset, normalizedConfig),
    pi: validatePIRequirements(dataset, normalizedConfig)
  };

  // Step 5: Overall summary
  console.log('\n' + '═'.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('═'.repeat(80));

  const allPassed = results.pch.passed && results.spp.passed && results.pi.passed;

  console.log('\n📊 Results:');
  console.log(`  PCH: ${results.pch.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  SPP: ${results.spp.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  PI:  ${results.pi.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (allPassed) {
    console.log('\n' + '🎉'.repeat(40));
    console.log('✅ ALL VALIDATIONS PASSED');
    console.log('✅ Dataset is ready for blockchain execution!');
    console.log('🎉'.repeat(40));
  } else {
    console.log('\n' + '⚠️ '.repeat(40));
    console.log('❌ VALIDATION FAILED');
    console.log('');
    console.log('Recommendations:');
    console.log('  1. Review the issues listed above');
    console.log('  2. Adjust dataset generation parameters');
    console.log('  3. Consider increasing policy count or adjusting semantic layers');
    console.log('  4. Re-run validation until all checks pass');
    console.log('⚠️ '.repeat(40));
  }

  // Save results to file
  const resultPath = path.resolve(__dirname, '../results/capture/validation_results.json');
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify({
    config: normalizedConfig,
    results,
    timestamp: new Date().toISOString(),
    allPassed
  }, null, 2));

  console.log(`\n💾 Results saved to: ${resultPath}`);

  const artifactRequested = Boolean(saveDatasetPath) || writeArtifacts;
  if (artifactRequested && !allPassed) {
    console.warn('\n⚠️  Validation failed. Dataset artifacts were not saved.');
  } else if (artifactRequested && allPassed) {
    const { dataset: annotatedDataset, summary } = annotateDatasetForSPP(dataset);

    if (saveDatasetPath) {
      fs.mkdirSync(path.dirname(saveDatasetPath), { recursive: true });
      fs.writeFileSync(saveDatasetPath, JSON.stringify(annotatedDataset, null, 2));
      console.log(`\n💾 Unified dataset saved to: ${saveDatasetPath}`);
    }

    if (writeArtifacts) {
      const { paths } = writeDatasetArtifacts({
        dataset: annotatedDataset,
        config: normalizedConfig,
        artifactDir,
        summary,
        sourceConfigPath
      });
      console.log(`\n📁 Unified dataset artifacts written to: ${paths.dir}`);
    }
  }

  return {
    allPassed,
    results,
    dataset,
    config: normalizedConfig
  };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let customConfig = { ...UNIFIED_CONFIG };
  let configPath = null;
  let datasetOutPath = null;
  let saveArtifacts = false;
  let artifactDir = null;

  args.forEach(arg => {
    if (arg.startsWith('--config=')) {
      configPath = path.resolve(arg.split('=')[1]);
      const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      customConfig = { ...customConfig, ...loadedConfig };
    } else if (arg.startsWith('--dataset-out=')) {
      datasetOutPath = path.resolve(arg.split('=')[1]);
    } else if (arg === '--save-artifacts') {
      saveArtifacts = true;
    } else if (arg.startsWith('--artifact-dir=')) {
      artifactDir = path.resolve(arg.split('=')[1]);
    }
  });

  // Run validation
  validateUnifiedDataset(customConfig, {
    saveDatasetPath: datasetOutPath,
    writeArtifacts: saveArtifacts,
    artifactDir,
    sourceConfigPath: configPath
  })
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch(err => {
      console.error('\n❌ Validation failed with error:');
      console.error(err);
      process.exit(2);
    });
}

module.exports = {
  validateUnifiedDataset,
  validatePCHRequirements,
  validateSPPRequirements,
  validatePIRequirements,
  UNIFIED_CONFIG
};
