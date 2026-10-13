'use strict';

// After a stale-epoch revert the TPS re-proves for the hour of the block that
// mined the failed tx. On the 2026-10-13 local rehearsal the cached
// getBlock('latest') still reported the previous hour, so the hour must come
// from the failed tx itself (tps/server.js failedSubmissionEpoch).

const { expect } = require('chai');
const { failedSubmissionEpoch, isStaleEpochFailure } = require('../../tps/server');

const TX_HASH = '0x218dfea09d5995e37a33d90cac6532dc1c6f8c891964b043bd768c94baaf11a6';
const HOUR = 497746;

// Shape of the ethers error a Hardhat automine node produced for the revert.
const automineError = {
  code: 'UNKNOWN_ERROR',
  message: 'could not coalesce error (error={ "code": -32603, "data": { "message": "Error: VM Exception while ' +
    "processing transaction: reverted with reason string 'Stale request epoch'\", \"txHash\": \"" + TX_HASH +
    '" } }, code=UNKNOWN_ERROR, version=6.13.4)'
};

function fakeProvider() {
  const calls = [];
  return {
    calls,
    async getTransactionReceipt(hash) {
      calls.push(['receipt', hash]);
      return hash === TX_HASH ? { blockNumber: 1547 } : null;
    },
    async send(method, params) {
      calls.push([method, ...params]);
      if (method === 'eth_getBlockByNumber' && params[0] === '0x60b') {
        return { timestamp: '0x' + (HOUR * 3600).toString(16) };
      }
      return null;
    }
  };
}

describe('TPS stale-epoch recovery', function () {
  it('recognizes the automine revert as a stale epoch', function () {
    expect(isStaleEpochFailure(automineError)).to.equal(true);
  });

  it('takes the hour from the block that mined the failed tx (automine error)', async function () {
    const provider = fakeProvider();
    expect(await failedSubmissionEpoch(provider, automineError)).to.equal(HOUR);
    expect(provider.calls[0]).to.deep.equal(['receipt', TX_HASH]);
  });

  it('takes the hour from the receipt of a mined, reverted tx (public chain)', async function () {
    const provider = fakeProvider();
    const error = { code: 'CALL_EXCEPTION', receipt: { status: 0, blockNumber: 1547 } };
    expect(await failedSubmissionEpoch(provider, error)).to.equal(HOUR);
  });

  it('returns null when the error names no transaction', async function () {
    expect(await failedSubmissionEpoch(fakeProvider(), new Error('Stale request epoch'))).to.equal(null);
  });
});
