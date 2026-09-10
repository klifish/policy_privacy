const { generatePolicyArtifacts } = require('../compiler/policy_generator');
const { buildWhitelist, verifyProof } = require('../utils/merkle/ontology_whitelist');
const { buildRequesterAllowlist } = require('../utils/merkle/requester_allowlist');

module.exports = {
    generatePolicyArtifacts,
    buildWhitelist,
    buildRequesterAllowlist,
    verifyMerkleProof: verifyProof
};
