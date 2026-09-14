const path = require('path');
const fs = require('fs');

function findArtifact(directory, fileName) {
    if (!fs.existsSync(directory)) return null;
    const pending = [directory];
    while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(full);
            if (entry.isFile() && entry.name === fileName) return full;
        }
    }
    return null;
}

function loadArtifact(relativePath, fileName) {
    const configuredRoot = process.env.PROTOCOL_HARDHAT_ARTIFACTS;
    const absolutePath = configuredRoot
        ? findArtifact(path.resolve(configuredRoot), fileName)
        : path.resolve(__dirname, '..', relativePath);
    if (!absolutePath) return null;
    if (fs.existsSync(absolutePath)) {
        return require(absolutePath);
    }
    return null;
}

const PolicyPrivacy = loadArtifact('artifacts/contracts/PolicyPrivacy.sol/PolicyPrivacy.json', 'PolicyPrivacy.json');
const Verifier = loadArtifact('artifacts/contracts/PolicyPrivacyMainVerifier.sol/PolicyPrivacyMainVerifier.json', 'PolicyPrivacyMainVerifier.json');

module.exports = {
    PolicyPrivacy,
    Verifier
};
