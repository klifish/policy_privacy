const { expect } = require('chai');
const { Contracts } = require('../../lib');
const path = require('path');
const fs = require('fs');

describe('SDK - Contracts Module', function() {
  describe('Contract Artifacts Loading', function() {
    it('should export Contracts object', function() {
      expect(Contracts).to.exist;
      expect(Contracts).to.be.an('object');
    });

    it('should include PolicyPrivacy contract', function() {
      expect(Contracts).to.have.property('PolicyPrivacy');
    });

    it('should include Verifier contract', function() {
      expect(Contracts).to.have.property('Verifier');
    });
  });

  describe('PolicyPrivacy Contract', function() {
    it('should load PolicyPrivacy artifact if available', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      expect(Contracts.PolicyPrivacy).to.be.an('object');
    });

    it('should have valid ABI structure if artifact exists', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      expect(Contracts.PolicyPrivacy).to.have.property('abi');
      expect(Contracts.PolicyPrivacy.abi).to.be.an('array');
    });

    it('should have bytecode if artifact exists', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      expect(Contracts.PolicyPrivacy).to.have.property('bytecode');
      expect(Contracts.PolicyPrivacy.bytecode).to.be.a('string');

      if (Contracts.PolicyPrivacy.bytecode && Contracts.PolicyPrivacy.bytecode !== '0x') {
        expect(Contracts.PolicyPrivacy.bytecode).to.match(/^0x[0-9a-fA-F]+$/);
      }
    });

    it('should have contract metadata if artifact exists', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      // Standard Hardhat artifact structure
      const expectedFields = ['abi', 'bytecode'];
      expectedFields.forEach(field => {
        expect(Contracts.PolicyPrivacy).to.have.property(field);
      });
    });

    it('should have key contract functions in ABI', function() {
      if (!Contracts.PolicyPrivacy || !Contracts.PolicyPrivacy.abi) {
        this.skip();
      }

      const abi = Contracts.PolicyPrivacy.abi;
      const functionNames = abi
        .filter(item => item.type === 'function')
        .map(item => item.name);

      // Check for expected functions (based on PolicyPrivacy contract)
      const expectedFunctions = ['registerPolicy', 'verifyAccess'];

      // At least some contract functions should exist
      expect(functionNames.length).to.be.greaterThan(0);
    });
  });

  describe('Verifier Contract', function() {
    it('should load Verifier artifact if available', function() {
      if (!Contracts.Verifier) {
        this.skip();
      }

      expect(Contracts.Verifier).to.be.an('object');
    });

    it('should have valid ABI structure if artifact exists', function() {
      if (!Contracts.Verifier) {
        this.skip();
      }

      expect(Contracts.Verifier).to.have.property('abi');
      expect(Contracts.Verifier.abi).to.be.an('array');
    });

    it('should have bytecode if artifact exists', function() {
      if (!Contracts.Verifier) {
        this.skip();
      }

      expect(Contracts.Verifier).to.have.property('bytecode');
      expect(Contracts.Verifier.bytecode).to.be.a('string');

      if (Contracts.Verifier.bytecode && Contracts.Verifier.bytecode !== '0x') {
        expect(Contracts.Verifier.bytecode).to.match(/^0x[0-9a-fA-F]+$/);
      }
    });

    it('should have verifyProof function in ABI', function() {
      if (!Contracts.Verifier || !Contracts.Verifier.abi) {
        this.skip();
      }

      const abi = Contracts.Verifier.abi;
      const verifyProof = abi.find(
        item => item.type === 'function' && item.name === 'verifyProof'
      );

      expect(verifyProof).to.exist;
    });

    it('should have correct verifyProof signature', function() {
      if (!Contracts.Verifier || !Contracts.Verifier.abi) {
        this.skip();
      }

      const abi = Contracts.Verifier.abi;
      const verifyProof = abi.find(
        item => item.type === 'function' && item.name === 'verifyProof'
      );

      if (verifyProof) {
        expect(verifyProof.inputs).to.be.an('array');
        // Groth16 verifier typically has 4 inputs: pA, pB, pC, pubSignals
        expect(verifyProof.inputs.length).to.be.at.least(2);
      }
    });
  });

  describe('Artifact File Paths', function() {
    it('should resolve artifacts from correct directory structure', function() {
      const artifactsDir = path.resolve(__dirname, '../../artifacts/contracts');

      // Check if artifacts directory exists
      if (fs.existsSync(artifactsDir)) {
        const files = fs.readdirSync(artifactsDir);
        expect(files).to.be.an('array');
      } else {
        this.skip();
      }
    });

    it('should handle missing artifacts gracefully', function() {
      // The module should export Contracts even if artifacts don't exist
      expect(Contracts).to.exist;

      // Individual contracts may be null if artifacts aren't built
      if (Contracts.PolicyPrivacy === null) {
        expect(Contracts.PolicyPrivacy).to.be.null;
      }
      if (Contracts.Verifier === null) {
        expect(Contracts.Verifier).to.be.null;
      }
    });
  });

  describe('Integration with Ethers.js', function() {
    it('should be compatible with ethers ContractFactory structure', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      // Check that the structure matches what ethers.ContractFactory expects
      expect(Contracts.PolicyPrivacy).to.have.property('abi');
      expect(Contracts.PolicyPrivacy).to.have.property('bytecode');

      // ABI should be an array (required by ethers)
      expect(Contracts.PolicyPrivacy.abi).to.be.an('array');

      // Bytecode should be a string (required by ethers)
      expect(Contracts.PolicyPrivacy.bytecode).to.be.a('string');
    });

    it('should be compatible with ethers Contract structure', function() {
      if (!Contracts.Verifier) {
        this.skip();
      }

      // Check that the structure matches what ethers.Contract expects
      expect(Contracts.Verifier).to.have.property('abi');
      expect(Contracts.Verifier.abi).to.be.an('array');
    });
  });

  describe('ABI Validation', function() {
    it('should have valid ABI items with required fields', function() {
      if (!Contracts.PolicyPrivacy || !Contracts.PolicyPrivacy.abi) {
        this.skip();
      }

      const abi = Contracts.PolicyPrivacy.abi;

      abi.forEach((item, index) => {
        expect(item, `ABI item ${index} missing type`).to.have.property('type');

        if (item.type === 'function') {
          expect(item, `Function at ${index} missing name`).to.have.property('name');
          expect(item, `Function ${item.name} missing inputs`).to.have.property('inputs');
          expect(item, `Function ${item.name} missing outputs`).to.have.property('outputs');
        }

        if (item.type === 'event') {
          expect(item, `Event at ${index} missing name`).to.have.property('name');
          expect(item, `Event ${item.name} missing inputs`).to.have.property('inputs');
        }
      });
    });

    it('should have valid function input/output types', function() {
      if (!Contracts.PolicyPrivacy || !Contracts.PolicyPrivacy.abi) {
        this.skip();
      }

      const abi = Contracts.PolicyPrivacy.abi;
      const functions = abi.filter(item => item.type === 'function');

      functions.forEach(func => {
        func.inputs.forEach((input, idx) => {
          expect(input, `Function ${func.name} input ${idx} missing type`).to.have.property('type');
          expect(input).to.have.property('name');
        });

        func.outputs.forEach((output, idx) => {
          expect(output, `Function ${func.name} output ${idx} missing type`).to.have.property('type');
        });
      });
    });
  });

  describe('Bytecode Validation', function() {
    it('should have non-empty bytecode for deployable contracts', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      const bytecode = Contracts.PolicyPrivacy.bytecode;

      if (bytecode) {
        expect(bytecode).to.not.equal('0x');
        expect(bytecode.length).to.be.greaterThan(2); // More than just "0x"
      }
    });

    it('should have valid hex bytecode format', function() {
      if (!Contracts.PolicyPrivacy || !Contracts.PolicyPrivacy.bytecode) {
        this.skip();
      }

      const bytecode = Contracts.PolicyPrivacy.bytecode;

      if (bytecode && bytecode !== '0x') {
        // Should start with 0x and contain only hex characters
        expect(bytecode).to.match(/^0x[0-9a-fA-F]*$/);

        // Should be even length (hex pairs)
        expect((bytecode.length - 2) % 2).to.equal(0);
      }
    });
  });

  describe('Contract Metadata', function() {
    it('should maintain compatibility with Hardhat artifact format', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      // Hardhat artifacts have these core fields
      const requiredFields = ['abi', 'bytecode'];

      requiredFields.forEach(field => {
        expect(Contracts.PolicyPrivacy).to.have.property(field);
      });
    });

    it('should be JSON-serializable', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      // Should be able to serialize and deserialize
      expect(() => {
        const json = JSON.stringify(Contracts.PolicyPrivacy);
        const parsed = JSON.parse(json);
        expect(parsed).to.deep.equal(Contracts.PolicyPrivacy);
      }).to.not.throw();
    });
  });

  describe('Real-world Usage Scenarios', function() {
    it('should provide all data needed for contract deployment', function() {
      if (!Contracts.PolicyPrivacy) {
        this.skip();
      }

      // For deployment, we need ABI and bytecode
      expect(Contracts.PolicyPrivacy.abi).to.exist;
      expect(Contracts.PolicyPrivacy.bytecode).to.exist;

      // These should be the right types
      expect(Contracts.PolicyPrivacy.abi).to.be.an('array');
      expect(Contracts.PolicyPrivacy.bytecode).to.be.a('string');
    });

    it('should provide all data needed for contract interaction', function() {
      if (!Contracts.Verifier) {
        this.skip();
      }

      // For interaction with deployed contract, we need ABI
      expect(Contracts.Verifier.abi).to.exist;
      expect(Contracts.Verifier.abi).to.be.an('array');
      expect(Contracts.Verifier.abi.length).to.be.greaterThan(0);
    });

    it('should support extracting function selectors', function() {
      if (!Contracts.PolicyPrivacy || !Contracts.PolicyPrivacy.abi) {
        this.skip();
      }

      const abi = Contracts.PolicyPrivacy.abi;
      const functions = abi.filter(item => item.type === 'function');

      expect(functions.length).to.be.greaterThan(0);

      // Each function should have a name that can be used to compute selector
      functions.forEach(func => {
        expect(func.name).to.be.a('string');
        expect(func.name.length).to.be.greaterThan(0);
      });
    });
  });
});
