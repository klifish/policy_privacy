// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "hardhat/console.sol";

/**
 * @dev circomlib's Poseidon(3) hasher, deployed from the generated EVM bytecode
 * (circomlibjs `poseidonContract.createCode(3)`) so that the on-chain digest is
 * bit-identical to the one the circuit computes.
 */
interface IPoseidon3 {
    function poseidon(uint256[3] calldata input) external pure returns (uint256);
}

interface IVerifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) external view returns (bool);
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
    event PolicyCommitted(
        address indexed dataSubject,
        uint256 indexed policyId,
        uint256 commitment,
        uint256 paramsCommitment
    );
    event ResourceRegistered(
        address indexed provider,
        uint256 indexed resourceId,
        uint256 indexed policyId
    );
    event AccessRequested(
        address indexed requester,
        uint256 indexed policyId,
        uint256 requestId
    );
    event AccessGranted(
        address indexed requester,
        uint256 indexed policyId,
        uint256 requestId
    );
    event AccessDenied(
        address indexed requester,
        uint256 indexed policyId,
        uint256 requestId
    );
    event PolicyRevoked(address indexed dataSubject, uint256 indexed policyId);
    event PolicyVersionCommitted(uint256 indexed policyId, uint256 indexed supersedesPolicyId);
    event ResourcePolicyRebound(uint256 indexed resourceId, uint256 indexed oldPolicyId, uint256 indexed newPolicyId);
    event PolicyTimeLimitConfigured(uint256 indexed policyId, uint256 timeLimitEpochs);
    event RequesterTimeLimitStarted(uint256 indexed policyId, uint256 indexed requesterId, uint256 startEpoch, uint256 expiryEpoch);

    // Struct for policy commitments
    struct PolicyCommitment {
        address dataSubject; // Who owns the data/policy
        uint256 commitment; // Poseidon hash of policy + randomness
        uint256 paramsCommitment; // Poseidon hash of external parameter configuration
        bool isActive; // Whether policy is still valid
        uint256 timestamp; // When policy was committed
        uint256 supersedesPolicyId; // Direct predecessor, or zero for a root policy
        string metadataURI; // Optional metadata (IPFS hash, etc.)
    }

    // Struct for access requests
    struct AccessRequest {
        address submitter; // Who submitted the transaction (the TPS, not the requester)
        uint256 requesterId; // Requester pseudonym bound into the proof statement
        uint256 resourceId; // Resource bound into the proof statement
        uint256 contextHash; // Poseidon(requesterId || resourceId || nonce), a public signal
        uint256 requestEpoch; // V2 EVM hour bucket asserted by the proof
        uint256 policyId; // Which policy they're claiming to satisfy
        uint256 timestamp; // When request was made
        bool isProcessed; // Whether request has been processed
        bool isGranted; // Whether access was granted
    }

    // Struct for protected resources (ACM role, Section V-A)
    struct Resource {
        uint256 policyId;   // Policy governing access to this resource
        address provider;   // Who registered this resource
        bool isActive;
    }

    struct RequesterTimeLimit {
        uint256 startEpoch;
        uint256 expiryEpoch;
    }

    // Contract state
    IVerifier public immutable verifier;
    IPoseidon3 public immutable contextHasher;
    uint256 public nextPolicyId;
    uint256 public nextRequestId;
    uint256 public nextResourceId;

    // Mappings
    mapping(uint256 => PolicyCommitment) public policies;
    mapping(uint256 => AccessRequest) public accessRequests;
    mapping(address => uint256[]) public subjectPolicies;
    mapping(address => uint256[]) public requesterRequests;
    mapping(uint256 => Resource) public resources;
    // Replay prevention: hash(policyId, resourceId, nonce, requesterId) → used.
    // requesterId is part of the key so a nonce consumed for one requester
    // cannot be reused to record an authorization for another.
    mapping(bytes32 => bool) public usedNonces;
    mapping(uint256 => uint256) public policySuccessor;
    // A non-zero duration makes TS public and contract-enforced. The state is
    // shared by all resources governed by the same policy.
    mapping(uint256 => uint256) public policyTimeLimitEpochs;
    mapping(uint256 => mapping(uint256 => RequesterTimeLimit)) private requesterTimeLimits;

    // Emergency controls
    address public immutable owner;
    bool public emergencyPaused;

    uint256 private constant MAX_GAS_PAD_TARGET_GAS = 8_000_000;
    uint256 public constant EPOCH_SECONDS = 3600;
    uint256 private constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
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
        require(
            policies[_policyId].dataSubject == msg.sender,
            "Not the data subject"
        );
        _;
    }

    constructor(IVerifier _verifier, IPoseidon3 _contextHasher) {
        verifier = _verifier;
        contextHasher = _contextHasher;
        owner = msg.sender;
        nextPolicyId = 1;
        nextRequestId = 1;
        nextResourceId = 1;
    }

    /**
     * @dev Pads gas consumption to reach a target total transaction gas
     * @param startGas Gas available at the start of the function
     * @param targetGas Target total transaction gas (including calldata, base, and execution)
     *
     * This improved implementation:
     * 1. Calculates actual calldata costs dynamically (zero vs non-zero bytes)
     * 2. Compensates for calldata differences to normalize total gas
     * 3. Accounts for storage and loop overhead
     *
     * Note: Perfect gas equalization is theoretically impossible due to EVM limitations
     * (storage state differences, memory expansion, etc.). This achieves ~3-5% variance,
     * which is acceptable for practical privacy preservation.
     *
     * See docs/GAS_PADDING_IMPROVEMENTS.md for detailed explanation.
     */
    function _padGasToTarget(uint256 startGas, uint256 targetGas) internal {
        if (targetGas == 0) {
            return;
        }
        require(
            targetGas <= MAX_GAS_PAD_TARGET_GAS,
            "Gas pad target too large"
        );

        uint256 currentGas = gasleft();
        uint256 executionGasUsed = startGas - currentGas;

        // Transaction gas breakdown:
        // Total TX gas = 21000 (base) + calldata_gas + execution_gas
        //
        // Calldata gas calculation (EIP-2028):
        // - Zero bytes: 4 gas each
        // - Non-zero bytes: 16 gas each
        //
        // Strategy: Calculate actual calldata costs and compensate with padding
        // to normalize all transactions to the same total gas consumption

        // Calculate actual calldata costs dynamically
        uint256 calldataLength = msg.data.length;
        uint256 calldataZeroBytes = 0;

        // Count zero bytes in calldata
        for (uint256 i = 0; i < calldataLength; i++) {
            if (msg.data[i] == 0) {
                calldataZeroBytes++;
            }
        }

        uint256 calldataNonZeroBytes = calldataLength - calldataZeroBytes;
        uint256 actualCalldataGas = (calldataZeroBytes * 4) +
            (calldataNonZeroBytes * 16);

        // Calculate maximum possible calldata gas for this function
        // (assuming all bytes are non-zero for worst case)
        uint256 maxCalldataGas = calldataLength * 16;

        // Base transaction cost
        uint256 BASE_TX_GAS = 21000;

        // Total overhead with MAXIMUM calldata cost (worst case)
        uint256 maxTxOverhead = BASE_TX_GAS + maxCalldataGas;

        // Safety check: ensure target is reasonable
        if (targetGas <= maxTxOverhead) {
            return;
        }

        // Calculate target execution gas based on MAXIMUM overhead
        // This ensures all transactions reach the same total gas
        uint256 targetExecutionGas = targetGas - maxTxOverhead;

        // Calculate additional padding needed to compensate for lower actual calldata cost
        // Transactions with more zero bytes (lower calldata cost) need more execution padding
        uint256 calldataCompensation = maxCalldataGas - actualCalldataGas;
        targetExecutionGas += calldataCompensation;

        // If we've already exceeded the target execution gas, we can't pad backwards
        if (executionGasUsed >= targetExecutionGas) {
            return;
        }

        // Calculate how much more gas we need to consume
        uint256 paddingNeeded = targetExecutionGas - executionGasUsed;

        console.log(
            "Gas padding needed:",
            paddingNeeded,
            "Current gas left:",
            currentGas
        );

        // Safety check: ensure we have enough gas left to pad
        if (paddingNeeded >= currentGas) {
            return;
        }

        // Calculate target gasleft() we need to reach
        // Account for loop overhead and final storage write
        // Storage write to non-zero: ~5000 gas, loop exit: ~50 gas
        uint256 finalOperationsCost = 5050;
        if (paddingNeeded <= finalOperationsCost) {
            return; // Too small to pad accurately
        }

        uint256 targetGasLeft = currentGas -
            paddingNeeded +
            finalOperationsCost;

        // Burn gas through computation until we reach target
        // Use simple, predictable operations with consistent gas cost
        uint256 acc = gasPadAccumulator;
        while (gasleft() > targetGasLeft) {
            unchecked {
                // Simple arithmetic operations with predictable gas costs
                // Each iteration: ~30-40 gas
                // Combine XOR, multiplication, and bit shifts for gas consumption
                acc = (acc ^ (0x9e3779b97f4a7c15)) * 0x1000003d;
                acc = (acc << 1) + (acc >> 1); // Simplified: double + half
            }
        }

        gasPadAccumulator = acc;
    }

    function _commitPolicy(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI,
        uint256 _supersedesPolicyId
    ) internal returns (uint256) {
        uint256 policyId = nextPolicyId++;

        policies[policyId] = PolicyCommitment({
            dataSubject: msg.sender,
            commitment: _commitment,
            paramsCommitment: _paramsCommitment,
            isActive: true,
            timestamp: block.timestamp,
            supersedesPolicyId: _supersedesPolicyId,
            metadataURI: _metadataURI
        });

        subjectPolicies[msg.sender].push(policyId);

        emit PolicyCommitted(
            msg.sender,
            policyId,
            _commitment,
            _paramsCommitment
        );
        if (_supersedesPolicyId != 0) {
            emit PolicyVersionCommitted(policyId, _supersedesPolicyId);
        }

        return policyId;
    }

    /**
     * @dev Commit a new policy without revealing its contents (full signature)
     * @param _commitment Poseidon hash of (policy || randomness)
     * @param _paramsCommitment Poseidon hash of external parameter configuration
     * @param _metadataURI Optional metadata URI (e.g., IPFS hash)
     */
    function commitPolicy(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI
    ) public notPaused returns (uint256) {
        return _commitPolicy(_commitment, _paramsCommitment, _metadataURI, 0);
    }

    /**
     * @dev Legacy helper preserving the previous signature (params commitment defaults to 0)
     */
    function commitPolicy(
        uint256 _commitment,
        string calldata _metadataURI
    ) external notPaused returns (uint256) {
        return _commitPolicy(_commitment, 0, _metadataURI, 0);
    }

    /** Commit a policy with a public, requester-first-use TS duration. */
    function commitPolicyWithTimeLimit(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI,
        uint256 _timeLimitEpochs
    ) public notPaused returns (uint256 policyId) {
        require(_timeLimitEpochs > 0, "Time limit is zero");
        policyId = _commitPolicy(_commitment, _paramsCommitment, _metadataURI, 0);
        policyTimeLimitEpochs[policyId] = _timeLimitEpochs;
        emit PolicyTimeLimitConfigured(policyId, _timeLimitEpochs);
    }

    /** Time-limited policy commit with optional gas normalization. */
    function commitPolicyWithTimeLimitAndGasPad(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI,
        uint256 _timeLimitEpochs,
        uint256 targetGas
    ) external notPaused returns (uint256 policyId) {
        uint256 startGas = gasleft();
        require(_timeLimitEpochs > 0, "Time limit is zero");
        policyId = _commitPolicy(_commitment, _paramsCommitment, _metadataURI, 0);
        policyTimeLimitEpochs[policyId] = _timeLimitEpochs;
        emit PolicyTimeLimitConfigured(policyId, _timeLimitEpochs);
        _padGasToTarget(startGas, targetGas);
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
        uint256 policyId = _commitPolicy(
            _commitment,
            _paramsCommitment,
            _metadataURI,
            0
        );
        _padGasToTarget(startGas, targetGas);
        return policyId;
    }

    function commitPolicyWithGasPad(
        uint256 _commitment,
        string calldata _metadataURI,
        uint256 targetGas
    ) external notPaused returns (uint256) {
        uint256 startGas = gasleft();
        uint256 policyId = _commitPolicy(_commitment, 0, _metadataURI, 0);
        _padGasToTarget(startGas, targetGas);
        return policyId;
    }

    /**
     * @dev Core verification path.
     *
     * _pubSignals = [isAuthorized, policyCommitment, paramsCommitment,
     *                contextHash, requestEpoch].
     * contextHash = Poseidon(requesterId || resourceId || nonce) is constrained
     * in-circuit by a hard equality, so a proof is bound to exactly one
     * authorization context: it cannot be replayed for a different requester,
     * resource or session without generating a new proof. The context values
     * themselves stay off the Groth16 public-signal array. The bound entry point
     * still receives them as public transaction calldata; it recomputes the
     * digest on-chain, and the request record stores the requester/resource and
     * digest so the binding is auditable from chain state.
     *
     * @param _idReq Requester pseudonym bound into the proof statement.
     * @param _resourceId Resource bound into the proof statement (0 for the
     *        unbound legacy entry point).
     */
    function _requestAccess(
        uint256 _policyId,
        uint256 _idReq,
        uint256 _resourceId,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) internal returns (uint256) {
        require(policies[_policyId].isActive, "Policy not active");

        require(
            _pubSignals[1] == policies[_policyId].commitment,
            "Policy commitment mismatch"
        );
        require(
            _pubSignals[2] == policies[_policyId].paramsCommitment,
            "Parameter commitment mismatch"
        );

        uint256 requestId = nextRequestId++;

        bool isValidProof = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);

        bool isAuthorized = isValidProof && (_pubSignals[0] == 1);

        accessRequests[requestId] = AccessRequest({
            submitter: msg.sender,
            requesterId: _idReq,
            resourceId: _resourceId,
            contextHash: _pubSignals[3],
            requestEpoch: _pubSignals[4],
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
        uint256 _idReq,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) external notPaused returns (uint256) {
        _policyId; _idReq; _pA; _pB; _pC; _pubSignals;
        revert("V2 requires requestAccessBound");
    }

    /**
     * @dev Request access with gas padding to equalize observable gas usage
     */
    function requestAccessWithGasPad(
        uint256 _policyId,
        uint256 _idReq,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals,
        uint256 targetGas
    ) external notPaused returns (uint256) {
        _policyId; _idReq; _pA; _pB; _pC; _pubSignals; targetGas;
        revert("V2 requires requestAccessBound");
    }

    /**
     * @dev Revoke a policy (data subject only)
     * @param _policyId The policy to revoke
     */
    function revokePolicy(
        uint256 _policyId
    ) external onlyDataSubject(_policyId) notPaused {
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

    /** @dev Current authorization predicate for the simulated access decision. */
    function isAuthorizationCurrent(uint256 _requestId) external view returns (bool) {
        AccessRequest memory request = accessRequests[_requestId];
        if (!request.isGranted || request.requestEpoch != block.timestamp / EPOCH_SECONDS) return false;
        Resource memory resource = resources[request.resourceId];
        return resource.isActive && resource.policyId == request.policyId && policies[request.policyId].isActive;
    }

    /**
     * @dev Get policy details
     * @param _policyId The policy ID
     */
    function getPolicy(
        uint256 _policyId
    )
        external
        view
        returns (
            address dataSubject,
            uint256 commitment,
            uint256 paramsCommitment,
            bool isActive,
            uint256 timestamp,
            uint256 supersedesPolicyId,
            string memory metadataURI
        )
    {
        PolicyCommitment memory policy = policies[_policyId];
        return (
            policy.dataSubject,
            policy.commitment,
            policy.paramsCommitment,
            policy.isActive,
            policy.timestamp,
            policy.supersedesPolicyId,
            policy.metadataURI
        );
    }

    /**
     * @dev Get all policy IDs for a data subject
     * @param _subject The data subject address
     */
    function getSubjectPolicies(
        address _subject
    ) external view returns (uint256[] memory) {
        return subjectPolicies[_subject];
    }

    /**
     * @dev Get all request IDs for a requester
     * @param _requester The requester address
     */
    function getRequesterRequests(
        address _requester
    ) external view returns (uint256[] memory) {
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
     * @dev Register a protected resource and bind it to a committed policy (Stage 1).
     * @param _policyId  An active policy that governs access to this resource.
     * @return resourceId  Unique resource identifier.
     */
    function registerResource(uint256 _policyId)
        external
        notPaused
        returns (uint256 resourceId)
    {
        require(policies[_policyId].isActive, "Policy not active");

        resourceId = nextResourceId++;
        resources[resourceId] = Resource({
            policyId: _policyId,
            provider: msg.sender,
            isActive: true
        });

        emit ResourceRegistered(msg.sender, resourceId, _policyId);
    }

    /** Commit a direct V2 successor without deactivating the predecessor. */
    function commitPolicyVersion(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI,
        uint256 _supersedesPolicyId
    ) external notPaused returns (uint256) {
        require(_supersedesPolicyId != 0, "Missing predecessor");
        require(policies[_supersedesPolicyId].isActive, "Predecessor not active");
        require(policies[_supersedesPolicyId].dataSubject == msg.sender, "Not predecessor subject");
        require(policySuccessor[_supersedesPolicyId] == 0, "Predecessor already superseded");
        uint256 policyId = _commitPolicy(_commitment, _paramsCommitment, _metadataURI, _supersedesPolicyId);
        policySuccessor[_supersedesPolicyId] = policyId;
        return policyId;
    }

    /**
     * @dev Commit a direct successor carrying a public TS duration.  A new
     * policy ID deliberately gets fresh requester windows, even when it
     * supersedes a time-limited predecessor.
     */
    function commitPolicyVersionWithTimeLimit(
        uint256 _commitment,
        uint256 _paramsCommitment,
        string calldata _metadataURI,
        uint256 _supersedesPolicyId,
        uint256 _timeLimitEpochs
    ) external notPaused returns (uint256 policyId) {
        require(_timeLimitEpochs > 0, "Time limit is zero");
        require(_supersedesPolicyId != 0, "Missing predecessor");
        require(policies[_supersedesPolicyId].isActive, "Predecessor not active");
        require(policies[_supersedesPolicyId].dataSubject == msg.sender, "Not predecessor subject");
        require(policySuccessor[_supersedesPolicyId] == 0, "Predecessor already superseded");
        policyId = _commitPolicy(_commitment, _paramsCommitment, _metadataURI, _supersedesPolicyId);
        policySuccessor[_supersedesPolicyId] = policyId;
        policyTimeLimitEpochs[policyId] = _timeLimitEpochs;
        emit PolicyTimeLimitConfigured(policyId, _timeLimitEpochs);
    }

    /** Rebind one resource to its policy's direct successor. */
    function rebindResourcePolicy(uint256 _resourceId, uint256 _newPolicyId) external notPaused {
        Resource storage resource = resources[_resourceId];
        uint256 oldPolicyId = resource.policyId;
        require(resource.isActive, "Resource not active");
        require(resource.provider == msg.sender, "Not resource provider");
        require(policies[_newPolicyId].isActive, "New policy not active");
        require(policies[_newPolicyId].supersedesPolicyId == oldPolicyId, "Not direct successor");
        require(policies[_newPolicyId].dataSubject == policies[oldPolicyId].dataSubject, "Different data subject");
        resource.policyId = _newPolicyId;
        emit ResourcePolicyRebound(_resourceId, oldPolicyId, _newPolicyId);
    }

    /**
     * @dev Get resource details.
     */
    function getResource(uint256 _resourceId)
        external
        view
        returns (uint256 policyId, address provider, bool isActive)
    {
        Resource memory r = resources[_resourceId];
        return (r.policyId, r.provider, r.isActive);
    }

    /**
     * @dev TPS-ZKPI access request with requester/resource/session binding (Stage 5).
     *
     * Extends requestAccess with:
     *  - resourceId binding  (links proof to the specific resource)
     *  - nonce replay prevention (prevents proof reuse across sessions)
     *
     * The proof must have been generated by the TPS against the committed policy.
     * It is bound to (requester, resource, nonce) inside the proof statement:
     * pubSignals[3] = Poseidon(requesterId || resourceId || nonce) is enforced
     * in-circuit AND recomputed here from the transaction parameters, so a
     * captured proof cannot be replayed under a different requester, resource
     * or session, and a recorded request cannot cite a statement proved for a
     * different context.
     *
     * @param _idReq Requester pseudonym; must match the one the proof was
     *        generated for, otherwise the context check reverts.
     *
     * @param _policyId    The policy governing access.
     * @param _resourceId  The protected resource being accessed.
     * @param _nonce       Fresh per-session nonce; must not have been used before.
     * @param _pA pB pC    Groth16 proof components.
     * @param _pubSignals  Public signals; pubSignals[1] must equal policy commitment.
     */
    function requestAccessBound(
        uint256 _policyId,
        uint256 _resourceId,
        uint256 _nonce,
        uint256 _idReq,
        uint256 _requestEpoch,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) external notPaused returns (uint256 requestId) {
        requestId = _requestAccessBound(
            _policyId, _resourceId, _nonce, _idReq, _requestEpoch, _pA, _pB, _pC, _pubSignals
        );
    }

    /**
     * @dev requestAccessBound with gas padding so observable gas usage is
     * normalized to a policy-independent target. Defense-in-depth on top of the
     * commitment-only public interface: the verification path's gas already
     * carries only a tiny residual from Groth16 proof-byte zero-byte variation,
     * and _padGasToTarget compensates calldata zero bytes dynamically, so the
     * total settles at the (randomized) target regardless of policy content.
     */
    function requestAccessBoundWithGasPad(
        uint256 _policyId,
        uint256 _resourceId,
        uint256 _nonce,
        uint256 _idReq,
        uint256 _requestEpoch,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals,
        uint256 targetGas
    ) external notPaused returns (uint256 requestId) {
        uint256 startGas = gasleft();
        requestId = _requestAccessBound(
            _policyId, _resourceId, _nonce, _idReq, _requestEpoch, _pA, _pB, _pC, _pubSignals
        );
        _padGasToTarget(startGas, targetGas);
    }

    /**
     * @dev Shared nonce/resource-bound verification logic for the two
     * requestAccessBound entry points (padded and unpadded).
     */
    function _requestAccessBound(
        uint256 _policyId,
        uint256 _resourceId,
        uint256 _nonce,
        uint256 _idReq,
        uint256 _requestEpoch,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) internal returns (uint256 requestId) {
        require(policies[_policyId].isActive, "Policy not active");
        require(resources[_resourceId].isActive, "Resource not active");
        require(
            resources[_resourceId].policyId == _policyId,
            "Resource/policy mismatch"
        );
        require(_idReq < SNARK_SCALAR_FIELD && _nonce < SNARK_SCALAR_FIELD, "Context value outside SNARK field");
        require(_requestEpoch == block.timestamp / EPOCH_SECONDS, "Stale request epoch");
        require(_pubSignals[4] == _requestEpoch, "Request epoch mismatch");
        uint256 timeLimitEpochs = policyTimeLimitEpochs[_policyId];
        RequesterTimeLimit storage timeLimit = requesterTimeLimits[_policyId][_idReq];
        if (timeLimitEpochs != 0 && timeLimit.expiryEpoch != 0) {
            // The TS interval is [startEpoch, expiryEpoch): at the expiry
            // epoch and later, no further authorization decision is allowed.
            require(_requestEpoch < timeLimit.expiryEpoch, "Time limit expired");
        }
        // Authorization-context binding: the proof's public signal must be the
        // digest of THIS request's context. The circuit constrains
        // contextHash === Poseidon(id_req || id_res || nonce), so recomputing
        // the digest here ties the transaction parameters to the verified
        // statement: a proof issued for one (requester, resource, session)
        // triple cannot be submitted under another, and a record cannot carry
        // parameters inconsistent with the statement it cites.
        require(
            _pubSignals[3] ==
                contextHasher.poseidon([_idReq, _resourceId, _nonce]),
            "Context binding mismatch"
        );

        // Nonce replay prevention: each (policy, resource, nonce, requester)
        // tuple is one-shot. The requester is part of the key because the proof
        // itself is bound to it: reusing a nonce under a different requester
        // would need a proof carrying that requester's contextHash.
        bytes32 nonceKey = keccak256(
            abi.encodePacked(_policyId, _resourceId, _nonce, _idReq)
        );
        require(!usedNonces[nonceKey], "Nonce already used");
        usedNonces[nonceKey] = true;

        // Delegate to existing internal verification logic
        requestId = _requestAccess(
            _policyId, _idReq, _resourceId, _pA, _pB, _pC, _pubSignals
        );

        // Start the policy-wide TS window only after a valid, authorized
        // request. Failed proofs and denials cannot consume the requester’s
        // time-limited use period.
        if (timeLimitEpochs != 0 && timeLimit.expiryEpoch == 0 && accessRequests[requestId].isGranted) {
            require(_requestEpoch <= type(uint256).max - timeLimitEpochs, "Time limit overflow");
            timeLimit.startEpoch = _requestEpoch;
            timeLimit.expiryEpoch = _requestEpoch + timeLimitEpochs;
            emit RequesterTimeLimitStarted(_policyId, _idReq, timeLimit.startEpoch, timeLimit.expiryEpoch);
        }
    }

    /** Return the public TS duration configured for a policy (zero = no TS). */
    function getPolicyTimeLimit(uint256 _policyId) external view returns (uint256) {
        return policyTimeLimitEpochs[_policyId];
    }

    /** Return the TS window for one requester under one policy. */
    function getRequesterTimeLimit(uint256 _policyId, uint256 _requesterId)
        external
        view
        returns (uint256 startEpoch, uint256 expiryEpoch)
    {
        RequesterTimeLimit memory limit = requesterTimeLimits[_policyId][_requesterId];
        return (limit.startEpoch, limit.expiryEpoch);
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
        uint[5] calldata _pubSignals
    ) external view returns (bool) {
        return verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
    }
}
