'use strict';

const path = require('path');

/**
 * Parse CLI arguments common to all three experiment runners.
 *
 * Handles: --phase/--start-phase, --dataset, --execution-results, --output,
 *          --policy-count, --executions-per-policy, --satisfy-ratio,
 *          --test-ratio, --seed, --use-unified-dataset/--unified,
 *          --unified-dir, --help/-h
 *
 * Returns a partial config object; callers merge it with their own defaults
 * and handle any experiment-specific flags in their own parseArgs().
 */
function parseCommonArgs(argv) {
  const config = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--phase':
      case '--start-phase':
        config.startPhase = parseInt(argv[++i], 10);
        break;
      case '--dataset':
        config.datasetPath = path.resolve(argv[++i]);
        break;
      case '--execution-results':
        config.executionResultsPath = path.resolve(argv[++i]);
        break;
      case '--output':
        config.outputDir = path.resolve(argv[++i]);
        break;
      case '--policy-count':
        config.policyCount = parseInt(argv[++i], 10);
        break;
      case '--executions-per-policy':
        config.executionsPerPolicy = parseInt(argv[++i], 10);
        break;
      case '--satisfy-ratio':
        config.satisfyRatio = parseFloat(argv[++i]);
        break;
      case '--test-ratio':
        config.testRatio = parseFloat(argv[++i]);
        break;
      case '--seed':
        config.seed = argv[++i];
        break;
      case '--use-unified-dataset':
      case '--unified':
        config.useUnifiedDataset = true;
        break;
      case '--unified-dir':
        config.unifiedDatasetDir = path.resolve(argv[++i]);
        break;
      case '--network':
        config.network = argv[++i];
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
      default:
        if (arg.startsWith('--unified-dir=')) {
          config.unifiedDatasetDir = path.resolve(arg.split('=')[1]);
        } else if (arg.startsWith('--network=')) {
          config.network = arg.split('=')[1];
        } else {
          // Unknown args are returned so callers can handle them
          config._unknown = config._unknown || [];
          config._unknown.push(arg);
        }
    }
  }

  return config;
}

/**
 * Print the CLI flags that are common to all experiment runners.
 * Call this from each experiment's printUsage() after its own header.
 */
function printCommonHelp() {
  console.log('Common options:');
  console.log('  --phase <1|2|3>                   Resume from given phase');
  console.log('  --dataset <path>                  Use pre-generated dataset JSON');
  console.log('  --execution-results <path>        Path to cached execution results');
  console.log('  --output <dir>                    Output directory (default: ./results)');
  console.log('  --policy-count <n>                Number of base policies to generate');
  console.log('  --executions-per-policy <n>       Executions per policy');
  console.log('  --satisfy-ratio <float>           Ratio of satisfying executions');
  console.log('  --test-ratio <float>              Train/test split ratio');
  console.log('  --seed <value>                    Random seed for reproducibility');
  console.log('  --use-unified-dataset             Reuse dataset/executions from unified pipeline');
  console.log('  --unified-dir <path>              Override unified artifact directory');
  console.log('  --network <name>                  Network scope for artifact/result dirs (default: localhost)');
  console.log('  --help, -h                        Show this help message');
}

/**
 * Wire up the standard CLI entry point for an experiment runner.
 *
 * Handles: help flag, runExperiment invocation, and process.exit codes.
 * Must be called with the caller's own `module` object so the
 * `require.main === callerModule` guard works correctly.
 *
 * @param {NodeModule} callerModule   - Pass `module` from the calling file.
 * @param {object}     opts
 * @param {Function}   opts.runExperiment  - Main async experiment function.
 * @param {Function}   opts.parseArgs      - CLI argument parser.
 * @param {Function}   opts.printUsage     - Help printer.
 * @param {Function}   opts.getPassedFlag  - (report) => boolean — extracts overall pass/fail.
 */
function runMain(callerModule, { runExperiment, parseArgs, printUsage, getPassedFlag }) {
  if (require.main !== callerModule) return;

  const config = parseArgs();

  if (config.help) {
    printUsage();
    process.exit(0);
  }

  console.log('Configuration:', config);

  runExperiment(config)
    .then((report) => {
      process.exit(getPassedFlag(report) ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n❌ Experiment failed:', error);
      process.exit(1);
    });
}

module.exports = { parseCommonArgs, printCommonHelp, runMain };
