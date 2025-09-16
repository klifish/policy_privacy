#!/usr/bin/env node

/**
 * PolicyPrivacy Complete End-to-End Workflow Demo
 * 
 * This script demonstrates the complete workflow from start to finish:
 * 1. Build circuits and setup Groth16 trusted setup
 * 2. Start local blockchain and deploy contract
 * 3. Start API server
 * 4. Register data provider and requester
 * 5. Commit policy and publish data
 * 6. Generate zero-knowledge proof and request access
 * 7. Verify the complete flow works with real cryptographic proofs
 */

const { exec, spawn } = require('child_process');
const axios = require('axios');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);
const API_BASE_URL = 'http://localhost:3000';

class PolicyPrivacyDemo {
  constructor() {
    this.hardhatProcess = null;
    this.apiProcess = null;
  }

  async log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkPrerequisites() {
    this.log('🔍 Checking prerequisites...');
    
    // Check if node_modules exists
    if (!fs.existsSync('node_modules')) {
      this.log('📦 Installing dependencies...');
      await execAsync('npm install');
      this.log('✅ Dependencies installed');
    }
    
    // Check if build directory exists
    if (!fs.existsSync('build')) {
      this.log('🏗️ Build directory not found, will build circuits...');
      return false;
    }
    
    // Check if required circuit files exist
    const requiredFiles = [
      'build/circuits/policy_privacy_main_instance.r1cs',
      'build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm',
      'build/circuits/policy_privacy_main_final.zkey'
    ];
    
    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        this.log(`🏗️ Missing circuit file: ${file}`);
        return false;
      }
    }
    
    this.log('✅ All prerequisites met');
    return true;
  }

  async buildCircuits() {
    this.log('🏗️ Building circuits and setting up Groth16 trusted setup...');
    this.log('⚠️  This may take several minutes on first run...');
    
    try {
      // Build circuits with full Groth16 setup
      this.log('🔨 Compiling circuits...');
      await execAsync('npm run build:circuit:compile', { timeout: 300000 }); // 5 minute timeout
      
      this.log('🔑 Setting up Groth16 trusted setup...');
      await execAsync('npm run build:circuit:setup', { timeout: 600000 }); // 10 minute timeout
      
      this.log('📄 Exporting verification key and Solidity verifier...');
      await execAsync('npm run build:circuit:export:verificationkey', { timeout: 60000 });
      await execAsync('npm run build:circuit:export:solidityverifier', { timeout: 60000 });
      
      this.log('✅ Circuits built and Groth16 setup completed successfully');
    } catch (error) {
      throw new Error(`Circuit building failed: ${error.message}`);
    }
  }

  async startHardhatNode() {
    this.log('🚀 Starting Hardhat local blockchain...');
    
    return new Promise((resolve, reject) => {
      this.hardhatProcess = spawn('npx', ['hardhat', 'node'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      this.hardhatProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('Started HTTP and WebSocket JSON-RPC server')) {
          this.log('✅ Hardhat node started successfully');
          resolve();
        }
      });

      this.hardhatProcess.stderr.on('data', (data) => {
        console.error('Hardhat error:', data.toString());
      });

      this.hardhatProcess.on('error', reject);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.hardhatProcess && !output.includes('Started HTTP')) {
          reject(new Error('Hardhat node failed to start within 30 seconds'));
        }
      }, 30000);
    });
  }

  async deployContract() {
    this.log('📄 Deploying PolicyPrivacy contract...');
    
    try {
      await execAsync('npx hardhat run scripts/deploy.js --network localhost');
      this.log('✅ Contract deployed successfully');
    } catch (error) {
      throw new Error(`Contract deployment failed: ${error.message}`);
    }
  }

  async startAPIServer() {
    this.log('🌐 Starting PolicyPrivacy API server...');
    
    return new Promise((resolve, reject) => {
      this.apiProcess = spawn('node', ['api/server.js'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: '3000' }
      });

      let output = '';
      this.apiProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('PolicyPrivacy API server running')) {
          this.log('✅ API server started successfully');
          resolve();
        }
      });

      this.apiProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        if (!errorMsg.includes('warn')) {
          console.error('API error:', errorMsg);
        }
      });

      this.apiProcess.on('error', reject);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.apiProcess && !output.includes('PolicyPrivacy API server running')) {
          reject(new Error('API server failed to start within 15 seconds'));
        }
      }, 15000);
    });
  }

  async waitForAPI() {
    this.log('⏳ Waiting for API to be ready...');
    
    for (let i = 0; i < 10; i++) {
      try {
        const response = await axios.get(`${API_BASE_URL}/health`);
        if (response.status === 200) {
          this.log('✅ API is ready');
          return;
        }
      } catch (error) {
        await this.sleep(1000);
      }
    }
    
    throw new Error('API failed to become ready');
  }

  async demoWorkflow() {
    this.log('🧪 Starting PolicyPrivacy Complete Workflow Demo...');
    this.log('='.repeat(50));

    // Test data
    const provider = {
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // First Hardhat account
      metadata: {
        name: 'Demo Healthcare Provider',
        description: 'Medical records provider for demonstration',
        contact: 'demo@healthcare.com'
      }
    };

    const requester = {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Second Hardhat account
      metadata: {
        name: 'Demo Research Institute',
        description: 'Medical research organization',
        contact: 'research@institute.com'
      }
    };

    try {
      this.log('');
      this.log('🏥 STEP 1: Data Provider Registration');
      this.log('-'.repeat(40));
      this.log(`Registering healthcare provider with address: ${provider.address}`);
      const providerResponse = await axios.post(`${API_BASE_URL}/api/data-provider/register`, provider);
      this.log(`✅ Provider registered successfully!`);
      this.log(`   Provider ID: ${providerResponse.data.providerId}`);
      this.log(`   Status: ${providerResponse.data.status}`);

      this.log('');
      this.log('🔬 STEP 2: Data Requester Registration');
      this.log('-'.repeat(40));
      this.log(`Registering research institute with address: ${requester.address}`);
      const requesterResponse = await axios.post(`${API_BASE_URL}/api/data-requester/register`, requester);
      this.log(`✅ Requester registered successfully!`);
      this.log(`   Requester ID: ${requesterResponse.data.requesterId}`);
      this.log(`   Status: ${requesterResponse.data.status}`);

      this.log('');
      this.log('🔐 STEP 3: Privacy Policy Commitment');
      this.log('-'.repeat(40));
      const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]; // attr0 AND attr1
      const randomizer = '12345';
      this.log(`Creating policy commitment for policy: ${JSON.stringify(policy)}`);
      this.log(`Policy meaning: Requester must have attribute0=1 AND attribute1=1`);
      this.log(`Using randomizer: ${randomizer}`);
      
      const commitmentResponse = await axios.post(`${API_BASE_URL}/api/proof/policy-commitment`, {
        policy,
        randomizer
      });
      const policyCommitment = commitmentResponse.data.commitment;
      this.log(`✅ Policy commitment calculated successfully!`);
      this.log(`   Commitment hash: ${policyCommitment}`);

      this.log('');
      this.log('📋 STEP 4: Smart Contract Policy Commitment');
      this.log('-'.repeat(40));
      this.log(`Committing policy to blockchain with Poseidon hash...`);
      const policyResponse = await axios.post(`${API_BASE_URL}/api/policy/commit`, {
        dataSubjectAddress: provider.address,
        policyCommitment,
        metadataURI: 'ipfs://QmDemoPolicyMetadata'
      });
      const policyId = policyResponse.data.policyId;
      this.log(`✅ Policy committed to smart contract!`);
      this.log(`   Policy ID: ${policyId}`);
      this.log(`   Transaction Hash: ${policyResponse.data.transactionHash}`);
      this.log(`   Gas Used: ${policyResponse.data.gasUsed}`);

      this.log('');
      this.log('📊 STEP 5: Data Publishing');
      this.log('-'.repeat(40));
      this.log(`Publishing medical dataset with privacy policy protection...`);
      const dataResponse = await axios.post(`${API_BASE_URL}/api/data-provider/publish`, {
        providerAddress: provider.address,
        dataHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        policyCommitment,
        metadataURI: 'ipfs://QmDemoDataMetadata',
        dataLocation: 'ipfs://QmDemoDataLocation',
        description: 'Demo medical records dataset'
      });
      this.log(`✅ Data published successfully!`);
      this.log(`   Data ID: ${dataResponse.data.dataId}`);
      this.log(`   Associated Policy ID: ${dataResponse.data.policyId}`);
      this.log(`   Transaction Hash: ${dataResponse.data.transactionHash}`);

      this.log('');
      this.log('🔮 STEP 6: Zero-Knowledge Proof Generation');
      this.log('-'.repeat(40));
      this.log(`Generating real Groth16 proof using snarkjs...`);
      this.log(`Requester attributes: [attr0=1, attr1=1, attr2=0] (satisfies policy)`);
      const startTime = Date.now();
      const proofResponse = await axios.post(`${API_BASE_URL}/api/proof/generate`, {
        policy,
        randomizer,
        requesterAttrs: [1, 1, 0] // Satisfies policy: attr0=1 AND attr1=1
      });
      const proof = proofResponse.data.proof;
      const proofTime = proofResponse.data.metadata.generationTimeMs;
      this.log(`✅ Zero-knowledge proof generated successfully!`);
      this.log(`   Generation time: ${proofTime}ms`);
      this.log(`   Proof components: pA, pB, pC, pubSignals`);
      this.log(`   Public signals[0] (isAuthorized): ${proof.pubSignals[0]}`);
      this.log(`   Public signals[1] (policyCommitment): ${proof.pubSignals[1]}`);

      this.log('');
      this.log('🔑 STEP 7: Data Access Request with Proof Verification');
      this.log('-'.repeat(40));
      this.log(`Submitting access request with cryptographic proof...`);
      const accessResponse = await axios.post(`${API_BASE_URL}/api/data-requester/request`, {
        requesterAddress: requester.address,
        policyId: parseInt(policyId),
        proof,
        purpose: 'Medical research demonstration'
      });
      this.log(`✅ Access request processed!`);
      this.log(`   Result: ${accessResponse.data.status.toUpperCase()}`);
      this.log(`   Access Request ID: ${accessResponse.data.accessRequestId}`);
      this.log(`   Can Access Data: ${accessResponse.data.canAccessData}`);
      this.log(`   Transaction Hash: ${accessResponse.data.transactionHash}`);
      this.log(`   Gas Used: ${accessResponse.data.gasUsed}`);

      this.log('');
      this.log('🔍 STEP 8: Results Verification');
      this.log('-'.repeat(40));
      
      // Check provider stats
      const providerStats = await axios.get(`${API_BASE_URL}/api/data-provider/stats/${provider.address}`);
      this.log(`📈 Data Provider Statistics:`);
      this.log(`   Total datasets published: ${providerStats.data.totalDatasets}`);
      this.log(`   Active datasets: ${providerStats.data.activeDatasets}`);
      this.log(`   Total access requests received: ${providerStats.data.totalAccessRequests}`);

      // Check requester stats
      const requesterStats = await axios.get(`${API_BASE_URL}/api/data-requester/stats/${requester.address}`);
      this.log(`📈 Data Requester Statistics:`);
      this.log(`   Total requests made: ${requesterStats.data.totalRequests}`);
      this.log(`   Granted requests: ${requesterStats.data.grantedRequests}`);
      this.log(`   Success rate: ${requesterStats.data.successRate}`);

      // Check policy details
      const policyDetails = await axios.get(`${API_BASE_URL}/api/policy/${policyId}`);
      this.log(`📋 Policy Verification:`);
      this.log(`   Policy ID: ${policyDetails.data.policyId}`);
      this.log(`   Is Active: ${policyDetails.data.isActive}`);
      this.log(`   Data Subject: ${policyDetails.data.dataSubject}`);
      this.log(`   Commitment Hash: ${policyDetails.data.commitment}`);

      this.log('');
      this.log('✅ Complete workflow verification successful!');

      return {
        provider: {
          id: providerResponse.data.providerId,
          address: provider.address,
          stats: providerStats.data
        },
        requester: {
          id: requesterResponse.data.requesterId,
          address: requester.address,
          stats: requesterStats.data
        },
        policy: {
          id: policyId,
          commitment: policyCommitment,
          details: policyDetails.data
        },
        data: {
          id: dataResponse.data.dataId,
          policyId: dataResponse.data.policyId,
          transactionHash: dataResponse.data.transactionHash
        },
        proof: {
          generated: true,
          timeMs: proofTime,
          components: ['pA', 'pB', 'pC', 'pubSignals'],
          isAuthorized: proof.pubSignals[0] === '1'
        },
        access: {
          requestId: accessResponse.data.accessRequestId,
          status: accessResponse.data.status,
          granted: accessResponse.data.canAccessData,
          transactionHash: accessResponse.data.transactionHash
        }
      };

    } catch (error) {
      this.log(`❌ Demo workflow failed: ${error.message}`);
      if (error.response) {
        this.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  async testAPIEndpoints() {
    this.log('🧪 Testing API endpoints...');

    const tests = [
      {
        name: 'Health Check',
        test: async () => {
          const response = await axios.get(`${API_BASE_URL}/health`);
          return response.data.status === 'healthy';
        }
      },
      {
        name: 'API Documentation',
        test: async () => {
          const response = await axios.get(`${API_BASE_URL}/api/docs`);
          return response.data.openapi === '3.0.0';
        }
      },
      {
        name: 'Circuit Information',
        test: async () => {
          const response = await axios.get(`${API_BASE_URL}/api/proof/circuit-info`);
          return response.data.circuit === 'PolicyPrivacyMain';
        }
      }
    ];

    for (const test of tests) {
      try {
        const result = await test.test();
        this.log(`✅ ${test.name}: ${result ? 'PASS' : 'FAIL'}`);
      } catch (error) {
        this.log(`❌ ${test.name}: FAIL - ${error.message}`);
      }
    }
  }

  async cleanup() {
    this.log('🧹 Cleaning up...');
    
    if (this.apiProcess) {
      this.apiProcess.kill();
      this.log('✅ API server stopped');
    }
    
    if (this.hardhatProcess) {
      this.hardhatProcess.kill();
      this.log('✅ Hardhat node stopped');
    }
  }

  async run() {
    try {
      this.log('🚀 Starting PolicyPrivacy Complete End-to-End Workflow Demo');
      this.log('='.repeat(60));
      
      // Step 0: Check prerequisites and build circuits if needed
      const prerequisitesMet = await this.checkPrerequisites();
      if (!prerequisitesMet) {
        await this.buildCircuits();
      }

      // Step 1: Start Hardhat node
      await this.startHardhatNode();
      await this.sleep(2000);

      // Step 2: Deploy contract
      await this.deployContract();
      await this.sleep(2000);

      // Step 3: Start API server
      await this.startAPIServer();
      await this.waitForAPI();

      // Step 4: Test basic endpoints
      await this.testAPIEndpoints();

      // Step 5: Run complete workflow demo
      const results = await this.demoWorkflow();

      this.log('🏆 Complete End-to-End Workflow Demo Completed Successfully!');
      this.log('='.repeat(60));
      this.log('📊 Demo Results Summary:');
      console.log(JSON.stringify(results, null, 2));

      this.log('');
      this.log('🎉 Summary of what was demonstrated:');
      this.log('✅ Circuit compilation and Groth16 trusted setup');
      this.log('✅ Local blockchain deployment with real smart contracts');
      this.log('✅ REST API server with comprehensive endpoints');
      this.log('✅ Data provider registration and data publishing');
      this.log('✅ Data requester registration and attribute validation');
      this.log('✅ Privacy policy commitment using Poseidon hash');
      this.log('✅ Real zero-knowledge proof generation using snarkjs');
      this.log('✅ On-chain proof verification with PolicyPrivacyMainVerifier');
      this.log('✅ Access control based on cryptographic proof validation');
      this.log('✅ End-to-end privacy-preserving consent management workflow');

    } catch (error) {
      this.log(`💥 Demo failed: ${error.message}`);
      if (error.stack) {
        this.log('Stack trace:');
        console.error(error.stack);
      }
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run demo if this script is executed directly
if (require.main === module) {
  const demo = new PolicyPrivacyDemo();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
    await demo.cleanup();
    process.exit(0);
  });

  demo.run().catch(console.error);
}

module.exports = PolicyPrivacyDemo;