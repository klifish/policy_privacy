'use strict';

/**
 * TPS service entry point.
 * Start with:  node tps/index.js
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const tpsRouter = require('./server');

const PORT = process.env.TPS_PORT || 3001;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/tps', tpsRouter);

// ── Optional: TPS chain signer for on-chain proof submission (Stage 5) ────────
// Set TPS_PRIVATE_KEY + CONTRACT_ADDRESS (or rely on deployment.json fallback)
// to enable TPS-submitted requestAccessBound() calls.
// Without these, TPS degrades gracefully to pure proof-oracle mode.
(function initChainSigner() {
    const privateKey = process.env.TPS_PRIVATE_KEY;
    if (!privateKey) return;

    const nodeUrl = process.env.ETH_NODE_URL || 'http://127.0.0.1:8545';

    let contractAddress = process.env.CONTRACT_ADDRESS;
    if (!contractAddress) {
        const deploymentPath = path.resolve(__dirname, '../deployment.json');
        if (fs.existsSync(deploymentPath)) {
            const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
            contractAddress = deployment.contracts && deployment.contracts.PolicyPrivacy;
        }
    }
    if (!contractAddress) {
        console.warn('[TPS] TPS_PRIVATE_KEY set but no CONTRACT_ADDRESS found – chain signer disabled');
        return;
    }

    const artifactPath = path.resolve(__dirname, '../artifacts/contracts/PolicyPrivacy.sol/PolicyPrivacy.json');
    if (!fs.existsSync(artifactPath)) {
        console.warn('[TPS] PolicyPrivacy artifact not found – chain signer disabled (run npx hardhat compile first)');
        return;
    }

    // Defer ethers require so TPS can start without ethers if chain submission is not needed
    const { ethers } = require('ethers');
    const abi = JSON.parse(fs.readFileSync(artifactPath, 'utf8')).abi;
    const provider = new ethers.JsonRpcProvider(nodeUrl);
    const tpsSigner = new ethers.Wallet(privateKey, provider);
    app.locals.tpsContract = new ethers.Contract(contractAddress, abi, tpsSigner);
    app.locals.tpsSignerAddress = tpsSigner.address;
    app.locals.contractAddress = contractAddress;
    app.locals.nodeUrl = nodeUrl;
    console.log(`[TPS] Chain signer initialised: ${tpsSigner.address} → ${contractAddress}`);
})();

app.listen(PORT, () => {
    console.log(`[TPS] Trusted Proof Service listening on port ${PORT}`);
    console.log(`[TPS] POST /tps/provision  – provider provisions policy material`);
    console.log(`[TPS] POST /tps/prove      – requester requests proof generation`);
    console.log(`[TPS] GET  /tps/health     – health check`);
    if (app.locals.tpsContract) {
        console.log(`[TPS] submitOnChain enabled (requestAccessBound)`);
    } else {
        console.log(`[TPS] submitOnChain disabled (proof-oracle mode)`);
    }
});

module.exports = app;
