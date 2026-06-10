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
const { spawn } = require('child_process');
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

const tpsClient = require('../../lib/tps-client');

const TPS_PORT = process.env.TPS_PORT || '3001';
const TPS_STARTUP_TIMEOUT_MS = 15000;
const TPS_POLL_INTERVAL_MS = 300;

async function waitForTps() {
  const deadline = Date.now() + TPS_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await tpsClient.health();
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, TPS_POLL_INTERVAL_MS));
    }
  }
  throw new Error(`TPS server did not become ready within ${TPS_STARTUP_TIMEOUT_MS}ms`);
}

async function startTpsServer() {
  const tpsIndexPath = path.resolve(__dirname, '../../tps/index.js');
  const tps = spawn(process.execPath, [tpsIndexPath], {
    env: { ...process.env, TPS_PORT },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  tps.stdout.on('data', (data) => process.stdout.write(`[TPS] ${data}`));
  tps.stderr.on('data', (data) => process.stderr.write(`[TPS] ${data}`));
  tps.on('error', (err) => { throw new Error(`Failed to start TPS server: ${err.message}`); });

  console.log(`Starting TPS server (port ${TPS_PORT})...`);
  await waitForTps();
  console.log('TPS server ready.\n');
  return tps;
}

function stopTpsServer(tps) {
  if (tps && !tps.killed) {
    tps.kill('SIGTERM');
    console.log('\nTPS server stopped.');
  }
}

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
  console.log('Unified Dataset Pipeline (TPS Workflow)');
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
  const effectiveConfig = validationResult.config ?? config;

  if (!validationResult.allPassed) {
    throw new Error('Unified dataset validation failed. Resolve issues before executing on-chain.');
  }

  // Step 2: annotate + save dataset artifacts
  const { dataset: annotatedDataset, summary } = annotateDatasetForSPP(validationResult.dataset);
  const { paths } = writeDatasetArtifacts({
    dataset: annotatedDataset,
    config: effectiveConfig,
    artifactDir: options.artifactDir,
    summary,
    sourceConfigPath: options.configPath
  });

  console.log(`Policy definitions saved to: ${paths.policyDefinitions}`);

  // Step 3: execute dataset on-chain via TPS workflow
  const provider = ethers.provider;
  const [signer] = await ethers.getSigners();

  await ensureSufficientBalance({
    provider,
    signer,
    executionCount: annotatedDataset.length
  });

  const policyPrivacy = await deployPolicyPrivacyContracts();

  // Start TPS server for this experiment run
  const tpsProcess = await startTpsServer();
  let executionResults;
  try {
    console.log(`Executing ${annotatedDataset.length} policy instances via TPS...`);
    executionResults = await executeDataset(
      annotatedDataset,
      policyPrivacy,
      paths.executedDataset
    );
  } finally {
    stopTpsServer(tpsProcess);
  }

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
