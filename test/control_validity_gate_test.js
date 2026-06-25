'use strict';

/**
 * Locks the control-validity gate in evaluateMultiseed/aggregateBuckets.
 *
 * A multi-seed PASS is only trustworthy if the attack pipeline demonstrably
 * separates a KNOWN-distinguishable positive control. If a control exists but is
 * NOT separable (its AUC is not high / not significant — e.g. PI's
 * controlled_difference, whose execution features are near-identical), the run is
 * INCONCLUSIVE (overallPassed === null), not PASS: we cannot tell "privacy holds"
 * from "the attack is powerless". A separable control (PCH/SPP, AUC≈0.99) leaves
 * the verdict at its base value — the gate is a no-op for them.
 */

const { expect } = require('chai');
const { evaluateMultiseed } = require('../experiments/core/multiseed_criterion');

const SEEDS = 8;

// A gating task that PASSes: chance AUC, never significant. Enough test samples
// to avoid the underpowered (non-gating) rule (minTestSamples default 20).
function realTaskPass() {
  return { key: 'real_attr', auc: 0.50, advantage: 0.0, permPValue: 0.70, n: 100 };
}

// A separable positive control: high AUC, always significant.
function controlSeparable() {
  return { key: 'CONTROL: gas>median', auc: 0.99, advantage: 0.49, permPValue: 0.001, n: 100 };
}

// A broken positive control: chance AUC, never significant (the PI situation).
function controlBroken() {
  return { key: 'CONTROL: gas>median', auc: 0.48, advantage: 0.02, permPValue: 0.60, n: 100 };
}

const OPTS = {
  seeds: SEEDS,
  positiveControlKeys: ['CONTROL: gas>median']
};

describe('control-validity gate', () => {
  it('flips a would-be PASS to INCONCLUSIVE when the control is not separable', async () => {
    const verdict = await evaluateMultiseed(
      () => [realTaskPass(), controlBroken()],
      OPTS
    );
    expect(verdict.controlsPresent).to.equal(true);
    expect(verdict.controlsValid).to.equal(false);
    expect(verdict.overallPassed).to.equal(null); // INCONCLUSIVE
    const control = verdict.tasks.find(t => t.positiveControl);
    expect(control.controlSeparable).to.equal(false);
    expect(control.nonGating).to.equal(true); // control still excluded from gating
  });

  it('leaves a PASS untouched when the control IS separable', async () => {
    const verdict = await evaluateMultiseed(
      () => [realTaskPass(), controlSeparable()],
      OPTS
    );
    expect(verdict.controlsPresent).to.equal(true);
    expect(verdict.controlsValid).to.equal(true);
    expect(verdict.overallPassed).to.equal(true);
    const control = verdict.tasks.find(t => t.positiveControl);
    expect(control.controlSeparable).to.equal(true);
  });

  it('reports controlsValid === null and gates normally when no control is present', async () => {
    const verdict = await evaluateMultiseed(
      () => [realTaskPass()],
      { seeds: SEEDS } // no positiveControlKeys
    );
    expect(verdict.controlsPresent).to.equal(false);
    expect(verdict.controlsValid).to.equal(null);
    expect(verdict.overallPassed).to.equal(true);
  });

  it('marks a configured but missing positive control as invalid', async () => {
    const verdict = await evaluateMultiseed(
      () => [realTaskPass()],
      OPTS
    );
    expect(verdict.controlsPresent).to.equal(true);
    expect(verdict.controlsValid).to.equal(false);
    expect(verdict.missingPositiveControlKeys).to.deep.equal(['CONTROL: gas>median']);
    expect(verdict.overallPassed).to.equal(null);
  });

  it('reports configured diagnostic tasks without letting them gate', async () => {
    const diagnosticLeak = {
      key: 'controlled_difference',
      auc: 0.90,
      advantage: 0.40,
      permPValue: 0.001,
      n: 100
    };
    const verdict = await evaluateMultiseed(
      () => [realTaskPass(), diagnosticLeak, controlSeparable()],
      {
        ...OPTS,
        nonGatingKeys: ['controlled_difference']
      }
    );
    const diagnostic = verdict.tasks.find(t => t.key === 'controlled_difference');
    expect(diagnostic.passed).to.equal(false);
    expect(diagnostic.diagnostic).to.equal(true);
    expect(diagnostic.positiveControl).to.equal(false);
    expect(diagnostic.nonGating).to.equal(true);
    expect(verdict.overallPassed).to.equal(true);
  });

  it('a real leaking task still FAILs even with a separable control', async () => {
    const leaking = () => ({ key: 'real_attr', auc: 0.80, advantage: 0.30, permPValue: 0.001, n: 100 });
    const verdict = await evaluateMultiseed(
      () => [leaking(), controlSeparable()],
      OPTS
    );
    expect(verdict.controlsValid).to.equal(true);
    expect(verdict.overallPassed).to.equal(false); // genuine leak, not masked
  });
});
