#!/usr/bin/env node

/**
 * Complete Setup Script for PolicyPrivacy
 * 
 * This script prepares the complete environment:
 * 1. Install dependencies
 * 2. Build circuits and setup Groth16
 * 3. Verify all components are ready
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execAsync = promisify(exec);

class PolicyPrivacySetup {
  async log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async checkNodeModules() {
    this.log('📦 Checking dependencies...');
    
    if (!fs.existsSync('node_modules')) {
      this.log('📥 Installing dependencies...');
      await execAsync('npm install');
      this.log('✅ Dependencies installed');
    } else {
      this.log('✅ Dependencies already installed');
    }
  }

  async buildCircuits() {
    this.log('🏗️ Building circuits and setting up Groth16...');
    this.log('⚠️  This will take several minutes on first run...');
    
    try {
      // Check if circuits are already built
      const requiredFiles = [
        'build/circuits/policy_privacy_main_instance.r1cs',
        'build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm',
        'build/circuits/policy_privacy_main_final.zkey',
        'contracts/PolicyPrivacyMainVerifier.sol'
      ];
      
      let needsBuild = false;
      for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
          this.log(`❌ Missing: ${file}`);
          needsBuild = true;
        }
      }
      
      if (!needsBuild) {
        this.log('✅ All circuit files already exist');
        return;
      }
      
      this.log('🔨 Compiling circuits...');
      await execAsync('npm run build:circuit:compile', { timeout: 300000 });
      
      this.log('🔑 Setting up Groth16 trusted setup...');
      await execAsync('npm run build:circuit:setup', { timeout: 600000 });
      
      this.log('📄 Exporting verifier...');
      await execAsync('npm run build:circuit:export:verificationkey', { timeout: 60000 });
      await execAsync('npm run build:circuit:export:solidityverifier', { timeout: 60000 });
      
      this.log('✅ Circuits built successfully');
      
    } catch (error) {
      this.log(`❌ Circuit building failed: ${error.message}`);
      throw error;
    }
  }

  async testSetup() {
    this.log('🧪 Testing setup...');
    
    try {
      // Test circuit compilation
      if (fs.existsSync('build/circuits/policy_privacy_main_instance.r1cs')) {
        this.log('✅ Circuit R1CS file exists');
      } else {
        throw new Error('Circuit R1CS file missing');
      }
      
      // Test WASM
      if (fs.existsSync('build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm')) {
        this.log('✅ Circuit WASM file exists');
      } else {
        throw new Error('Circuit WASM file missing');
      }
      
      // Test ZKey
      if (fs.existsSync('build/circuits/policy_privacy_main_final.zkey')) {
        this.log('✅ Groth16 ZKey file exists');
      } else {
        throw new Error('Groth16 ZKey file missing');
      }
      
      // Test Verifier
      if (fs.existsSync('contracts/PolicyPrivacyMainVerifier.sol')) {
        this.log('✅ Solidity verifier exists');
      } else {
        throw new Error('Solidity verifier missing');
      }
      
      // Test if we can import proof generator
      try {
        require('../test/utils/proofGenerator');
        this.log('✅ Proof generator module loads correctly');
      } catch (error) {
        throw new Error(`Proof generator module failed: ${error.message}`);
      }
      
      this.log('✅ All setup tests passed');
      
    } catch (error) {
      this.log(`❌ Setup test failed: ${error.message}`);
      throw error;
    }
  }

  async run() {
    try {
      this.log('🚀 Starting PolicyPrivacy complete setup...');
      this.log('='.repeat(60));
      
      await this.checkNodeModules();
      await this.buildCircuits();
      await this.testSetup();
      
      this.log('='.repeat(60));
      this.log('🎉 Setup completed successfully!');
      this.log('');
      this.log('Next steps:');
      this.log('  npm run demo           # Run complete end-to-end demo');
      this.log('  npm run api:start      # Start API server');
      this.log('  npx hardhat test       # Run smart contract tests');
      this.log('');
      
    } catch (error) {
      this.log(`💥 Setup failed: ${error.message}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const setup = new PolicyPrivacySetup();
  setup.run();
}

module.exports = PolicyPrivacySetup;