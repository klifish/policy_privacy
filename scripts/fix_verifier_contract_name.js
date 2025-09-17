#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix the contract name in the generated verifier file
function fixVerifierContractName() {
    const verifierPath = path.join(__dirname, '..', 'contracts', 'PolicyPrivacyMainVerifier.sol');
    
    if (!fs.existsSync(verifierPath)) {
        console.error('PolicyPrivacyMainVerifier.sol not found');
        process.exit(1);
    }
    
    console.log('Fixing verifier contract name...');
    
    let content = fs.readFileSync(verifierPath, 'utf8');
    
    // Replace the contract name from Groth16Verifier to PolicyPrivacyMainVerifier
    content = content.replace(
        /contract\s+Groth16Verifier\s*\{/g,
        'contract PolicyPrivacyMainVerifier {'
    );
    
    // Write back the fixed content
    fs.writeFileSync(verifierPath, content, 'utf8');
    
    console.log('✅ Contract name fixed: Groth16Verifier → PolicyPrivacyMainVerifier');
}

if (require.main === module) {
    fixVerifierContractName();
}

module.exports = { fixVerifierContractName };