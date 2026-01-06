const path = require('path');
const fs = require('fs');

function loadArtifact(relativePath) {
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
