# PolicyPrivacy API Documentation

## Overview

The PolicyPrivacy API provides a REST interface for privacy-preserving consent management using zero-knowledge proofs. The API enables data providers to publish data with privacy policies and data requesters to access data by proving policy satisfaction without revealing their attributes.

## Base URL
```
http://localhost:3000
```

## Authentication

The API supports multiple authentication methods:

1. **API Key**: Include `X-API-Key` header
2. **Bearer Token**: Include `Authorization: Bearer <token>` header  
3. **Address-based**: Include Ethereum address in request body (for demo)

For production use, implement proper JWT authentication and signature verification.

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": "Additional error details (optional)"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created successfully
- `400`: Bad request (validation error)
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not found
- `429`: Rate limit exceeded
- `500`: Internal server error

## Data Provider Endpoints

### Register Data Provider

Register a new data provider in the system.

**POST** `/api/data-provider/register`

**Request Body:**
```json
{
  "address": "0x1234567890123456789012345678901234567890",
  "metadata": {
    "name": "Healthcare Provider ABC",
    "description": "Primary care medical records",
    "contact": "admin@healthcare-abc.com"
  }
}
```

**Response:**
```json
{
  "message": "Data provider registered successfully",
  "providerId": "uuid-string",
  "address": "0x1234567890123456789012345678901234567890",
  "status": "active"
}
```

### Publish Data with Policy

Publish new data with an associated privacy policy commitment.

**POST** `/api/data-provider/publish`

**Request Body:**
```json
{
  "providerAddress": "0x1234567890123456789012345678901234567890",
  "dataHash": "0xabcdef...",
  "policyCommitment": "12345678901234567890",
  "metadataURI": "ipfs://QmHash...",
  "dataLocation": "ipfs://QmDataHash...",
  "description": "Patient medical records dataset"
}
```

**Response:**
```json
{
  "message": "Data published successfully",
  "dataId": "uuid-string",
  "policyId": "1",
  "transactionHash": "0xabcdef...",
  "gasUsed": "182456",
  "data": {
    "id": "uuid-string",
    "policyId": "1",
    "status": "active",
    "publishedAt": "2024-01-15T10:30:00Z"
  }
}
```

### List Published Data

Get published data for a specific provider.

**GET** `/api/data-provider/data?providerAddress=0x123...&status=active&limit=10&offset=0`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-string",
      "providerAddress": "0x123...",
      "dataHash": "0xabcdef...",
      "policyId": "1",
      "policyCommitment": "12345678901234567890",
      "metadataURI": "ipfs://QmHash...",
      "dataLocation": "ipfs://QmDataHash...",
      "description": "Patient medical records",
      "publishedAt": "2024-01-15T10:30:00Z",
      "status": "active",
      "accessRequests": [],
      "transactionHash": "0xabcdef..."
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 25
  }
}
```

### Get Data Details

Get details for a specific published dataset.

**GET** `/api/data-provider/data/:id`

**Response:**
```json
{
  "id": "uuid-string",
  "providerAddress": "0x123...",
  "dataHash": "0xabcdef...",
  "policyId": "1",
  "policyCommitment": "12345678901234567890",
  "metadataURI": "ipfs://QmHash...",
  "dataLocation": "ipfs://QmDataHash...",
  "description": "Patient medical records",
  "publishedAt": "2024-01-15T10:30:00Z",
  "status": "active",
  "accessRequests": [],
  "transactionHash": "0xabcdef...",
  "policyDetails": {
    "dataSubject": "0x123...",
    "commitment": "12345678901234567890",
    "isActive": true,
    "timestamp": "2024-01-15T10:30:00Z",
    "metadataURI": "ipfs://QmHash..."
  }
}
```

### Update Data

Update metadata for published data.

**PUT** `/api/data-provider/data/:id`

**Request Body:**
```json
{
  "description": "Updated description",
  "dataLocation": "ipfs://QmNewDataHash...",
  "metadataURI": "ipfs://QmNewMetadataHash..."
}
```

### Deactivate Data

Mark published data as inactive.

**DELETE** `/api/data-provider/data/:id`

**Response:**
```json
{
  "message": "Data deactivated successfully",
  "dataId": "uuid-string",
  "status": "inactive"
}
```

### Provider Statistics

Get statistics for a data provider.

**GET** `/api/data-provider/stats/:address`

**Response:**
```json
{
  "totalDatasets": 15,
  "activeDatasets": 12,
  "totalAccessRequests": 47,
  "registeredAt": "2024-01-10T08:00:00Z"
}
```

## Data Requester Endpoints

### Register Data Requester

Register a new data requester in the system.

**POST** `/api/data-requester/register`

**Request Body:**
```json
{
  "address": "0x9876543210987654321098765432109876543210",
  "metadata": {
    "name": "Research Institute XYZ",
    "description": "Medical research organization",
    "contact": "research@institute-xyz.org"
  }
}
```

**Response:**
```json
{
  "message": "Data requester registered successfully",
  "requesterId": "uuid-string",
  "address": "0x9876543210987654321098765432109876543210",
  "status": "active"
}
```

### Request Data Access

Submit a zero-knowledge proof to request access to protected data.

**POST** `/api/data-requester/request`

**Request Body:**
```json
{
  "requesterAddress": "0x9876543210987654321098765432109876543210",
  "policyId": 1,
  "proof": {
    "pA": ["123...", "456..."],
    "pB": [["789...", "012..."], ["345...", "678..."]],
    "pC": ["901...", "234..."],
    "pubSignals": ["1", "12345678901234567890", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"]
  },
  "attributes": {
    "role": "researcher",
    "institution": "Institute XYZ"
  },
  "purpose": "Medical research study on cardiovascular diseases"
}
```

**Response:**
```json
{
  "message": "Access request granted",
  "accessRequestId": "uuid-string", 
  "contractRequestId": "1",
  "status": "granted",
  "transactionHash": "0xabcdef...",
  "gasUsed": "145234",
  "canAccessData": true
}
```

### List Access Requests

Get access requests for a specific requester.

**GET** `/api/data-requester/requests?requesterAddress=0x987...&status=granted&limit=10&offset=0`

**Response:**
```json
{
  "requests": [
    {
      "id": "uuid-string",
      "contractRequestId": "1",
      "requesterAddress": "0x987...",
      "policyId": "1",
      "proof": { "pA": [...], "pB": [...], "pC": [...], "pubSignals": [...] },
      "attributes": {"role": "researcher"},
      "purpose": "Medical research",
      "requestedAt": "2024-01-15T11:00:00Z",
      "status": "granted",
      "transactionHash": "0xabcdef...",
      "gasUsed": "145234"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 5
  }
}
```

### Get Request Details

Get details for a specific access request.

**GET** `/api/data-requester/requests/:id`

**Response:**
```json
{
  "id": "uuid-string",
  "contractRequestId": "1",
  "requesterAddress": "0x987...",
  "policyId": "1", 
  "proof": { "pA": [...], "pB": [...], "pC": [...], "pubSignals": [...] },
  "attributes": {"role": "researcher"},
  "purpose": "Medical research",
  "requestedAt": "2024-01-15T11:00:00Z",
  "status": "granted",
  "transactionHash": "0xabcdef...",
  "gasUsed": "145234",
  "contractDetails": {
    "requester": "0x987...",
    "policyId": "1",
    "timestamp": "2024-01-15T11:00:00Z",
    "isProcessed": true,
    "isGranted": true
  }
}
```

### Requester Statistics

Get statistics for a data requester.

**GET** `/api/data-requester/stats/:address`

**Response:**
```json
{
  "totalRequests": 8,
  "grantedRequests": 6,
  "deniedRequests": 2,
  "successRate": "75.00%",
  "registeredAt": "2024-01-12T14:30:00Z"
}
```

### Validate Attributes

Validate requester attributes before generating proof.

**POST** `/api/data-requester/validate-attributes`

**Request Body:**
```json
{
  "attributes": {
    "role": "researcher",
    "institution": "Institute XYZ",
    "clearance": "level2"
  },
  "requiredAttributes": ["role", "institution", "clearance"]
}
```

**Response:**
```json
{
  "message": "Attribute validation completed",
  "validation": {
    "isValid": true,
    "missingAttributes": [],
    "providedAttributes": ["role", "institution", "clearance"],
    "validationResults": {
      "role": true,
      "institution": true, 
      "clearance": true
    }
  }
}
```

## Policy Management Endpoints

### Commit Policy

Commit a new privacy policy to the smart contract.

**POST** `/api/policy/commit`

**Request Body:**
```json
{
  "dataSubjectAddress": "0x1234567890123456789012345678901234567890",
  "policyCommitment": "12345678901234567890",
  "metadataURI": "ipfs://QmPolicyMetadata..."
}
```

**Response:**
```json
{
  "message": "Policy committed successfully",
  "policyId": "1",
  "commitment": "12345678901234567890",
  "transactionHash": "0xabcdef...",
  "gasUsed": "187923"
}
```

### Get Policy Details

Get details for a specific policy.

**GET** `/api/policy/:id`

**Response:**
```json
{
  "policyId": "1",
  "dataSubject": "0x123...",
  "commitment": "12345678901234567890",
  "isActive": true,
  "timestamp": "2024-01-15T10:30:00Z",
  "metadataURI": "ipfs://QmPolicyMetadata..."
}
```

### Revoke Policy

Revoke an existing policy.

**POST** `/api/policy/:id/revoke`

**Request Body:**
```json
{
  "dataSubjectAddress": "0x1234567890123456789012345678901234567890"
}
```

**Response:**
```json
{
  "message": "Policy revoked successfully",
  "policyId": "1",
  "transactionHash": "0xabcdef...",
  "gasUsed": "45234"
}
```

### List Subject Policies

Get all policies for a data subject.

**GET** `/api/policy/subject/:address?status=active&limit=10&offset=0`

**Response:**
```json
{
  "policies": [
    {
      "policyId": "1",
      "dataSubject": "0x123...",
      "commitment": "12345678901234567890",
      "isActive": true,
      "timestamp": "2024-01-15T10:30:00Z",
      "metadataURI": "ipfs://QmPolicyMetadata..."
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 3
  }
}
```

### Get Policy Access Requests

Get access requests for a specific policy.

**GET** `/api/policy/:id/access-requests?limit=10&offset=0`

**Response:**
```json
{
  "accessRequests": [
    {
      "requestId": "1",
      "requester": "0x987...",
      "policyId": "1",
      "timestamp": "2024-01-15T11:00:00Z",
      "isProcessed": true,
      "isGranted": true
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 5
  }
}
```

## Zero-Knowledge Proof Endpoints

### Generate Proof

Generate a Groth16 zero-knowledge proof.

**POST** `/api/proof/generate`

**Request Body:**
```json
{
  "policy": [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
  "randomizer": "12345",
  "requesterAttrs": [1, 1, 0],
  "merkleProofs": {
    "roots": ["0", "0", "0", "0", "0", "0", "0", "0"],
    "pathElements": [["0", "0", "0", "0", "0", "0", "0", "0", "0", "0"]],
    "pathIndices": [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]
  },
  "credentials": {
    "messages": ["0", "0", "0"],
    "signatures": [["0", "0"], ["0", "0"], ["0", "0"]],
    "pubKeys": [["0", "0"], ["0", "0"], ["0", "0"]]
  },
  "rangeProofs": {
    "values": ["25", "35", "0"],
    "bounds": [["18", "65"], ["30", "50"], ["0", "100"]]
  }
}
```

**Response:**
```json
{
  "message": "Proof generated successfully",
  "proof": {
    "pA": ["123...", "456..."],
    "pB": [["789...", "012..."], ["345...", "678..."]],
    "pC": ["901...", "234..."],
    "pubSignals": ["1", "12345678901234567890", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"]
  },
  "metadata": {
    "policyCommitment": "12345678901234567890",
    "generationTimeMs": 4532,
    "circuitParameters": {
      "N": 3,
      "M": 2,
      "DEPTH": 10,
      "K": 3,
      "MERKLE_LEVELS": 8,
      "RANGE_BITS": 32
    }
  }
}
```

### Verify Proof

Verify a Groth16 zero-knowledge proof.

**POST** `/api/proof/verify`

**Request Body:**
```json
{
  "proof": {
    "pA": ["123...", "456..."],
    "pB": [["789...", "012..."], ["345...", "678..."]],
    "pC": ["901...", "234..."],
    "pubSignals": ["1", "12345678901234567890", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"]
  },
  "expectedPolicyCommitment": "12345678901234567890"
}
```

**Response:**
```json
{
  "message": "Proof verification completed",
  "isValid": true,
  "isAuthorized": true,
  "commitmentMatch": true,
  "details": {
    "policyCommitment": "12345678901234567890",
    "expectedPolicyCommitment": "12345678901234567890",
    "pubSignals": {
      "isAuthorized": "1",
      "policyCommitment": "12345678901234567890",
      "merkleRoots": ["0", "0", "0", "0", "0", "0", "0", "0"],
      "other": ["0", "0", "0", "0", "0"]
    }
  }
}
```

### Calculate Policy Commitment

Calculate a policy commitment hash.

**POST** `/api/proof/policy-commitment`

**Request Body:**
```json
{
  "policy": [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
  "randomizer": "12345"
}
```

**Response:**
```json
{
  "message": "Policy commitment calculated",
  "commitment": "12345678901234567890",
  "policy": [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
  "randomizer": "12345"
}
```

### Get Circuit Information

Get information about the zero-knowledge circuit.

**GET** `/api/proof/circuit-info`

**Response:**
```json
{
  "circuit": "PolicyPrivacyMain",
  "parameters": {
    "N": 3,
    "M": 2,
    "DEPTH": 10,
    "K": 3,
    "MERKLE_LEVELS": 8,
    "RANGE_BITS": 32
  },
  "proofSystem": "Groth16",
  "publicSignals": {
    "0": "isAuthorized",
    "1": "policyCommitment",
    "2-9": "merkleRoots[8]",
    "10-14": "additionalOutputs[5]"
  },
  "description": "Zero-knowledge proof system for privacy-preserving consent management",
  "setupFiles": {
    "wasmPath": "build/circuits/policy_privacy_main_js/policy_privacy_main.wasm",
    "zkeyPath": "build/circuits/policy_privacy_main_final.zkey"
  }
}
```

## Utility Endpoints

### Health Check

Check API and smart contract connectivity.

**GET** `/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "contract": "connected"
}
```

### API Documentation

Get complete API documentation.

**GET** `/api/docs`

Returns OpenAPI 3.0 specification for the API.

## Rate Limiting

- 100 requests per 15-minute window per IP address
- Higher limits available with API key authentication

## Examples

### Complete Flow Example

1. **Register Data Provider**:
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

2. **Commit Policy**:
```bash
curl -X POST http://localhost:3000/api/policy/commit \
  -H "Content-Type: application/json" \
  -d '{
    "dataSubjectAddress": "0x1234567890123456789012345678901234567890",
    "policyCommitment": "12345678901234567890",
    "metadataURI": "ipfs://QmPolicy..."
  }'
```

3. **Publish Data**:
```bash
curl -X POST http://localhost:3000/api/data-provider/publish \
  -H "Content-Type: application/json" \
  -d '{
    "providerAddress": "0x1234567890123456789012345678901234567890",
    "dataHash": "0xabcdef...",
    "policyCommitment": "12345678901234567890",
    "metadataURI": "ipfs://QmData...",
    "description": "Patient records"
  }'
```

4. **Register Data Requester**:
```bash
curl -X POST http://localhost:3000/api/data-requester/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x9876543210987654321098765432109876543210",
    "metadata": {
      "name": "Research Institute",
      "description": "Medical research"
    }
  }'
```

5. **Generate Proof**:
```bash
curl -X POST http://localhost:3000/api/proof/generate \
  -H "Content-Type: application/json" \
  -d '{
    "policy": [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
    "randomizer": "12345",
    "requesterAttrs": [1, 1, 0]
  }'
```

6. **Request Access**:
```bash
curl -X POST http://localhost:3000/api/data-requester/request \
  -H "Content-Type: application/json" \
  -d '{
    "requesterAddress": "0x9876543210987654321098765432109876543210",
    "policyId": 1,
    "proof": { /* proof from step 5 */ },
    "purpose": "Medical research"
  }'
```

## Environment Variables

Set these environment variables for production:

```bash
NODE_ENV=production
PORT=3000
BLOCKCHAIN_NODE_URL=http://localhost:8545
CONTRACT_ADDRESS=0x...
PRIVATE_KEY=0x...
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
API_KEY_SECRET=your-secret-key
JWT_SECRET=your-jwt-secret
```

## Development

### Start API Server
```bash
npm run api:start
```

### Development Mode with Auto-reload
```bash
npm run api:dev
```

### Run API Tests
```bash
npm run api:test
```

## Security Considerations

1. **Authentication**: Implement proper JWT tokens and signature verification
2. **Rate Limiting**: Configure appropriate limits for production
3. **Input Validation**: All inputs are validated and sanitized
4. **CORS**: Configure CORS for your specific domains
5. **HTTPS**: Use HTTPS in production
6. **Private Keys**: Use environment variables and secure key management
7. **Database**: Replace in-memory storage with secure database
8. **Logging**: Implement comprehensive logging and monitoring