const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const {
  buildWhitelist,
  verifyProof,
  NAMESPACE_IDS
} = require('../utils/merkle/ontology_whitelist');

function makeSampleConfig() {
  return {
    merkleLevels: 3,
    defaultEpoch: 1,
    terms: [
      { namespace: 'ICD10', termId: 'A00' },
      { namespace: 'ICD10', termId: 'B00' },
      { namespace: 'ICD10', termId: 'A00' }, // duplicate intentional
      { namespace: 'OBI', termId: 'OBI:0000175', epoch: 2 },
      { namespace: 'SNOMED', termId: '123456', epoch: 7 },
      { namespace: 'ISO3166', termId: 'US' },
      // { namespace: NAMESPACE_IDS.HANCESTRO, termId: 'HANCESTRO:0005', epoch: 3 }
    ]
  };
}

describe('Ontology whitelist toolchain', function () {
  this.timeout(30000);

  it('buildWhitelist produces deterministic root and unique entries', async function () {
    const config = makeSampleConfig();
    const { metadata, entries } = await buildWhitelist(config);
    expect(entries).to.have.length(5); // duplicate removed
    expect(metadata.rootHex).to.be.a('string');

    const repeated = await buildWhitelist(config);
    expect(repeated.metadata.rootHex).to.equal(metadata.rootHex);
    expect(repeated.entries.map(e => e.termId)).to.deep.equal(entries.map(e => e.termId));

    for (const entry of entries) {
      const ok = await verifyProof({
        leaf: entry.leaf,
        pathElements: entry.pathElements,
        pathIndices: entry.pathIndices,
        root: metadata.root
      });
      expect(ok).to.equal(true);
    }

    const invalid = await verifyProof({
      leaf: entries[0].leaf,
      pathElements: entries[0].pathElements,
      pathIndices: entries[0].pathIndices,
      root: metadata.root + 1n
    });
    expect(invalid).to.equal(false);
  });

  it('CLI exports root and proofs matching in-memory build', async function () {
    const config = makeSampleConfig();
    const { metadata } = await buildWhitelist(config);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ontology-whitelist-'));
    const configPath = path.join(tmpDir, 'config.json');
    const outputDir = path.join(tmpDir, 'out');

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const scriptPath = path.resolve(__dirname, '../scripts/build_ontology_whitelist.js');
    execSync(`node "${scriptPath}" --config "${configPath}" --out "${outputDir}"`);

    const rootPath = path.join(outputDir, 'root.json');
    expect(fs.existsSync(rootPath)).to.equal(true);
    const rootJson = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
    expect(rootJson.root).to.equal(metadata.rootHex);
    expect(rootJson.leafCount).to.equal(5);

    const proofsDir = path.join(outputDir, 'proofs');
    const proofFiles = fs.readdirSync(proofsDir).filter(f => f.endsWith('.json'));
    expect(proofFiles).to.have.length(5);

    for (const fileName of proofFiles) {
      const proof = JSON.parse(fs.readFileSync(path.join(proofsDir, fileName), 'utf8'));
      const ok = await verifyProof(proof, { root: rootJson.root });
      expect(ok).to.equal(true);
    }
  });
});
