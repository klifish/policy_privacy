/**
 * On-chain Poseidon(3) hasher.
 *
 * The ACM recomputes the authorization-context digest
 *
 *     ctx = Poseidon(id_req || id_res || nonce)
 *
 * from the transaction parameters and requires it to equal the proof's fourth
 * public signal. For that check to mean anything, the on-chain hash must be the
 * same function the circuit computes, so the contract is deployed from
 * circomlib's own generated EVM bytecode rather than a reimplementation:
 * identical round constants, MDS matrix and field.
 *
 * There is no Solidity source for this contract — circomlibjs emits bytecode
 * directly — so it is deployed through a plain ContractFactory built from the
 * generated ABI and code.
 */

const { poseidonContract } = require('circomlibjs');

const POSEIDON_ARITY = 3;

/**
 * Deploy the Poseidon(3) hasher and return the deployed contract.
 *
 * @param {object} ethers  An ethers v6 instance (e.g. hre.ethers).
 * @param {object} [signer] Deployer signer; defaults to the first signer.
 * @returns {Promise<object>} The deployed contract (has `poseidon(uint256[3])`).
 */
async function deployPoseidon3(ethers, signer) {
  const deployer = signer || (await ethers.getSigners())[0];
  const factory = new ethers.ContractFactory(
    poseidonContract.generateABI(POSEIDON_ARITY),
    poseidonContract.createCode(POSEIDON_ARITY),
    deployer
  );
  const hasher = await factory.deploy();
  await hasher.waitForDeployment();
  return hasher;
}

module.exports = { deployPoseidon3, POSEIDON_ARITY };
