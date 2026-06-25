'use strict';

const fs = require('fs');
const path = require('path');

const { getArtifactPaths } = require('../../unified/artifacts');
const { sha256, stableEntryIdentity } = require('./prepare');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function assertAligned(b1, b2) {
  if (b1.length !== b2.length) {
    throw new Error(`B1/B2 execution count mismatch: ${b1.length} vs ${b2.length}`);
  }
  for (let index = 0; index < b1.length; index++) {
    const left = JSON.stringify(stableEntryIdentity(b1[index]));
    const right = JSON.stringify(stableEntryIdentity(b2[index]));
    if (left !== right) throw new Error(`B1/B2 label or policy mismatch at index ${index}`);
    if (b1[index].protectionProfile !== 'b1_unpadded') {
      throw new Error(`B1 record ${index} does not declare protectionProfile=b1_unpadded`);
    }
  }
}

function verifyAblation(rootDir) {
  const manifestPath = path.join(rootDir, 'execution_manifest.json');
  const manifest = readJson(manifestPath);
  const sharedDefinitions = readJson(path.join(rootDir, 'shared/policy_definitions.json'));
  const b1Paths = getArtifactPaths(path.join(rootDir, 'b1_unpadded'));
  const b2Paths = getArtifactPaths(path.join(rootDir, 'b2_padded'));
  const b1Definitions = readJson(b1Paths.policyDefinitions);
  const b2Definitions = readJson(b2Paths.policyDefinitions);
  const b1Executions = readJson(b1Paths.executedDataset);
  const b2Executions = readJson(b2Paths.executedDataset);

  const expectedHash = manifest.policyDefinitionsSha256;
  for (const [name, value] of [
    ['shared', sharedDefinitions],
    ['B1', b1Definitions],
    ['B2', b2Definitions]
  ]) {
    const actual = sha256(value);
    if (actual !== expectedHash) {
      throw new Error(`${name} policy definition hash mismatch: ${actual} != ${expectedHash}`);
    }
  }
  assertAligned(b1Executions, b2Executions);

  const verification = {
    verifiedAt: new Date().toISOString(),
    policyDefinitionsSha256: expectedHash,
    executionCount: b1Executions.length,
    b1ExecutionsSha256: sha256(b1Executions),
    b2ExecutionsSha256: sha256(b2Executions),
    aligned: true
  };
  writeJson(path.join(rootDir, 'comparison', 'alignment.json'), verification);
  return verification;
}

if (require.main === module) {
  const rootDir = path.resolve(process.argv[2] || path.join(__dirname, 'polygonAmoy'));
  try {
    const result = verifyAblation(rootDir);
    console.log(`B1/B2 alignment verified for ${result.executionCount} executions.`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { assertAligned, verifyAblation };
