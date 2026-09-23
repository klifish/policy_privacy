'use strict';

/*
 * Marginal on-chain gas of the authorization-context binding.
 *
 * The binding adds four things to an access transaction: the ACM recomputes
 * Poseidon(id_req || id_res || nonce) and checks both context values lie in the
 * SNARK field; the nonce key hashes one more word; the verifier checks one more
 * public input (the digest); and the calldata carries two more words (id_req
 * and the digest). For auditability the ACM also records requesterId,
 * resourceId and contextHash with each request.
 *
 * This script derives counterfactual contracts from the real sources, each
 * substitution asserted to match exactly once so that a variant differs from
 * the evaluated contract only where stated:
 *
 *   PolicyPrivacyNoBind          no recomputation, no field check, 3-word nonce key
 *   PolicyPrivacyNoBindNoRecord  additionally drops the three recorded context fields
 *   PolicyPrivacyMainVerifier4   the evaluated verifier without the digest input
 *
 * and a measurement-only GasProbe. It then compiles them in an isolated
 * build directory and runs scripts/context_binding_gas_measure.js, which
 * submits the same real Groth16 proofs to every ACM variant.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build', 'context_binding_gas');
const SOURCES = path.join(BUILD, 'contracts');

function replaceOnce(source, from, to, label) {
  const matches = typeof from === 'string'
    ? source.split(from).length - 1
    : (source.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g')) || []).length;
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}`);
  return source.replace(from, to);
}

function deriveNoBind(acm) {
  let s = replaceOnce(acm, 'contract PolicyPrivacy {', 'contract PolicyPrivacyNoBind {', 'contract name');
  s = replaceOnce(s,
    /\n[ \t]*require\(_idReq < SNARK_SCALAR_FIELD && _nonce < SNARK_SCALAR_FIELD, "Context value outside SNARK field"\);/,
    '', 'field check');
  s = replaceOnce(s,
    /\n[ \t]*\/\/ Authorization-context binding:[\s\S]*?"Context binding mismatch"\s*\n[ \t]*\);/,
    '', 'context recomputation');
  s = replaceOnce(s,
    'abi.encodePacked(_policyId, _resourceId, _nonce, _idReq)',
    'abi.encodePacked(_policyId, _resourceId, _nonce)', 'nonce key');
  return s;
}

function deriveNoBindNoRecord(noBind) {
  let s = replaceOnce(noBind, 'contract PolicyPrivacyNoBind {', 'contract PolicyPrivacyNoBindNoRecord {', 'contract name');
  for (const field of ['requesterId', 'resourceId', 'contextHash']) {
    s = replaceOnce(s, new RegExp(`\\n[ \\t]*uint256 ${field};[^\\n]*`), '', `struct field ${field}`);
  }
  s = replaceOnce(s, /\n[ \t]*requesterId: _idReq,/, '', 'record requesterId');
  s = replaceOnce(s, /\n[ \t]*resourceId: _resourceId,/, '', 'record resourceId');
  s = replaceOnce(s, /\n[ \t]*contextHash: _pubSignals\[3\],/, '', 'record contextHash');
  // The only reader of the dropped fields; a view, never on the measured path.
  s = replaceOnce(s,
    /\n[ \t]*\/\*\* @dev Current authorization predicate[^\n]*\n[ \t]*function isAuthorizationCurrent[\s\S]*?\n    }\n/,
    '\n', 'isAuthorizationCurrent');
  return s;
}

function deriveVerifier4(verifier) {
  let s = replaceOnce(verifier, 'contract PolicyPrivacyMainVerifier {', 'contract PolicyPrivacyMainVerifier4 {', 'contract name');
  s = replaceOnce(s, 'uint[5] calldata _pubSignals', 'uint[4] calldata _pubSignals', 'signal count');
  // pubSignals = [isAuthorized, h, pp, contextHash, requestEpoch] <-> IC1..IC5.
  s = replaceOnce(s, /\n[ \t]*g1_mulAccC\(_pVk, IC4x, IC4y, calldataload\(add\(pubSignals, 96\)\)\)/, '', 'digest term');
  s = replaceOnce(s,
    'g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))',
    'g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 96)))', 'epoch term offset');
  s = replaceOnce(s, /\n[ \t]*checkField\(calldataload\(add\(_pubSignals, 128\)\)\)/, '', 'field check of last signal');
  return s;
}

const GAS_PROBE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IProbeVerifier5 {
    function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[5] calldata) external view returns (bool);
}

interface IProbeVerifier4 {
    function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[4] calldata) external view returns (bool);
}

interface IProbePoseidon3 {
    function poseidon(uint256[3] calldata input) external pure returns (uint256);
}

/**
 * Measurement only. Each function reports the gas one call costs its caller,
 * including the cold account access, as the ACM pays it inside an access
 * transaction. Run through eth_call; nothing here is part of the protocol.
 */
contract GasProbe {
    mapping(uint256 => uint256) private slots;

    function verify5(address v, uint[2] calldata a, uint[2][2] calldata b, uint[2] calldata c, uint[5] calldata s)
        external view returns (uint256 used, bool ok)
    {
        uint256 start = gasleft();
        ok = IProbeVerifier5(v).verifyProof(a, b, c, s);
        used = start - gasleft();
    }

    function verify4(address v, uint[2] calldata a, uint[2][2] calldata b, uint[2] calldata c, uint[4] calldata s)
        external view returns (uint256 used, bool ok)
    {
        uint256 start = gasleft();
        ok = IProbeVerifier4(v).verifyProof(a, b, c, s);
        used = start - gasleft();
    }

    function poseidon3(address h, uint256[3] calldata input) external view returns (uint256 used, uint256 out) {
        uint256 start = gasleft();
        out = IProbePoseidon3(h).poseidon(input);
        used = start - gasleft();
    }

    /** Three writes to fresh slots: the shape of the recorded context fields. */
    function store3(uint256 key, uint256 a, uint256 b, uint256 c) external returns (uint256 used) {
        uint256 start = gasleft();
        slots[key] = a;
        slots[key + 1] = b;
        slots[key + 2] = c;
        used = start - gasleft();
    }

    /** One precompile call, for comparing network gas schedules. */
    function precompile(address target, bytes calldata input) external view returns (uint256 used, bool ok) {
        bytes memory data = input;
        uint256 start = gasleft();
        (ok, ) = target.staticcall(data);
        used = start - gasleft();
    }

    function sloadCold(uint256 key) external view returns (uint256 used, uint256 value) {
        uint256 start = gasleft();
        value = slots[key];
        used = start - gasleft();
    }
}
`;

function main() {
  fs.rmSync(SOURCES, { recursive: true, force: true });
  fs.mkdirSync(SOURCES, { recursive: true });
  const acm = fs.readFileSync(path.join(ROOT, 'contracts', 'PolicyPrivacy.sol'), 'utf8');
  const verifier = fs.readFileSync(path.join(ROOT, 'contracts', 'PolicyPrivacyMainVerifier.sol'), 'utf8');
  const noBind = deriveNoBind(acm);
  const files = {
    'PolicyPrivacy.sol': acm,
    'PolicyPrivacyMainVerifier.sol': verifier,
    'PolicyPrivacyNoBind.sol': noBind,
    'PolicyPrivacyNoBindNoRecord.sol': deriveNoBindNoRecord(noBind),
    'PolicyPrivacyMainVerifier4.sol': deriveVerifier4(verifier),
    'GasProbe.sol': GAS_PROBE
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(SOURCES, name), content);
  console.log(`[context-binding-gas] derived ${Object.keys(files).length} sources in ${path.relative(ROOT, SOURCES)}`);

  const run = spawnSync('npx', ['hardhat', 'run', path.join('scripts', 'context_binding_gas_measure.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      HARDHAT_SOURCES: SOURCES,
      HARDHAT_ARTIFACTS: path.join(BUILD, 'artifacts'),
      HARDHAT_CACHE: path.join(BUILD, 'cache')
    }
  });
  process.exit(run.status === null ? 1 : run.status);
}

main();
