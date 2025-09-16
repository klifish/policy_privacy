#!/usr/bin/env node

/**
 * Quick Integration Test
 * Tests the complete workflow without building circuits (uses mock if needed)
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Axios will be loaded dynamically after dependencies are installed
let axios = null;

async function loadAxios() {
  if (!axios) {
    axios = require('axios');
  }
  return axios;
}

async function quickTest() {
  console.log('🚀 Running quick integration test...');
  
  let hardhatProcess = null;
  let apiProcess = null;
  
  try {
    // Install dependencies if needed
    const fs = require('fs');
    if (!fs.existsSync('node_modules')) {
      console.log('📦 Installing dependencies...');
      await execAsync('npm install');
      console.log('✅ Dependencies installed');
    }
    // Start Hardhat node
    console.log('📦 Starting local blockchain...');
    hardhatProcess = spawn('npx', ['hardhat', 'node'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Wait for Hardhat to start
    await new Promise((resolve, reject) => {
      let output = '';
      hardhatProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('Started HTTP and WebSocket JSON-RPC server')) {
          resolve();
        }
      });
      setTimeout(() => reject(new Error('Hardhat timeout')), 30000);
    });
    
    console.log('✅ Blockchain started');
    
    // Deploy contract
    console.log('📄 Deploying smart contract...');
    await execAsync('npx hardhat run scripts/deploy.js --network localhost');
    console.log('✅ Contract deployed');
    
    // Start API
    console.log('🌐 Starting API server...');
    apiProcess = spawn('node', ['api/server.js'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '3000' }
    });
    
    // Wait for API
    await new Promise((resolve, reject) => {
      let output = '';
      apiProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('PolicyPrivacy API server running')) {
          resolve();
        }
      });
      setTimeout(() => reject(new Error('API timeout')), 15000);
    });
    
    console.log('✅ API server started');
    
    // Wait a bit more for API to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Load axios after dependencies are installed
    const axios = await loadAxios();
    
    // Test API endpoints
    console.log('🧪 Testing API endpoints...');
    
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log(`✅ Health check: ${healthResponse.data.status}`);
    
    const docsResponse = await axios.get('http://localhost:3000/api/docs');
    console.log(`✅ API docs: ${docsResponse.data.info.title}`);
    
    const circuitResponse = await axios.get('http://localhost:3000/api/proof/circuit-info');
    console.log(`✅ Circuit info: ${circuitResponse.data.circuit}`);
    
    // Test provider registration
    console.log('📝 Testing provider registration...');
    const providerResponse = await axios.post('http://localhost:3000/api/data-provider/register', {
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      metadata: {
        name: 'Test Provider',
        description: 'Test provider for quick integration test'
      }
    });
    console.log(`✅ Provider registered: ${providerResponse.data.providerId}`);
    
    console.log('🎉 Quick integration test completed successfully!');
    console.log('ℹ️  Full demo with ZK proofs available with: npm run demo');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (apiProcess) apiProcess.kill();
    if (hardhatProcess) hardhatProcess.kill();
  }
}

if (require.main === module) {
  quickTest();
}

module.exports = quickTest;