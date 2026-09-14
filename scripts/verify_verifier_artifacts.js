#!/usr/bin/env node
'use strict';

/**
 * Fails when the checked-in Solidity verifier does not represent the current
 * Groth16 zkey and exported verification key.  This prevents a circuit build
 * from silently deploying stale verifier constants.
 */

const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CIRCUITS = process.env.PROTOCOL_CIRCUITS_DIR
    ? path.resolve(process.env.PROTOCOL_CIRCUITS_DIR)
    : path.join(ROOT, 'build', 'circuits');
const ZKEY = path.join(CIRCUITS, 'policy_privacy_main_final.zkey');
const VKEY = path.join(CIRCUITS, 'policy_privacy_main_vk.json');
const VERIFIER = process.env.PROTOCOL_VERIFIER_PATH
    ? path.resolve(process.env.PROTOCOL_VERIFIER_PATH)
    : path.join(ROOT, 'contracts', 'PolicyPrivacyMainVerifier.sol');
const SNARKJS = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'snarkjs.cmd' : 'snarkjs');

function readJson(file) {
    assert.ok(fs.existsSync(file), `required artifact is missing: ${path.relative(ROOT, file)}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function scalar(source, name) {
    const match = source.match(new RegExp(`uint256\\s+constant\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
    assert.ok(match, `verifier constant ${name} is missing`);
    return match[1];
}

function assertPointConstants(source, vk) {
    const expected = {
        alphax: vk.vk_alpha_1[0], alphay: vk.vk_alpha_1[1],
        betax1: vk.vk_beta_2[0][1], betax2: vk.vk_beta_2[0][0],
        betay1: vk.vk_beta_2[1][1], betay2: vk.vk_beta_2[1][0],
        gammax1: vk.vk_gamma_2[0][1], gammax2: vk.vk_gamma_2[0][0],
        gammay1: vk.vk_gamma_2[1][1], gammay2: vk.vk_gamma_2[1][0],
        deltax1: vk.vk_delta_2[0][1], deltax2: vk.vk_delta_2[0][0],
        deltay1: vk.vk_delta_2[1][1], deltay2: vk.vk_delta_2[1][0]
    };
    for (const [name, value] of Object.entries(expected)) {
        assert.equal(scalar(source, name), value, `verifier ${name} differs from verification key`);
    }
    vk.IC.forEach((point, index) => {
        assert.equal(scalar(source, `IC${index}x`), point[0], `verifier IC${index}.x differs from verification key`);
        assert.equal(scalar(source, `IC${index}y`), point[1], `verifier IC${index}.y differs from verification key`);
    });
}

function compareExportedKey(zkeyKey, checkedInKey) {
    const fields = ['protocol', 'curve', 'nPublic', 'vk_alpha_1', 'vk_beta_2', 'vk_gamma_2', 'vk_delta_2', 'IC'];
    for (const field of fields) {
        assert.deepEqual(checkedInKey[field], zkeyKey[field], `verification key field ${field} differs from final zkey`);
    }
}

function main() {
    assert.ok(fs.existsSync(ZKEY), `required artifact is missing: ${path.relative(ROOT, ZKEY)}`);
    assert.ok(fs.existsSync(SNARKJS), 'local snarkjs executable is required; run npm ci first');
    const checkedInKey = readJson(VKEY);
    const verifier = fs.readFileSync(VERIFIER, 'utf8');

    assert.equal(checkedInKey.protocol, 'groth16', 'verification key must use Groth16');
    assert.equal(checkedInKey.curve, 'bn128', 'verification key must use BN254/bn128');
    assert.equal(checkedInKey.nPublic, 5, 'main circuit must expose exactly five public signals');
    assert.equal(checkedInKey.IC.length, checkedInKey.nPublic + 1, 'verification key IC length must equal nPublic + 1');
    assert.match(verifier, /contract\s+PolicyPrivacyMainVerifier\s*\{/, 'unexpected Solidity verifier contract name');
    const publicSignalMatch = verifier.match(/uint\[(\d+)\]\s+calldata\s+_pubSignals/);
    assert.ok(publicSignalMatch, 'Solidity verifier public-signal parameter is missing');
    assert.equal(Number(publicSignalMatch[1]), checkedInKey.nPublic, 'Solidity verifier public-signal count differs from verification key');
    assertPointConstants(verifier, checkedInKey);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkpi-vkey-'));
    const exportedKey = path.join(tempDir, 'verification_key.json');
    try {
        execFileSync(SNARKJS, ['zkey', 'export', 'verificationkey', ZKEY, exportedKey], {
            cwd: ROOT,
            stdio: 'pipe'
        });
        compareExportedKey(readJson(exportedKey), checkedInKey);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log(`Verifier artifacts are synchronized (Groth16, ${checkedInKey.nPublic} public signals).`);
}

try {
    main();
} catch (error) {
    console.error(`Verifier artifact validation failed: ${error.message}`);
    process.exitCode = 1;
}
