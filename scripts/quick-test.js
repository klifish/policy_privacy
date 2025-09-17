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

async function checkPortAvailability() {
  console.log('🔍 Checking port availability...');
  
  const net = require('net');
  const ports = [8545, 3000]; // Hardhat and API server ports
  
  for (const port of ports) {
    const isInUse = await isPortInUse(port);
    if (isInUse) {
      console.log(`⚠️  Port ${port} is in use, attempting to free it...`);
      await killProcessOnPort(port);
      
      // Wait a moment and check again
      await new Promise(resolve => setTimeout(resolve, 2000));
      const stillInUse = await isPortInUse(port);
      if (stillInUse) {
        throw new Error(`Port ${port} is still in use after cleanup attempt. Please manually stop processes using this port.`);
      } else {
        console.log(`✅ Port ${port} is now available`);
      }
    } else {
      console.log(`✅ Port ${port} is available`);
    }
  }
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.listen(port, () => {
      server.once('close', () => {
        resolve(false);
      });
      server.close();
    });
    server.on('error', () => {
      resolve(true);
    });
  });
}

async function killProcessOnPort(port) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    if (process.platform === 'win32') {
      // Windows
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.split('\n').filter(line => line.includes(`LISTENING`));
      for (const line of lines) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== '0') {
          await execAsync(`taskkill /PID ${pid} /F`);
          console.log(`🔄 Killed process ${pid} on port ${port}`);
        }
      }
    } else {
      // Unix-like systems (Linux, macOS)
      try {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(pid => pid);
        for (const pid of pids) {
          await execAsync(`kill -9 ${pid}`);
          console.log(`🔄 Killed process ${pid} on port ${port}`);
        }
      } catch (error) {
        // lsof command might not find any processes, which is fine
        if (!error.message.includes('No such file or directory')) {
          console.log(`ℹ️  No processes found on port ${port}`);
        }
      }
    }
  } catch (error) {
    console.log(`⚠️  Could not kill process on port ${port}: ${error.message}`);
  }
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

    // Check ports before starting
    await checkPortAvailability();
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
    console.log('🧹 Cleaning up...');
    
    if (apiProcess) {
      apiProcess.kill('SIGTERM');
      console.log('✅ API server stopped');
    }
    
    if (hardhatProcess) {
      hardhatProcess.kill('SIGTERM');
      console.log('✅ Hardhat node stopped');
    }

    // Wait a moment for processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Clean up any remaining processes on the ports
    console.log('🔄 Ensuring ports are fully released...');
    try {
      await killProcessOnPort(8545); // Hardhat port
      await killProcessOnPort(3000); // API server port
    } catch (error) {
      console.log(`⚠️  Port cleanup warning: ${error.message}`);
    }

    console.log('✅ Cleanup completed');
  }
}

if (require.main === module) {
  quickTest();
}

module.exports = quickTest;