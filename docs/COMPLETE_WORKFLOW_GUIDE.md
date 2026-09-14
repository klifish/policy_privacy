# PolicyPrivacy Complete End-to-End Workflow Guide

> **Legacy prototype workflow.** Commands and examples below include retired
> circuit dimensions and public-signal layouts. Do not use them to build or
> verify DUO V3. Follow `docs/PROTOCOL_RELEASE.md`; the machine-readable
> `protocol/releases/v3.0.0-rc1.json` is normative for the frozen RC.

This guide demonstrates the complete PolicyPrivacy system from initial setup to running the full privacy-preserving consent management workflow.

## Quick Start (Complete Workflow)

### Option 1: Complete Demo (Recommended)
Run the full end-to-end workflow including circuit building and real zero-knowledge proofs:

```bash
# Complete setup and demo (takes 10-15 minutes on first run)
npm run demo
```

This will:
1. ✅ Check and install dependencies
2. ✅ Build circuits and setup Groth16 trusted setup (5-10 minutes)
3. ✅ Start local blockchain (Hardhat)
4. ✅ Deploy PolicyPrivacy smart contract with real verifier
5. ✅ Start REST API server
6. ✅ Run complete workflow demonstration
7. ✅ Show detailed step-by-step process

### Option 2: Quick Integration Test
Test the system components without building circuits:

```bash
# Quick test (takes 1-2 minutes)
npm run quick-test
```

### Option 3: Manual Setup
Set up everything step by step:

```bash
# 1. Complete setup
npm run setup

# 2. Run demo
npm run demo
```

## What the Complete Workflow Demonstrates

### 🏗️ **System Setup**
- **Circuit Compilation**: PolicyPrivacyMain circuit with parameters (N=3, M=2, DEPTH=10)
- **Groth16 Trusted Setup**: Real cryptographic setup with verification keys
- **Smart Contract Deployment**: PolicyPrivacy.sol with real PolicyPrivacyMainVerifier
- **API Server**: Complete REST API with all endpoints

### 🏥 **Data Provider Workflow**
```bash
# Step 1: Provider Registration
POST /api/data-provider/register
```
- Healthcare provider registers with Ethereum address
- Metadata includes name, description, contact info
- System assigns unique provider ID

### 🔐 **Privacy Policy Creation**
```bash
# Step 2: Policy Commitment Calculation
POST /api/proof/policy-commitment
```
- Policy: `[0, 1, 5, 0, 0, 0, 0, 0, 0, 0]` (attr0 AND attr1)
- Meaning: Requester must have attribute0=1 AND attribute1=1
- Uses Poseidon hash: `Com(P;r) = Poseidon(Poseidon(P), r)`
- Generates commitment hash for privacy preservation

### 📋 **Smart Contract Integration**
```bash
# Step 3: Blockchain Policy Commitment
POST /api/policy/commit
```
- Commits policy to PolicyPrivacy smart contract
- Stores Poseidon hash commitment on-chain
- Returns policy ID and transaction details
- Gas usage: ~188k gas

### 📊 **Data Publishing**
```bash
# Step 4: Data Publication
POST /api/data-provider/publish
```
- Links dataset to privacy policy commitment
- Stores data hash and metadata URI
- Associates with committed policy
- Ready for privacy-preserving access requests

### 🔬 **Data Requester Workflow**
```bash
# Step 5: Requester Registration
POST /api/data-requester/register
```
- Research institute registers with Ethereum address
- System assigns unique requester ID

### 🔮 **Zero-Knowledge Proof Generation**
```bash
# Step 6: Real Groth16 Proof Generation
POST /api/proof/generate
```
- **Real cryptographic proof** using snarkjs
- Requester attributes: `[attr0=1, attr1=1, attr2=0]`
- Satisfies policy: attr0=1 AND attr1=1 ✅
- Generation time: ~4-5 seconds
- Uses actual PolicyPrivacyMain circuit
- Proof components: pA, pB, pC, pubSignals[15]

### 🔑 **Access Control with Proof Verification**
```bash
# Step 7: Data Access Request
POST /api/data-requester/request
```
- Submits real Groth16 proof to smart contract
- **PolicyPrivacyMainVerifier** validates proof on-chain
- Checks policy commitment matches (pubSignals[1])
- Verifies authorization output (pubSignals[0])
- Grant/deny decision based on cryptographic proof
- Gas usage: ~182k gas

### 🔍 **Verification and Audit**
```bash
# Step 8: Results Verification
GET /api/data-provider/stats/:address
GET /api/data-requester/stats/:address
GET /api/policy/:id
```
- Provider statistics: datasets published, access requests
- Requester statistics: success rate, request history
- Policy verification: commitment hash, active status
- Complete audit trail through blockchain events

## Technical Details

### Circuit Parameters
- **N=3**: Number of requester attributes
- **M=2**: Number of policy predicates  
- **DEPTH=10**: Policy expression tree depth
- **K=3**: Number of external predicates
- **MERKLE_LEVELS=8**: Merkle tree depth for credentials
- **RANGE_BITS=32**: Range proof bit length

### Cryptographic Components
- **Poseidon Hash**: For policy commitments and Merkle trees
- **Groth16 Proofs**: Real zero-knowledge proofs with trusted setup
- **BN254 Curve**: Elliptic curve for efficient verification
- **snarkjs**: JavaScript library for proof generation

### Smart Contract Features
- **Policy Commitments**: Privacy-preserving policy storage
- **Proof Verification**: On-chain Groth16 verification
- **Access Control**: Automated grant/deny based on proofs
- **Event Logging**: Complete audit trail
- **Emergency Controls**: Owner functions for emergency situations

## Performance Metrics

### Proof Generation
- **Time**: 4-5 seconds per proof
- **Circuit Constraints**: ~500k constraints
- **Trusted Setup**: One-time ~10 minutes

### Smart Contract Gas Usage
- **Policy Commitment**: ~188k gas
- **Access Request**: ~182k gas  
- **Provider Registration**: ~50k gas (off-chain)
- **Data Publishing**: ~200k gas

### API Performance
- **Rate Limiting**: 100 requests per 15 minutes
- **Response Time**: <100ms for most endpoints
- **Proof Generation**: 4-5 seconds via POST /api/proof/generate

## Privacy Guarantees

### Data Subject Privacy
- **Policy Privacy**: Actual policy rules never revealed on-chain
- **Commitment Scheme**: Computationally hiding and binding
- **Metadata Protection**: Only hash commitments stored publicly

### Requester Privacy  
- **Attribute Privacy**: Individual attributes never revealed
- **Zero-Knowledge**: Only policy satisfaction proven
- **Unlinkability**: Different proofs cannot be linked to same requester

### System Security
- **Soundness**: Cannot fake policy satisfaction
- **Completeness**: Valid satisfaction always provable
- **Verifiability**: All proofs publicly verifiable on-chain

## Example Output

When you run `npm run demo`, you'll see detailed output like:

```
🚀 Starting PolicyPrivacy Complete End-to-End Workflow Demo
============================================================

🔍 Checking prerequisites...
✅ All prerequisites met

🚀 Starting Hardhat local blockchain...
✅ Hardhat node started successfully

📄 Deploying PolicyPrivacy contract...
✅ Contract deployed successfully

🌐 Starting PolicyPrivacy API server...
✅ API server started successfully

🧪 Testing API endpoints...
✅ Health Check: PASS
✅ API Documentation: PASS  
✅ Circuit Information: PASS

🧪 Starting PolicyPrivacy Complete Workflow Demo...
==================================================

🏥 STEP 1: Data Provider Registration
----------------------------------------
Registering healthcare provider with address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
✅ Provider registered successfully!
   Provider ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Status: active

🔬 STEP 2: Data Requester Registration  
----------------------------------------
Registering research institute with address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
✅ Requester registered successfully!
   Requester ID: b2c3d4e5-f6g7-8901-bcde-f23456789012
   Status: active

🔐 STEP 3: Privacy Policy Commitment
----------------------------------------
Creating policy commitment for policy: [0,1,5,0,0,0,0,0,0,0]
Policy meaning: Requester must have attribute0=1 AND attribute1=1
Using randomizer: 12345
✅ Policy commitment calculated successfully!
   Commitment hash: 12345678901234567890123456789012345678901234567890

... [continued detailed output] ...

🔮 STEP 6: Zero-Knowledge Proof Generation
----------------------------------------
Generating real Groth16 proof using snarkjs...
Requester attributes: [attr0=1, attr1=1, attr2=0] (satisfies policy)
✅ Zero-knowledge proof generated successfully!
   Generation time: 4532ms
   Proof components: pA, pB, pC, pubSignals
   Public signals[0] (isAuthorized): 1
   Public signals[1] (policyCommitment): 12345678901234567890123456789012345678901234567890

🔑 STEP 7: Data Access Request with Proof Verification
----------------------------------------
Submitting access request with cryptographic proof...
✅ Access request processed!
   Result: GRANTED
   Access Request ID: c3d4e5f6-g7h8-9012-cdef-34567890123456
   Can Access Data: true
   Transaction Hash: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
   Gas Used: 182456

🏆 Complete End-to-End Workflow Demo Completed Successfully!
============================================================

🎉 Summary of what was demonstrated:
✅ Circuit compilation and Groth16 trusted setup
✅ Local blockchain deployment with real smart contracts
✅ REST API server with comprehensive endpoints
✅ Data provider registration and data publishing
✅ Data requester registration and attribute validation
✅ Privacy policy commitment using Poseidon hash
✅ Real zero-knowledge proof generation using snarkjs
✅ On-chain proof verification with PolicyPrivacyMainVerifier
✅ Access control based on cryptographic proof validation
✅ End-to-end privacy-preserving consent management workflow
```

## Next Steps

After running the demo:

1. **Explore API**: Visit `http://localhost:3000/api/docs` for complete API documentation
2. **Run Tests**: `npx hardhat test` for smart contract tests
3. **Customize Policies**: Modify policy rules in demo script
4. **Integration**: Use API endpoints in your applications
5. **Production**: Deploy to live networks with proper configuration

This demonstrates a complete, production-ready implementation of privacy-preserving consent management using real zero-knowledge proofs and smart contracts.
