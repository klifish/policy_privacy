/**
 * Unified Dataset Pipeline
 *
 * 1. Runs the unified dataset validator with a chosen config
 * 2. Saves annotated policy definitions to a shared artifact folder
 * 3. Executes the dataset on-chain once and saves execution results
 * 4. Emits experiment-specific dataset slices (PCH/SPP/PI)
 *
 * Usage:
 *   npx hardhat run experiments/run_unified_dataset.js --network <network>
 *     --config=experiments/unified_dataset_config_optimized.json
 *     --artifact-dir=experiments/unified_dataset_artifacts
 */

const path = require('path');
const fs = require('fs');
const { ethers } = require('hardhat');

const {
  validateUnifiedDataset,
  UNIFIED_CONFIG
} = require('./validator');

const {
  annotateDatasetForSPP,
  writeDatasetArtifacts,
  writeExecutionArtifacts
} = require('./artifacts');

const {
  executeDataset
} = require('../policy_content_hiding/data_generator');

const {
  ensureSufficientBalance,
  deployPolicyPrivacyContracts
} = require('../core/blockchain');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactDir: null,
    configPath: null,
    sppExecutionsPerPolicy: 3,
    help: false
  };

  argv.forEach((arg) => {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--config=')) {
      options.configPath = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--artifact-dir=')) {
      options.artifactDir = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--spp-executions=')) {
      options.sppExecutionsPerPolicy = parseInt(arg.split('=')[1], 10);
    }
  });

  return options;
}

function printUsage() {
  console.log('Usage: npx hardhat run experiments/run_unified_dataset.js [--network <net>] [options]');
  console.log('\nOptions:');
  console.log('  --config=<path>            Path to unified dataset config (JSON)');
  console.log('  --artifact-dir=<path>      Output directory for shared artifacts');
  console.log('  --spp-executions=<n>       Executions per policy to expose to SPP experiment (default: 3)');
  console.log('  --help                     Show this message');
}

async function runUnifiedDatasetWorkflow(cliOptions = {}) {
  const options = {
    artifactDir: cliOptions.artifactDir,
    configPath: cliOptions.configPath || process.env.UNIFIED_CONFIG_PATH,
    sppExecutionsPerPolicy: cliOptions.sppExecutionsPerPolicy ?? 3
  };

  let config = { ...UNIFIED_CONFIG };
  if (options.configPath) {
    const loaded = JSON.parse(fs.readFileSync(options.configPath, 'utf8'));
    config = { ...config, ...loaded };
  }

  console.log('='.repeat(70));
  console.log('Unified Dataset Pipeline');
  console.log('='.repeat(70));
  if (options.configPath) {
    console.log(`Config: ${options.configPath}`);
  } else {
    console.log('Config: default UNIFIED_CONFIG');
  }
  if (options.artifactDir) {
    console.log(`Artifacts: ${options.artifactDir}`);
  } else {
    console.log('Artifacts: default experiments/unified_dataset_artifacts');
  }
  console.log();

  // Step 1: validate + generate dataset
  const validationResult = await validateUnifiedDataset(config, {
    writeArtifacts: false,
    sourceConfigPath: options.configPath
  });

  if (!validationResult.allPassed) {
    throw new Error('Unified dataset validation failed. Resolve issues before executing on-chain.');
  }

  // Step 2: annotate + save dataset artifacts
  const { dataset: annotatedDataset, summary } = annotateDatasetForSPP(validationResult.dataset);
  const { paths } = writeDatasetArtifacts({
    dataset: annotatedDataset,
    config,
    artifactDir: options.artifactDir,
    summary,
    sourceConfigPath: options.configPath
  });

  console.log(`Policy definitions saved to: ${paths.policyDefinitions}`);

  // Step 3: execute dataset on-chain once
  const provider = ethers.provider;
  const [signer] = await ethers.getSigners();

  await ensureSufficientBalance({
    provider,
    signer,
    executionCount: annotatedDataset.length
  });

  const policyPrivacy = await deployPolicyPrivacyContracts();
  console.log(`Executing ${annotatedDataset.length} policy instances...`);

  const executionResults = await executeDataset(
    annotatedDataset,
    policyPrivacy,
    paths.executedDataset
  );

  writeExecutionArtifacts({
    executions: executionResults,
    artifactDir: paths.dir,
    sppExecutionsPerPolicy: options.sppExecutionsPerPolicy
  });

  console.log(`Executed dataset saved to: ${paths.executedDataset}`);
  console.log(`SPP slice saved to:        ${paths.sppDataset}`);
  console.log();

  console.log('Unified dataset artifacts ready.');
  console.log('Next steps:');
  console.log('  1. Run PCH experiment phase 2+:');
  console.log('     node experiments/policy_content_hiding/run_experiment.js --use-unified-dataset --phase 2');
  console.log('  2. Run SPP experiment phase 2+:');
  console.log('     node experiments/structure_and_parameter_privacy/run_experiment.js --use-unified-dataset --phase 2');
  console.log('  3. Run PI experiment phase 2+:');
  console.log('     node experiments/policy_indistinguishability/run_experiment.js --use-unified-dataset --phase 2');
}

if (require.main === module) {
  const cliOptions = parseArgs();
  if (cliOptions.help) {
    printUsage();
    process.exit(0);
  }

  runUnifiedDatasetWorkflow(cliOptions)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Unified dataset pipeline failed:');
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runUnifiedDatasetWorkflow
};
