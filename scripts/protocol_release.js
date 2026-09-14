#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  ROOT,
  TAG,
  MANIFEST_REL,
  ARTIFACT_SPECS,
  sha256File,
  writeManifest,
  readManifest,
  verifySemanticInvariants,
  verifyArtifactHashes,
  verifyR1cs,
  verifyEphemeralBuild,
  verifyPtauAndZkey,
  verifyGoldenVectors
} = require('../lib/protocol_release');

async function verify({ verifyZkey = true } = {}) {
  const manifest = readManifest();
  verifySemanticInvariants(manifest);
  verifyArtifactHashes(manifest);
  verifyR1cs(manifest);
  await verifyGoldenVectors(manifest);

  const verifierScript = path.join(ROOT, 'scripts', 'verify_verifier_artifacts.js');
  execFileSync(process.execPath, [verifierScript], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PROTOCOL_CIRCUITS_DIR: path.dirname(path.join(ROOT, manifest.artifacts.r1cs.path)),
      PROTOCOL_VERIFIER_PATH: path.join(ROOT, manifest.artifacts.solidityVerifier.path)
    }
  });

  if (verifyZkey) verifyPtauAndZkey(manifest);
  console.log(`Protocol ${manifest.gitTag} manifest, sources, ABI and cryptographic artifacts are valid.`);
  return manifest;
}

async function packageRelease() {
  const manifest = await verify();
  const outputDir = path.join(ROOT, 'dist', 'protocol');
  fs.mkdirSync(outputDir, { recursive: true });
  const bundlePath = path.join(outputDir, manifest.releaseAsset);
  const checksumPath = path.join(outputDir, 'SHA256SUMS');
  const releaseManifestPath = path.join(outputDir, path.basename(MANIFEST_REL));
  const releaseFiles = [MANIFEST_REL, ...ARTIFACT_SPECS.map(({ path: filePath }) => filePath)];
  for (const filePath of releaseFiles) {
    const resolved = path.resolve(ROOT, filePath);
    const relative = path.relative(ROOT, resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `release path escapes repository: ${filePath}`);
  }
  fs.rmSync(bundlePath, { force: true });
  execFileSync('tar', ['--zstd', '-cf', bundlePath, ...releaseFiles], { cwd: ROOT, stdio: 'inherit' });
  // Publish a standalone copy alongside the archive: SHA256SUMS is meant to
  // verify the exact files a release consumer downloads from GitHub.
  fs.copyFileSync(path.join(ROOT, MANIFEST_REL), releaseManifestPath);
  const lines = [
    `${sha256File(bundlePath)}  ${path.basename(bundlePath)}`,
    `${sha256File(releaseManifestPath)}  ${path.basename(releaseManifestPath)}`
  ];
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`);
  console.log(`Release bundle: ${bundlePath}`);
  console.log(`Checksums: ${checksumPath}`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'manifest') {
    console.log(`Wrote ${path.relative(ROOT, writeManifest())}`);
    return;
  }
  if (command === 'verify') {
    await verify({ verifyZkey: !process.argv.includes('--skip-zkey') });
    return;
  }
  if (command === 'verify-ci') {
    const circuitsDir = process.env.PROTOCOL_CIRCUITS_DIR;
    assert.ok(circuitsDir, 'PROTOCOL_CIRCUITS_DIR is required for verify-ci');
    verifyEphemeralBuild(readManifest(), path.resolve(circuitsDir));
    console.log(`Ephemeral source build matches ${TAG}.`);
    return;
  }
  if (command === 'package') {
    await packageRelease();
    return;
  }
  throw new Error('usage: node scripts/protocol_release.js <manifest|verify|verify-ci|package> [--skip-zkey]');
}

main().catch((error) => {
  console.error(`Protocol release command failed: ${error.message}`);
  process.exitCode = 1;
});
