const { ethers } = require('hardhat');
const fs = require('fs');

async function main() {
  console.log('🚀 Deploying PolicyPrivacy contracts to local blockchain...\n');

  // Get deployment account
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH\n');

  let verifierAddress;
  let verifierType;

  // Check if PolicyPrivacyMainVerifier exists (real Groth16 verifier)
  try {
    console.log('📋 Checking for PolicyPrivacyMainVerifier...');
    const PolicyPrivacyMainVerifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
    const realVerifier = await PolicyPrivacyMainVerifier.deploy();
    await realVerifier.waitForDeployment();
    verifierAddress = await realVerifier.getAddress();
    verifierType = 'PolicyPrivacyMainVerifier';
    console.log('✅ PolicyPrivacyMainVerifier deployed to:', verifierAddress);
  } catch (error) {
    // Fall back to MockVerifier if real verifier not available
    console.log('⚠️  PolicyPrivacyMainVerifier not available, using MockVerifier...');
    console.log('📋 Deploying MockVerifier...');
    const MockVerifier = await ethers.getContractFactory('MockVerifier');
    const mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();
    verifierAddress = await mockVerifier.getAddress();
    verifierType = 'MockVerifier';
    console.log('✅ MockVerifier deployed to:', verifierAddress);
  }

  // Deploy PolicyPrivacy contract
  console.log('\n📋 Deploying PolicyPrivacy...');
  const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
  const policyPrivacy = await PolicyPrivacy.deploy(verifierAddress);
  await policyPrivacy.waitForDeployment();
  console.log('✅ PolicyPrivacy deployed to:', await policyPrivacy.getAddress());

  console.log('\n🎉 Deployment completed successfully!');
  console.log(`📋 Using ${verifierType} for proof verification`);
  
  if (verifierType === 'MockVerifier') {
    console.log('\n💡 Note: Using MockVerifier for testing.');
    console.log('   Run "npm run build:circuit:full" to build real Groth16 verifier.');
    console.log('   Then redeploy to use PolicyPrivacyMainVerifier.');
  }

  // Save deployment info for scripts
  const deploymentInfo = {
    network: 'localhost',
    deployer: deployer.address,
    contracts: {
      [verifierType]: verifierAddress,
      PolicyPrivacy: await policyPrivacy.getAddress()
    },
    verifierType: verifierType,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
  console.log('\n📄 Deployment info saved to deployment.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });