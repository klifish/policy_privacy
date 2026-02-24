const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

function loadArtifact(relativePath) {
    if (isBrowser) {
        return null; // Artifacts not available in browser; use ABI from app config
    }
    const path = require('path');
    const fs = require('fs');
    const absolutePath = path.resolve(__dirname, '..', relativePath);
    if (fs.existsSync(absolutePath)) {
        return require(absolutePath);
    }
    return null;
}

const PolicyPrivacy = loadArtifact('artifacts/contracts/PolicyPrivacy.sol/PolicyPrivacy.json');
const Verifier = loadArtifact('artifacts/contracts/PolicyPrivacyMainVerifier.sol/PolicyPrivacyMainVerifier.json');

module.exports = {
    PolicyPrivacy,
    Verifier
};
