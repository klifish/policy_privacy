// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @dev Minimal mock for the PolicyPrivacy contract.
 *      Returns configurable values so AccessControlManager tests
 *      can exercise all paths without deploying the real contract.
 */
contract MockPolicyPrivacy {
    struct PolicyData {
        address dataSubject;
        uint256 commitment;
        uint256 paramsCommitment;
        uint256 ownershipCommitment;
        bool    isActive;
        uint256 timestamp;
        string  metadataURI;
    }

    mapping(uint256 => PolicyData) public policies;
    uint256 public nextPolicyId;

    function createPolicy(
        address _dataSubject,
        uint256 _commitment,
        uint256 _paramsCommitment
    ) external returns (uint256 policyId) {
        policyId = nextPolicyId++;
        policies[policyId] = PolicyData({
            dataSubject:       _dataSubject,
            commitment:        _commitment,
            paramsCommitment:  _paramsCommitment,
            ownershipCommitment: 0,
            isActive:          true,
            timestamp:         block.timestamp,
            metadataURI:       ""
        });
    }

    function getPolicy(uint256 _policyId) external view returns (
        address dataSubject,
        uint256 commitment,
        uint256 paramsCommitment,
        uint256 ownershipCommitment,
        bool    isActive,
        uint256 timestamp,
        string memory metadataURI
    ) {
        PolicyData storage p = policies[_policyId];
        return (p.dataSubject, p.commitment, p.paramsCommitment,
                p.ownershipCommitment, p.isActive, p.timestamp, p.metadataURI);
    }

    function setActive(uint256 _policyId, bool _active) external {
        policies[_policyId].isActive = _active;
    }
}
