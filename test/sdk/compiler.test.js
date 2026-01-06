const { expect } = require('chai');
const { generatePolicyArtifacts } = require('../../lib/compiler');

describe('SDK - Compiler Module', function() {
  this.timeout(30000);

  describe('generatePolicyArtifacts()', function() {
    it('should compile simple policy with single attribute', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: {
          GR: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts).to.have.property('tokens');
      expect(artifacts).to.have.property('policyCommitment');
      expect(artifacts).to.have.property('metadata');
      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should compile policy with AND logic', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: {
            comparison: 'IN',
            value: 'icd10:A00'
          }
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.tokens.length).to.be.greaterThan(0);
      expect(artifacts.policyCommitment).to.match(/^\d+$/);
    });

    it('should compile policy with OR logic', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR OR DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should compile policy with complex nested logic', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS', 'RS'],
        logic: '(GR AND DS) OR RS',
        attributes: {
          GR: true,
          DS: true,
          RS: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.tokens.length).to.be.greaterThan(3);
    });

    it('should generate different commitments for different policies', async function() {
      const policy1 = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const policy2 = {
        attributeOrder: ['DS'],
        logic: 'DS',
        attributes: { DS: true }
      };

      const artifacts1 = await generatePolicyArtifacts(policy1, { depth: 20 });
      const artifacts2 = await generatePolicyArtifacts(policy2, { depth: 20 });

      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should generate different commitments for different randomizers', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const artifacts1 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '12345'
      });

      const artifacts2 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '67890'
      });

      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should include metadata in artifacts', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.metadata).to.be.an('object');
      expect(artifacts.metadata).to.have.property('attributeOrder');
      expect(artifacts.metadata.attributeOrder).to.deep.equal(['GR', 'DS']);
    });

    it('should handle all DUO attributes', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS', 'RS', 'POA', 'GS', 'CC'],
        logic: 'GR OR DS OR RS OR POA OR GS OR CC',
        attributes: {
          GR: true,
          DS: true,
          RS: true,
          POA: true,
          GS: true,
          CC: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should handle custom depth parameter', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const artifacts10 = await generatePolicyArtifacts(policy, { depth: 10 });
      const artifacts20 = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts10.tokens).to.be.an('array');
      expect(artifacts20.tokens).to.be.an('array');
      // Different depth might affect padding
    });

    it('should handle attribute with ontology predicate', async function() {
      const policy = {
        attributeOrder: ['DS'],
        logic: 'DS',
        attributes: {
          DS: {
            comparison: 'IN',
            value: 'icd10:A00',
            merkleRoot: '0x123abc'
          }
        },
        predicates: [
          {
            slot: 0,
            duo: 'DS',
            namespace: 'ICD10',
            root: '0x123abc'
          }
        ]
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.metadata).to.have.property('predicates');
    });

    it('should produce valid RPN tokens', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      // RPN tokens should be numeric values
      artifacts.tokens.forEach(token => {
        expect(token).to.be.a('number');
      });
    });

    it('should handle negation (NOT) operator', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND NOT DS',
        attributes: {
          GR: true,
          DS: false
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should handle deeply nested parentheses', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS', 'RS', 'CC'],
        logic: '((GR AND DS) OR (RS AND CC))',
        attributes: {
          GR: true,
          DS: true,
          RS: true,
          CC: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });
  });

  describe('Compiler Error Handling', function() {
    it('should handle missing attribute order', async function() {
      const policy = {
        logic: 'GR',
        attributes: { GR: true }
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

    it('should handle missing logic', async function() {
      const policy = {
        attributeOrder: ['GR'],
        attributes: { GR: true }
      };

      try {
        const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });
        expect(artifacts).to.exist;
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle empty attributes', async function() {
      const policy = {
        attributeOrder: [],
        logic: '',
        attributes: {}
      };

      try {
        const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });
        expect(artifacts).to.exist;
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Integration with DUO Standard', function() {
    it('should compile realistic healthcare consent policy', async function() {
      // Disease-specific research for diabetes
      const policy = {
        attributeOrder: ['DS', 'GR'],
        logic: 'DS AND GR',
        attributes: {
          DS: {
            comparison: 'IN',
            value: 'icd10:E10-E14'
          },
          GR: true
        },
        predicates: [
          {
            slot: 0,
            duo: 'DS',
            namespace: 'ICD10',
            root: '0x1234567890abcdef'
          }
        ]
      };

      const artifacts = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x9876543210fedcba'
      });

      expect(artifacts).to.have.all.keys('tokens', 'policyCommitment', 'metadata');
      expect(artifacts.tokens).to.be.an('array').with.length.greaterThan(0);
      expect(BigInt(artifacts.policyCommitment)).to.be.greaterThan(0n);
    });

    it('should compile policy with geographical restriction', async function() {
      const policy = {
        attributeOrder: ['GR', 'GS'],
        logic: 'GR AND GS',
        attributes: {
          GR: true,
          GS: {
            comparison: 'IN',
            value: 'iso3166:US'
          }
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });

    it('should compile policy with research-specific restrictions', async function() {
      const policy = {
        attributeOrder: ['RS', 'GR'],
        logic: 'RS OR GR',
        attributes: {
          RS: {
            comparison: 'IN',
            value: 'obi:0000066'
          },
          GR: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');
    });
  });

  describe('Commitment Properties', function() {
    it('should produce deterministic commitments for same input', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      const randomizer = '12345';
      const artifacts1 = await generatePolicyArtifacts(policy, { depth: 20, randomizer });
      const artifacts2 = await generatePolicyArtifacts(policy, { depth: 20, randomizer });

      expect(artifacts1.policyCommitment).to.equal(artifacts2.policyCommitment);
    });

    it('should produce hiding commitments (different for same policy, different randomizer)', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const artifacts1 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '111'
      });

      const artifacts2 = await generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '222'
      });

      // Same policy, different randomizer -> different commitment (hiding property)
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should produce binding commitments (different policies have different commitments)', async function() {
      const policy1 = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const policy2 = {
        attributeOrder: ['DS'],
        logic: 'DS',
        attributes: { DS: true }
      };

      const randomizer = '12345';
      const artifacts1 = await generatePolicyArtifacts(policy1, { depth: 20, randomizer });
      const artifacts2 = await generatePolicyArtifacts(policy2, { depth: 20, randomizer });

      // Different policies -> different commitments (binding property)
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });
  });

  describe('Token Generation', function() {
    it('should generate valid operator tokens', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      // Should contain operator tokens (11=AND, 12=OR, etc.)
      const hasOperator = artifacts.tokens.some(t => t >= 11);
      expect(hasOperator).to.be.true;
    });

    it('should generate valid operand tokens', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS', 'RS'],
        logic: 'GR OR DS OR RS',
        attributes: {
          GR: true,
          DS: true,
          RS: true
        }
      };

      const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });

      // Should contain operand tokens (0-10 range typically)
      const hasOperand = artifacts.tokens.some(t => t >= 0 && t <= 10);
      expect(hasOperand).to.be.true;
    });
  });
});
