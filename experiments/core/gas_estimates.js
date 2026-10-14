'use strict';

// Gas estimates for a capture's balance preflight and shard funding. Kept free
// of hardhat so the shard wallet tool can use them outside a hardhat run.

// Calibrated against measured usage (commit avg ~305k max ~329k;
// registerResource ~80k; padded access on Amoy ~945k–1.155M after the
// 2026-09-17 re-measurement, see experiments/capture/run.js) with headroom.
const GAS_ESTIMATES = Object.freeze({
  deployment: 4_500_000n,
  commit: 350_000n,
  registration: 100_000n,
  access: 1_050_000n,
  bufferPercent: 25n
});

// Unpadded transactions (B1): bare commit ~197k locally, bare access ~553k
// locally and ~748k on Amoy (2026-09-17 estimateGas replay), with headroom.
const UNPADDED_GAS_ESTIMATES = Object.freeze({
  ...GAS_ESTIMATES,
  commit: 250_000n,
  access: 800_000n
});

function gasEstimates(padded = true) {
  return padded ? GAS_ESTIMATES : UNPADDED_GAS_ESTIMATES;
}

function withBuffer(gasUnits) {
  return gasUnits + (gasUnits * GAS_ESTIMATES.bufferPercent) / 100n;
}

function estimateTotalGas(executionCount) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }

  const base = GAS_ESTIMATES.deployment +
    count * (GAS_ESTIMATES.commit + GAS_ESTIMATES.registration + GAS_ESTIMATES.access);
  return withBuffer(base);
}

// TPS workflow role split: the deployer pays for contract deployment and
// commitPolicy txs; the TPS signer pays for requestAccessBound txs.
function estimateDeployerGas(executionCount, { padded = true, includeDeployment = true } = {}) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }
  const g = gasEstimates(padded);
  return withBuffer(
    (includeDeployment ? g.deployment : 0n) +
    count * (g.commit + g.registration)
  );
}

function estimateTpsGas(executionCount, { padded = true } = {}) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }
  return withBuffer(count * gasEstimates(padded).access);
}

module.exports = {
  GAS_ESTIMATES,
  UNPADDED_GAS_ESTIMATES,
  gasEstimates,
  withBuffer,
  estimateTotalGas,
  estimateDeployerGas,
  estimateTpsGas
};
