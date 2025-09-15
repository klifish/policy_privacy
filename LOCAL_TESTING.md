# Local Blockchain Testing for PolicyPrivacy

This guide explains how to test the PolicyPrivacy smart contracts locally using Hardhat.

## Overview

The PolicyPrivacy system implements a zero-knowledge approach for privacy-preserving consent management in healthcare blockchain systems. The smart contracts work alongside Circom zero-knowledge circuits to enable:

- **Private Policy Commitments**: Patients can commit to consent policies without revealing their contents
- **Zero-Knowledge Access Control**: Healthcare providers prove policy satisfaction without revealing their credentials
- **Verifiable External Predicates**: Integration with external systems (credentials, age verification, etc.)

## Smart Contracts

### Core Contracts

1. **PolicyPrivacy.sol** - Main contract for privacy-preserving consent management
2. **Commitment.sol** - Generic commitment verification contract  
3. **MockVerifier.sol** - Mock zero-knowledge proof verifier for testing
4. **CommitmentPlonkVerifier.sol** - Generated PLONK verifier from circuits

### Contract Features

- **Policy Commitment**: Poseidon hash-based commitments: `Com(P;r) = Poseidon(P || r)`
- **Access Requests**: Zero-knowledge proof verification for policy satisfaction
- **Policy Revocation**: Data subjects can revoke consent at any time
- **Emergency Controls**: Owner-controlled pause functionality
- **Event Tracking**: Complete audit trail of all consent operations

## Local Testing Setup

### Prerequisites

```bash
# Ensure Node.js dependencies are installed
npm install

# Verify Hardhat is working
npx hardhat --version
```

### Running Tests

#### 1. Smart Contract Unit Tests

```bash
# Run all smart contract tests
npx hardhat test

# Run specific test suites
npx hardhat test test/PolicyPrivacy.js
npx hardhat test test/PolicyPrivacyIntegration.js
npx hardhat test test/Commitment.js
npx hardhat test test/Lock.js
```

#### 2. Integration Tests with Circuits

```bash
# Test integration between contracts and circuit commitment calculations
npx hardhat test test/PolicyPrivacyIntegration.js

# These tests verify that JavaScript commitment calculations match
# what the Circom circuits would produce
```

### Local Deployment

#### 1. Quick Deployment

```bash
# Deploy all contracts to local Hardhat network
npx hardhat run scripts/deploy.js --network hardhat
```

This will:
- Deploy MockVerifier, PolicyPrivacy, and Commitment contracts
- Test basic functionality
- Save deployment addresses to `deployment.json`

#### 2. Persistent Local Node

```bash
# Start local Hardhat node (in separate terminal)
npx hardhat node

# Deploy to persistent local node (in another terminal)
npx hardhat run scripts/deploy.js --network localhost
```

## Test Scenarios

### Healthcare Consent Workflows

The test suite includes comprehensive healthcare scenarios:

#### 1. Medical Data Sharing
```javascript
// Patient commits policy: "Share with doctors AND in emergency"
const policyTokens = [DOCTOR_ATTR, EMERGENCY_ATTR, AND];
const commitment = calculateCommitment(policyTokens, randomizer);
await policyPrivacy.commitPolicy(commitment, metadataURI);

// Doctor proves policy satisfaction with ZK proof
await policyPrivacy.requestAccess(policyId, zkProof);
```

#### 2. Research Consent  
```javascript
// Complex policy: "Share for diabetes research IF (certified AND age >= 18)"
const researchPolicy = [RESEARCHER_CERT, AGE_CHECK, AND, STUDY_APPROVED, AND];
await policyPrivacy.commitPolicy(calculateCommitment(researchPolicy, r), uri);
```

#### 3. Multi-Party Access
- Emergency responders → Emergency medical data
- Regular doctors → Standard medical records  
- Researchers → Anonymized research data

### Zero-Knowledge Integration

#### Policy Commitment Calculation
```javascript
// JavaScript implementation matching Circom circuit
function calculatePolicyCommitment(policyTokens, randomizer) {
  const allInputs = policyTokens.concat([randomizer]);
  return poseidon(allInputs);
}
```

#### Proof Verification Flow
1. **Policy Commitment**: Patient commits `Com(P;r) = Poseidon(P || r)`
2. **Access Request**: Requester provides ZK proof proving policy satisfaction
3. **Verification**: Contract verifies proof against committed policy
4. **Access Decision**: Automated grant/deny based on proof validity

## Gas Usage Analysis

The test suite includes gas usage analysis:

- **Policy Commitment**: ~188,000 gas
- **Access Request**: ~181,000 gas
- **Policy Revocation**: ~45,000 gas

## Testing with Real ZK Circuits

To test with actual zero-knowledge circuits:

1. **Build Circuits**:
   ```bash
   npm run build:circuit
   ```

2. **Generate Proofs**:
   ```bash
   # The circuits will generate actual PLONK/Groth16 proofs
   # Replace MockVerifier with generated verifier contracts
   ```

3. **Full Integration**:
   ```bash
   # Test with real proofs and circuit-generated verifiers
   npx hardhat test test/comprehensive_functional.js
   ```

## Network Configuration

### Hardhat Network Settings

```javascript
// hardhat.config.js
module.exports = {
  solidity: "0.8.27",
  networks: {
    hardhat: {
      chainId: 31337,
      gas: 12000000,
      gasPrice: 20000000000,
      accounts: {
        count: 10,
        accountsBalance: "10000000000000000000000" // 10,000 ETH
      }
    }
  }
};
```

### Test Account Setup

The deployment script automatically uses Hardhat's test accounts:
- **Deployer**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Patient Accounts**: For testing data subject roles
- **Provider Accounts**: For testing healthcare provider roles
- **Researcher Accounts**: For testing research access

## Debugging and Monitoring

### Event Monitoring

```javascript
// Listen for policy commitment events
policyPrivacy.on('PolicyCommitted', (dataSubject, policyId, commitment) => {
  console.log(`Policy ${policyId} committed by ${dataSubject}`);
});

// Listen for access requests
policyPrivacy.on('AccessGranted', (requester, policyId, requestId) => {
  console.log(`Access granted to ${requester} for policy ${policyId}`);
});
```

### Contract State Inspection

```bash
# Get policy details
npx hardhat console --network localhost
> const contract = await ethers.getContractAt("PolicyPrivacy", "CONTRACT_ADDRESS");
> await contract.getPolicy(1);
> await contract.getSubjectPolicies("PATIENT_ADDRESS");
```

## Security Considerations

### Test Environment Security

- **Mock Verifier**: Only for testing - always returns configurable result
- **Local Network**: Not connected to mainnet - safe for experimentation
- **Test Accounts**: Pre-funded accounts with no real value

### Production Considerations

- Replace MockVerifier with actual circuit-generated verifiers
- Implement proper key management for production deployments
- Add access control for emergency functions
- Consider gas optimization for large-scale deployment

## Next Steps

1. **Build ZK Circuits**: `npm run build:circuit`
2. **Generate Real Proofs**: Replace mock verifier with circuit verifiers
3. **Integration Testing**: Test full workflow with real ZK proofs
4. **Performance Optimization**: Analyze gas costs and optimize if needed
5. **Security Audit**: Comprehensive security review before production

## Troubleshooting

### Common Issues

1. **Out of Gas**: Increase gas limit in hardhat.config.js
2. **Circuit Build Errors**: Ensure circom and dependencies are properly installed
3. **Test Failures**: Check that all contracts are deployed correctly

### Getting Help

- Review test outputs for detailed error messages
- Check deployment.json for contract addresses
- Verify account balances and permissions
- Ensure MockVerifier state is set correctly for tests