/**
 * Shared blockchain utilities for experiments
 *
 * Provides common functionality for:
 * - Gas estimation and balance checking
 * - Contract deployment
 * - Network utilities
 */

const { ethers, network } = require('hardhat');
const { waitForTx } = require('../../lib/rpc-retry');

const NATIVE_TOKEN_SYMBOL_BY_CHAIN = Object.freeze({
  1: 'ETH',
  5: 'ETH',
  11155111: 'ETH',
  137: 'MATIC',
  80001: 'MATIC',
  80002: 'MATIC'
});

// Calibrated against measured usage (commit avg ~305k max ~329k;
// access avg ~602k max ~618k) with headroom.
const GAS_ESTIMATES = Object.freeze({
  deployment: 4_500_000n,
  commit: 350_000n,
  access: 650_000n,
  bufferPercent: 25n
});

function getNativeTokenSymbol(chainId) {
  return NATIVE_TOKEN_SYMBOL_BY_CHAIN[Number(chainId)] || 'ETH';
}

function withBuffer(gasUnits) {
  return gasUnits + (gasUnits * GAS_ESTIMATES.bufferPercent) / 100n;
}

function estimateTotalGas(executionCount) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }

  const base = GAS_ESTIMATES.deployment + count * (GAS_ESTIMATES.commit + GAS_ESTIMATES.access);
  return withBuffer(base);
}

// TPS workflow role split: the deployer pays for contract deployment and
// commitPolicy txs; the TPS signer pays for requestAccessBound txs.
function estimateDeployerGas(executionCount) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }
  return withBuffer(GAS_ESTIMATES.deployment + count * GAS_ESTIMATES.commit);
}

function estimateTpsGas(executionCount) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }
  return withBuffer(count * GAS_ESTIMATES.access);
}

async function ensureSufficientBalance({ provider, signer, executionCount, tpsAddress }) {
  if (executionCount <= 0) {
    return;
  }

  const chainNetwork = await provider.getNetwork();
  // Prefer the pinned gas price from hardhat network config (what txs will
  // actually pay) over RPC fee suggestions, which on Amoy run ~2x the
  // enforced minimum and would reject balances that are in fact sufficient.
  let gasPrice = typeof network.config.gasPrice === 'number'
    ? BigInt(network.config.gasPrice)
    : null;
  if (!gasPrice) {
    const feeData = await provider.getFeeData();
    gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  }

  if (!gasPrice) {
    throw new Error('Unable to determine gas price for balance preflight check.');
  }

  const nativeSymbol = getNativeTokenSymbol(chainNetwork.chainId);

  const checks = [{
    role: 'Deployer (deployment + commitPolicy)',
    address: await signer.getAddress(),
    gasUnits: tpsAddress ? estimateDeployerGas(executionCount) : estimateTotalGas(executionCount)
  }];
  if (tpsAddress) {
    checks.push({
      role: 'TPS (requestAccessBound)',
      address: tpsAddress,
      gasUnits: estimateTpsGas(executionCount)
    });
  }

  console.log('Balance Preflight Check');
  console.log('-'.repeat(60));
  console.log(`  Network: ${chainNetwork.name || 'unknown'} (chainId: ${chainNetwork.chainId})`);
  console.log(`  Gas price used for estimate: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

  const shortfalls = [];
  for (const check of checks) {
    const estimatedCostWei = check.gasUnits * gasPrice;
    const balance = await provider.getBalance(check.address);
    console.log(`  ${check.role}`);
    console.log(`    Address:         ${check.address}`);
    console.log(`    Current balance: ${ethers.formatEther(balance)} ${nativeSymbol}`);
    console.log(`    Estimated gas:   ${check.gasUnits.toString()} units`);
    console.log(`    Estimated cost:  ${ethers.formatEther(estimatedCostWei)} ${nativeSymbol}`);
    if (balance < estimatedCostWei) {
      const shortfall = estimatedCostWei - balance;
      shortfalls.push(
        `${check.role} (${check.address}): requires ~${ethers.formatEther(estimatedCostWei)} ${nativeSymbol}, ` +
        `short by ${ethers.formatEther(shortfall)} ${nativeSymbol}`
      );
    }
  }

  if (shortfalls.length > 0) {
    throw new Error(
      `Insufficient balance to run experiment on ${chainNetwork.name || 'network'}:\n` +
      shortfalls.map((line) => `  - ${line}`).join('\n')
    );
  }

  console.log('  ✓ Balance check passed\n');
}

async function getExperimentSigner(provider = ethers.provider) {
  const isLocalNetwork = network.name === 'localhost' || network.name === 'hardhat';
  if (!isLocalNetwork && process.env.AMOY_PRIVATE_KEY) {
    return new ethers.Wallet(process.env.AMOY_PRIVATE_KEY, provider);
  }

  const [signer] = await ethers.getSigners();
  return signer;
}

async function deployPolicyPrivacyContracts() {
  console.log('Deploying PolicyPrivacy + verifier contracts...');
  const signer = await getExperimentSigner();

  const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy', signer);
  const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier', signer);

  const verifier = await Verifier.deploy();
  await waitForTx(verifier.deploymentTransaction(), 1, { label: 'verifier deployment' });
  console.log('Verifier deployed at:', await verifier.getAddress());

  const policyPrivacy = await PolicyPrivacy.deploy(await verifier.getAddress());
  await waitForTx(policyPrivacy.deploymentTransaction(), 1, { label: 'PolicyPrivacy deployment' });
  console.log('PolicyPrivacy deployed at:', await policyPrivacy.getAddress());
  console.log();

  return policyPrivacy;
}

module.exports = {
  NATIVE_TOKEN_SYMBOL_BY_CHAIN,
  GAS_ESTIMATES,
  getNativeTokenSymbol,
  estimateTotalGas,
  estimateDeployerGas,
  estimateTpsGas,
  ensureSufficientBalance,
  getExperimentSigner,
  deployPolicyPrivacyContracts
};
