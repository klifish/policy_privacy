const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoseidon3 } = require('../lib/poseidon_contract');
const { calculateContextHash, calculateParamsCommitment } = require('../lib/prover');

describe('PolicyPrivacy V2 restricted access-time consent', function () {
  const proof = [[0, 0], [[0, 0], [0, 0]], [0, 0]];
  let provider;
  let other;
  let contract;
  let paramsCommitment;

  async function epoch() {
    const block = await ethers.provider.getBlock('latest');
    return BigInt(Math.floor(Number(block.timestamp) / 3600));
  }

  async function commitRoot() {
    const tx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](111n, paramsCommitment, '');
    const receipt = await tx.wait();
    return receipt.logs.map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    }).find((event) => event?.name === 'PolicyCommitted').args.policyId;
  }

  async function submit(policyId, resourceId, nonce, requesterId, commitment = 111n) {
    const requestEpoch = await epoch();
    const ctx = await calculateContextHash(requesterId, resourceId, nonce);
    const signals = [1n, commitment, paramsCommitment, BigInt(ctx), requestEpoch];
    const tx = await contract.connect(provider).requestAccessBound(
      policyId, resourceId, nonce, requesterId, requestEpoch,
      proof[0], proof[1], proof[2], signals
    );
    const receipt = await tx.wait();
    return receipt.logs.map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    }).find((event) => event?.name === 'AccessRequested').args.requestId;
  }

  beforeEach(async function () {
    [provider, other] = await ethers.getSigners();
    paramsCommitment = BigInt(await calculateParamsCommitment({
      predicateTypes: [4, 4, 4, 4, 4],
      predicateSchemaTags: [0, 0, 0, 0, 0],
      policyValidFromEpoch: 0,
      policyValidUntilEpoch: 4294967295
    }));
    const verifier = await (await ethers.getContractFactory('MockVerifier')).deploy();
    const hasher = await deployPoseidon3(ethers);
    contract = await (await ethers.getContractFactory('PolicyPrivacy')).deploy(verifier.target, hasher.target);
  });

  it('rejects stale epochs and accepts a matching hour-bound proof', async function () {
    const policyId = await commitRoot();
    const resourceId = await contract.connect(provider).registerResource.staticCall(policyId);
    await contract.connect(provider).registerResource(policyId);
    const currentEpoch = await epoch();
    const ctx = await calculateContextHash(7n, resourceId, 9n);
    await expect(contract.connect(provider).requestAccessBound(
      policyId, resourceId, 9n, 7n, currentEpoch - 1n,
      proof[0], proof[1], proof[2], [1n, 111n, paramsCommitment, BigInt(ctx), currentEpoch - 1n]
    )).to.be.revertedWith('Stale request epoch');

    const requestId = await submit(policyId, resourceId, 10n, 7n);
    expect(await contract.isAuthorizationCurrent(requestId)).to.equal(true);
  });

  it('rebind invalidates historical authorization while retaining its record', async function () {
    const oldPolicy = await commitRoot();
    const resourceId = await contract.connect(provider).registerResource.staticCall(oldPolicy);
    await contract.connect(provider).registerResource(oldPolicy);
    const oldRequest = await submit(oldPolicy, resourceId, 21n, 8n);
    expect(await contract.isAuthorizationCurrent(oldRequest)).to.equal(true);

    await contract.connect(provider).commitPolicyVersion(222n, paramsCommitment, '', oldPolicy);
    const newPolicy = 2n;
    await contract.connect(provider).rebindResourcePolicy(resourceId, newPolicy);
    expect(await contract.isAccessGranted(oldRequest)).to.equal(true);
    expect(await contract.isAuthorizationCurrent(oldRequest)).to.equal(false);

    const newRequest = await submit(newPolicy, resourceId, 22n, 8n, 222n);
    expect(await contract.isAuthorizationCurrent(newRequest)).to.equal(true);
  });

  it('requires a direct successor and the resource provider for rebind', async function () {
    const oldPolicy = await commitRoot();
    const resourceId = await contract.connect(provider).registerResource.staticCall(oldPolicy);
    await contract.connect(provider).registerResource(oldPolicy);
    await contract.connect(provider).commitPolicyVersion(222n, paramsCommitment, '', oldPolicy);

    await expect(contract.connect(other).rebindResourcePolicy(resourceId, 2n)).to.be.revertedWith('Not resource provider');
    await expect(contract.connect(provider).rebindResourcePolicy(resourceId, oldPolicy)).to.be.revertedWith('Not direct successor');
  });
});
