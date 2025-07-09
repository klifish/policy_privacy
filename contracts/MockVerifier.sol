// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IVerifier {
  function verifyProof(uint256[24] calldata _proof, uint256[1] calldata _pubSignals) external view returns (bool);
}

contract MockVerifier is IVerifier {
  bool public result = true;

  function setResult(bool _result) external {
    result = _result;
  }

  function verifyProof(uint256[24] calldata, uint256[1] calldata) external view override returns (bool) {
    return result;
  }
}

