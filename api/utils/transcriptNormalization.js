'use strict';

/**
 * Observability-Aware Transcript Normalization (Section V-F).
 *
 * Goal: reduce policy-dependent variation in public-chain artifacts so that
 * an observer cannot distinguish policies from calldata size, gas, or log shape.
 *
 * Four mechanisms (mirroring the paper):
 *   1. Calldata padding  – pad proof bytes to a fixed length Lcd
 *   2. Fixed log structure – ACM emits uniform events (enforced in Solidity)
 *   3. Fixed public parameters – only commitment-sized values go on-chain
 *   4. Gas padding – use requestAccessWithGasPad / commitPolicyWithGasPad
 */

// Target calldata size in bytes (Lcd in the paper).
// Must be large enough to accommodate any valid serialised proof+signals.
// 32 * (2 + 4 + 2 + 5) = 32 * 13 = 416 bytes for pA/pB/pC/pubSignals alone;
// add selector (4) + policyId (32) + resource (32) + nonce (32) ≈ 1412 bytes.
// We round up to 2048 to leave headroom.
const LCD = 2048;

// Recommended gas target for requestAccessBound / requestAccess calls.
// Chosen to be safely above the 99th-percentile empirical gas cost observed
// during testnet experiments.  Set to 0 to disable gas padding.
const GAS_PAD_TARGET = process.env.GAS_PAD_TARGET
    ? parseInt(process.env.GAS_PAD_TARGET, 10)
    : 800000;

/**
 * Pad a Buffer / Uint8Array of serialised calldata to LCD bytes.
 * Extra bytes are zero-filled (cheap calldata per EIP-2028).
 *
 * @param {Buffer|Uint8Array} calldataBytes
 * @returns {Buffer}
 */
function padCalldata(calldataBytes) {
    const buf = Buffer.from(calldataBytes);
    if (buf.length >= LCD) return buf;
    return Buffer.concat([buf, Buffer.alloc(LCD - buf.length)]);
}

/**
 * Return the recommended gas-pad target for on-chain calls.
 * Pass this as `targetGas` to commitPolicyWithGasPad / requestAccessWithGasPad.
 *
 * @returns {number}
 */
function gasPadTarget() {
    return GAS_PAD_TARGET;
}

/**
 * Normalise proof components to fixed hex strings so that serialised
 * calldata always has the same byte-length regardless of numeric magnitude.
 *
 * @param {{pA, pB, pC, pubSignals}} proof
 * @returns {{pA, pB, pC, pubSignals}}  – all elements are 0x-prefixed 64-char hex
 */
function normaliseProof({ pA, pB, pC, pubSignals }) {
    const hex64 = (v) => {
        const s = BigInt(v).toString(16);
        return '0x' + s.padStart(64, '0');
    };
    return {
        pA: pA.map(hex64),
        pB: pB.map((row) => row.map(hex64)),
        pC: pC.map(hex64),
        pubSignals: pubSignals.map(hex64)
    };
}

module.exports = { padCalldata, gasPadTarget, normaliseProof, LCD, GAS_PAD_TARGET };
