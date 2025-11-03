const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying PolicyPrivacy (gas pad enabled) with account:', deployer.address);
  const balance = await deployer.getBalance();
  console.log('Account balance:', hre.ethers.formatEther(balance), 'MATIC');

  let verifierAddress = process.env.VERIFIER_ADDRESS;
  if (!verifierAddress) {
    console.log('VERIFIER_ADDRESS not provided, deploying PolicyPrivacyMainVerifier...');
    const Verifier = await hre.ethers.getContractFactory('PolicyPrivacyMainVerifier');
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log('PolicyPrivacyMainVerifier deployed at:', verifierAddress);
  } else {
    console.log('Using existing verifier at:', verifierAddress);
  }

  const PolicyPrivacy = await hre.ethers.getContractFactory('PolicyPrivacy');
  console.log('Deploying PolicyPrivacy...');
  const policyPrivacy = await PolicyPrivacy.deploy(verifierAddress);
  await policyPrivacy.waitForDeployment();
  const policyPrivacyAddress = await policyPrivacy.getAddress();

  console.log('PolicyPrivacy deployed to:', policyPrivacyAddress);

  if (typeof policyPrivacy.commitPolicyWithGasPad !== 'function' ||
      typeof policyPrivacy.requestAccessWithGasPad !== 'function') {
    throw new Error('Deployed PolicyPrivacy contract lacks gas pad functions. Ensure latest contract is compiled.');
  }

  console.log('Gas pad functions verified.');

  return { policyPrivacyAddress, verifierAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
