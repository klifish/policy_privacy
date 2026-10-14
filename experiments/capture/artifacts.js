const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { DUO_V3_DEPTH, DUO_V3_N, DUO_V3_M } = require('../../lib/duo_v3');

const {
  annotatePolicy,
  summarizeDataset
} = require('../analysis/crosscheck/spp/data_generator');

const DEFAULT_ARTIFACT_DIR = path.resolve(__dirname, '../data');

// Circuit build artefacts — imported from the TPS prover so the recorded
// provenance always describes the artefacts that actually produced the proofs
// (PROTOCOL_CIRCUITS_DIR overrides the default build/circuits location).
const {
  WASM_PATH: CIRCUIT_WASM_PATH,
  ZKEY_PATH: CIRCUIT_ZKEY_PATH,
  VKEY_PATH: CIRCUIT_VKEY_PATH
} = require('../../tps/proofGenerator');
const ROOT_DIR = path.resolve(__dirname, '../..');

function fileBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_) {
    return null;
  }
}

function fileSha256(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (_) {
    return null;
  }
}

/**
 * Run-level reproducibility metadata: circuit scale, toolchain versions, and the
 * git commit. All fields are best-effort; anything unresolved is recorded as null
 * rather than aborting the run. Recorded once per run (not per execution row).
 */
function buildProvenance({ network, protectionProfile } = {}) {
  let commitHash = null;
  try {
    commitHash = execSync('git rev-parse HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
  } catch (_) { /* not a git checkout or git unavailable */ }

  // A capture taken from a modified working tree is not the commit above: record
  // that, and the hash of the tracked changes (`git diff HEAD`).
  let workingTreeDiffSha256 = null;
  try {
    const diff = execSync('git diff HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
    workingTreeDiffSha256 = diff.length === 0 ? null : crypto.createHash('sha256').update(diff).digest('hex');
  } catch (_) { /* not a git checkout or git unavailable */ }

  // snarkjs does not expose package.json via its exports map, so resolve the
  // installed module and read package.json from its directory.
  let snarkjsVersion = null;
  try {
    const snarkjsMain = require.resolve('snarkjs');
    const snarkjsPkg = path.join(snarkjsMain.slice(0, snarkjsMain.indexOf(`${path.sep}snarkjs${path.sep}`) + `${path.sep}snarkjs`.length), 'package.json');
    snarkjsVersion = JSON.parse(fs.readFileSync(snarkjsPkg, 'utf8')).version;
  } catch (_) { /* snarkjs not resolvable from here */ }

  return {
    protocolVersion: 'duo-v3',
    // Circuit instantiation (see circuits/policy_privacy_main_instance.circom).
    circuitDepth: DUO_V3_DEPTH,
    numAttributes: DUO_V3_N,
    numPredicates: DUO_V3_M,
    circuitsDir: path.relative(ROOT_DIR, path.dirname(CIRCUIT_ZKEY_PATH)),
    wasmBytes: fileBytes(CIRCUIT_WASM_PATH),
    zkeyBytes: fileBytes(CIRCUIT_ZKEY_PATH),
    zkeySha256: fileSha256(CIRCUIT_ZKEY_PATH),
    vkeyBytes: fileBytes(CIRCUIT_VKEY_PATH),
    snarkjsVersion,
    nodeVersion: process.version,
    network: network || null,
    protectionProfile: protectionProfile || null,
    commitHash,
    workingTreeClean: commitHash ? workingTreeDiffSha256 === null : null,
    workingTreeDiffSha256
  };
}

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
  sourceConfigPath,
  network,
  protectionProfile
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
    provenance: buildProvenance({ network, protectionProfile }),
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

// Keeps the first `perPolicy` executions of each policy and outcome, so the
// slice holds granted and denied executions of every policy that has both.
function sliceExecutionsForSPP(executions, perPolicy = 3) {
  if (!Number.isInteger(perPolicy) || perPolicy <= 0) {
    return executions;
  }

  const seen = new Map();
  const subset = [];

  executions.forEach((record) => {
    const key = `${record.policyId}|${Boolean(record.satisfy)}`;
    const current = seen.get(key) || 0;
    if (current >= perPolicy) {
      return;
    }
    subset.push(record);
    seen.set(key, current + 1);
  });

  return subset;
}

// The PI slice is the designed pairs when the capture has a PI layer.
function buildExperimentSlices(executions, sppExecutionsPerPolicy) {
  const paired = executions.filter((record) => record.piPair);
  return {
    pch: executions,
    spp: sliceExecutionsForSPP(executions, sppExecutionsPerPolicy),
    pi: paired.length > 0 ? paired : executions
  };
}

function writeExecutionArtifacts({
  executions,
  artifactDir,
  sppExecutionsPerPolicy
}) {
  const paths = getArtifactPaths(artifactDir);
  ensureDir(paths.dir);

  writeJson(paths.executedDataset, executions);
  const slices = buildExperimentSlices(executions, sppExecutionsPerPolicy);
  writeJson(paths.pchDataset, slices.pch);
  writeJson(paths.sppDataset, slices.spp);
  writeJson(paths.piDataset, slices.pi);

  return paths;
}

module.exports = {
  DEFAULT_ARTIFACT_DIR,
  aggregatePoliciesByDefinition,
  annotateDatasetForSPP,
  getArtifactPaths,
  writeDatasetArtifacts,
  writeExecutionArtifacts,
  buildExperimentSlices,
  sliceExecutionsForSPP,
  buildProvenance
};
