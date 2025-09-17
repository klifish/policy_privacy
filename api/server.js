const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Import route handlers
const dataProviderRoutes = require('./routes/dataProvider');
const dataRequesterRoutes = require('./routes/dataRequester');
const policyRoutes = require('./routes/policy');
const proofRoutes = require('./routes/proof');

// Import middleware
const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');

class PolicyPrivacyAPI {
  constructor(config = {}) {
    this.app = express();
    this.config = {
      port: config.port || 3000,
      nodeUrl: config.nodeUrl || 'http://localhost:8545',
      contractAddress: config.contractAddress,
      ...config
    };

    this.contract = null;
    this.provider = null;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Custom middleware
    this.app.use('/api', authMiddleware);
    this.app.use('/api', validationMiddleware);

    // Inject contract instance into requests
    this.app.use((req, res, next) => {
      req.contract = this.contract;
      req.provider = this.provider;
      next();
    });
  }

  setupRoutes() {
    // API Documentation
    this.app.get('/', (req, res) => {
      res.json({
        name: 'PolicyPrivacy API',
        version: '1.0.0',
        description: 'Privacy-preserving consent management API using zero-knowledge proofs',
        endpoints: {
          'GET /api/docs': 'API documentation',
          'POST /api/data-provider/register': 'Register as data provider',
          'POST /api/data-provider/publish': 'Publish data with policy',
          'GET /api/data-provider/data': 'List published data',
          'PUT /api/data-provider/data/:id': 'Update data',
          'DELETE /api/data-provider/data/:id': 'Remove data',
          'POST /api/data-requester/register': 'Register as data requester',
          'POST /api/data-requester/request': 'Request data access',
          'GET /api/data-requester/requests': 'List access requests',
          'POST /api/policy/commit': 'Commit privacy policy',
          'GET /api/policy/:id': 'Get policy details',
          'POST /api/policy/:id/revoke': 'Revoke policy',
          'POST /api/proof/generate': 'Generate ZK proof',
          'POST /api/proof/verify': 'Verify ZK proof'
        }
      });
    });

    // API Routes
    this.app.use('/api/data-provider', dataProviderRoutes);
    this.app.use('/api/data-requester', dataRequesterRoutes);
    this.app.use('/api/policy', policyRoutes);
    this.app.use('/api/proof', proofRoutes);

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        contract: this.contract ? 'connected' : 'disconnected'
      });
    });

    // API Documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      const docs = this.generateAPIDocumentation();
      res.json(docs);
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `${req.method} ${req.originalUrl} is not a valid endpoint`
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('API Error:', err);

      if (err.type === 'validation') {
        return res.status(400).json({
          error: 'Validation error',
          message: err.message,
          details: err.details
        });
      }

      if (err.type === 'blockchain') {
        return res.status(500).json({
          error: 'Blockchain error',
          message: err.message
        });
      }

      if (err.type === 'proof') {
        return res.status(400).json({
          error: 'Proof error',
          message: err.message
        });
      }

      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });
  }

  async initializeBlockchain() {
    try {
      // Connect to blockchain
      this.provider = new ethers.JsonRpcProvider(this.config.nodeUrl);

      // Load contract address from deployment
      const deploymentPath = path.join(__dirname, '..', 'deployment.json');
      console.log('Loading contract address from deployment file:', deploymentPath);
      if (fs.existsSync(deploymentPath)) {
        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        this.config.contractAddress = deployment.contracts.PolicyPrivacy;
      }

      if (!this.config.contractAddress) {
        throw new Error('Contract address not provided and deployment.json not found');
      }

      // Load contract ABI
      const artifactPath = path.join(__dirname, '../artifacts/contracts/PolicyPrivacy.sol/PolicyPrivacy.json');
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

      // Initialize contract
      this.contract = new ethers.Contract(
        this.config.contractAddress,
        artifact.abi,
        this.provider
      );

      console.log(`Connected to PolicyPrivacy contract at: ${this.config.contractAddress}`);

      // Verify contract is accessible
      const nextPolicyId = await this.contract.nextPolicyId();
      console.log(`Contract verified. Next policy ID: ${nextPolicyId}`);

    } catch (error) {
      console.error('Failed to initialize blockchain connection:', error);
      throw error;
    }
  }

  generateAPIDocumentation() {
    return {
      openapi: '3.0.0',
      info: {
        title: 'PolicyPrivacy API',
        version: '1.0.0',
        description: 'REST API for privacy-preserving consent management using zero-knowledge proofs'
      },
      servers: [
        {
          url: `http://localhost:${this.config.port}`,
          description: 'Local development server'
        }
      ],
      paths: {
        '/api/data-provider/register': {
          post: {
            summary: 'Register as data provider',
            description: 'Register a new data provider in the system',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['address', 'metadata'],
                    properties: {
                      address: {
                        type: 'string',
                        description: 'Ethereum address of the data provider'
                      },
                      metadata: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          description: { type: 'string' },
                          contact: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            responses: {
              201: {
                description: 'Provider registered successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        providerId: { type: 'string' },
                        address: { type: 'string' },
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/data-provider/publish': {
          post: {
            summary: 'Publish data with privacy policy',
            description: 'Publish new data with an associated privacy policy commitment',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['dataHash', 'policyCommitment', 'metadataURI'],
                    properties: {
                      dataHash: {
                        type: 'string',
                        description: 'Hash of the data being published'
                      },
                      policyCommitment: {
                        type: 'string',
                        description: 'Poseidon hash commitment of the privacy policy'
                      },
                      metadataURI: {
                        type: 'string',
                        description: 'URI to metadata (IPFS hash, etc.)'
                      },
                      dataLocation: {
                        type: 'string',
                        description: 'Location where data is stored'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              201: {
                description: 'Data published successfully'
              }
            }
          }
        },
        '/api/data-requester/request': {
          post: {
            summary: 'Request access to data',
            description: 'Submit a zero-knowledge proof to request access to protected data',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['policyId', 'proof'],
                    properties: {
                      policyId: {
                        type: 'number',
                        description: 'ID of the policy to satisfy'
                      },
                      proof: {
                        type: 'object',
                        properties: {
                          pA: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Groth16 proof component A'
                          },
                          pB: {
                            type: 'array',
                            items: {
                              type: 'array',
                              items: { type: 'string' }
                            },
                            description: 'Groth16 proof component B'
                          },
                          pC: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Groth16 proof component C'
                          },
                          pubSignals: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Public signals for proof verification'
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'Access request processed'
              }
            }
          }
        }
      }
    };
  }

  async start() {
    try {
      await this.initializeBlockchain();

      this.server = this.app.listen(this.config.port, () => {
        console.log(`PolicyPrivacy API server running on port ${this.config.port}`);
        console.log(`Health check: http://localhost:${this.config.port}/health`);
        console.log(`API docs: http://localhost:${this.config.port}/api/docs`);
      });

      return this.server;
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }
}

module.exports = PolicyPrivacyAPI;

// CLI usage
if (require.main === module) {
  const api = new PolicyPrivacyAPI();
  api.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await api.stop();
    process.exit(0);
  });
}