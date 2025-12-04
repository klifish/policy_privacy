const fs = require('fs');
const path = require('path');

const {
  annotatePolicy,
  summarizeDataset
} = require('./structure_and_parameter_privacy/data_generator');

const DEFAULT_ARTIFACT_DIR = path.join(__dirname, 'unified_dataset_artifacts');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function aggregatePoliciesByDefinition(dataset) {
  const policies = new Map();

  dataset.forEach((result) => {
    const id = result.policyId;
    if (!policies.has(id)) {
      policies.set(id, {
        policyId: id,
        policyIndex: result.policyIndex,
        layer: result.layer,
        layerVariant: result.layerVariant,
        duoTerm: result.duoTerm,
        duoTerms: Array.isArray(result.duoTerms) ? result.duoTerms.slice() : [],
        semantics: { ...(result.semantics || {}) },
        structure: { ...(result.structure || {}) },
        executionProfile: { ...(result.execution || {}) },
        predicateSlots: Array.isArray(result.predicateSlots) ? result.predicateSlots.slice() : [],
        ontologyNamespace: result.ontologyNamespace,
        ontologyValue: result.ontologyValue,
        executionCount: 0
      });
    }

    const policy = policies.get(id);
    policy.executionCount += 1;
  });

  return Array.from(policies.values());
}

function buildFamilyId(policy) {
  const parts = [
    policy.logicStructure,
    policy.predicateCombo,
    policy.paramType,
    policy.rangeWidth
  ].filter(Boolean);
  return parts.join('__');
}

function annotateDatasetForSPP(dataset) {
  const policies = aggregatePoliciesByDefinition(dataset);
  policies.forEach((policy) => annotatePolicy(policy));

  const lookup = new Map();
  policies.forEach((policy) => lookup.set(policy.policyId, policy));

  dataset.forEach((entry) => {
    const annotation = lookup.get(entry.policyId);
    if (!annotation) {
      return;
    }
    entry.logicStructure = annotation.logicStructure;
    entry.nestingDepth = annotation.nestingDepth;
    entry.predicateCount = annotation.predicateCount;
    entry.setSize = annotation.setSize;
    entry.rangeWidth = annotation.rangeWidth;
    entry.structureType = annotation.structureType;
    entry.predicateCombo = annotation.predicateCombo;
    entry.paramType = annotation.paramType;
    entry.structureStats = annotation.structureStats;
    if (!entry.familyId) {
      entry.familyId = buildFamilyId(annotation);
    }
  });

  const summary = summarizeDataset(policies);

  return {
    dataset,
    policies,
    summary
  };
}

function getArtifactPaths(baseDir) {
  const dir = baseDir ? path.resolve(baseDir) : DEFAULT_ARTIFACT_DIR;
  return {
    dir,
    policyDefinitions: path.join(dir, 'policy_definitions.json'),
    executedDataset: path.join(dir, 'executed_dataset.json'),
    metadata: path.join(dir, 'metadata.json'),
    config: path.join(dir, 'config.json'),
    summary: path.join(dir, 'artifact_index.json'),
    pchDataset: path.join(dir, 'pch_dataset.json'),
    sppDataset: path.join(dir, 'spp_dataset.json'),
    piDataset: path.join(dir, 'pi_dataset.json')
  };
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function writeDatasetArtifacts({
  dataset,
  config,
  artifactDir,
  summary,
  sourceConfigPath
}) {
  const paths = getArtifactPaths(artifactDir);
  ensureDir(paths.dir);

  writeJson(paths.policyDefinitions, dataset);

  if (config) {
    writeJson(paths.config, config);
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    policyCount: config?.policyCount ?? null,
    executionsPerPolicy: config?.executionsPerPolicy ?? null,
    satisfyRatio: config?.satisfyRatio ?? null,
    seed: config?.seed ?? null,
    datasetEntries: Array.isArray(dataset) ? dataset.length : null,
    summary
  };

  writeJson(paths.metadata, metadata);
  writeJson(paths.summary, {
    datasetPath: paths.policyDefinitions,
    executedDatasetPath: paths.executedDataset,
    artifactsDir: paths.dir,
    configPath: sourceConfigPath || null,
    generatedAt: metadata.generatedAt
  });

  return { paths, metadata };
}

function sliceExecutionsForSPP(executions, perPolicy = 3) {
  if (!Number.isInteger(perPolicy) || perPolicy <= 0) {
    return executions;
  }

  const seen = new Map();
  const subset = [];

  executions.forEach((record) => {
    const current = seen.get(record.policyId) || 0;
    if (current >= perPolicy) {
      return;
    }
    subset.push(record);
    seen.set(record.policyId, current + 1);
  });

  return subset;
}

function writeExecutionArtifacts({
  executions,
  artifactDir,
  sppExecutionsPerPolicy
}) {
  const paths = getArtifactPaths(artifactDir);
  ensureDir(paths.dir);

  writeJson(paths.executedDataset, executions);
  writeJson(paths.pchDataset, executions);

  const sppExecutions = sliceExecutionsForSPP(executions, sppExecutionsPerPolicy);
  writeJson(paths.sppDataset, sppExecutions);
  writeJson(paths.piDataset, executions);

  return paths;
}

module.exports = {
  DEFAULT_ARTIFACT_DIR,
  aggregatePoliciesByDefinition,
  annotateDatasetForSPP,
  getArtifactPaths,
  writeDatasetArtifacts,
  writeExecutionArtifacts,
  sliceExecutionsForSPP
};
