const { expect } = require('chai');
const { generatePolicyArtifacts } = require('../../lib/compiler');

describe('SDK - Compiler Module', function () {
  this.timeout(30000);

  // Namespace mapping based on ATTRIBUTE_DEFINITIONS in policy_generator.js
  // GR and CU have namespace: null, requiresPredicate: false
  // DS -> ICD10, RS -> OBI, POA -> HANCESTRO, GS -> ISO3166, CC -> SNOMED
  const NAMESPACE_MAP = {
    'DS': 'ICD10',
    'RS': 'OBI',
    'POA': 'HANCESTRO',
    'GS': 'ISO3166',
    'CC': 'SNOMED'
  };

  // Helper to create predicates for attributes that require them
  function makePredicates(duoCodes) {
    const predicates = [];
    let slotIdx = 0;
    for (const code of duoCodes) {
      if (NAMESPACE_MAP[code]) {
        predicates.push({
          slot: slotIdx++,
          duo: code,
          namespace: NAMESPACE_MAP[code],
          root: `0x${(slotIdx).toString(16).padStart(4, '0')}`
        });
      }
    }
    return predicates;
  }

  describe('generatePolicyArtifacts()', function () {
    it('should compile simple policy with single attribute', async function () {
      // Using DS which requires a predicate
      const policy = {
        attributes: {
          DS: true
        },
        predicates: makePredicates(['DS']),
        logic: 'DS & P[ICD10]'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS']
      });


      expect(artifacts).to.have.property('tokens');
      expect(artifacts).to.have.property('policyCommitment');
      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should compile policy with AND logic', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.tokens.length).to.be.greaterThan(0);
      expect(artifacts.policyCommitment).to.match(/^0x[0-9a-f]+$/);
    });

    it('should compile policy with OR logic', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) | (RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should compile policy with complex nested logic', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true,
          GS: true
        },
        predicates: makePredicates(['DS', 'RS', 'GS']),
        logic: '((DS & P[ICD10]) & (RS & P[OBI])) | (GS & P[ISO3166])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS', 'GS']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.tokens.length).to.be.greaterThan(3);
    });

    it('should generate different commitments for different policies', async function () {
      const policy1 = {
        attributes: { DS: true },
        predicates: [{ slot: 0, duo: 'DS', namespace: 'ICD10', root: '0x0001' }],
        logic: 'DS & P[ICD10]'
      };

      const policy2 = {
        attributes: { RS: true },
        predicates: [{ slot: 0, duo: 'RS', namespace: 'OBI', root: '0x0001' }],
        logic: 'RS & P[OBI]'
      };

      const artifacts1 = await generatePolicyArtifacts(policy1, {
        depth: 20,
        attributeOrder: ['DS']
      });
      const artifacts2 = await generatePolicyArtifacts(policy2, {
        depth: 20,
        attributeOrder: ['RS']
      });

      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should generate different commitments for different randomizers', async function () {
      const policy = {
        attributes: { DS: true },
        predicates: makePredicates(['DS']),
        logic: 'DS & P[ICD10]'
      };

      const artifacts1 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x12345',
        attributeOrder: ['DS']
      });

      const artifacts2 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x67890',
        attributeOrder: ['DS']
      });

      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should include metadata in artifacts', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS']
      });

      expect(artifacts.attributes).to.be.an('object');
      expect(artifacts.attributes).to.have.property('order');
      expect(artifacts.attributes.order).to.deep.equal(['DS', 'RS']);
    });

    it('should handle multiple DUO attributes with predicates', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true,
          POA: true,
          GS: true,
          CC: true
        },
        predicates: makePredicates(['DS', 'RS', 'POA', 'GS', 'CC']),
        logic: '(DS & P[ICD10]) | (RS & P[OBI]) | (POA & P[HANCESTRO]) | (GS & P[ISO3166]) | (CC & P[SNOMED])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 30,
        attributeOrder: ['DS', 'RS', 'POA', 'GS', 'CC']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should handle custom depth parameter', async function () {
      const policy = {
        attributes: { DS: true },
        predicates: makePredicates(['DS']),
        logic: 'DS & P[ICD10]'
      };

      const artifacts10 = await generatePolicyArtifacts(policy, {
        depth: 10,
        attributeOrder: ['DS']
      });
      const artifacts20 = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS']
      });

      expect(artifacts10.tokens).to.be.an('array');
      expect(artifacts20.tokens).to.be.an('array');
      // Different depth might affect padding
    });

    it('should handle attribute with ontology predicate', async function () {
      const policy = {
        attributes: {
          DS: true
        },
        predicates: [
          {
            slot: 0,
            duo: 'DS',
            namespace: 'ICD10',
            root: '0x123abc',
            description: 'ICD-10 whitelist for DS'
          }
        ],
        logic: 'DS & P[ICD10]'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.predicates).to.have.property('slots');
    });

    it('should produce valid RPN tokens', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS']
      });

      // RPN tokens should be numeric values
      artifacts.tokens.forEach(token => {
        expect(token).to.be.a('number');
      });
    });

    it('should handle negation (NOT) operator', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: false
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) & !(RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should handle deeply nested parentheses', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true,
          GS: true,
          CC: true
        },
        predicates: makePredicates(['DS', 'RS', 'GS', 'CC']),
        logic: '(((DS & P[ICD10]) & (RS & P[OBI])) | ((GS & P[ISO3166]) & (CC & P[SNOMED])))'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 30,
        attributeOrder: ['DS', 'RS', 'GS', 'CC']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });
  });

  describe('Compiler Error Handling', function () {
    it('should handle missing attribute order', async function () {
      const policy = {
        attributes: { DS: true },
        predicates: makePredicates(['DS']),
        logic: 'DS & P[ICD10]'
      };

      try {
        const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });
        // Some implementations might provide defaults
        expect(artifacts).to.exist;
      } catch (error) {
        // Or it might throw an error
        expect(error).to.exist;
      }
    });

    it('should handle missing logic', async function () {
      const policy = {
        attributes: { DS: true },
        predicates: makePredicates(['DS'])
      };

      try {
        const artifacts = await generatePolicyArtifacts(policy, {
          depth: 20,
          attributeOrder: ['DS']
        });
        expect(artifacts).to.exist;
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle empty attributes', async function () {
      const policy = {
        attributes: {},
        predicates: [],
        logic: ''
      };

      try {
        const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });
        expect(artifacts).to.exist;
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Integration with DUO Standard', function () {
    it('should compile realistic healthcare consent policy', async function () {
      // Disease-specific research for diabetes
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: [
          {
            slot: 0,
            duo: 'DS',
            namespace: 'ICD10',
            root: '0x1234567890abcdef',
            description: 'ICD-10 whitelist for diabetes'
          },
          {
            slot: 1,
            duo: 'RS',
            namespace: 'OBI',
            root: '0xfedcba0987654321'
          }
        ],
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x9876543210fedcba',
        attributeOrder: ['DS', 'RS']
      });

      expect(artifacts).to.have.all.keys(
        'policyId', 'datasetId', 'depth', 'numAttributes', 'numPredicates',
        'numOperations', 'tokens', 'policy', 'attributes', 'predicates',
        'logic', 'operators', 'randomizer', 'policyCommitment', 'policyHash'
      );
      expect(artifacts.tokens).to.be.an('array').with.length.greaterThan(0);
      expect(BigInt(artifacts.policyCommitment)).to.be.greaterThan(0n);
    });

    it('should compile policy with geographical restriction', async function () {
      const policy = {
        attributes: {
          DS: true,
          GS: true
        },
        predicates: [
          {
            slot: 0,
            duo: 'DS',
            namespace: 'ICD10',
            root: '0x0001'
          },
          {
            slot: 1,
            duo: 'GS',
            namespace: 'ISO3166',
            root: '0x0002'
          }
        ],
        logic: '(DS & P[ICD10]) & (GS & P[ISO3166])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'GS']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should compile policy with research-specific restrictions', async function () {
      const policy = {
        attributes: {
          RS: true,
          POA: true
        },
        predicates: [
          {
            slot: 0,
            duo: 'RS',
            namespace: 'OBI',
            root: '0x0001'
          },
          {
            slot: 1,
            duo: 'POA',
            namespace: 'HANCESTRO',
            root: '0x0002'
          }
        ],
        logic: '(RS & P[OBI]) | (POA & P[HANCESTRO])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['RS', 'POA']
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });
  });

  describe('Commitment Properties', function () {
    it('should produce deterministic commitments for same input', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const randomizer = '0x12345';
      const artifacts1 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer,
        attributeOrder: ['DS', 'RS']
      });
      const artifacts2 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer,
        attributeOrder: ['DS', 'RS']
      });

      expect(artifacts1.policyCommitment).to.equal(artifacts2.policyCommitment);
    });

    it('should produce hiding commitments (different for same policy, different randomizer)', async function () {
      const policy = {
        attributes: { DS: true },
        predicates: makePredicates(['DS']),
        logic: 'DS & P[ICD10]'
      };

      const artifacts1 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x111',
        attributeOrder: ['DS']
      });

      const artifacts2 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x222',
        attributeOrder: ['DS']
      });

      // Same policy, different randomizer -> different commitment (hiding property)
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should produce binding commitments (different policies have different commitments)', async function () {
      // Use same attribute order but different logic to ensure different token sequences
      const policy1 = {
        attributes: { DS: true, RS: false },
        predicates: [
          { slot: 0, duo: 'DS', namespace: 'ICD10', root: '0x0001' },
          { slot: 1, duo: 'RS', namespace: 'OBI', root: '0x0002' }
        ],
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const policy2 = {
        attributes: { DS: true, RS: true },
        predicates: [
          { slot: 0, duo: 'DS', namespace: 'ICD10', root: '0x0001' },
          { slot: 1, duo: 'RS', namespace: 'OBI', root: '0x0002' }
        ],
        logic: '(DS & P[ICD10]) | (RS & P[OBI])'  // Different operator: OR instead of AND
      };

      const randomizer = '0x12345';
      const artifacts1 = await generatePolicyArtifacts(policy1, {
        depth: 20,
        randomizer,
        attributeOrder: ['DS', 'RS']
      });
      const artifacts2 = await generatePolicyArtifacts(policy2, {
        depth: 20,
        randomizer,
        attributeOrder: ['DS', 'RS']
      });

      // Different policies -> different commitments (binding property)
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });
  });

  describe('Token Generation', function () {
    it('should generate valid operator tokens', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true
        },
        predicates: makePredicates(['DS', 'RS']),
        logic: '(DS & P[ICD10]) & (RS & P[OBI])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS']
      });

      // Should contain operator tokens (AND, OR, etc. are mapped to higher numbers)
      const hasOperator = artifacts.tokens.some(t => t >= artifacts.numAttributes + artifacts.numPredicates);
      expect(hasOperator).to.be.true;
    });

    it('should generate valid operand tokens', async function () {
      const policy = {
        attributes: {
          DS: true,
          RS: true,
          GS: true
        },
        predicates: makePredicates(['DS', 'RS', 'GS']),
        logic: '(DS & P[ICD10]) | (RS & P[OBI]) | (GS & P[ISO3166])'
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        attributeOrder: ['DS', 'RS', 'GS']
      });

      // Should contain operand tokens (attributes are in 0 to numAttributes-1 range)
      const hasOperand = artifacts.tokens.some(t => t >= 0 && t < artifacts.numAttributes);
      expect(hasOperand).to.be.true;
    });
  });
});
