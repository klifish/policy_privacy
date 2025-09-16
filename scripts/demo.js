#!/usr/bin/env node

/**
 * PolicyPrivacy API Usage Example
 * 
 * This script demonstrates the complete workflow:
 * 1. Start local blockchain and deploy contract
 * 2. Start API server
 * 3. Register data provider and requester
 * 4. Commit policy and publish data
 * 5. Generate proof and request access
 * 6. Verify the complete flow works
 */

const { exec, spawn } = require('child_process');
const axios = require('axios');
const { promisify } = require('util');

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
    this.log('🧪 Starting PolicyPrivacy API demo workflow...');

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
      // 1. Register Data Provider
      this.log('📝 Registering data provider...');
      const providerResponse = await axios.post(`${API_BASE_URL}/api/data-provider/register`, provider);
      this.log(`✅ Provider registered: ${providerResponse.data.providerId}`);

      // 2. Register Data Requester
      this.log('📝 Registering data requester...');
      const requesterResponse = await axios.post(`${API_BASE_URL}/api/data-requester/register`, requester);
      this.log(`✅ Requester registered: ${requesterResponse.data.requesterId}`);

      // 3. Calculate Policy Commitment
      this.log('🔐 Calculating policy commitment...');
      const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]; // attr0 AND attr1
      const randomizer = '12345';
      
      const commitmentResponse = await axios.post(`${API_BASE_URL}/api/proof/policy-commitment`, {
        policy,
        randomizer
      });
      const policyCommitment = commitmentResponse.data.commitment;
      this.log(`✅ Policy commitment: ${policyCommitment}`);

      // 4. Commit Policy
      this.log('📋 Committing privacy policy...');
      const policyResponse = await axios.post(`${API_BASE_URL}/api/policy/commit`, {
        dataSubjectAddress: provider.address,
        policyCommitment,
        metadataURI: 'ipfs://QmDemoPolicyMetadata'
      });
      const policyId = policyResponse.data.policyId;
      this.log(`✅ Policy committed with ID: ${policyId}`);

      // 5. Publish Data
      this.log('📊 Publishing data with policy...');
      const dataResponse = await axios.post(`${API_BASE_URL}/api/data-provider/publish`, {
        providerAddress: provider.address,
        dataHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        policyCommitment,
        metadataURI: 'ipfs://QmDemoDataMetadata',
        dataLocation: 'ipfs://QmDemoDataLocation',
        description: 'Demo medical records dataset'
      });
      this.log(`✅ Data published: ${dataResponse.data.dataId}`);

      // 6. Generate Zero-Knowledge Proof
      this.log('🔮 Generating zero-knowledge proof...');
      const proofResponse = await axios.post(`${API_BASE_URL}/api/proof/generate`, {
        policy,
        randomizer,
        requesterAttrs: [1, 1, 0] // Satisfies policy: attr0=1 AND attr1=1
      });
      const proof = proofResponse.data.proof;
      this.log(`✅ Proof generated in ${proofResponse.data.metadata.generationTimeMs}ms`);

      // 7. Request Data Access
      this.log('🔑 Requesting data access with proof...');
      const accessResponse = await axios.post(`${API_BASE_URL}/api/data-requester/request`, {
        requesterAddress: requester.address,
        policyId: parseInt(policyId),
        proof,
        purpose: 'Medical research demonstration'
      });
      this.log(`✅ Access ${accessResponse.data.status}: ${accessResponse.data.accessRequestId}`);

      // 8. Verify Results
      this.log('🔍 Verifying workflow results...');
      
      // Check provider stats
      const providerStats = await axios.get(`${API_BASE_URL}/api/data-provider/stats/${provider.address}`);
      this.log(`📈 Provider stats: ${providerStats.data.totalDatasets} datasets, ${providerStats.data.totalAccessRequests} requests`);

      // Check requester stats
      const requesterStats = await axios.get(`${API_BASE_URL}/api/data-requester/stats/${requester.address}`);
      this.log(`📈 Requester stats: ${requesterStats.data.totalRequests} requests, ${requesterStats.data.successRate} success rate`);

      // Check policy details
      const policyDetails = await axios.get(`${API_BASE_URL}/api/policy/${policyId}`);
      this.log(`📋 Policy details: Active=${policyDetails.data.isActive}, Subject=${policyDetails.data.dataSubject}`);

      this.log('🎉 Demo workflow completed successfully!');
      
      return {
        provider: providerResponse.data,
        requester: requesterResponse.data,
        policy: policyResponse.data,
        data: dataResponse.data,
        proof: { generated: true, timeMs: proofResponse.data.metadata.generationTimeMs },
        access: accessResponse.data,
        stats: { provider: providerStats.data, requester: requesterStats.data }
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

      this.log('🏆 All tests completed successfully!');
      this.log('📊 Demo Results Summary:');
      console.log(JSON.stringify(results, null, 2));

    } catch (error) {
      this.log(`💥 Demo failed: ${error.message}`);
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