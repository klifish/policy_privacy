// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IVerifier {
  function verifyProof(uint256[24] calldata _proof, uint256[1] calldata _pubSignals) external view returns (bool);
}

/**
 * @title PolicyPrivacy
 * @dev Main contract for privacy-preserving consent management using zero-knowledge proofs
 * 
 * This contract implements the paper's approach for healthcare consent management where:
 * - Data subjects commit to policies without revealing them
 * - Requesters prove policy satisfaction without revealing their attributes
 * - External predicates (credentials, range proofs, etc.) are verified off-chain
 */
contract PolicyPrivacy {
    // Events for tracking policy lifecycle
    event PolicyCommitted(address indexed dataSubject, uint256 indexed policyId, uint256 commitment);
    event AccessRequested(address indexed requester, uint256 indexed policyId, uint256 requestId);
    event AccessGranted(address indexed requester, uint256 indexed policyId, uint256 requestId);
    event AccessDenied(address indexed requester, uint256 indexed policyId, uint256 requestId);
    event PolicyRevoked(address indexed dataSubject, uint256 indexed policyId);

    // Struct for policy commitments
    struct PolicyCommitment {
        address dataSubject;      // Who owns the data/policy
        uint256 commitment;       // Poseidon hash of policy + randomness
        bool isActive;           // Whether policy is still valid
        uint256 timestamp;       // When policy was committed
        string metadataURI;      // Optional metadata (IPFS hash, etc.)
    }

    // Struct for access requests
    struct AccessRequest {
        address requester;        // Who is requesting access
        uint256 policyId;        // Which policy they're claiming to satisfy
        uint256 timestamp;       // When request was made
        bool isProcessed;        // Whether request has been processed
        bool isGranted;          // Whether access was granted
    }

    // Contract state
    IVerifier public immutable verifier;
    uint256 public nextPolicyId;
    uint256 public nextRequestId;
    
    // Mappings
    mapping(uint256 => PolicyCommitment) public policies;
    mapping(uint256 => AccessRequest) public accessRequests;
    mapping(address => uint256[]) public subjectPolicies;
    mapping(address => uint256[]) public requesterRequests;

    // Emergency controls
    address public immutable owner;
    bool public emergencyPaused;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier notPaused() {
        require(!emergencyPaused, "Contract is paused");
        _;
    }

    modifier onlyDataSubject(uint256 _policyId) {
        require(policies[_policyId].dataSubject == msg.sender, "Not the data subject");
        _;
    }

    constructor(IVerifier _verifier) {
        verifier = _verifier;
        owner = msg.sender;
        nextPolicyId = 1;
        nextRequestId = 1;
    }

    /**
     * @dev Commit a new policy without revealing its contents
     * @param _commitment Poseidon hash of (policy || randomness)
     * @param _metadataURI Optional metadata URI (e.g., IPFS hash)
     */
    function commitPolicy(uint256 _commitment, string calldata _metadataURI) external notPaused returns (uint256) {
        uint256 policyId = nextPolicyId++;
        
        policies[policyId] = PolicyCommitment({
            dataSubject: msg.sender,
            commitment: _commitment,
            isActive: true,
            timestamp: block.timestamp,
            metadataURI: _metadataURI
        });

        subjectPolicies[msg.sender].push(policyId);
        
        emit PolicyCommitted(msg.sender, policyId, _commitment);
        
        return policyId;
    }

    /**
     * @dev Request access to data protected by a policy using zero-knowledge proof
     * @param _policyId The policy ID to request access for
     * @param _proof Zero-knowledge proof that policy is satisfied
     */
    function requestAccess(uint256 _policyId, uint256[24] calldata _proof) external notPaused returns (uint256) {
        require(policies[_policyId].isActive, "Policy not active");
        
        uint256 requestId = nextRequestId++;
        
        // Verify the zero-knowledge proof
        bool isValid = verifier.verifyProof(_proof, [policies[_policyId].commitment]);
        
        accessRequests[requestId] = AccessRequest({
            requester: msg.sender,
            policyId: _policyId,
            timestamp: block.timestamp,
            isProcessed: true,
            isGranted: isValid
        });

        requesterRequests[msg.sender].push(requestId);
        
        emit AccessRequested(msg.sender, _policyId, requestId);
        
        if (isValid) {
            emit AccessGranted(msg.sender, _policyId, requestId);
        } else {
            emit AccessDenied(msg.sender, _policyId, requestId);
        }
        
        return requestId;
    }

    /**
     * @dev Revoke a policy (data subject only)
     * @param _policyId The policy to revoke
     */
    function revokePolicy(uint256 _policyId) external onlyDataSubject(_policyId) notPaused {
        require(policies[_policyId].isActive, "Policy already inactive");
        
        policies[_policyId].isActive = false;
        
        emit PolicyRevoked(msg.sender, _policyId);
    }

    /**
     * @dev Check if an access request was granted
     * @param _requestId The request ID to check
     */
    function isAccessGranted(uint256 _requestId) external view returns (bool) {
        return accessRequests[_requestId].isGranted;
    }

    /**
     * @dev Get policy details
     * @param _policyId The policy ID
     */
    function getPolicy(uint256 _policyId) external view returns (
        address dataSubject,
        uint256 commitment,
        bool isActive,
        uint256 timestamp,
        string memory metadataURI
    ) {
        PolicyCommitment memory policy = policies[_policyId];
        return (policy.dataSubject, policy.commitment, policy.isActive, policy.timestamp, policy.metadataURI);
    }

    /**
     * @dev Get all policy IDs for a data subject
     * @param _subject The data subject address
     */
    function getSubjectPolicies(address _subject) external view returns (uint256[] memory) {
        return subjectPolicies[_subject];
    }

    /**
     * @dev Get all request IDs for a requester
     * @param _requester The requester address
     */
    function getRequesterRequests(address _requester) external view returns (uint256[] memory) {
        return requesterRequests[_requester];
    }

    /**
     * @dev Emergency pause function (owner only)
     */
    function emergencyPause() external onlyOwner {
        emergencyPaused = true;
    }

    /**
     * @dev Emergency unpause function (owner only)
     */
    function emergencyUnpause() external onlyOwner {
        emergencyPaused = false;
    }

    /**
     * @dev Verify a proof manually (view function for testing)
     * @param _proof The zero-knowledge proof
     * @param _commitment The policy commitment to verify against
     */
    function verifyProof(uint256[24] calldata _proof, uint256 _commitment) external view returns (bool) {
        return verifier.verifyProof(_proof, [_commitment]);
    }
}