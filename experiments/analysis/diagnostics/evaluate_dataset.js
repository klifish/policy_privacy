#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  loadDataset,
  evaluateDatasetQuality,
  formatQualityReport,
} = require("./dataset_quality");

function printUsage() {
  const lines = [
    "Usage: node evaluate_dataset.js --dataset <path> [options]",
    "",
    "Options:",
    "  --dataset <path>   Path to dataset JSON file generated in phase 1",
    "  --output <path>    Optional path to write quality report JSON",
    "  --json             Print JSON summary to stdout instead of text report",
    "  --help             Show this message",
  ];
  console.log(lines.join("\n"));
}

function parseArgs(argv) {
  const config = {
    dataset: null,
    output: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--dataset":
        config.dataset = argv[++i];
        break;
      case "--output":
        config.output = argv[++i];
        break;
      case "--json":
        config.json = true;
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        console.warn(`Ignoring unknown argument: ${arg}`);
    }
  }

  return config;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.dataset) {
    printUsage();
    process.exit(args.help ? 0 : 1);
    return;
  }

  try {
    const dataset = loadDataset(args.dataset);
    const quality = evaluateDatasetQuality(dataset);

    if (args.output) {
      const resolvedOutput = path.resolve(args.output);
      fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
      fs.writeFileSync(resolvedOutput, JSON.stringify(quality, null, 2));
      console.log(`Saved quality report to ${resolvedOutput}`);
    }

    if (args.json) {
      console.log(JSON.stringify(quality, null, 2));
    } else {
      console.log(formatQualityReport(quality));
    }
  } catch (error) {
    console.error("Dataset evaluation failed:", error.message);
    process.exit(1);
  }
}

main();
