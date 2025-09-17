// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IVerifier {
  function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[15] calldata _pubSignals) external view returns (bool);
}

contract MockVerifier is IVerifier {
  bool public result = true;

  function setResult(bool _result) external {
    result = _result;
  }

  function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[15] calldata) external view override returns (bool) {
    return result;
  }
}

