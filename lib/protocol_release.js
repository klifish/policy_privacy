'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  DUO_V3_PROTOCOL_VERSION,
  DUO_V3_PUBLIC_SIGNAL_ORDER,
  DUO_V3_N,
  DUO_V3_M,
  DUO_V3_DEPTH
} = require('./duo_v3');

const ROOT = path.resolve(__dirname, '..');
const TAG = `v${DUO_V3_PROTOCOL_VERSION}`;
const RELEASE_ROOT_REL = `build/protocol/${TAG}`;
const CIRCUITS_REL = `${RELEASE_ROOT_REL}/circuits`;
const MANIFEST_REL = `protocol/releases/${TAG}.json`;
const PTAU_NAME = 'ppot_0080_20.ptau';
const PTAU_URL = 'https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_20.ptau';
// Pinned after downloading the phase-2-ready file from PTAU_URL and verifying
// its complete embedded contribution transcript with snarkjs 0.7.5.
const PTAU_EXPECTED_SHA256 = '560412532a1205145d5f21585274fb2cef61273496ddc7186aec855aab01a8cd';
const EXPECTED_R1CS = Object.freeze({
  wires: 81124,
  constraints: 81980,
  privateInputs: 496,
  publicInputs: 4,
  outputs: 1
});
const PARAMETER_COMMITMENT_FIELDS = Object.freeze([
  'predicateTypes',
  'predicateSchemaTags',
  'merkleRoots',
  'credPublicKeys',
  'rangeMin',
  'rangeMax',
  'ontologyPolicyIds',
  'ontologyEpochs',
  'scopeKinds',
  'approvedScopeIds',
  'policyValidFromEpoch',
  'policyValidUntilEpoch',
  'moratoriumUntilEpoch',
  'timeLimitEpochs'
]);
const ARTIFACT_SPECS = Object.freeze([
  { id: 'r1cs', path: `${CIRCUITS_REL}/policy_privacy_main_instance.r1cs` },
  { id: 'wasm', path: `${CIRCUITS_REL}/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm` },
  { id: 'symbolMap', path: `${CIRCUITS_REL}/policy_privacy_main_instance.sym` },
  { id: 'witnessCalculator', path: `${CIRCUITS_REL}/policy_privacy_main_instance_js/witness_calculator.js` },
  { id: 'provingKey', path: `${CIRCUITS_REL}/policy_privacy_main_final.zkey` },
  { id: 'verificationKey', path: `${CIRCUITS_REL}/policy_privacy_main_vk.json` },
  { id: 'ptauAttestation', path: 'protocol/trust/ppot_0080_20.json' },
  { id: 'solidityVerifier', path: 'contracts/PolicyPrivacyMainVerifier.sol' },
  { id: 'policyPrivacyAbi', path: `${RELEASE_ROOT_REL}/PolicyPrivacy.abi.json` },
  { id: 'policyPrivacyCreationBytecode', path: `${RELEASE_ROOT_REL}/PolicyPrivacy.bytecode` },
  { id: 'policyPrivacyDeployedBytecode', path: `${RELEASE_ROOT_REL}/PolicyPrivacy.deployed-bytecode` },
  { id: 'verifierAbi', path: `${RELEASE_ROOT_REL}/PolicyPrivacyMainVerifier.abi.json` },
  { id: 'poseidon3Abi', path: `${RELEASE_ROOT_REL}/Poseidon3.abi.json` },
  { id: 'poseidon3Bytecode', path: `${RELEASE_ROOT_REL}/Poseidon3.bytecode` }
]);

function absolute(relativePath, root = ROOT) {
  return path.resolve(root, relativePath);
}

function assertInsideRoot(filePath, root = ROOT) {
  const relative = path.relative(root, filePath);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `path escapes release root: ${filePath}`);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function commandOutput(executable, args) {
  return execFileSync(executable, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function snarkjsPath() {
  return path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'snarkjs.cmd' : 'snarkjs');
}

function parseR1csInfo(output) {
  const read = (label) => {
    const match = output.match(new RegExp(`# of ${label}:\\s*(\\d+)`, 'i'));
    assert.ok(match, `unable to parse R1CS ${label}`);
    return Number(match[1]);
  };
  return {
    wires: read('Wires'),
    constraints: read('Constraints'),
    privateInputs: read('Private Inputs'),
    publicInputs: read('Public Inputs'),
    outputs: read('Outputs')
  };
}

function r1csInfo(filePath) {
  return parseR1csInfo(commandOutput(snarkjsPath(), ['r1cs', 'info', filePath]));
}

function artifactEntry(spec, root = ROOT) {
  const filePath = absolute(spec.path, root);
  assert.ok(fs.existsSync(filePath), `required release artifact is missing: ${spec.path}`);
  assert.ok(fs.statSync(filePath).isFile(), `release artifact is not a file: ${spec.path}`);
  return { path: spec.path, bytes: fs.statSync(filePath).size, sha256: sha256File(filePath) };
}

function packageVersion(name) {
  return require(path.join(ROOT, 'node_modules', name, 'package.json')).version;
}

function buildManifest() {
  const ptauPath = path.resolve(process.env.PTAU_PATH || path.join(ROOT, 'build', 'circuits', PTAU_NAME));
  assert.ok(fs.existsSync(ptauPath), `PTAU file is missing: ${ptauPath}`);
  const attestation = JSON.parse(fs.readFileSync(absolute('protocol/trust/ppot_0080_20.json'), 'utf8'));
  const ptauSha256 = sha256File(ptauPath);
  assert.equal(ptauSha256, PTAU_EXPECTED_SHA256, 'PTAU file differs from the independently pinned release hash');
  assert.equal(attestation.sha256, ptauSha256, 'PTAU file differs from the project-owner attestation');
  assert.equal(attestation.bytes, fs.statSync(ptauPath).size, 'PTAU byte length differs from the attestation');
  assert.equal(attestation.transcriptAudit.status, 'previously-audited-by-project-owner');

  const artifacts = {};
  for (const spec of ARTIFACT_SPECS) artifacts[spec.id] = artifactEntry(spec);

  const packageLockPath = absolute('package-lock.json');
  const r1cs = absolute(ARTIFACT_SPECS.find(({ id }) => id === 'r1cs').path);
  const stats = r1csInfo(r1cs);
  assert.deepEqual(stats, EXPECTED_R1CS, 'main R1CS statistics differ from the frozen protocol');

  return {
    schemaVersion: 1,
    protocol: 'policy-privacy-duo',
    version: DUO_V3_PROTOCOL_VERSION,
    gitTag: TAG,
    status: 'release-candidate',
    scope: {
      localValidationOnly: true,
      amoyValidated: false,
      paperExperimentsRerun: false,
      productionMpcCeremony: false
    },
    proofSystem: { scheme: 'groth16', curve: 'bn128' },
    circuit: {
      entrypoint: 'circuits/policy_privacy_main_instance.circom',
      template: 'PolicyPrivacyMain',
      optimization: 'O2',
      parameters: { N: 13, M: 11, DEPTH: 64, K: 5, MERKLE_LEVELS: 8, RANGE_BITS: 32 },
      r1cs: stats
    },
    statement: {
      publicSignals: DUO_V3_PUBLIC_SIGNAL_ORDER.map((name, index) => ({
        index,
        name,
        direction: index === 0 ? 'output' : 'input',
        solidityType: 'uint256'
      })),
      solidityArrayType: 'uint256[5]'
    },
    commitments: {
      policy: {
        hash: 'Poseidon',
        formula: 'chunk[i]=Poseidon16(P[16i..16i+15]); policyHash=Poseidon4(chunk[0..3]); commitment=Poseidon3(policyHash,programLength,randomizer)',
        chunkSize: 16,
        paddedPolicyLength: 64,
        programLengthBound: true
      },
      context: { hash: 'Poseidon', formula: 'Poseidon(idReq, idRes, nonce)' },
      parameters: {
        hash: 'Poseidon',
        vectorHashChain: 'chain[0]=0; chain[i+1]=Poseidon(chain[i], value[i])',
        digestHashChain: 'digest[0]=0; digest[i+1]=Poseidon(digest[i], fieldDigest[i])',
        fields: PARAMETER_COMMITMENT_FIELDS,
        blinding: 'randomizer (the policy commitment randomizer), hashed after the fields',
        domainSeparator: 7
      }
    },
    goldenVectors: {
      policy: {
        policy: [1, ...Array(63).fill(0)],
        programLength: 1,
        randomizer: '12345',
        commitment: '6188529263597870953365864003941543971371730781757740254979781499492990398474'
      },
      context: {
        idReq: '101', idRes: '202', nonce: '303',
        contextHash: '16947480294709526194316021992207472708811178304342346590634176743326966425153'
      },
      parameters: {
        preset: 'all-disabled-v3',
        policyValidFromEpoch: '0',
        policyValidUntilEpoch: '4294967295',
        moratoriumUntilEpoch: '0',
        timeLimitEpochs: '0',
        randomizer: '12345',
        commitment: '16671338540461776457424107378813178011652104728410368549201967487443445667059'
      }
    },
    contractInterface: {
      verifier: 'verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[5])',
      boundRequest: 'requestAccessBound(uint256,uint256,uint256,uint256,uint256,uint256[2],uint256[2][2],uint256[2],uint256[5])',
      boundRequestWithGasPad: 'requestAccessBoundWithGasPad(uint256,uint256,uint256,uint256,uint256,uint256[2],uint256[2][2],uint256[2],uint256[5],uint256)'
    },
    toolchain: {
      node: process.version,
      nodePinned: fs.readFileSync(absolute('.nvmrc'), 'utf8').trim(),
      npm: commandOutput(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']),
      circom2Package: packageVersion('circom2'),
      circomCompiler: commandOutput(path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'circom2.cmd' : 'circom2'), ['--version']).split(/\\r?\\n/).pop(),
      snarkjs: packageVersion('snarkjs'),
      hardhat: packageVersion('hardhat'),
      solidityConfigured: '0.8.27',
      packageLock: { path: 'package-lock.json', bytes: fs.statSync(packageLockPath).size, sha256: sha256File(packageLockPath) }
    },
    ceremony: {
      ptau: { file: PTAU_NAME, url: PTAU_URL, bytes: fs.statSync(ptauPath).size, sha256: PTAU_EXPECTED_SHA256 },
      transcriptAudit: {
        status: 'previously-audited-by-project-owner',
        repeatedForThisRelease: false
      },
      phase2: 'single local CSPRNG contribution followed by a fixed final beacon',
      productionReady: false
    },
    artifacts,
    releaseAsset: `policy-privacy-duo-${TAG}-groth16.tar.zst`
  };
}

function writeManifest(manifest = buildManifest()) {
  const manifestPath = absolute(MANIFEST_REL);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function readManifest(manifestPath = absolute(MANIFEST_REL)) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function assertSubsequence(source, values, description) {
  let cursor = -1;
  for (const value of values) {
    const next = source.indexOf(value, cursor + 1);
    assert.ok(next > cursor, `${description} is missing or out of order at ${value}`);
    cursor = next;
  }
}

function functionByName(abi, name) {
  return abi.find((entry) => entry.type === 'function' && entry.name === name);
}

function verifyManifestInvariants(manifest) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.protocol, 'policy-privacy-duo');
  assert.equal(manifest.version, DUO_V3_PROTOCOL_VERSION);
  assert.equal(manifest.gitTag, TAG);
  assert.equal(manifest.status, 'release-candidate');
  assert.equal(manifest.proofSystem.scheme, 'groth16');
  assert.equal(manifest.proofSystem.curve, 'bn128');
  assert.deepEqual(manifest.circuit.parameters, { N: DUO_V3_N, M: DUO_V3_M, DEPTH: DUO_V3_DEPTH, K: 5, MERKLE_LEVELS: 8, RANGE_BITS: 32 });
  assert.equal(manifest.circuit.optimization, 'O2');
  assert.deepEqual(manifest.circuit.r1cs, EXPECTED_R1CS);
  assert.deepEqual(manifest.statement.publicSignals.map(({ name }) => name), [...DUO_V3_PUBLIC_SIGNAL_ORDER]);
  assert.deepEqual(manifest.statement.publicSignals.map(({ index }) => index), [0, 1, 2, 3, 4]);
  assert.equal(manifest.statement.solidityArrayType, 'uint256[5]');
  assert.equal(manifest.commitments.policy.programLengthBound, true);
  assert.equal(manifest.commitments.policy.chunkSize, 16);
  assert.equal(manifest.commitments.policy.formula, 'chunk[i]=Poseidon16(P[16i..16i+15]); policyHash=Poseidon4(chunk[0..3]); commitment=Poseidon3(policyHash,programLength,randomizer)');
  assert.deepEqual(manifest.commitments.parameters.fields, [...PARAMETER_COMMITMENT_FIELDS]);
  assert.equal(manifest.commitments.parameters.domainSeparator, 7);
  assert.equal(manifest.scope.localValidationOnly, true);
  assert.equal(manifest.scope.amoyValidated, false);
  assert.equal(manifest.ceremony.productionReady, false);
  assert.equal(manifest.ceremony.ptau.sha256, PTAU_EXPECTED_SHA256);
  assert.equal(manifest.ceremony.transcriptAudit.status, 'previously-audited-by-project-owner');
  assert.equal(manifest.ceremony.transcriptAudit.repeatedForThisRelease, false);
}

function verifySemanticInvariants(manifest, root = ROOT) {
  verifyManifestInvariants(manifest);
  assert.equal(manifest.toolchain.nodePinned, fs.readFileSync(absolute('.nvmrc', root), 'utf8').trim());
  assert.equal(manifest.toolchain.node, `v${manifest.toolchain.nodePinned}`, 'release was built with a Node version other than .nvmrc');

  const instance = fs.readFileSync(absolute('circuits/policy_privacy_main_instance.circom', root), 'utf8');
  assert.match(instance, /public\s*\[policyCommitment,\s*paramsCommitment,\s*contextHash,\s*requestEpoch\]/s);
  assert.match(instance, /PolicyPrivacyMain\(13,\s*11,\s*64,\s*5,\s*8,\s*32\)/s);

  const main = fs.readFileSync(absolute('circuits/policy_privacy_main.circom', root), 'utf8');
  assert.match(main, /PARAM_DOMAIN_SEPARATOR\s*=\s*7/);
  assert.match(main, /contextHash\s*===\s*contextHasher\.out/);
  assertSubsequence(main, [
    'predicateTypeHashChain[M]', 'predicateSchemaTagHashChain[M]', 'merkleRootHashChain[M]',
    'credPublicKeyHashChain[M]', 'rangeMinHashChain[M]', 'rangeMaxHashChain[M]',
    'ontologyPolicyIdHashChain[M]', 'ontologyEpochHashChain[M]', 'scopeKindHashChain[M]',
    'approvedScopeIdHashChain[M]', 'policyValidFromEpoch', 'policyValidUntilEpoch',
    'moratoriumUntilEpoch', 'timeLimitEpochs',
    'paramsDigestHashers[14].inputs[1] <== randomizer', 'PARAM_DOMAIN_SEPARATOR'
  ], 'parameter commitment chain');

  const verifierSource = fs.readFileSync(absolute('contracts/PolicyPrivacyMainVerifier.sol', root), 'utf8');
  assert.match(verifierSource, /contract\s+PolicyPrivacyMainVerifier\s*\{/);
  assert.match(verifierSource, /uint\[5\]\s+calldata\s+_pubSignals/);

  const contractSource = fs.readFileSync(absolute('contracts/PolicyPrivacy.sol', root), 'utf8');
  assert.match(contractSource, /_pubSignals\[1\]\s*==\s*policies\[_policyId\]\.commitment/);
  assert.match(contractSource, /_pubSignals\[2\]\s*==\s*policies\[_policyId\]\.paramsCommitment/);
  assert.match(contractSource, /_pubSignals\[3\]\s*==\s*contextHasher\.poseidon/s);
  assert.match(contractSource, /_pubSignals\[4\]\s*==\s*_requestEpoch/);

  const symLines = fs.readFileSync(absolute(manifest.artifacts.symbolMap.path, root), 'utf8').split(/\r?\n/).slice(0, 5);
  const symNames = symLines.map((line, index) => {
    const columns = line.split(',');
    assert.equal(Number(columns[0]), index + 1, `unexpected witness index in symbol row ${index + 1}`);
    assert.equal(Number(columns[1]), index + 1, `unexpected signal index in symbol row ${index + 1}`);
    return columns[3]?.replace(/^main\./, '');
  });
  assert.deepEqual(symNames, [...DUO_V3_PUBLIC_SIGNAL_ORDER], 'symbol map public-signal order differs');

  const abi = JSON.parse(fs.readFileSync(absolute(manifest.artifacts.policyPrivacyAbi.path, root), 'utf8'));
  const verifyProof = functionByName(abi, 'verifyProof');
  const requestAccessBound = functionByName(abi, 'requestAccessBound');
  const requestAccessBoundWithGasPad = functionByName(abi, 'requestAccessBoundWithGasPad');
  assert.ok(verifyProof && requestAccessBound && requestAccessBoundWithGasPad, 'frozen ABI is missing a required protocol entry point');
  assert.equal(verifyProof.inputs.at(-1).type, 'uint256[5]');
  assert.equal(requestAccessBound.inputs.at(-1).type, 'uint256[5]');
  assert.equal(requestAccessBoundWithGasPad.inputs.at(-2).type, 'uint256[5]');

  const verifierAbi = JSON.parse(fs.readFileSync(absolute(manifest.artifacts.verifierAbi.path, root), 'utf8'));
  assert.equal(functionByName(verifierAbi, 'verifyProof').inputs.at(-1).type, 'uint256[5]');
  const poseidonAbi = JSON.parse(fs.readFileSync(absolute(manifest.artifacts.poseidon3Abi.path, root), 'utf8'));
  assert.ok(poseidonAbi.some((entry) => entry.name === 'poseidon' && entry.inputs?.[0]?.type === 'uint256[3]'), 'Poseidon3 ABI is missing uint256[3] poseidon');
}

function verifyArtifactHashes(manifest, root = ROOT) {
  for (const spec of ARTIFACT_SPECS) {
    const expected = manifest.artifacts[spec.id];
    assert.ok(expected, `manifest artifact entry is missing: ${spec.id}`);
    assert.equal(expected.path, spec.path, `manifest artifact path differs: ${spec.id}`);
    const filePath = absolute(expected.path, root);
    assertInsideRoot(filePath, root);
    assert.ok(fs.existsSync(filePath), `frozen artifact is missing: ${expected.path}`);
    assert.equal(fs.statSync(filePath).size, expected.bytes, `artifact byte length differs: ${expected.path}`);
    assert.equal(sha256File(filePath), expected.sha256, `artifact SHA-256 differs: ${expected.path}`);
  }
  const lockPath = absolute(manifest.toolchain.packageLock.path, root);
  assert.equal(fs.statSync(lockPath).size, manifest.toolchain.packageLock.bytes, 'package-lock byte length differs');
  assert.equal(sha256File(lockPath), manifest.toolchain.packageLock.sha256, 'package-lock SHA-256 differs');
}

function verifyR1cs(manifest, root = ROOT) {
  const stats = r1csInfo(absolute(manifest.artifacts.r1cs.path, root));
  assert.deepEqual(stats, manifest.circuit.r1cs, 'R1CS statistics differ from the release manifest');
}

function verifyEphemeralBuild(manifest, circuitsDir) {
  verifyManifestInvariants(manifest);
  const files = {
    r1cs: path.join(circuitsDir, 'policy_privacy_main_instance.r1cs'),
    wasm: path.join(circuitsDir, 'policy_privacy_main_instance_js', 'policy_privacy_main_instance.wasm'),
    symbolMap: path.join(circuitsDir, 'policy_privacy_main_instance.sym')
  };
  for (const [id, filePath] of Object.entries(files)) {
    assert.ok(fs.existsSync(filePath), `ephemeral ${id} is missing: ${filePath}`);
    assert.equal(sha256File(filePath), manifest.artifacts[id].sha256, `ephemeral ${id} differs from the frozen source build`);
  }
  assert.deepEqual(r1csInfo(files.r1cs), manifest.circuit.r1cs, 'ephemeral R1CS statistics differ');
  const names = fs.readFileSync(files.symbolMap, 'utf8').split(/\r?\n/).slice(0, 5)
    .map((line) => line.split(',')[3]?.replace(/^main\./, ''));
  assert.deepEqual(names, [...DUO_V3_PUBLIC_SIGNAL_ORDER], 'ephemeral public-signal order differs');
}

function verifyPtauAndZkey(manifest, root = ROOT) {
  const ptauPath = path.resolve(process.env.PTAU_PATH || path.join(ROOT, 'build', 'circuits', manifest.ceremony.ptau.file));
  assert.ok(fs.existsSync(ptauPath), `PTAU file is missing: ${ptauPath}`);
  assert.equal(fs.statSync(ptauPath).size, manifest.ceremony.ptau.bytes, 'PTAU byte length differs');
  assert.equal(sha256File(ptauPath), manifest.ceremony.ptau.sha256, 'PTAU SHA-256 differs');
  const attestation = JSON.parse(fs.readFileSync(absolute(manifest.artifacts.ptauAttestation.path, root), 'utf8'));
  assert.equal(attestation.sha256, manifest.ceremony.ptau.sha256, 'PTAU attestation hash differs');
  assert.equal(attestation.transcriptAudit.status, 'previously-audited-by-project-owner');
  execFileSync(snarkjsPath(), [
    'zkey', 'verify',
    absolute(manifest.artifacts.r1cs.path, root),
    ptauPath,
    absolute(manifest.artifacts.provingKey.path, root)
  ], { cwd: root, stdio: 'inherit' });
}

async function verifyGoldenVectors(manifest) {
  const {
    calculatePolicyCommitment,
    calculateParamsCommitment,
    calculateContextHash
  } = require('./prover');
  const policyVector = manifest.goldenVectors.policy;
  assert.equal(
    await calculatePolicyCommitment(policyVector.policy, BigInt(policyVector.randomizer), policyVector.programLength),
    policyVector.commitment,
    'policy commitment golden vector differs'
  );
  const contextVector = manifest.goldenVectors.context;
  assert.equal(
    await calculateContextHash(contextVector.idReq, contextVector.idRes, contextVector.nonce),
    contextVector.contextHash,
    'context commitment golden vector differs'
  );
  const M = DUO_V3_M;
  const paramsVector = manifest.goldenVectors.parameters;
  assert.equal(
    await calculateParamsCommitment({
      predicateTypes: Array(M).fill(4),
      predicateSchemaTags: Array(M).fill(0),
      merkleRoots: Array(M).fill(0),
      credPublicKeys: Array(M).fill(0),
      rangeMin: Array(M).fill(0),
      rangeMax: Array(M).fill(0),
      ontologyPolicyIds: Array(M).fill(0),
      ontologyEpochs: Array(M).fill(0),
      scopeKinds: Array(M).fill(0),
      approvedScopeIds: Array(M).fill(0),
      policyValidFromEpoch: paramsVector.policyValidFromEpoch,
      policyValidUntilEpoch: paramsVector.policyValidUntilEpoch,
      moratoriumUntilEpoch: paramsVector.moratoriumUntilEpoch,
      timeLimitEpochs: paramsVector.timeLimitEpochs,
      randomizer: paramsVector.randomizer
    }),
    paramsVector.commitment,
    'parameter commitment golden vector differs'
  );
}

module.exports = {
  ROOT,
  TAG,
  RELEASE_ROOT_REL,
  CIRCUITS_REL,
  MANIFEST_REL,
  PTAU_NAME,
  PTAU_URL,
  PTAU_EXPECTED_SHA256,
  EXPECTED_R1CS,
  PARAMETER_COMMITMENT_FIELDS,
  ARTIFACT_SPECS,
  sha256File,
  parseR1csInfo,
  buildManifest,
  writeManifest,
  readManifest,
  verifyManifestInvariants,
  verifySemanticInvariants,
  verifyArtifactHashes,
  verifyR1cs,
  verifyEphemeralBuild,
  verifyPtauAndZkey,
  verifyGoldenVectors
};
