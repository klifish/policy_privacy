// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IVerifier {
  function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[33] calldata _pubSignals) external view returns (bool);
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
    event PolicyCommitted(address indexed dataSubject, uint256 indexed policyId, uint256 commitment, uint256 paramsCommitment);
    event AccessRequested(address indexed requester, uint256 indexed policyId, uint256 requestId);
    event AccessGranted(address indexed requester, uint256 indexed policyId, uint256 requestId);
    event AccessDenied(address indexed requester, uint256 indexed policyId, uint256 requestId);
    event PolicyRevoked(address indexed dataSubject, uint256 indexed policyId);

    // Struct for policy commitments
    struct PolicyCommitment {
        address dataSubject;      // Who owns the data/policy
        uint256 commitment;       // Poseidon hash of policy + randomness
        uint256 paramsCommitment; // Poseidon hash of external parameter configuration
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

    uint256 private constant MAX_GAS_PAD_TARGET_GAS = 8_000_000;
    uint256 private gasPadAccumulator;

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

    function _padGasToTarget(uint256 startGas, uint256 targetGas) internal {
        if (targetGas == 0) {
            return;
        }
        require(targetGas <= MAX_GAS_PAD_TARGET_GAS, "Gas pad target too large");

        uint256 currentGas = gasleft();
        uint256 executionGasUsed = startGas - currentGas;

        // Transaction gas breakdown:
        // Total TX gas = 21000 (base) + calldata_gas + execution_gas
        //
        // We want: Total TX gas = targetGas for ALL policy types
        // Therefore: execution_gas_after_padding = targetGas - 21000 - calldata_gas
        //
        // Estimated transaction overhead:
        // - Base: 21,000 gas
        // - Calldata: ~44,192 gas (2762 bytes × 16 gas/byte for non-zero bytes)
        // - Total overhead: ~65,192 gas
        //
        // This means if targetGas = 7,100,000:
        //   Execution must consume: 7,100,000 - 65,192 = 7,034,808 gas
        //
        // Strategy: Calculate how much padding needed to reach target TRANSACTION gas

        uint256 TX_OVERHEAD = 65192; // 21000 + 44192 (estimated)

        // Safety check: ensure target is reasonable
        if (targetGas <= TX_OVERHEAD) {
            return;
        }

        // Calculate target execution gas (what we need to consume in this function)
        uint256 targetExecutionGas = targetGas - TX_OVERHEAD;

        // If we've already exceeded the target execution gas, we can't pad backwards
        if (executionGasUsed >= targetExecutionGas) {
            return;
        }

        // Calculate how much more gas we need to consume
        uint256 paddingNeeded = targetExecutionGas - executionGasUsed;

        // Safety check: ensure we have enough gas left to pad
        if (paddingNeeded >= currentGas) {
            return;
        }

        // Calculate target gasleft() we need to reach
        uint256 targetGasLeft = currentGas - paddingNeeded;

        // Burn gas through computation until we reach target
        uint256 acc = gasPadAccumulator;
        while (gasleft() > targetGasLeft) {
            unchecked {
                acc = (acc ^ (0x9e3779b97f4a7c15)) * 0x1000003d;
            }
        }

        gasPadAccumulator = acc;
    }

    function _commitPolicy(uint256 _commitment, uint256 _paramsCommitment, string calldata _metadataURI) internal returns (uint256) {
        uint256 policyId = nextPolicyId++;

        policies[policyId] = PolicyCommitment({
            dataSubject: msg.sender,
            commitment: _commitment,
            paramsCommitment: _paramsCommitment,
            isActive: true,
            timestamp: block.timestamp,
            metadataURI: _metadataURI
        });

        subjectPolicies[msg.sender].push(policyId);

        emit PolicyCommitted(msg.sender, policyId, _commitment, _paramsCommitment);

        return policyId;
    }

    /**
     * @dev Commit a new policy without revealing its contents (full signature)
     * @param _commitment Poseidon hash of (policy || randomness)
     * @param _paramsCommitment Poseidon hash of external parameter configuration
     * @param _metadataURI Optional metadata URI (e.g., IPFS hash)
     */
    function commitPolicy(uint256 _commitment, uint256 _paramsCommitment, string calldata _metadataURI) public notPaused returns (uint256) {
        return _commitPolicy(_commitment, _paramsCommitment, _metadataURI);
    }

    /**
     * @dev Legacy helper preserving the previous signature (params commitment defaults to 0)
     */
    function commitPolicy(uint256 _commitment, string calldata _metadataURI) external notPaused returns (uint256) {
        return _commitPolicy(_commitment, 0, _metadataURI);
    }

    /**
     * @dev Commit policy with additional gas padding to equalize observable gas usage
     */
    function commitPolicyWithGasPad(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI,
        uint256 targetGas
    ) public notPaused returns (uint256) {
        uint256 startGas = gasleft();
        uint256 policyId = _commitPolicy(_commitment, _paramsCommitment, _metadataURI);
        _padGasToTarget(startGas, targetGas);
        return policyId;
    }

    function commitPolicyWithGasPad(
        uint256 _commitment,
        string calldata _metadataURI,
        uint256 targetGas
    ) external notPaused returns (uint256) {
        uint256 startGas = gasleft();
        uint256 policyId = _commitPolicy(_commitment, 0, _metadataURI);
        _padGasToTarget(startGas, targetGas);
        return policyId;
    }

    function _requestAccess(
        uint256 _policyId,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[33] calldata _pubSignals
    ) internal returns (uint256) {
        require(policies[_policyId].isActive, "Policy not active");

        require(_pubSignals[1] == policies[_policyId].commitment, "Policy commitment mismatch");
        require(_pubSignals[2] == policies[_policyId].paramsCommitment, "Parameter commitment mismatch");

        uint256 requestId = nextRequestId++;

        bool isValidProof = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);

        bool isAuthorized = isValidProof && (_pubSignals[0] == 1);

        accessRequests[requestId] = AccessRequest({
            requester: msg.sender,
            policyId: _policyId,
            timestamp: block.timestamp,
            isProcessed: true,
            isGranted: isAuthorized
        });

        requesterRequests[msg.sender].push(requestId);

        emit AccessRequested(msg.sender, _policyId, requestId);

        if (isAuthorized) {
            emit AccessGranted(msg.sender, _policyId, requestId);
        } else {
            emit AccessDenied(msg.sender, _policyId, requestId);
        }

        return requestId;
    }

    /**
     * @dev Request access to data protected by a policy using zero-knowledge proof
     * @param _policyId The policy ID to request access for
     * @param _pA Groth16 proof component A
     * @param _pB Groth16 proof component B  
     * @param _pC Groth16 proof component C
     * @param _pubSignals Public signals for proof verification
     */
    function requestAccess(
        uint256 _policyId, 
        uint[2] calldata _pA, 
        uint[2][2] calldata _pB, 
        uint[2] calldata _pC, 
        uint[33] calldata _pubSignals
    ) external notPaused returns (uint256) {
        return _requestAccess(_policyId, _pA, _pB, _pC, _pubSignals);
    }

    /**
     * @dev Request access with gas padding to equalize observable gas usage
     */
    function requestAccessWithGasPad(
        uint256 _policyId,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[33] calldata _pubSignals,
        uint256 targetGas
    ) external notPaused returns (uint256) {
        uint256 startGas = gasleft();
        uint256 requestId = _requestAccess(_policyId, _pA, _pB, _pC, _pubSignals);
        _padGasToTarget(startGas, targetGas);
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
        uint256 paramsCommitment,
        bool isActive,
        uint256 timestamp,
        string memory metadataURI
    ) {
        PolicyCommitment memory policy = policies[_policyId];
        return (
            policy.dataSubject,
            policy.commitment,
            policy.paramsCommitment,
            policy.isActive,
            policy.timestamp,
            policy.metadataURI
        );
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
     * @param _pA Groth16 proof component A
     * @param _pB Groth16 proof component B  
     * @param _pC Groth16 proof component C
     * @param _pubSignals Public signals for proof verification
     */
    function verifyProof(
        uint[2] calldata _pA, 
        uint[2][2] calldata _pB, 
        uint[2] calldata _pC, 
        uint[33] calldata _pubSignals
    ) external view returns (bool) {
        return verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
    }
}
