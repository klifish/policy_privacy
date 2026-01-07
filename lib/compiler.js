const { generatePolicyArtifacts } = require('../compiler/policy_generator');
const { buildWhitelist, verifyProof } = require('../utils/merkle/ontology_whitelist');

module.exports = {
    generatePolicyArtifacts,
    buildWhitelist,
    verifyMerkleProof: verifyProof
};
