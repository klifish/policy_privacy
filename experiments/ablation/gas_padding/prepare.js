'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  getArtifactPaths,
  sliceExecutionsForSPP
} = require('../../capture/artifacts');
const {
  calculatePolicyCommitment
} = require('../../../test/utils/proofGenerator');

const DEFAULT_SOURCE = path.resolve(
  __dirname,
  '../../data/polygonAmoy'
);
const DEFAULT_OUTPUT = path.resolve(__dirname, 'polygonAmoy');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sourceDir: DEFAULT_SOURCE,
    outputDir: DEFAULT_OUTPUT,
    minRowsPerClass: 70,
    minPoliciesPerClass: 8,
    sppExecutionsPerPolicy: 3
  };
  for (const arg of argv) {
    if (arg.startsWith('--source-dir=')) options.sourceDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--output-dir=')) options.outputDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--min-rows-per-class=')) options.minRowsPerClass = Number(arg.split('=')[1]);
    else if (arg.startsWith('--min-policies-per-class=')) options.minPoliciesPerClass = Number(arg.split('=')[1]);
    else if (arg.startsWith('--spp-executions=')) options.sppExecutionsPerPolicy = Number(arg.split('=')[1]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ['minRowsPerClass', 'minPoliciesPerClass', 'sppExecutionsPerPolicy']) {
    if (!Number.isInteger(options[key]) || options[key] < 1) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  return options;
}

function printUsage() {
  console.log('Prepare a deterministic B2 subset for the B1/B2 gas-padding ablation.');
  console.log('Usage: node experiments/ablation/gas_padding/prepare.js [options]');
  console.log('  --source-dir=<path>             Existing B2 unified artifacts');
  console.log('  --output-dir=<path>             Ablation artifact root');
  console.log('  --min-rows-per-class=<n>        Coverage target per label class (default: 70)');
  console.log('  --min-policies-per-class=<n>    Independent policy target per label class (default: 8)');
  console.log('  --spp-executions=<n>            SPP executions retained per policy (default: 3)');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function policyKey(entry) {
  if (entry.policyIndex !== undefined && entry.policyIndex !== null) {
    return String(entry.policyIndex);
  }
  if (entry.policyId !== undefined && entry.policyId !== null) {
    return String(entry.policyId);
  }
  throw new Error('Every policy definition must carry policyIndex or policyId');
}

function stableEntryIdentity(entry) {
  return {
    policyIndex: entry.policyIndex,
    policyId: entry.policyId,
    layer: entry.layer,
    layerVariant: entry.layerVariant,
    duoTerm: entry.duoTerm,
    duoTermCodes: entry.duoTermCodes || [],
    ontologyNamespace: entry.ontologyNamespace,
    ontologyValue: entry.ontologyValue,
    logicStructure: entry.logicStructure,
    structureType: entry.structureType,
    nestingDepth: entry.nestingDepth,
    predicateCombo: entry.predicateCombo,
    paramType: entry.paramType,
    randomizer: entry.randomizer,
    policyCommitment: entry.policyCommitment || entry.structure?.policyCommitment,
    policyHash: entry.structure?.policyHash
  };
}

function stableLabelIdentity(entry) {
  const identity = stableEntryIdentity(entry);
  delete identity.randomizer;
  delete identity.policyCommitment;
  return identity;
}

function replayDefinition(execution) {
  const definition = { ...execution };
  delete definition.features;
  delete definition.transactions;
  delete definition.blockchainPolicyId;
  delete definition.paramsCommitment;
  delete definition.protectionProfile;
  // The replay must use B2's actual randomizer so the recomputed commitment and
  // calldata are paired with the existing B2 execution, not the stale
  // pre-execution randomizer in historical policy_definitions.json.
  definition.randomizer = execution.randomizer || execution.structure?.randomizer;
  if (definition.structure) {
    definition.structure = { ...definition.structure };
  }
  return definition;
}

function assertSourceAlignment(definitions, executions) {
  if (definitions.length !== executions.length) {
    throw new Error(
      `B2 source is not aligned: ${definitions.length} definitions vs ${executions.length} executions`
    );
  }
  definitions.forEach((definition, index) => {
    const execution = executions[index];
    const left = JSON.stringify(stableLabelIdentity(definition));
    const right = JSON.stringify(stableLabelIdentity(execution));
    if (left !== right) {
      throw new Error(`B2 source definition/execution mismatch at index ${index}`);
    }
  });
}

function labelsFor(entry) {
  const labels = [];
  for (const code of entry.duoTermCodes || []) labels.push(`duo:${code}`);
  if ((entry.duoTermCodes || []).length === 0 && entry.duoTerm != null) {
    labels.push(`duo:${entry.duoTerm}`);
  }
  if (entry.ontologyNamespace === 'ICD10' && entry.ontologyValue != null) {
    labels.push(`icd10:${entry.ontologyValue}`);
  }
  for (const [dimension, value] of [
    ['logicStructure', entry.logicStructure],
    ['structureType', entry.structureType],
    ['nestingDepth', entry.nestingDepth],
    ['predicateCombo', entry.predicateCombo],
    ['paramType', entry.paramType]
  ]) {
    if (value != null) labels.push(`${dimension}:${value}`);
  }
  return [...new Set(labels)];
}

function buildPolicies(definitions) {
  const policies = new Map();
  definitions.forEach((entry, index) => {
    const key = policyKey(entry);
    if (!policies.has(key)) policies.set(key, { key, indices: [], labels: new Set() });
    const policy = policies.get(key);
    policy.indices.push(index);
    for (const label of labelsFor(entry)) policy.labels.add(label);
  });
  return policies;
}

function coverageFor(selected, policies) {
  const coverage = new Map();
  for (const key of selected) {
    const policy = policies.get(key);
    for (const label of policy.labels) {
      if (!coverage.has(label)) coverage.set(label, { rows: 0, policies: 0 });
      const value = coverage.get(label);
      value.rows += policy.indices.length;
      value.policies += 1;
    }
  }
  return coverage;
}

function selectPolicies(definitions, options) {
  const policies = buildPolicies(definitions);
  const allLabels = [...new Set(
    [...policies.values()].flatMap(policy => [...policy.labels])
  )].sort();
  const selected = new Set(
    [...policies.values()]
      .filter(policy => policy.indices.length >= 30)
      .map(policy => policy.key)
  );
  const available = coverageFor(new Set(policies.keys()), policies);
  const effectiveTargets = new Map(allLabels.map(label => {
    const maximum = available.get(label) || { rows: 0, policies: 0 };
    return [label, {
      rows: Math.min(options.minRowsPerClass, maximum.rows),
      policies: Math.min(options.minPoliciesPerClass, maximum.policies)
    }];
  }));

  const orderedCandidates = [...policies.values()]
    .filter(policy => !selected.has(policy.key))
    .sort((a, b) => {
      const an = Number(a.key);
      const bn = Number(b.key);
      return Number.isFinite(an) && Number.isFinite(bn)
        ? an - bn
        : a.key.localeCompare(b.key);
    });

  let coverage = coverageFor(selected, policies);
  const deficient = label => {
    const value = coverage.get(label) || { rows: 0, policies: 0 };
    const target = effectiveTargets.get(label);
    return value.rows < target.rows || value.policies < target.policies;
  };

  for (const policy of orderedCandidates) {
    if (![...policy.labels].some(deficient)) continue;
    selected.add(policy.key);
    coverage = coverageFor(selected, policies);
    if (allLabels.every(label => !deficient(label))) break;
  }

  const failures = allLabels.filter(deficient);
  if (failures.length > 0) {
    throw new Error(
      `Source dataset cannot satisfy coverage targets for: ${failures.join(', ')}`
    );
  }

  const indices = [...selected]
    .flatMap(key => policies.get(key).indices)
    .sort((a, b) => a - b);
  return {
    indices,
    selectedPolicyKeys: [...selected].sort(),
    highExecutionPolicies: [...policies.values()].filter(p => p.indices.length >= 30).length,
    coverage: Object.fromEntries(
      allLabels.map(label => [label, {
        ...coverage.get(label),
        target: effectiveTargets.get(label),
        available: available.get(label)
      }])
    )
  };
}

function writeB2Subset(outputDir, definitions, executions, selection, options, sourceDir) {
  const selectedDefinitions = selection.indices.map(index => replayDefinition(executions[index]));
  const selectedExecutions = selection.indices.map(index => executions[index]);
  const sharedDir = path.join(outputDir, 'shared');
  const b2Dir = path.join(outputDir, 'b2_padded');
  const b2Paths = getArtifactPaths(b2Dir);

  writeJson(path.join(sharedDir, 'policy_definitions.json'), selectedDefinitions);
  writeJson(path.join(sharedDir, 'selected_source_indices.json'), selection.indices);
  writeJson(b2Paths.policyDefinitions, selectedDefinitions);
  writeJson(b2Paths.executedDataset, selectedExecutions);
  writeJson(b2Paths.pchDataset, selectedExecutions);
  writeJson(
    b2Paths.sppDataset,
    sliceExecutionsForSPP(selectedExecutions, options.sppExecutionsPerPolicy)
  );
  writeJson(b2Paths.piDataset, selectedExecutions);

  const sourceConfig = path.join(sourceDir, 'config.json');
  if (fs.existsSync(sourceConfig)) {
    fs.copyFileSync(sourceConfig, b2Paths.config);
    fs.copyFileSync(sourceConfig, path.join(sharedDir, 'source_config.json'));
  }

  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceB2Dir: sourceDir,
    sourceDefinitionCount: definitions.length,
    replayDefinitionSource: 'existing B2 executed_dataset.json (actual randomizer/commitment provenance)',
    selectedExecutionCount: selectedDefinitions.length,
    selectedPolicyCount: selection.selectedPolicyKeys.length,
    highExecutionPoliciesRetained: selection.highExecutionPolicies,
    selectionRules: {
      retainPoliciesWithAtLeastExecutions: 30,
      minRowsPerClass: options.minRowsPerClass,
      minPoliciesPerClass: options.minPoliciesPerClass,
      dimensions: ['DUO', 'ICD10', 'logicStructure', 'structureType', 'nestingDepth', 'predicateCombo', 'paramType']
    },
    selectedSourceIndicesSha256: sha256(selection.indices),
    policyDefinitionsSha256: sha256(selectedDefinitions),
    b2ExecutionsSha256: sha256(selectedExecutions),
    coverage: selection.coverage,
    profiles: {
      b1: 'b1_unpadded',
      b2: 'b2_padded'
    },
    amoyPreflightEstimate: {
      transactionCount: selectedDefinitions.length * 3 + 2,
      gasPriceGwei: 30,
      gasUnitsWith25PercentBuffer: Math.ceil(
        (4_500_000 + selectedDefinitions.length * (350_000 + 100_000 + 650_000)) * 1.25
      ),
      estimatedNativeToken: (
        Math.ceil(
          (4_500_000 + selectedDefinitions.length * (350_000 + 100_000 + 650_000)) * 1.25
        ) * 30e9 / 1e18
      )
    },
    limitation: 'B2 is reused from the existing Polygon Amoy run; B1 and B2 were not executed contemporaneously. blockDifference remains excluded from modeling.'
  };
  writeJson(path.join(outputDir, 'execution_manifest.json'), manifest);
  return manifest;
}

async function assertReplayCommitments(definitions, executions) {
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index];
    const expected = BigInt(executions[index].policyCommitment).toString();
    // numOperations is part of the commitment preimage, so the replay must
    // supply the same program length as the original execution.
    const numOperations = definition.numOperations
      ?? definition.structure?.numOperations
      ?? definition.policy.filter((t) => t !== 0).length;
    const actual = BigInt(
      await calculatePolicyCommitment(definition.policy, definition.randomizer, numOperations)
    ).toString();
    if (actual !== expected) {
      throw new Error(`Replay commitment mismatch at selected index ${index}`);
    }
  }
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    return;
  }
  const sourcePaths = getArtifactPaths(options.sourceDir);
  const definitions = readJson(sourcePaths.policyDefinitions);
  const executions = readJson(sourcePaths.executedDataset);
  assertSourceAlignment(definitions, executions);
  const selection = selectPolicies(definitions, options);
  const selectedReplayDefinitions = selection.indices.map(
    index => replayDefinition(executions[index])
  );
  const selectedExecutions = selection.indices.map(index => executions[index]);
  await assertReplayCommitments(selectedReplayDefinitions, selectedExecutions);
  const manifest = writeB2Subset(
    options.outputDir,
    definitions,
    executions,
    selection,
    options,
    options.sourceDir
  );
  console.log(`Prepared deterministic B2 subset at ${options.outputDir}`);
  console.log(`  executions: ${manifest.selectedExecutionCount}/${manifest.sourceDefinitionCount}`);
  console.log(`  policies:   ${manifest.selectedPolicyCount}`);
  console.log(`  high-execution PI policies retained: ${manifest.highExecutionPoliciesRetained}`);
  console.log(`  definitions sha256: ${manifest.policyDefinitionsSha256}`);
  console.log(`  estimated Amoy transactions: ${manifest.amoyPreflightEstimate.transactionCount}`);
  console.log(
    `  estimated B1 cost at 30 gwei (25% buffer): ` +
    `${manifest.amoyPreflightEstimate.estimatedNativeToken.toFixed(3)} native token`
  );
  console.log('\nRun B1 with:');
  console.log(
    'PROTOCOL_CIRCUITS_DIR=$PWD/build/protocol/v3.0.0-rc1/circuits ' +
    `UNIFIED_DATASET_PATH=${path.join(options.outputDir, 'shared/policy_definitions.json')} ` +
    `UNIFIED_CONFIG_PATH=${path.join(options.outputDir, 'shared/source_config.json')} ` +
    `UNIFIED_ARTIFACT_DIR=${path.join(options.outputDir, 'b1_unpadded')} ` +
    'PROTECTION_PROFILE=b1_unpadded ' +
    'npx hardhat run experiments/capture/run.js --network polygonAmoy'
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  assertSourceAlignment,
  labelsFor,
  selectPolicies,
  stableEntryIdentity,
  stableLabelIdentity,
  replayDefinition,
  assertReplayCommitments,
  sha256
};
