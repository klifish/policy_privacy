/**
 * Unified Dataset Pipeline
 *
 * 1. Runs the unified dataset validator with a chosen config
 * 2. Saves annotated policy definitions to a shared artifact folder
 * 3. Executes the dataset on-chain once and saves execution results
 * 4. Emits experiment-specific dataset slices (PCH/SPP/PI)
 *
 * Usage (Hardhat does not forward arbitrary script flags, so env vars are the
 * portable CLI interface):
 *   UNIFIED_CONFIG_PATH=experiments/capture/configs/unified_dataset_config_decoupled.json \
 *   UNIFIED_ARTIFACT_DIR=experiments/data/<network> \
 *   PROTECTION_PROFILE=b2_padded \
 *   npx hardhat run experiments/capture/run.js --network <network>
 */

const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const { ethers, network } = require('hardhat');

const {
  validateUnifiedDataset,
  UNIFIED_CONFIG
} = require('./validator');

const {
  DEFAULT_ARTIFACT_DIR,
  annotateDatasetForSPP,
  writeDatasetArtifacts,
  writeExecutionArtifacts
} = require('./artifacts');

const { executeDatasetWithProgress } = require('../core/execution');

const {
  ensureSufficientBalance,
  getExperimentSigner,
  deployPolicyPrivacyContracts
} = require('../core/blockchain');
const {
  PROTECTION_PROFILES,
  normalizeProtectionProfile
} = require('../core/data_generator');

const tpsClient = require('../../lib/tps-client');

const DEFAULT_TPS_PORT = process.env.TPS_PORT || '3001';
const TPS_STARTUP_TIMEOUT_MS = 15000;
const TPS_POLL_INTERVAL_MS = 300;

async function findFreePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && !process.env.TPS_PORT) {
        const fallback = net.createServer();
        fallback.unref();
        fallback.on('error', reject);
        fallback.listen(0, '127.0.0.1', () => {
          const { port } = fallback.address();
          fallback.close(() => resolve(String(port)));
        });
        return;
      }
      reject(error);
    });
    server.listen(Number(preferredPort), '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(String(port)));
    });
  });
}

function sameAddress(a, b) {
  if (!a || !b) return false;
  try {
    return ethers.getAddress(a) === ethers.getAddress(b);
  } catch (_) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }
}

async function waitForTps(expected = {}) {
  const deadline = Date.now() + TPS_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const health = await tpsClient.health();
      if (
        expected.contractAddress &&
        !sameAddress(health.contractAddress, expected.contractAddress)
      ) {
        throw new Error(
          `TPS health check reached a different service. Expected contract ${expected.contractAddress}, ` +
          `got ${health.contractAddress || 'none'}. Stop the stale TPS process or use another TPS_PORT.`
        );
      }
      return;
    } catch (error) {
      if (/different service/i.test(error.message)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, TPS_POLL_INTERVAL_MS));
    }
  }
  throw new Error(`TPS server did not become ready within ${TPS_STARTUP_TIMEOUT_MS}ms`);
}

async function startTpsServer(extraEnv = {}) {
  const tpsPort = await findFreePort(DEFAULT_TPS_PORT);
  const tpsUrl = `http://127.0.0.1:${tpsPort}`;
  process.env.TPS_URL = tpsUrl;

  const tpsIndexPath = path.resolve(__dirname, '../../tps/index.js');
  const tps = spawn(process.execPath, [tpsIndexPath], {
    env: { ...process.env, TPS_PORT: tpsPort, TPS_URL: tpsUrl, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  tps.stdout.on('data', (data) => process.stdout.write(`[TPS] ${data}`));
  tps.stderr.on('data', (data) => process.stderr.write(`[TPS] ${data}`));
  tps.on('error', (err) => { throw new Error(`Failed to start TPS server: ${err.message}`); });

  console.log(`Starting TPS server (port ${tpsPort})...`);
  await Promise.race([
    waitForTps({ contractAddress: extraEnv.CONTRACT_ADDRESS }),
    new Promise((_, reject) => {
      tps.once('exit', (code, signal) => {
        reject(new Error(`TPS server exited before readiness (code=${code}, signal=${signal || 'none'})`));
      });
    })
  ]);
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
    datasetPath: null,
    protectionProfile: null,
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
    } else if (arg.startsWith('--dataset=')) {
      options.datasetPath = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--protection-profile=')) {
      options.protectionProfile = normalizeProtectionProfile(arg.split('=')[1]);
    } else if (arg.startsWith('--spp-executions=')) {
      options.sppExecutionsPerPolicy = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--coverage-executions=')) {
      options.coverageExecutions = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--depth-executions=')) {
      options.depthExecutions = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--depth-per-structure=')) {
      options.depthSubsetPerStructure = parseInt(arg.split('=')[1], 10);
    }
  });

  return options;
}

function printUsage() {
  console.log('Usage: npx hardhat run experiments/capture/run.js [--network <net>] [options]');
  console.log('\nOptions:');
  console.log('  --config=<path>            Path to unified dataset config (JSON)');
  console.log('  --artifact-dir=<path>      Output directory for shared artifacts');
  console.log('  --dataset=<path>           Reuse exact policy definitions instead of regenerating them');
  console.log('  --protection-profile=<id>  b1_unpadded or b2_padded (default: b2_padded)');
  console.log('  --spp-executions=<n>       Executions per policy to expose to SPP experiment (default: 3)');
  console.log('  --coverage-executions=<n>  Two-layer: executions for coverage-layer policies (default from config)');
  console.log('  --depth-executions=<n>     Two-layer: executions for depth-layer subset; enables two-layer mode');
  console.log('  --depth-per-structure=<n>  Two-layer: depth-subset policies per logicStructure (default: 8)');
  console.log('  --help                     Show this message');
}

async function runUnifiedDatasetWorkflow(cliOptions = {}) {
  const options = {
    // Artifacts are network-scoped by default so testnet results (with real
    // tx hashes) are never overwritten by localhost smoke runs.
    artifactDir: cliOptions.artifactDir ||
      (process.env.UNIFIED_ARTIFACT_DIR ? path.resolve(process.env.UNIFIED_ARTIFACT_DIR) : null) ||
      path.join(DEFAULT_ARTIFACT_DIR, network.name),
    configPath: cliOptions.configPath || process.env.UNIFIED_CONFIG_PATH,
    datasetPath: cliOptions.datasetPath ||
      (process.env.UNIFIED_DATASET_PATH ? path.resolve(process.env.UNIFIED_DATASET_PATH) : null),
    protectionProfile: normalizeProtectionProfile(
      cliOptions.protectionProfile || process.env.PROTECTION_PROFILE || PROTECTION_PROFILES.B2_PADDED
    ),
    sppExecutionsPerPolicy: cliOptions.sppExecutionsPerPolicy ?? 3
  };

  let config = { ...UNIFIED_CONFIG };
  if (options.configPath) {
    const loaded = JSON.parse(fs.readFileSync(options.configPath, 'utf8'));
    config = { ...config, ...loaded };
  }

  // CLI two-layer overrides win over the config file (only when provided).
  ['coverageExecutions', 'depthExecutions', 'depthSubsetPerStructure'].forEach((key) => {
    if (cliOptions[key] !== undefined) {
      config[key] = cliOptions[key];
    }
  });

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
    console.log('Artifacts: default experiments/data/<network>');
  }
  console.log();

  let sourceDataset;
  let effectiveConfig = config;
  if (options.datasetPath) {
    sourceDataset = JSON.parse(fs.readFileSync(options.datasetPath, 'utf8'));
    if (!Array.isArray(sourceDataset) || sourceDataset.length === 0) {
      throw new Error(`Reusable dataset must be a non-empty JSON array: ${options.datasetPath}`);
    }
    const reusedPolicyIds = new Set(
      sourceDataset.map(entry => entry.policyIndex ?? entry.policyId)
    );
    effectiveConfig = {
      ...config,
      policyCount: reusedPolicyIds.size,
      policyCountTarget: reusedPolicyIds.size,
      executionsPerPolicy: null,
      reusedDataset: true
    };
    console.log(`Reusing exact policy definitions: ${options.datasetPath}`);
  } else {
    const validationResult = await validateUnifiedDataset(config, {
      writeArtifacts: false,
      sourceConfigPath: options.configPath
    });
    effectiveConfig = validationResult.config ?? config;
    if (!validationResult.allPassed) {
      throw new Error('Unified dataset validation failed. Resolve issues before executing on-chain.');
    }
    sourceDataset = validationResult.dataset;
  }

  // Step 2: annotate + save dataset artifacts
  const { dataset: annotatedDataset, summary } = annotateDatasetForSPP(sourceDataset);
  effectiveConfig = {
    ...effectiveConfig,
    protectionProfile: options.protectionProfile,
    sourceDatasetPath: options.datasetPath
  };
  const { paths } = writeDatasetArtifacts({
    dataset: annotatedDataset,
    config: effectiveConfig,
    artifactDir: options.artifactDir,
    summary,
    sourceConfigPath: options.configPath,
    network: network.name,
    protectionProfile: options.protectionProfile
  });

  console.log(`Policy definitions saved to: ${paths.policyDefinitions}`);
  console.log(`Protection profile: ${options.protectionProfile}`);

  // Step 3: execute dataset on-chain via TPS workflow
  const provider = ethers.provider;
  const signer = await getExperimentSigner(provider);

  // TPS signer pays the requestAccessBound txs — resolve its address up front
  // so the preflight can check both accounts. Local networks always use
  // hardhat account #1 (a .env TPS_PRIVATE_KEY for a testnet has no local
  // funds); public networks require an explicit, funded TPS_PRIVATE_KEY.
  const isLocalNetwork = network.name === 'localhost' || network.name === 'hardhat';
  const tpsPrivateKey = isLocalNetwork
    ? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    : process.env.TPS_PRIVATE_KEY;
  if (!tpsPrivateKey) {
    throw new Error(`TPS_PRIVATE_KEY must be set to a funded account for network "${network.name}".`);
  }
  const tpsAddress = new ethers.Wallet(tpsPrivateKey).address;

  const artifactDir = path.dirname(paths.executedDataset);
  const checkpointPath = path.join(artifactDir, 'execution_checkpoint.json');
  const contractCachePath = path.join(artifactDir, 'contract_cache.json');

  // On a resume only the executions still to run cost gas; a preflight
  // over the full dataset would refuse a wallet that is ample for the rest.
  let completedExecutions = 0;
  if (fs.existsSync(checkpointPath)) {
    try {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      completedExecutions = Number(checkpoint?.data?.lastIndex ?? -1) + 1;
    } catch (_) { /* unreadable checkpoint: preflight the whole dataset */ }
  }
  if (completedExecutions > 0) {
    console.log(`Balance preflight covers the ${annotatedDataset.length - completedExecutions} executions after checkpoint index ${completedExecutions - 1}.`);
  }
  await ensureSufficientBalance({
    provider,
    signer,
    executionCount: Math.max(annotatedDataset.length - completedExecutions, 0),
    tpsAddress
  });

  // Reuse previously deployed contract if a checkpoint + contract cache both exist.
  let policyPrivacy;
  const hasCheckpoint = fs.existsSync(checkpointPath);
  const hasContractCache = fs.existsSync(contractCachePath);
  if (hasCheckpoint && hasContractCache) {
    const { policyPrivacyAddress, verifierAddress } = JSON.parse(fs.readFileSync(contractCachePath, 'utf8'));
    console.log(`Resuming — reusing contracts from previous run:`);
    console.log(`  Verifier:      ${verifierAddress}`);
    console.log(`  PolicyPrivacy: ${policyPrivacyAddress}`);
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    policyPrivacy = PolicyPrivacy.attach(policyPrivacyAddress);
  } else {
    policyPrivacy = await deployPolicyPrivacyContracts();
    fs.writeFileSync(contractCachePath, JSON.stringify({
      policyPrivacyAddress: await policyPrivacy.getAddress(),
      verifierAddress: null  // not needed post-deploy
    }, null, 2));
  }

  // Start TPS server for this experiment run.
  // On Amoy, pin the gas price to 30 gwei (>= the enforced 25 gwei minimum tip)
  // instead of the RPC-suggested ~59 gwei, halving the experiment cost.
  const tpsGasPriceGwei = process.env.TPS_GAS_PRICE_GWEI ||
    (network.name === 'polygonAmoy' ? '30' : '');
  // Pin the provider-side commit/registerResource gas price in THIS process too
  // (executePolicy runs here, not in the TPS subprocess). Without this, an RPC
  // timeout+retry on a commit tx can fall back to a ~1 gwei tip and be rejected
  // by Amoy's 25 gwei minimum — which aborted the first full run at policy 368.
  if (tpsGasPriceGwei && !process.env.PROVIDER_GAS_PRICE_GWEI) {
    process.env.PROVIDER_GAS_PRICE_GWEI = tpsGasPriceGwei;
  }
  // Access-path gas padding base target (defense-in-depth on the commitment-only
  // interface). MUST exceed the bare access gas across ALL policies so the whole
  // randomized ±10% band stays above real usage — otherwise a low target both
  // defeats padding (_padGasToTarget early-returns) and risks out-of-gas reverts.
  // Measured on Amoy 2026-09-17 (eth_estimateGas replay of the rc1 verifier
  // and access path): bare requestAccessBound ~748k, and the padded entry
  // point does not fall below ~881k for any target — Amoy prices the bn256
  // precompiles above Istanbul (the same verifyProof call costs 243k on
  // hardhat and 372k on Amoy), so the local rehearsal under-measures. Above
  // that floor the padded cost tracks target + ~31k. Base 1.05M → band
  // 945k–1.155M, bottom 64k above the floor (proof zero-byte variance is
  // ~17k). The earlier 750k base (band 675k–825k) sat entirely below the
  // floor and OOG-reverted the first Amoy tx. Override or disable (0) via env.
  const accessGasPadTarget = options.protectionProfile === PROTECTION_PROFILES.B1_UNPADDED
    ? '0'
    : (process.env.TPS_ACCESS_GAS_PAD_TARGET || '1050000');
  const tpsProcess = await startTpsServer({
    TPS_PRIVATE_KEY: tpsPrivateKey,
    CONTRACT_ADDRESS: await policyPrivacy.getAddress(),
    // TPS must talk to the same chain hardhat is targeting.
    ETH_NODE_URL: network.config.url || 'http://127.0.0.1:8545',
    TPS_GAS_PRICE_GWEI: tpsGasPriceGwei,
    TPS_ACCESS_GAS_PAD_TARGET: accessGasPadTarget
  });
  let executionResults;
  try {
    console.log(`Executing ${annotatedDataset.length} policy instances via TPS...`);
    console.log(`(Checkpoint: ${checkpointPath} — safe to Ctrl+C and resume with: npm run unified or npm run unified:testnet)`);
    executionResults = await executeDatasetWithProgress(
      annotatedDataset,
      policyPrivacy,
      paths.executedDataset,
      {
        checkpointPath,
        clearCheckpointOnDone: true,
        continueOnError: false,
        executionOptions: { protectionProfile: options.protectionProfile }
      }
    );
    fs.unlinkSync(contractCachePath);
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
  console.log('     node experiments/analysis/crosscheck/pch/run_experiment.js --use-unified-dataset --phase 2');
  console.log('  2. Run SPP experiment phase 2+:');
  console.log('     node experiments/analysis/crosscheck/spp/run_experiment.js --use-unified-dataset --phase 2');
  console.log('  3. Run PI experiment phase 2+:');
  console.log('     node experiments/analysis/crosscheck/pi/run_experiment.js --use-unified-dataset --phase 2');
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
