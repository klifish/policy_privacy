#!/usr/bin/env node

/**
 * Generate PI pair files from an existing execution dataset.
 *
 * Usage:
 *   node scripts/generate_pi_pairs.js --dataset-dir path/to/dataset
 *
 * Optional flags:
 *   --dataset <path/to/pi_dataset.json>
 *   --output <path/to/pi_pairs.json>
 *   --seed <number>
 *   --min <number>
 *   --target <number>
 *   --max <number>
 */

const fs = require('fs');
const path = require('path');

const {
  buildPairsFromExecutionResults,
  PI_DEFAULT_CONFIG
} = require('../experiments/analysis/crosscheck/pi/pi_data_generator');

function parseArgs(argv) {
  const args = {
    datasetDir: process.cwd(),
    dataset: null,
    output: null,
    minPairsPerType: PI_DEFAULT_CONFIG.minPairsPerType,
    targetPairsPerType: PI_DEFAULT_CONFIG.targetPairsPerType,
    maxPairsPerType: PI_DEFAULT_CONFIG.maxPairsPerType,
    randomSeed: null
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dataset-dir':
        args.datasetDir = argv[++i];
        break;
      case '--dataset':
        args.dataset = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--seed':
        args.randomSeed = argv[++i];
        break;
      case '--min':
        args.minPairsPerType = parseInt(argv[++i], 10);
        break;
      case '--target':
        args.targetPairsPerType = parseInt(argv[++i], 10);
        break;
      case '--max':
        args.maxPairsPerType = parseInt(argv[++i], 10);
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.warn(`Unknown argument "${arg}" ignored`);
    }
  }

  return args;
}

function printUsage() {
  console.log('Generate PI pairs from execution results');
  console.log('Options:');
  console.log('  --dataset-dir <path>  Directory containing pi_dataset.json');
  console.log('  --dataset <path>      Explicit dataset JSON path (overrides --dataset-dir)');
  console.log('  --output <path>       Output pi_pairs.json path');
  console.log('  --seed <value>        Random seed for pair sampling');
  console.log('  --min <n>             Minimum pairs per type');
  console.log('  --target <n>          Target pairs per type');
  console.log('  --max <n>             Maximum pairs per type');
}

function main() {
  const args = parseArgs(process.argv);
  const datasetDir = path.resolve(args.datasetDir);
  const datasetPath = path.resolve(args.dataset || path.join(datasetDir, 'pi_dataset.json'));
  const outputPath = path.resolve(args.output || path.join(datasetDir, 'pi_pairs.json'));

  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found: ${datasetPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(datasetPath, 'utf8');
  const executionResults = JSON.parse(raw);
  if (!Array.isArray(executionResults)) {
    console.error(`Dataset must be an array of execution results: ${datasetPath}`);
    process.exit(1);
  }

  const config = {
    ...PI_DEFAULT_CONFIG,
    minPairsPerType: args.minPairsPerType || PI_DEFAULT_CONFIG.minPairsPerType,
    targetPairsPerType: args.targetPairsPerType || PI_DEFAULT_CONFIG.targetPairsPerType,
    maxPairsPerType: args.maxPairsPerType || PI_DEFAULT_CONFIG.maxPairsPerType,
    randomSeed: args.randomSeed || PI_DEFAULT_CONFIG.randomSeed
  };

  const result = buildPairsFromExecutionResults(executionResults, config);

  const output = {
    generatedAt: new Date().toISOString(),
    piConfig: result.config,
    stats: result.stats,
    datasetMeta: {
      executionResults: executionResults.length,
      datasetPath: datasetPath
    },
    policies: result.policies,
    pairs: result.pairs
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Generated ${result.pairs.length} PI pairs at ${outputPath}`);
}

if (require.main === module) {
  main();
}
