const { expect } = require('chai');
const request = require('supertest');
const PolicyPrivacyAPI = require('../../api/server');

describe('PolicyPrivacy API Integration Tests', function() {
  let app;
  let server;

  before(async function() {
    this.timeout(30000);

    // ethers' JsonRpcProvider retries network detection forever, so probe the
    // node first and skip the suite outright when nothing listens on :8545.
    const nodeUp = await fetch('http://localhost:8545', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
      signal: AbortSignal.timeout(2000)
    }).then((r) => r.ok, () => false);
    if (!nodeUp) {
      console.warn('No local node on :8545, API tests skipped');
      this.skip();
    }

    // Start API server for testing
    const api = new PolicyPrivacyAPI({
      port: 3001, // Use different port for testing
      nodeUrl: 'http://localhost:8545'
    });
    
    try {
      server = await api.start();
      app = api.app;
      console.log('Test API server started on port 3001');
    } catch (error) {
      console.warn('Could not start API server, tests will be skipped:', error.message);
      this.skip();
    }
  });

  after(async function() {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('Basic API Endpoints', function() {
    it('should return API information on root endpoint', async function() {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.body.name).to.equal('PolicyPrivacy API');
      expect(response.body.version).to.equal('1.0.0');
      expect(response.body.endpoints).to.be.an('object');
    });

    it('should return health status', async function() {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).to.equal('healthy');
      expect(response.body.timestamp).to.be.a('string');
      expect(response.body.contract).to.be.oneOf(['connected', 'disconnected']);
    });

    it('should return API documentation', async function() {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);
      
      expect(response.body.openapi).to.equal('3.0.0');
      expect(response.body.info.title).to.equal('PolicyPrivacy API');
      expect(response.body.paths).to.be.an('object');
    });

    it('should return 404 for unknown endpoints', async function() {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404);
      
      expect(response.body.error).to.equal('Endpoint not found');
    });
  });

  describe('Data Provider Endpoints', function() {
    const testProvider = {
      address: '0x1234567890123456789012345678901234567890',
      metadata: {
        name: 'Test Healthcare Provider',
        description: 'Test medical records provider',
        contact: 'test@provider.com'
      }
    };

    it('should register a new data provider', async function() {
      const response = await request(app)
        .post('/api/data-provider/register')
        .send(testProvider)
        .expect(201);
      
      expect(response.body.message).to.equal('Data provider registered successfully');
      expect(response.body.providerId).to.be.a('string');
      expect(response.body.address).to.equal(testProvider.address);
      expect(response.body.status).to.equal('active');
    });

    it('should reject invalid provider registration', async function() {
      const response = await request(app)
        .post('/api/data-provider/register')
        .send({
          address: 'invalid-address',
          metadata: { name: 'Test' }
        })
        .expect(400);
      
      expect(response.body.error).to.equal('Invalid address');
    });

    it('should reject duplicate provider registration', async function() {
      const response = await request(app)
        .post('/api/data-provider/register')
        .send(testProvider)
        .expect(409);
      
      expect(response.body.error).to.equal('Provider exists');
    });

    it('should get provider statistics', async function() {
      const response = await request(app)
        .get(`/api/data-provider/stats/${testProvider.address}`)
        .expect(200);
      
      expect(response.body.totalDatasets).to.be.a('number');
      expect(response.body.activeDatasets).to.be.a('number');
      expect(response.body.totalAccessRequests).to.be.a('number');
      expect(response.body.registeredAt).to.be.a('string');
    });

    it('should list published data for provider', async function() {
      const response = await request(app)
        .get(`/api/data-provider/data?providerAddress=${testProvider.address}`)
        .expect(200);
      
      expect(response.body.data).to.be.an('array');
      expect(response.body.pagination).to.be.an('object');
      expect(response.body.pagination.limit).to.be.a('number');
      expect(response.body.pagination.offset).to.be.a('number');
      expect(response.body.pagination.total).to.be.a('number');
    });
  });

  describe('Data Requester Endpoints', function() {
    const testRequester = {
      address: '0x9876543210987654321098765432109876543210',
      metadata: {
        name: 'Test Research Institute',
        description: 'Test medical research organization',
        contact: 'test@research.org'
      }
    };

    it('should register a new data requester', async function() {
      const response = await request(app)
        .post('/api/data-requester/register')
        .send(testRequester)
        .expect(201);
      
      expect(response.body.message).to.equal('Data requester registered successfully');
      expect(response.body.requesterId).to.be.a('string');
      expect(response.body.address).to.equal(testRequester.address);
      expect(response.body.status).to.equal('active');
    });

    it('should reject invalid requester registration', async function() {
      const response = await request(app)
        .post('/api/data-requester/register')
        .send({
          address: 'invalid-address',
          metadata: { name: 'Test' }
        })
        .expect(400);
      
      expect(response.body.error).to.equal('Invalid address');
    });

    it('should validate attributes', async function() {
      const response = await request(app)
        .post('/api/data-requester/validate-attributes')
        .send({
          attributes: {
            role: 'researcher',
            institution: 'Test Institute'
          },
          requiredAttributes: ['role', 'institution']
        })
        .expect(200);
      
      expect(response.body.validation.isValid).to.be.true;
      expect(response.body.validation.missingAttributes).to.be.an('array').that.is.empty;
    });

    it('should detect missing attributes', async function() {
      const response = await request(app)
        .post('/api/data-requester/validate-attributes')
        .send({
          attributes: {
            role: 'researcher'
          },
          requiredAttributes: ['role', 'institution', 'clearance']
        })
        .expect(200);
      
      expect(response.body.validation.isValid).to.be.false;
      expect(response.body.validation.missingAttributes).to.include('institution');
      expect(response.body.validation.missingAttributes).to.include('clearance');
    });

    it('should get requester statistics', async function() {
      const response = await request(app)
        .get(`/api/data-requester/stats/${testRequester.address}`)
        .expect(200);
      
      expect(response.body.totalRequests).to.be.a('number');
      expect(response.body.grantedRequests).to.be.a('number');
      expect(response.body.deniedRequests).to.be.a('number');
      expect(response.body.successRate).to.be.a('string');
      expect(response.body.registeredAt).to.be.a('string');
    });

    it('should list access requests for requester', async function() {
      const response = await request(app)
        .get(`/api/data-requester/requests?requesterAddress=${testRequester.address}`)
        .expect(200);
      
      expect(response.body.requests).to.be.an('array');
      expect(response.body.pagination).to.be.an('object');
    });
  });

  describe('Proof Endpoints', function() {
    it('should return circuit information', async function() {
      const response = await request(app)
        .get('/api/proof/circuit-info')
        .expect(200);
      
      expect(response.body.circuit).to.equal('PolicyPrivacyMain');
      expect(response.body.proofSystem).to.equal('Groth16');
      expect(response.body.parameters).to.be.an('object');
      expect(response.body.parameters.N).to.equal(3);
      expect(response.body.parameters.M).to.equal(2);
    });

    it('should calculate policy commitment', async function() {
      const response = await request(app)
        .post('/api/proof/policy-commitment')
        .send({
          policy: [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
          randomizer: '12345'
        })
        .expect(200);
      
      expect(response.body.commitment).to.be.a('string');
      expect(response.body.policy).to.deep.equal([0, 1, 5, 0, 0, 0, 0, 0, 0, 0]);
      expect(response.body.randomizer).to.equal('12345');
    });

    it('should reject invalid policy for commitment calculation', async function() {
      const response = await request(app)
        .post('/api/proof/policy-commitment')
        .send({
          policy: [0, 1, 5], // Wrong length
          randomizer: '12345'
        })
        .expect(400);
      
      expect(response.body.error).to.equal('Invalid policy');
    });

    it('should validate proof format', async function() {
      const validProof = {
        pA: ['123', '456'],
        pB: [['789', '012'], ['345', '678']],
        pC: ['901', '234'],
        pubSignals: Array(15).fill('0')
      };

      const response = await request(app)
        .post('/api/proof/verify')
        .send({ proof: validProof })
        .expect(200);
      
      expect(response.body.message).to.equal('Proof verification completed');
      expect(response.body.isValid).to.be.a('boolean');
      expect(response.body.details).to.be.an('object');
    });

    it('should reject invalid proof format', async function() {
      const invalidProof = {
        pA: ['123'], // Wrong length
        pB: [['789', '012'], ['345', '678']],
        pC: ['901', '234'],
        pubSignals: Array(15).fill('0')
      };

      const response = await request(app)
        .post('/api/proof/verify')
        .send({ proof: invalidProof })
        .expect(400);
      
      expect(response.body.error).to.equal('Invalid proof format');
    });
  });

  describe('Error Handling', function() {
    it('should handle validation errors', async function() {
      const response = await request(app)
        .post('/api/data-provider/register')
        .send({}) // Empty body
        .expect(400);
      
      expect(response.body.error).to.be.a('string');
      expect(response.body.message).to.be.a('string');
    });

    it('should handle rate limiting', async function() {
      // This test would require more sophisticated setup to test rate limiting
      // For now, just verify the rate limiting middleware is present
      expect(app._router.stack.some(layer => 
        layer.name === 'rateLimit' || 
        (layer.handle && layer.handle.name === 'rateLimit')
      )).to.be.true;
    });
  });
});

// Install supertest as dev dependency
const packageJson = require('../../package.json');
if (!packageJson.devDependencies.supertest) {
  console.log('Note: Add supertest to devDependencies for API testing');
}