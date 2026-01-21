/**
 * Shared blockchain utilities for experiments
 *
 * Provides common functionality for:
 * - Gas estimation and balance checking
 * - Contract deployment
 * - Network utilities
 */

const { ethers } = require('hardhat');

const NATIVE_TOKEN_SYMBOL_BY_CHAIN = Object.freeze({
  1: 'ETH',
  5: 'ETH',
  11155111: 'ETH',
  137: 'MATIC',
  80001: 'MATIC',
  80002: 'MATIC'
});

const GAS_ESTIMATES = Object.freeze({
  deployment: 4_500_000n,
  commit: 250_000n,
  access: 750_000n,
  bufferPercent: 25n
});

function getNativeTokenSymbol(chainId) {
  return NATIVE_TOKEN_SYMBOL_BY_CHAIN[Number(chainId)] || 'ETH';
}

function estimateTotalGas(executionCount) {
  const count = BigInt(executionCount);
  if (count === 0n) {
    return 0n;
  }

  const base = GAS_ESTIMATES.deployment + count * (GAS_ESTIMATES.commit + GAS_ESTIMATES.access);
  return base + (base * GAS_ESTIMATES.bufferPercent) / 100n;
}

async function ensureSufficientBalance({ provider, signer, executionCount }) {
  if (executionCount <= 0) {
    return;
  }

  const network = await provider.getNetwork();
  const address = await signer.getAddress();
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;

  if (!gasPrice) {
    throw new Error('Unable to determine gas price for balance preflight check.');
  }

  const estimatedGasUnits = estimateTotalGas(executionCount);
  const estimatedCostWei = estimatedGasUnits * gasPrice;
  const balance = await provider.getBalance(address);
  const nativeSymbol = getNativeTokenSymbol(network.chainId);

  console.log('Balance Preflight Check');
  console.log('-'.repeat(60));
  console.log(`  Network: ${network.name || 'unknown'} (chainId: ${network.chainId})`);
  console.log(`  Signer: ${address}`);
  console.log(`  Current balance: ${ethers.formatEther(balance)} ${nativeSymbol}`);
  console.log(`  Gas price used for estimate: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
  console.log(`  Estimated gas required: ${estimatedGasUnits.toString()} units`);
  console.log(`  Estimated cost: ${ethers.formatEther(estimatedCostWei)} ${nativeSymbol}`);

  if (balance < estimatedCostWei) {
    const shortfall = estimatedCostWei - balance;
    throw new Error(
      `Insufficient balance to run experiment on ${network.name || 'network'}.\n` +
      `Required ~${ethers.formatEther(estimatedCostWei)} ${nativeSymbol}, short by ${ethers.formatEther(shortfall)} ${nativeSymbol}.`
    );
  }

  console.log('  ✓ Balance check passed\n');
}

async function deployPolicyPrivacyContracts() {
  console.log('Deploying PolicyPrivacy + verifier contracts...');
  const [signer] = await ethers.getSigners();

  const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy', signer);
  const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier', signer);

  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  console.log('Verifier deployed at:', await verifier.getAddress());

  const policyPrivacy = await PolicyPrivacy.deploy(await verifier.getAddress());
  await policyPrivacy.waitForDeployment();
  console.log('PolicyPrivacy deployed at:', await policyPrivacy.getAddress());
  console.log();

  return policyPrivacy;
}

module.exports = {
  NATIVE_TOKEN_SYMBOL_BY_CHAIN,
  GAS_ESTIMATES,
  getNativeTokenSymbol,
  estimateTotalGas,
  ensureSufficientBalance,
  deployPolicyPrivacyContracts
};
