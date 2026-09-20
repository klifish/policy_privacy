'use strict';

/*
 * Child process of scripts/circuit_cost_sweep.js: compile one representative
 * DUO V3 policy at the requested DEPTH, generate `count` proofs against the
 * build in PROTOCOL_CIRCUITS_DIR, and print the timings as one JSON line.
 *
 * Runs in its own process because tps/proofGenerator.js reads
 * PROTOCOL_CIRCUITS_DIR and PROTOCOL_CIRCUIT_DEPTH at module load.
 *
 *   PROTOCOL_CIRCUITS_DIR=build/cost_sweep/depth_128 PROTOCOL_CIRCUIT_DEPTH=128 \
 *     node scripts/circuit_cost_sweep_prove.js --count 5 --logic "(DS OR RS) AND HMB AND US AND TS"
 */

const path = require('path');

const depth = Number(process.env.PROTOCOL_CIRCUIT_DEPTH || 64);
const args = process.argv.slice(2);
const count = Number((args.find((a) => a.startsWith('--count=')) || '--count=5').split('=')[1]);
const logicArg = args.find((a) => a.startsWith('--logic='));
const logic = logicArg ? logicArg.slice('--logic='.length) : '(DS OR RS) AND HMB AND US AND TS';

const H = require(path.resolve(__dirname, '../test/duo/helpers/duo_v3_harness'));
const { generatePolicyArtifacts } = require(path.resolve(__dirname, '../compiler/policy_generator'));
const { generateProof } = require(path.resolve(__dirname, '../tps/proofGenerator'));

async function main() {
  const fixtures = await H.buildTermFixtures();
  const terms = H.termsIn(logic);
  // Same steps as H.compilePolicy, but at the sweep DEPTH.
  const artifacts = await generatePolicyArtifacts(
    { logic, predicates: H.predicatesFor(terms, fixtures) },
    { depth, randomizer: H.randomizerFor(logic) }
  );
  const material = await H.materialFromArtifacts(artifacts);
  const ctx = { logic, terms, artifacts, material };
  const profile = H.resolveProfile({ flip: ['RS'] });
  const timings = [];
  for (let i = 0; i < count; i++) {
    const { evidence, idReq } = await H.evidenceFor(ctx, profile, fixtures, {
      resourceId: H.WITNESS_PUBLIC.resourceId, requestEpoch: H.WITNESS_PUBLIC.requestEpoch
    });
    const result = await generateProof(material, evidence, {
      policyCommitment: artifacts.policyCommitment,
      idReq, idRes: H.WITNESS_PUBLIC.resourceId, nonce: BigInt(1000 + i), requestEpoch: H.WITNESS_PUBLIC.requestEpoch
    });
    if (!result.timings.verified) throw new Error(`proof ${i} did not verify at DEPTH=${depth}`);
    if (BigInt(result.pubSignals[0]) !== 1n) throw new Error(`proof ${i} did not authorize at DEPTH=${depth}`);
    timings.push(result.timings);
  }
  process.stdout.write(JSON.stringify({
    depth, logic, tokens: artifacts.tokens.length, numOperations: artifacts.numOperations,
    predicateTypes: material.predicateTypes, timings
  }) + '\n');
}

// snarkjs keeps worker threads alive after proving; exit explicitly so the
// parent's spawnSync returns once the JSON line has been flushed.
main().then(
  () => process.stdout.write('', () => process.exit(0)),
  (error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  }
);
