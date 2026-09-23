'use strict';

/*
 * Measurement half of scripts/context_binding_gas.js; runs under `hardhat run`
 * with HARDHAT_SOURCES pointing at the derived counterfactual contracts.
 *
 * End to end (local Hardhat EVM): every real Groth16 proof is submitted,
 * unpadded, to three ACMs that share one verifier and one Poseidon(3) hasher.
 * Policies and resources are registered in the same order on each, so the
 * ids, the proof and the calldata are identical and the proof verifies on all
 * three; the receipt differences are pure execution gas:
 *
 *   evaluated - noBind          recomputation, field check, nonce-key word
 *   noBind    - noBindNoRecord  the three recorded context fields
 *
 * Components (local and Polygon Amoy): GasProbe measures the digest's cost as
 * a verifier input (5- vs 4-input verifier; Groth16 verification gas does not
 * depend on whether the proof is valid), the Poseidon(3) call, and three fresh
 * storage writes. On Amoy the probe, verifiers and hasher are injected with
 * eth_call state overrides: nothing is deployed and no transaction is sent.
 * The two extra calldata words are priced per byte (EIP-2028).
 *
 * Amoy's gas schedule differs from the local one for the BN254 precompiles and
 * for cold storage access, so the Amoy figures are the local end-to-end values
 * shifted by the probe's Amoy-minus-local difference for the same operation
 * (the probe's own call overhead cancels). Amoy is probed at the median block
 * of the evaluated executions and at the latest block.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const hre = require('hardhat');

const { ethers } = hre;
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'experiments', 'results', 'cost');
const H = require(path.join(ROOT, 'test', 'duo', 'helpers', 'duo_v3_harness'));
const { generateProof } = require(path.join(ROOT, 'tps', 'proofGenerator'));
const { deployPoseidon3 } = require(path.join(ROOT, 'lib', 'poseidon_contract'));

// Same four fixed-circuit policies as scripts/policy_scalability_benchmark.js.
const SCENARIOS = [
  { id: 'simple', label: 'Simple', logic: 'DS' },
  { id: 'ontology_heavy', label: 'Ontology-heavy', logic: 'DS AND RS AND POA AND GS AND CC' },
  { id: 'profile_heavy', label: 'Profile-heavy', logic: 'GRU AND HMB AND NMDS AND GSO AND NPUNCU AND NPOA AND NPU AND NCU' },
  {
    id: 'max_mixed',
    label: 'Max-mixed',
    logic: 'DS AND RS AND POA AND GS AND CC AND US AND PS AND IS AND MOR AND TS AND GRU AND HMB AND NMDS AND GSO AND NPUNCU AND NPOA AND NPU AND NCU'
  }
];

const ACMS = [
  { id: 'evaluated', contract: 'PolicyPrivacy' },
  { id: 'noBind', contract: 'PolicyPrivacyNoBind' },
  { id: 'noBindNoRecord', contract: 'PolicyPrivacyNoBindNoRecord' }
];

const REPETITIONS = Number(process.env.CTX_GAS_REPETITIONS || 5);
const PROBE_AMOY = process.env.CTX_GAS_AMOY !== '0' && Boolean(process.env.AMOY_RPC_URL);

// Arbitrary addresses for the Amoy state overrides.
const AMOY_ADDR = {
  probe: '0x000000000000000000000000000000000000C7B0',
  verifier5: '0x000000000000000000000000000000000000C7B5',
  verifier4: '0x000000000000000000000000000000000000C7B4',
  hasher: '0x000000000000000000000000000000000000C7B3'
};

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function spread(values) {
  return { n: values.length, min: Math.min(...values), median: quantile(values, 0.5), max: Math.max(...values) };
}

/** EIP-2028 calldata gas of one ABI word: 4 per zero byte, 16 per non-zero byte. */
function wordCalldataGas(value) {
  const hex = BigInt(value).toString(16).padStart(64, '0');
  let gas = 0;
  for (let i = 0; i < 64; i += 2) gas += hex.slice(i, i + 2) === '00' ? 4 : 16;
  return gas;
}

/** Commit and register exactly as the DUO harness does, on any ACM variant. */
async function commitAndRegister(contract, provider, ctx) {
  const commitment = BigInt(ctx.artifacts.policyCommitment);
  const params = BigInt(ctx.material.paramsCommitment);
  const timeLimit = BigInt(ctx.material.timeLimitEpochs);
  const c = contract.connect(provider);
  let policyId;
  if (timeLimit !== 0n) {
    policyId = await c.commitPolicyWithTimeLimit.staticCall(commitment, params, 'ipfs://ctx-gas', timeLimit);
    await (await c.commitPolicyWithTimeLimit(commitment, params, 'ipfs://ctx-gas', timeLimit)).wait();
  } else {
    policyId = await c['commitPolicy(uint256,uint256,string)'].staticCall(commitment, params, 'ipfs://ctx-gas');
    await (await c['commitPolicy(uint256,uint256,string)'](commitment, params, 'ipfs://ctx-gas')).wait();
  }
  const resourceId = await c.registerResource.staticCall(policyId);
  await (await c.registerResource(policyId)).wait();
  return { policyId, resourceId };
}

// BN254 generator points (EIP-197) for well-formed precompile inputs.
const BN254_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const G2 = [
  11559732032986387107991004021392285783925812861821192530917403151452391805634n,
  10857046999023057135944570762232829481370756359578518086990519993285655852781n,
  4082367875863433681332203403145435568316851327593401208105741076214120093531n,
  8495653923123431417604973247489272438418190587263600148770280649306958101930n
];
const words = (values) => ethers.AbiCoder.defaultAbiCoder().encode(values.map(() => 'uint256'), values);
const pairingInput = (pairs) => words(Array.from({ length: pairs }, (_, i) => [1n, i % 2 ? BN254_P - 2n : 2n, ...G2]).flat());
const SCHEDULE_PROBES = [
  { id: 'identity', label: 'identity precompile, 128 B (call overhead)', target: 4, input: words([1n, 2n, 3n, 4n]) },
  { id: 'ecAdd', label: 'ecAdd', target: 6, input: words([1n, 2n, 1n, 2n]) },
  { id: 'ecMul', label: 'ecMul', target: 7, input: words([1n, 2n, 123456789n]) },
  { id: 'pairing2', label: 'ecPairing, 2 pairs', target: 8, input: pairingInput(2) },
  { id: 'pairing4', label: 'ecPairing, 4 pairs', target: 8, input: pairingInput(4) }
];

async function runScheduleProbes(call, probe) {
  const out = {};
  for (const item of SCHEDULE_PROBES) {
    const target = ethers.zeroPadValue(ethers.toBeHex(item.target), 20);
    const decoded = probe.interface.decodeFunctionResult('precompile',
      await call(probe.interface.encodeFunctionData('precompile', [target, item.input])));
    if (decoded[1] !== true) throw new Error(`precompile probe ${item.id} failed`);
    out[item.id] = Number(decoded[0]);
  }
  out.sloadCold = Number(probe.interface.decodeFunctionResult('sloadCold',
    await call(probe.interface.encodeFunctionData('sloadCold', [3n << 200n])))[0]);
  return out;
}

/** Median block of the evaluated Polygon Amoy access transactions. */
function evaluationBlock() {
  const file = path.join(ROOT, 'experiments', 'data', 'polygonAmoy', 'executed_dataset.json');
  if (!fs.existsSync(file)) return null;
  const blocks = JSON.parse(fs.readFileSync(file, 'utf8'))
    .map((row) => row.transactions?.access?.receipt?.blockNumber)
    .filter((block) => block !== undefined && block !== null)
    .map(Number);
  return blocks.length ? { median: Math.round(quantile(blocks, 0.5)), min: Math.min(...blocks), max: Math.max(...blocks), n: blocks.length } : null;
}

function probeCalls(probe, addr, proof, context) {
  const s = proof.pubSignals.map(BigInt);
  const s4 = [s[0], s[1], s[2], s[4]]; // drop the digest, keep the epoch
  return {
    verify5: probe.interface.encodeFunctionData('verify5', [addr.verifier5, proof.pA, proof.pB, proof.pC, s]),
    verify4: probe.interface.encodeFunctionData('verify4', [addr.verifier4, proof.pA, proof.pB, proof.pC, s4]),
    poseidon3: probe.interface.encodeFunctionData('poseidon3', [addr.hasher, context]),
    store3: probe.interface.encodeFunctionData('store3', [1n << 200n, context[0], context[1], s[3]])
  };
}

async function runProbes(call, probe, addr, proof, context) {
  const data = probeCalls(probe, addr, proof, context);
  const out = {};
  for (const [name, calldata] of Object.entries(data)) {
    const raw = await call(calldata);
    const decoded = probe.interface.decodeFunctionResult(name, raw);
    out[name] = Number(decoded[0]);
    if (name === 'verify5' && decoded[1] !== true) throw new Error('5-input verifier rejected a valid proof');
    if (name === 'poseidon3' && BigInt(decoded[1]) !== BigInt(proof.pubSignals[3])) {
      throw new Error('probe digest differs from the proof digest');
    }
  }
  return out;
}

function renderMarkdown(report) {
  const s = report.summary;
  const amoy = report.amoy;
  const cell = (v) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'));
  const lines = [
    '# Marginal gas of the authorization-context binding', '',
    `Generated: ${report.generatedAt}`, '',
    `Local: Hardhat ${report.local.hardhat} EVM (hardfork ${report.local.hardfork}), solc ${report.local.solc}, optimizer ${report.local.optimizer ? 'on' : 'off'}.`,
    amoy
      ? `Amoy: eth_call with state overrides at blocks ${amoy.byBlock.map((row) => `${row.block} (${row.label})`).join(' and ')}; ` +
        `nothing deployed, no transaction sent. Results ${amoy.stableAcrossBlocks ? 'identical' : 'DIFFER'} across these blocks; the table uses the first.`
      : 'Amoy: not probed.',
    `Proofs: ${report.proofs} real Groth16 proofs (${REPETITIONS} per policy), each submitted unpadded to all three ACM variants; every submission granted.`, '',
    '## End-to-end access gas (local, unpadded)', '',
    '| Policy | Evaluated ACM | No binding | No binding, no record |', '|---|---:|---:|---:|'
  ];
  for (const row of report.byScenario) {
    lines.push(`| ${row.label} | ${cell(row.evaluated.median)} | ${cell(row.noBind.median)} | ${cell(row.noBindNoRecord.median)} |`);
  }
  const constant = (stat) => stat.min === stat.max;
  lines.push('', 'Medians over the proofs of each policy. ' + (constant(s.acmBinding) && constant(s.record) && constant(s.verifierInput)
    ? `The paired differences below are identical for all ${s.acmBinding.n} proofs.`
    : `Paired differences vary across proofs: binding ${s.acmBinding.min}–${s.acmBinding.max}, record ${s.record.min}–${s.record.max}.`), '',
    '## Marginal cost of the binding', '',
    '| Component | Local | Amoy | Measured as |', '|---|---:|---:|---|',
    `| Context recomputation, field check, nonce-key word | ${cell(s.acmBinding.median)} | ${cell(amoy && amoy.acmBinding)} | evaluated − noBind |`,
    `| &nbsp;&nbsp;of which the Poseidon(3) call | ${cell(s.poseidonCall.median)} | ${cell(amoy && amoy.poseidon3)} | GasProbe |`,
    `| Digest as a verifier public input | ${cell(s.verifierInput.median)} | ${cell(amoy && amoy.verifierInput)} | 5- minus 4-input verifier |`,
    `| Calldata: id_req and digest words | ${cell(s.calldata.median)} | ${cell(s.calldata.median)} | EIP-2028, per byte |`,
    `| **Binding total** | **${cell(s.bindingTotal.median)}** | **${cell(amoy && amoy.bindingTotal)}** | |`,
    `| Recorded context fields (3 fresh slots) | ${cell(s.record.median)} | ${cell(amoy && amoy.record)} | noBind − noBindNoRecord |`,
    `| **Total with the audit record** | **${cell(s.total.median)}** | **${cell(amoy && amoy.total)}** | |`,
    '',
    `Local unpadded access gas of the evaluated ACM: median ${cell(s.evaluatedAccess.median)} ` +
      `(binding ${(100 * s.bindingTotal.median / s.evaluatedAccess.median).toFixed(1)}%, with record ` +
      `${(100 * s.total.median / s.evaluatedAccess.median).toFixed(1)}%).`,
    '',
    '## Gas schedules (GasProbe, as called; the call overhead is identical on both networks)', '',
    '| Operation | Local | Amoy | Amoy − local |', '|---|---:|---:|---:|'
  );
  const scheduleRows = [
    ...SCHEDULE_PROBES.map((item) => [item.label, item.id]),
    ['cold SLOAD', 'sloadCold']
  ];
  for (const [label, key] of scheduleRows) {
    const l = report.localSchedule[key];
    const a = amoy && amoy.schedule[key];
    lines.push(`| ${label} | ${cell(l)} | ${cell(a)} | ${a === undefined || a === null ? '—' : cell(a - l)} |`);
  }
  lines.push(
    `| three fresh SSTOREs (store3) | ${cell(s.store3.median)} | ${cell(amoy && amoy.store3)} | ${amoy ? cell(amoy.store3 - s.store3.median) : '—'} |`,
    `| 5-input verifyProof | ${cell(s.verify5.median)} | ${cell(amoy && amoy.verify5)} | ${amoy ? cell(amoy.verify5 - s.verify5.median) : '—'} |`,
    `| 4-input verifyProof | ${cell(s.verify4.median)} | ${cell(amoy && amoy.verify4)} | ${amoy ? cell(amoy.verify4 - s.verify4.median) : '—'} |`,
    ''
  );
  return lines.join('\n');
}

async function main() {
  const [provider, tps] = await ethers.getSigners();
  const verifier5 = await (await ethers.getContractFactory('PolicyPrivacyMainVerifier')).deploy();
  const verifier4 = await (await ethers.getContractFactory('PolicyPrivacyMainVerifier4')).deploy();
  const hasher = await deployPoseidon3(ethers);
  const probe = await (await ethers.getContractFactory('GasProbe')).deploy();
  const acms = [];
  for (const variant of ACMS) {
    const contract = await (await ethers.getContractFactory(variant.contract)).deploy(verifier5.target, hasher.target);
    acms.push({ ...variant, instance: contract });
  }

  const fixtures = await H.buildTermFixtures();
  const profile = H.resolveProfile();
  const localAddr = { verifier5: verifier5.target, verifier4: verifier4.target, hasher: hasher.target };
  const localCall = (data) => ethers.provider.call({ to: probe.target, data });

  let nonce = 5_000_000n;
  const rows = [];
  const firstProofPerScenario = [];
  for (const scenario of SCENARIOS) {
    console.log(`[ctx-gas] ${scenario.id}: compiling`);
    const ctx = await H.compilePolicy(scenario.logic, fixtures);
    const ids = [];
    for (const acm of acms) ids.push(await commitAndRegister(acm.instance, provider, ctx));
    if (ids.some((id) => id.policyId !== ids[0].policyId || id.resourceId !== ids[0].resourceId)) {
      throw new Error('ACM variants assigned different policy or resource ids');
    }
    const { policyId, resourceId } = ids[0];

    for (let rep = 0; rep < REPETITIONS; rep += 1) {
      const requestEpoch = await H.freshRequestEpoch(ethers);
      nonce += 1n;
      const { evidence, idReq } = await H.evidenceFor(ctx, profile, fixtures, { resourceId, requestEpoch });
      const proof = await generateProof(ctx.material, evidence, {
        policyCommitment: ctx.artifacts.policyCommitment, idReq, idRes: resourceId, nonce, requestEpoch
      });
      if (!proof.timings.verified || BigInt(proof.pubSignals[0]) !== 1n) throw new Error(`${scenario.id}: proof did not authorize`);

      const gas = {};
      for (const acm of acms) {
        const receipt = await (await acm.instance.connect(tps).requestAccessBound(
          policyId, resourceId, nonce, idReq, requestEpoch, proof.pA, proof.pB, proof.pC, proof.pubSignals
        )).wait();
        const granted = receipt.logs.some((log) => {
          try { return acm.instance.interface.parseLog(log)?.name === 'AccessGranted'; } catch { return false; }
        });
        if (!granted) throw new Error(`${scenario.id}: ${acm.id} did not grant`);
        gas[acm.id] = Number(receipt.gasUsed);
      }
      const context = [BigInt(idReq), BigInt(resourceId), nonce];
      const probes = await runProbes(localCall, probe, localAddr, proof, context);
      rows.push({
        scenario: scenario.id,
        rep,
        gas,
        probes,
        calldata: { idReq: wordCalldataGas(idReq), digest: wordCalldataGas(proof.pubSignals[3]) }
      });
      if (rep === 0) firstProofPerScenario.push({ scenario: scenario.id, proof, context });
    }
    console.log(`[ctx-gas] ${scenario.id}: evaluated ${rows.at(-1).gas.evaluated}, noBind ${rows.at(-1).gas.noBind}, noBindNoRecord ${rows.at(-1).gas.noBindNoRecord}`);
  }

  const pick = (fn) => spread(rows.map(fn));
  const summary = {
    evaluatedAccess: pick((r) => r.gas.evaluated),
    acmBinding: pick((r) => r.gas.evaluated - r.gas.noBind),
    record: pick((r) => r.gas.noBind - r.gas.noBindNoRecord),
    poseidonCall: pick((r) => r.probes.poseidon3),
    verify5: pick((r) => r.probes.verify5),
    verify4: pick((r) => r.probes.verify4),
    verifierInput: pick((r) => r.probes.verify5 - r.probes.verify4),
    store3: pick((r) => r.probes.store3),
    calldata: pick((r) => r.calldata.idReq + r.calldata.digest)
  };
  summary.bindingTotal = pick((r) => (r.gas.evaluated - r.gas.noBind) + (r.probes.verify5 - r.probes.verify4) + r.calldata.idReq + r.calldata.digest);
  summary.total = pick((r) => (r.gas.evaluated - r.gas.noBindNoRecord) + (r.probes.verify5 - r.probes.verify4) + r.calldata.idReq + r.calldata.digest);

  const localSchedule = await runScheduleProbes(localCall, probe);

  let amoy = null;
  if (PROBE_AMOY) {
    const amoyProvider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL, 80002, { staticNetwork: true });
    const overrides = {
      [AMOY_ADDR.probe]: { code: await ethers.provider.getCode(probe.target) },
      [AMOY_ADDR.verifier5]: { code: await ethers.provider.getCode(verifier5.target) },
      [AMOY_ADDR.verifier4]: { code: await ethers.provider.getCode(verifier4.target) },
      [AMOY_ADDR.hasher]: { code: await ethers.provider.getCode(hasher.target) }
    };
    const evaluation = evaluationBlock();
    const latest = await amoyProvider.getBlockNumber();
    const targets = [
      ...(evaluation ? [{ label: 'evaluation median', block: evaluation.median }] : []),
      { label: 'latest', block: latest }
    ];
    const local = (key) => summary[key].median;
    const byBlock = [];
    for (const target of targets) {
      const blockTag = ethers.toQuantity(target.block);
      const amoyCall = (data) => amoyProvider.send('eth_call', [{ to: AMOY_ADDR.probe, data, gas: '0x1c9c380' }, blockTag, overrides]);
      const samples = [];
      for (const { scenario, proof, context } of firstProofPerScenario) {
        console.log(`[ctx-gas] amoy probes at ${target.label} block ${target.block}: ${scenario}`);
        samples.push({ scenario, ...(await runProbes(amoyCall, probe, AMOY_ADDR, proof, context)) });
      }
      const median = (key) => quantile(samples.map((sample) => sample[key]), 0.5);
      const row = {
        ...target,
        samples,
        schedule: await runScheduleProbes(amoyCall, probe),
        verify5: median('verify5'),
        verify4: median('verify4'),
        verifierInput: median('verify5') - median('verify4'),
        poseidon3: median('poseidon3'),
        store3: median('store3'),
        // Local end-to-end value shifted by the Amoy-minus-local probe difference.
        acmBinding: local('acmBinding') + (median('poseidon3') - local('poseidonCall')),
        record: local('record') + (median('store3') - local('store3'))
      };
      row.bindingTotal = row.acmBinding + row.verifierInput + local('calldata');
      row.total = row.bindingTotal + row.record;
      byBlock.push(row);
    }
    const keys = ['verifierInput', 'acmBinding', 'record', 'bindingTotal', 'total'];
    amoy = {
      evaluationBlocks: evaluation,
      byBlock,
      stableAcrossBlocks: byBlock.every((row) => keys.every((key) => row[key] === byBlock[0][key])),
      ...Object.fromEntries(['block', 'verify5', 'verify4', 'poseidon3', 'store3', 'schedule', ...keys].map((key) => [key, byBlock[0][key]]))
    };
  }

  const solidity = hre.config.solidity.compilers[0];
  const report = {
    generatedAt: new Date().toISOString(),
    host: { cpu: os.cpus()[0]?.model || 'unknown', cores: os.cpus().length, node: process.version, platform: os.platform() },
    local: {
      hardhat: require('hardhat/package.json').version,
      hardfork: hre.config.networks.hardhat.hardfork,
      solc: solidity.version,
      optimizer: Boolean(solidity.settings?.optimizer?.enabled)
    },
    proofs: rows.length,
    repetitionsPerPolicy: REPETITIONS,
    byScenario: SCENARIOS.map((scenario) => {
      const own = rows.filter((r) => r.scenario === scenario.id);
      return {
        id: scenario.id,
        label: scenario.label,
        logic: scenario.logic,
        evaluated: spread(own.map((r) => r.gas.evaluated)),
        noBind: spread(own.map((r) => r.gas.noBind)),
        noBindNoRecord: spread(own.map((r) => r.gas.noBindNoRecord))
      };
    }),
    summary,
    localSchedule,
    amoy,
    rows
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'context_binding_gas.json'), JSON.stringify(report, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  const markdown = renderMarkdown(report);
  fs.writeFileSync(path.join(OUT_DIR, 'context_binding_gas.md'), markdown);
  console.log(markdown);
}

main().then(
  () => process.stdout.write('', () => process.exit(0)),
  (error) => { console.error(error.stack || error.message); process.exit(1); }
);
