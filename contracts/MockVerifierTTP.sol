// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @dev Mock verifier for PolicyPrivacyMainTTP circuit (42 public signals).
 *      Used in Hardhat tests for Variant 3 TTP-assisted ZK proof path.
 *      Public signal layout matches policy_privacy_main_ttp_instance.circom:
 *        [0]  isAuthorized
 *        [1]  nullifier
 *        [2]  pid
 *        [3]  policyCommitment
 *        [4]  paramsCommitment
 *        [5..41] merkle roots, keys, ranges, ontology, scopeHash, timestamp
 */
contract MockVerifierTTP {
    bool public result = true;

    function setResult(bool _result) external {
        result = _result;
    }

    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[42] memory
    ) external view returns (bool) {
        return result;
    }
}
