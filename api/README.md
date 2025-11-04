# PolicyPrivacy API

A comprehensive REST API for privacy-preserving consent management using zero-knowledge proofs. This API provides endpoints for data providers to publish data with privacy policies and for data requesters to access data by proving policy satisfaction without revealing their attributes.

## Features

- **Data Provider Management**: Register providers, publish datasets with privacy policies
- **Data Requester Management**: Register requesters, submit access requests with ZK proofs
- **Policy Management**: Commit privacy policies, revoke policies, query policy details
- **Zero-Knowledge Proofs**: Generate and verify Groth16 proofs using real cryptographic circuits
- **Smart Contract Integration**: Full integration with PolicyPrivacy smart contract on Ethereum
- **Comprehensive API**: RESTful endpoints with OpenAPI documentation
- **Security**: Rate limiting, input validation, authentication middleware
- **Real-time**: Event-driven architecture with blockchain integration

## Quick Start

### Prerequisites

1. Node.js 16+ installed
2. Hardhat blockchain running locally
3. PolicyPrivacy smart contract deployed
4. Circuit artifacts built (`npm run build:circuit:full`)

### Installation

```bash
# Install dependencies
npm install

# Build circuits (required for proof generation)
npm run build:circuit:full

# Deploy smart contract (if not already deployed)
npx hardhat run scripts/deploy.js
```

### Start API Server

```bash
# Production mode
npm run api:start

# Development mode with auto-reload
npm run api:dev
```

The API will start on `http://localhost:3000`

### Environment Setup

Create a `.env` file:

```bash
NODE_ENV=development
PORT=3000
BLOCKCHAIN_NODE_URL=http://localhost:8545
PRIVATE_KEY=0x...  # For contract interactions
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## API Endpoints

### Core Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `GET /api/docs` - Complete API documentation

### Data Provider

- `POST /api/data-provider/register` - Register provider
- `POST /api/data-provider/publish` - Publish data with policy
- `GET /api/data-provider/data` - List published data
- `GET /api/data-provider/data/:id` - Get data details
- `PUT /api/data-provider/data/:id` - Update data
- `DELETE /api/data-provider/data/:id` - Deactivate data
- `GET /api/data-provider/stats/:address` - Provider statistics

### Data Requester

- `POST /api/data-requester/register` - Register requester
- `POST /api/data-requester/request` - Request data access with ZK proof
- `GET /api/data-requester/requests` - List access requests
- `GET /api/data-requester/requests/:id` - Get request details
- `GET /api/data-requester/stats/:address` - Requester statistics
- `POST /api/data-requester/validate-attributes` - Validate attributes

### Policy Management

- `POST /api/policy/commit` - Commit privacy policy
- `GET /api/policy/:id` - Get policy details
- `POST /api/policy/:id/revoke` - Revoke policy
- `GET /api/policy/subject/:address` - List subject policies
- `GET /api/policy/:id/access-requests` - Policy access requests

### Zero-Knowledge Proofs

- `POST /api/proof/generate` - Generate Groth16 proof
- `POST /api/proof/verify` - Verify Groth16 proof
- `POST /api/proof/policy-commitment` - Calculate policy commitment
- `GET /api/proof/circuit-info` - Circuit information

## Usage Examples

### Complete Workflow

1. **Register Data Provider**
```bash
curl -X POST http://localhost:3000/api/data-provider/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x1234567890123456789012345678901234567890",
    "metadata": {
      "name": "Hospital ABC",
      "description": "Medical records provider"
    }
  }'
```

2. **Commit Privacy Policy**
```bash
curl -X POST http://localhost:3000/api/policy/commit \
  -H "Content-Type: application/json" \
  -d '{
    "dataSubjectAddress": "0x1234567890123456789012345678901234567890",
    "policyCommitment": "12345678901234567890",
    "metadataURI": "ipfs://QmPolicy..."
  }'
```

3. **Publish Data**
```bash
curl -X POST http://localhost:3000/api/data-provider/publish \
  -H "Content-Type: application/json" \
  -d '{
    "providerAddress": "0x1234567890123456789012345678901234567890",
    "dataHash": "0xabcdef...",
    "policyCommitment": "12345678901234567890",
    "metadataURI": "ipfs://QmData...",
    "description": "Patient medical records"
  }'
```

4. **Register Data Requester**
```bash
curl -X POST http://localhost:3000/api/data-requester/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x9876543210987654321098765432109876543210",
    "metadata": {
      "name": "Research Institute",
      "description": "Medical research organization"
    }
  }'
```

5. **Generate Zero-Knowledge Proof**
```bash
curl -X POST http://localhost:3000/api/proof/generate \
  -H "Content-Type: application/json" \
  -d '{
    "policy": [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
    "randomizer": "12345",
    "requesterAttrs": [1, 1, 0]
  }'
```

6. **Request Data Access**
```bash
curl -X POST http://localhost:3000/api/data-requester/request \
  -H "Content-Type: application/json" \
  -d '{
    "requesterAddress": "0x9876543210987654321098765432109876543210",
    "policyId": 1,
    "proof": {
      "pA": ["123...", "456..."],
      "pB": [["789...", "012..."], ["345...", "678..."]],
      "pC": ["901...", "234..."],
      "pubSignals": [
        "1",
        "12345678901234567890",
        "0",
        "0", "0", "0", "0", "0",
        "0", "0", "0", "0", "0",
        "0", "0", "0", "0", "0",
        "100", "100", "100", "100", "100",
        "0", "0", "0", "0", "0",
        "0", "0", "0", "0", "0"
      ]
    },
    "purpose": "Medical research study"
  }'
```

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Provider │    │      API        │    │ Data Requester  │
│                 │    │                 │    │                 │
│ - Register      │◄──►│ - REST Routes   │◄──►│ - Register      │
│ - Publish Data  │    │ - Validation    │    │ - Generate ZK   │
│ - Manage Policy │    │ - Auth/Rate     │    │ - Request Access│
└─────────────────┘    │ - Error Handle  │    └─────────────────┘
                       └─────────────────┘
                               │
                       ┌─────────────────┐
                       │  Smart Contract │
                       │                 │
                       │ - PolicyPrivacy │
                       │ - Groth16 Verif │
                       │ - Events        │
                       └─────────────────┘
                               │
                       ┌─────────────────┐
                       │   Blockchain    │
                       │                 │
                       │ - Ethereum      │
                       │ - Hardhat       │
                       │ - Local Node    │
                       └─────────────────┘
```

### Data Flow

1. **Data Provider** registers and publishes data with privacy policy commitments
2. **API** validates requests and interacts with smart contract
3. **Smart Contract** stores policy commitments and verifies proofs
4. **Data Requester** generates ZK proofs and submits access requests
5. **Blockchain** provides immutable audit trail and proof verification

## Technical Details

### Zero-Knowledge Proof System

- **Circuit**: PolicyPrivacyMain with parameters (N=3, M=2, DEPTH=10, K=3, MERKLE_LEVELS=8, RANGE_BITS=32)
- **Proof System**: Groth16 with trusted setup
- **Public Signals**: 33 signals including isAuthorized, policyCommitment, paramsCommitment, merkle roots, credential keys, range bounds, ontology metadata
- **Generation Time**: ~4-5 seconds per proof
- **Verification**: On-chain using PolicyPrivacyMainVerifier.sol

### Smart Contract Integration

- **Contract**: PolicyPrivacy.sol with real Groth16 verifier
- **Policy Storage**: Poseidon hash commitments with metadata URIs
- **Access Control**: Proof-based authorization with circuit validation
- **Events**: Comprehensive event logging for audit trails
- **Gas Usage**: ~188k gas for policy commitment, ~182k gas for access requests

### Security Features

- **Input Validation**: Comprehensive validation middleware
- **Rate Limiting**: 100 requests per 15-minute window
- **Authentication**: API key, bearer token, and address-based auth
- **CORS**: Configurable cross-origin resource sharing
- **Error Handling**: Structured error responses
- **Proof Validation**: Cryptographic proof verification

## Testing

### Run API Tests
```bash
# Install test dependencies
npm install

# Run API integration tests
npm run api:test

# Run all tests including smart contracts
npx hardhat test
```

### Test Coverage

- API endpoint validation
- Smart contract integration
- Proof generation and verification
- Error handling and edge cases
- Authentication and authorization
- Rate limiting

## Development

### Project Structure
```
api/
├── server.js              # Main API server
├── routes/                # API route handlers
│   ├── dataProvider.js    # Data provider endpoints
│   ├── dataRequester.js   # Data requester endpoints
│   ├── policy.js          # Policy management endpoints
│   └── proof.js           # Zero-knowledge proof endpoints
├── middleware/            # Custom middleware
│   ├── auth.js            # Authentication middleware
│   └── validation.js      # Input validation middleware
└── utils/                 # Utility functions
    └── proofUtils.js      # Proof handling utilities

docs/
└── API_DOCUMENTATION.md   # Complete API documentation

test/
└── api/
    └── api.test.js        # API integration tests
```

### Adding New Endpoints

1. Create route handler in appropriate `routes/` file
2. Add validation using `req.validate` helpers
3. Implement error handling with typed errors
4. Add tests in `test/api/`
5. Update API documentation

### Database Integration

Currently uses in-memory storage for demo. For production:

1. Replace Map storage with database (MongoDB, PostgreSQL)
2. Implement data persistence and migrations
3. Add database connection pooling
4. Update queries for production scalability

## Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=production
PORT=3000

# Blockchain Configuration
BLOCKCHAIN_NODE_URL=http://localhost:8545
CONTRACT_ADDRESS=0x...
PRIVATE_KEY=0x...

# Security Configuration
ALLOWED_ORIGINS=https://app.example.com
API_KEY_SECRET=your-secret-key
JWT_SECRET=your-jwt-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Production Deployment

1. **Environment Setup**:
   - Configure production blockchain node
   - Set up proper authentication
   - Enable HTTPS
   - Configure CORS for your domains

2. **Database**:
   - Replace in-memory storage
   - Set up connection pooling
   - Implement proper indexing

3. **Monitoring**:
   - Add comprehensive logging
   - Set up health checks
   - Monitor API performance
   - Track blockchain interactions

4. **Security**:
   - Implement JWT authentication
   - Use proper secret management
   - Set up API rate limiting
   - Enable request logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Update documentation
6. Submit a pull request

## License

This project is licensed under the ISC License.
