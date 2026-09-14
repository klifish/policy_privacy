'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ROOT,
  ARTIFACT_SPECS,
  readManifest,
  verifyManifestInvariants,
  verifyArtifactHashes,
  verifyGoldenVectors
} = require('../lib/protocol_release');

describe('DUO V3 frozen protocol release', function () {
  this.timeout(120000);

  it('matches the pinned policy, parameter and context commitment vectors', async function () {
    await verifyGoldenVectors(readManifest());
  });

  it('rejects a swapped public-signal order', function () {
    const manifest = structuredClone(readManifest());
    [manifest.statement.publicSignals[2], manifest.statement.publicSignals[3]] = [
      manifest.statement.publicSignals[3],
      manifest.statement.publicSignals[2]
    ];
    assert.throws(() => verifyManifestInvariants(manifest), /Expected values to be strictly deep-equal/);
  });

  it('rejects a changed parameter commitment field order', function () {
    const manifest = structuredClone(readManifest());
    [manifest.commitments.parameters.fields[0], manifest.commitments.parameters.fields[1]] = [
      manifest.commitments.parameters.fields[1],
      manifest.commitments.parameters.fields[0]
    ];
    assert.throws(() => verifyManifestInvariants(manifest), /Expected values to be strictly deep-equal/);
  });

  it('rejects a one-byte artifact mutation', function () {
    const manifest = readManifest();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-v3-release-tamper-'));
    try {
      for (const spec of ARTIFACT_SPECS) {
        const source = path.join(ROOT, spec.path);
        const target = path.join(tempRoot, spec.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.symlinkSync(source, target);
      }
      const lockTarget = path.join(tempRoot, manifest.toolchain.packageLock.path);
      fs.mkdirSync(path.dirname(lockTarget), { recursive: true });
      fs.symlinkSync(path.join(ROOT, manifest.toolchain.packageLock.path), lockTarget);

      const victim = path.join(tempRoot, manifest.artifacts.poseidon3Abi.path);
      fs.unlinkSync(victim);
      const bytes = fs.readFileSync(path.join(ROOT, manifest.artifacts.poseidon3Abi.path));
      bytes[bytes.length - 2] ^= 1;
      fs.writeFileSync(victim, bytes);

      assert.throws(() => verifyArtifactHashes(manifest, tempRoot), /SHA-256 differs/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
