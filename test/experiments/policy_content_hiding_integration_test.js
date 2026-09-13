/**
 * Minimal integration test for Policy Content Hiding experiment
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

describe('Policy Content Hiding Integration (Minimal)', function () {
  it('should run minimal experiment end-to-end', async function () {
    this.timeout(600000); // 10 minutes for minimal test

    // Check if circuits are built before running expensive workflow
    const circuitWasmPath = path.join(
      __dirname,
      '../../build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm'
    );
    const zkeyPath = path.join(
      __dirname,
      '../../build/circuits/policy_privacy_main_final.zkey'
    );

    if (!fs.existsSync(circuitWasmPath) || !fs.existsSync(zkeyPath)) {
      console.log('\n⚠️  Skipping integration test: circuits not built');
      console.log('   Run "npm run build:circuit:full" to build circuits first');
      this.skip();
      return;
    }

    const { runExperiment } = require('../../experiments/analysis/crosscheck/pch/run_experiment');

    // Run with minimal configuration to keep test lightweight
    const report = await runExperiment({
      numDuoTerms: 2,            // Minimal for testing
      numIcd10Chapters: 2,       // Minimal for testing
      executionsPerPolicy: 2,    // Minimal for testing
      testRatio: 0.3,
      outputDir: path.join(
        __dirname,
        '../../experiments/.work/tests/pch'
      )
    });

    // Verify report structure
    expect(report).to.have.property('experiment', 'Policy Content Hiding Evaluation');
    expect(report).to.have.property('diagnostics');
    expect(report.diagnostics).to.have.property('evaluation');
    expect(report.diagnostics).to.have.property('privacyCheck');
    expect(report).to.have.property('multiseedVerdict');
    expect(report).to.have.property('overallPassed');
    expect(report).to.have.property('conclusion');

    // Verify evaluation results (single-split diagnostic)
    expect(report.diagnostics.evaluation.results).to.be.an('array');
    expect(report.diagnostics.evaluation.results.length).to.be.greaterThan(0);

    // Verify privacy check (single-split diagnostic)
    expect(report.diagnostics.privacyCheck).to.have.property('overallPassed');
    expect(report.diagnostics.privacyCheck.results).to.be.an('array');

    // Authoritative verdict drives the top-level result
    expect(report.overallPassed).to.equal(report.multiseedVerdict.overallPassed);

    console.log('\nExperiment Summary:');
    console.log(`Total executions: ${report.config.totalExecutions}`);
    console.log(`Privacy check (diagnostic): ${report.diagnostics.privacyCheck.overallPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Verdict (multi-seed): ${report.overallPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Conclusion: ${report.conclusion}`);
  });
});
