#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildWhitelist, toHex } = require('../utils/merkle/ontology_whitelist');

function printUsage() {
  console.log('Usage: node scripts/build_ontology_whitelist.js --config <file> [--out <dir>] [--force]');
  console.log();
  console.log('Options:');
  console.log('  --config <file>   Path to JSON config describing ontology terms');
  console.log('  --out <dir>       Output directory (defaults to artifacts/ontology_whitelist)');
  console.log('  --force           Allow writing into a non-empty output directory');
  console.log('  --help            Show this message');
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--config':
        args.configPath = argv[++i];
        break;
      case '--out':
      case '--out-dir':
        args.outputDir = argv[++i];
        break;
      case '--force':
        args.force = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function loadConfig(configPath) {
  const resolved = path.resolve(configPath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!raw.terms && raw.termsFile) {
    const termsPath = path.resolve(path.dirname(resolved), raw.termsFile);
    raw.terms = JSON.parse(fs.readFileSync(termsPath, 'utf8'));
  }
  if (!Array.isArray(raw.terms)) {
    throw new Error('Config must include a "terms" array or "termsFile" path');
  }
  return raw;
}

function ensureOutputDir(dirPath, force) {
  if (fs.existsSync(dirPath)) {
    const entries = fs.readdirSync(dirPath);
    if (entries.length > 0 && !force) {
      throw new Error(`Output directory ${dirPath} is not empty. Use --force to override.`);
    }
  } else {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilename(namespace, termId) {
  const safeNs = namespace.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const trimmedNs = safeNs.replace(/^_+|_+$/g, '') || 'namespace';
  const safeTerm = String(termId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'term';
  const truncatedTerm = safeTerm.length > 64 ? safeTerm.slice(0, 64) : safeTerm;
  return `${trimmedNs}__${truncatedTerm}`;
}

function serializeEntry(entry, metadata) {
  return {
    namespace: entry.namespace,
    namespaceId: entry.namespaceId,
    termId: entry.termId,
    epoch: entry.epoch.toString(),
    index: entry.index,
    termHash: toHex(entry.termHash),
    termHashFull: toHex(entry.termHashFull),
    packed: toHex(entry.packed),
    leaf: toHex(entry.leaf),
    pathElements: entry.pathElements.map(toHex),
    pathIndices: entry.pathIndices,
    root: metadata.rootHex,
    merkleLevels: metadata.merkleLevels
  };
}

async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.configPath) {
    printUsage();
    if (!args.configPath) {
      process.exit(args.help ? 0 : 1);
    }
    return;
  }

  const config = loadConfig(args.configPath);
  const outputDir = path.resolve(args.outputDir || config.outputDir || path.join(process.cwd(), 'artifacts', 'ontology_whitelist'));
  const proofsDir = path.join(outputDir, 'proofs');

  ensureOutputDir(outputDir, args.force);
  fs.mkdirSync(proofsDir, { recursive: true });

  const { metadata, entries } = await buildWhitelist(config);

  const rootPayload = {
    root: metadata.rootHex,
    merkleLevels: metadata.merkleLevels,
    treeSize: metadata.treeSize,
    leafCount: metadata.leafCount,
    fillerLeaf: metadata.fillerLeafHex,
    configHash: metadata.configHash,
    generatedAt: new Date().toISOString(),
    terms: entries.map(entry => ({
      namespace: entry.namespace,
      namespaceId: entry.namespaceId,
      termId: entry.termId,
      epoch: entry.epoch.toString(),
      index: entry.index,
      packed: toHex(entry.packed),
      leaf: toHex(entry.leaf)
    }))
  };

  fs.writeFileSync(path.join(outputDir, 'root.json'), JSON.stringify(rootPayload, null, 2));

  entries.forEach(entry => {
    const payload = serializeEntry(entry, metadata);
    const baseName = sanitizeFilename(entry.namespace, entry.termId);
    const fileName = `${entry.index.toString().padStart(4, '0')}_${baseName}.json`;
    fs.writeFileSync(path.join(proofsDir, fileName), JSON.stringify(payload, null, 2));
  });

  console.log('Poseidon Merkle whitelist generated');
  console.log(`  Root: ${metadata.rootHex}`);
  console.log(`  Merkle levels: ${metadata.merkleLevels}`);
  console.log(`  Leaves: ${metadata.leafCount} / ${metadata.treeSize}`);
  console.log(`  Output directory: ${outputDir}`);
}

if (require.main === module) {
  run(process.argv.slice(2)).catch(err => {
    console.error(err.stack || err.message || err);
    process.exit(1);
  });
}

module.exports = { run };
