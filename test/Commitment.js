const { expect } = require('chai');

describe('Commitment', function () {
  let Commitment;
  let MockVerifier;
  let verifier;
  let commitment;

  beforeEach(async function () {
    Commitment = await ethers.getContractFactory('Commitment');
    MockVerifier = await ethers.getContractFactory('MockVerifier');
    verifier = await MockVerifier.deploy();
    commitment = await Commitment.deploy(verifier, 42);
  });

  it('returns verifier result', async function () {
    const proof = Array(24).fill(0);

    await verifier.setResult(true);
    expect(await commitment.verify(proof)).to.equal(true);

    await verifier.setResult(false);
    expect(await commitment.verify(proof)).to.equal(false);
  });
});

