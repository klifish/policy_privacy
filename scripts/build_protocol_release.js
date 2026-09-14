#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  ROOT,
  TAG,
  RELEASE_ROOT_REL,
  PTAU_NAME
} = require('../lib/protocol_release');

const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
const profile = profileArg ? profileArg.slice('--profile='.length) : 'rc';
assert.ok(['rc', 'ci'].includes(profile), 'profile must be rc or ci');

const finalOutputRoot = profile === 'rc'
  ? path.join(ROOT, RELEASE_ROOT_REL)
  : path.join(ROOT, 'build', 'ci', 'protocol');
const outputRoot = profile === 'rc'
  ? path.join(ROOT, 'build', 'protocol', `.${TAG}.staging-${process.pid}`)
  : finalOutputRoot;
const circuitsDir = path.join(outputRoot, 'circuits');
const isolatedContractsDir = path.join(outputRoot, 'contracts');
const isolatedArtifactsDir = path.join(outputRoot, 'hardhat-artifacts');
const isolatedCacheDir = path.join(outputRoot, 'hardhat-cache');
const ptauPath = path.resolve(process.env.PTAU_PATH || path.join(ROOT, 'build', 'circuits', PTAU_NAME));
const verifierPath = path.join(isolatedContractsDir, 'PolicyPrivacyMainVerifier.sol');

function run(executable, args, options = {}) {
  console.log(`> ${path.basename(executable)} ${args.join(' ')}`);
  execFileSync(executable, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...options.env }
  });
}

function localBin(name) {
  return path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

function assertBuildTarget(target) {
  const buildRoot = path.join(ROOT, 'build');
  const relative = path.relative(buildRoot, target);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `refusing to replace non-build path: ${target}`);
}

function findArtifact(start, suffix) {
  const pending = [start];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      if (entry.isFile() && full.endsWith(suffix)) return full;
    }
  }
  throw new Error(`Hardhat artifact not found: ${suffix}`);
}

function main() {
  const pinnedNode = fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim();
  assert.equal(process.version.replace(/^v/, ''), pinnedNode, `release build requires Node ${pinnedNode}, got ${process.version}`);
  assert.ok(fs.existsSync(ptauPath), `PTAU file is missing: ${ptauPath}`);
  assertBuildTarget(finalOutputRoot);
  assertBuildTarget(outputRoot);
  if (profile === 'rc') {
    const manifestPath = path.join(ROOT, 'protocol', 'releases', `${TAG}.json`);
    let tagExists = false;
    try {
      execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${TAG}`], { cwd: ROOT, stdio: 'ignore' });
      tagExists = true;
    } catch (_) {
      tagExists = false;
    }
    assert.ok(!fs.existsSync(manifestPath), `${TAG} manifest already exists; advance to a new RC instead of regenerating it`);
    assert.ok(!tagExists, `${TAG} tag already exists; released tags are immutable`);
  }
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(circuitsDir, { recursive: true });
  fs.cpSync(path.join(ROOT, 'contracts'), isolatedContractsDir, { recursive: true });

  run(localBin('circom2'), [
    'circuits/policy_privacy_main_instance.circom',
    '--r1cs', '--wasm', '--sym', '--O2',
    '-o', circuitsDir,
    '-l', 'node_modules'
  ]);

  run(process.execPath, ['scripts/groth16_trust_setup.js'], {
    env: {
      PROTOCOL_CIRCUITS_DIR: circuitsDir,
      PTAU_PATH: ptauPath,
      VERIFY_PTAU_TRANSCRIPT: process.env.VERIFY_PTAU_TRANSCRIPT || '0'
    }
  });

  const zkey = path.join(circuitsDir, 'policy_privacy_main_final.zkey');
  const verificationKey = path.join(circuitsDir, 'policy_privacy_main_vk.json');
  run(localBin('snarkjs'), ['zkey', 'export', 'verificationkey', zkey, verificationKey]);
  run(localBin('snarkjs'), ['zkey', 'export', 'solidityverifier', zkey, verifierPath]);

  let verifier = fs.readFileSync(verifierPath, 'utf8');
  verifier = verifier.replace(/contract\s+Groth16Verifier\s*\{/g, 'contract PolicyPrivacyMainVerifier {');
  assert.match(verifier, /contract\s+PolicyPrivacyMainVerifier\s*\{/, 'unable to normalize generated verifier contract name');
  fs.writeFileSync(verifierPath, verifier);

  run(process.execPath, ['scripts/verify_verifier_artifacts.js'], {
    env: {
      PROTOCOL_CIRCUITS_DIR: circuitsDir,
      PROTOCOL_VERIFIER_PATH: verifierPath
    }
  });

  const hardhatEnv = {
    HARDHAT_SOURCES: isolatedContractsDir,
    HARDHAT_ARTIFACTS: isolatedArtifactsDir,
    HARDHAT_CACHE: isolatedCacheDir
  };
  run(localBin('hardhat'), ['compile', '--force'], { env: hardhatEnv });

  if (profile === 'rc') {
    const policyArtifact = findArtifact(isolatedArtifactsDir, `${path.sep}PolicyPrivacy.json`);
    const policyJson = JSON.parse(fs.readFileSync(policyArtifact, 'utf8'));
    const abi = policyJson.abi;
    assert.ok(Array.isArray(abi) && abi.length > 0, 'PolicyPrivacy ABI is empty');
    fs.writeFileSync(path.join(outputRoot, 'PolicyPrivacy.abi.json'), `${JSON.stringify(abi, null, 2)}\n`);
    fs.writeFileSync(path.join(outputRoot, 'PolicyPrivacy.bytecode'), `${policyJson.bytecode}\n`);
    fs.writeFileSync(path.join(outputRoot, 'PolicyPrivacy.deployed-bytecode'), `${policyJson.deployedBytecode}\n`);

    const verifierArtifact = findArtifact(isolatedArtifactsDir, `${path.sep}PolicyPrivacyMainVerifier.json`);
    const verifierAbi = JSON.parse(fs.readFileSync(verifierArtifact, 'utf8')).abi;
    fs.writeFileSync(path.join(outputRoot, 'PolicyPrivacyMainVerifier.abi.json'), `${JSON.stringify(verifierAbi, null, 2)}\n`);

    const { poseidonContract } = require('circomlibjs');
    fs.writeFileSync(path.join(outputRoot, 'Poseidon3.abi.json'), `${JSON.stringify(poseidonContract.generateABI(3), null, 2)}\n`);
    fs.writeFileSync(path.join(outputRoot, 'Poseidon3.bytecode'), `${poseidonContract.createCode(3)}\n`);

    fs.rmSync(finalOutputRoot, { recursive: true, force: true });
    fs.renameSync(outputRoot, finalOutputRoot);
    fs.copyFileSync(
      path.join(finalOutputRoot, 'contracts', 'PolicyPrivacyMainVerifier.sol'),
      path.join(ROOT, 'contracts', 'PolicyPrivacyMainVerifier.sol')
    );
    run(localBin('hardhat'), ['compile', '--force']);
  }

  console.log(`Protocol ${TAG} ${profile} build completed at ${path.relative(ROOT, finalOutputRoot)}.`);
}

try {
  main();
} catch (error) {
  console.error(`Protocol build failed: ${error.message}`);
  process.exitCode = 1;
}
