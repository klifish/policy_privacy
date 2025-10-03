/**
 * Data Generator for Policy Content Hiding Evaluation
 * 
 * Generates a dataset of policies with DUO terms and ICD-10 codes,
 * executes them multiple times, and collects observable features
 * from blockchain transactions.
 */

const { ethers } = require('hardhat');
const { generateGroth16Proof, calculatePolicyCommitment, createCircuitInput } = require('../../test/utils/proofGenerator');

// DUO Terms (Data Use Ontology) - based on actual DUO ontology
// See: https://ega-archive.org/access/data-access-committee/data-use-ontology/
const DUO_TERMS = {
  GENERAL_RESEARCH: 0,      // DUO:0000042 - General research use
  DISEASE_SPECIFIC: 1,      // DUO:0000007 - Disease-specific research (ontology-linked)
  POPULATION_RESEARCH: 2,   // DUO:0000011 - Population research
  CLINICAL_CARE: 3,         // DUO:0000043 - Clinical care use
  COMMERCIAL_USE: 4         // DUO:0000046 - Commercial purpose
};

// Ontology-linked DUO terms that require external ontologies (like ICD-10)
const ONTOLOGY_LINKED_TERMS = new Set([
  DUO_TERMS.DISEASE_SPECIFIC  // Requires disease ontology (ICD-10)
]);

// ICD-10 Chapters (simplified)
const ICD10_CHAPTERS = {
  INFECTIOUS: 0,      // A00-B99
  NEOPLASMS: 1,       // C00-D49
  BLOOD: 2,           // D50-D89
  ENDOCRINE: 3,       // E00-E89
  MENTAL: 4,          // F01-F99
  NERVOUS: 5,         // G00-G99
  CIRCULATORY: 6,     // I00-I99
  RESPIRATORY: 7,     // J00-J99
  DIGESTIVE: 8,       // K00-K95
  MUSCULOSKELETAL: 9  // M00-M99
};

/**
 * Check if a DUO term is ontology-linked (requires ICD-10)
 */
function isOntologyLinked(duoTerm) {
  return ONTOLOGY_LINKED_TERMS.has(duoTerm);
}

/**
 * Generate a policy configuration
 * Policy format: [attr0, attr1, attr2, op1, op2, ...padding]
 * We encode DUO terms as attributes and ICD-10 as external predicates
 */
function generatePolicy(duoTerm, icd10Chapter = null) {
  // Check if this DUO term requires ontology linking
  const requiresOntology = isOntologyLinked(duoTerm);
  
  if (requiresOntology && icd10Chapter !== null) {
    // Ontology-linked policy: DUO term AND ICD-10 chapter
    // RPN encoding: [0, 2, 5, 0, 0, 0, 0, 0, 0, 0]
    // Translation: attr0 AND external_predicate_0
    // where: 0=attr0 (DUO term), 2=external_pred_0 (ICD-10), 5=AND
    const policy = [0, 2, 5, 0, 0, 0, 0, 0, 0, 0];
    
    return {
      policy,
      duoTerm,
      icd10Chapter,
      requiresOntology: true,
      description: `DUO:${Object.keys(DUO_TERMS)[duoTerm]}, ICD10:${Object.keys(ICD10_CHAPTERS)[icd10Chapter]}`
    };
  } else {
    // Non-ontology-linked policy: only DUO term
    // RPN encoding: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    // Translation: attr0 (just the DUO term attribute)
    const policy = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    return {
      policy,
      duoTerm,
      icd10Chapter: null,
      requiresOntology: false,
      description: `DUO:${Object.keys(DUO_TERMS)[duoTerm]}`
    };
  }
}

/**
 * Generate requester attributes that satisfy or don't satisfy the policy
 */
function generateRequesterAttrs(duoTerm, satisfy) {
  // attr0 = DUO term presence
  // attr1, attr2 = other attributes (not used in this policy)
  return [
    satisfy ? 1 : 0,  // attr0: whether requester has DUO term
    0,                 // attr1: unused
    0                  // attr2: unused
  ];
}

/**
 * Generate a dataset of policy configurations
 */
function generateDataset(config = {}) {
  const {
    duoTerms = Object.values(DUO_TERMS),
    icd10Chapters = Object.values(ICD10_CHAPTERS),
    executionsPerPolicy = 10,
    satisfyRatio = 0.5  // 50% satisfy, 50% don't satisfy
  } = config;
  
  const dataset = [];
  
  // Generate policies based on DUO term type
  for (const duoTerm of duoTerms) {
    if (isOntologyLinked(duoTerm)) {
      // Ontology-linked DUO terms: pair with each ICD-10 chapter
      for (const icd10Chapter of icd10Chapters) {
        const policyConfig = generatePolicy(duoTerm, icd10Chapter);
        
        // Generate multiple executions
        for (let i = 0; i < executionsPerPolicy; i++) {
          const satisfy = Math.random() < satisfyRatio;
          const requesterAttrs = generateRequesterAttrs(duoTerm, satisfy);
          
          dataset.push({
            policyId: dataset.length,
            ...policyConfig,
            requesterAttrs,
            satisfy,
            executionId: i
          });
        }
      }
    } else {
      // Non-ontology-linked DUO terms: no ICD-10 pairing needed
      const policyConfig = generatePolicy(duoTerm);
      
      // Generate multiple executions
      for (let i = 0; i < executionsPerPolicy; i++) {
        const satisfy = Math.random() < satisfyRatio;
        const requesterAttrs = generateRequesterAttrs(duoTerm, satisfy);
        
        dataset.push({
          policyId: dataset.length,
          ...policyConfig,
          requesterAttrs,
          satisfy,
          executionId: i
        });
      }
    }
  }
  
  return dataset;
}

/**
 * Execute a policy and collect observable features
 */
async function executePolicy(policyData, contract) {
  const { policy, requesterAttrs, satisfy, requiresOntology } = policyData;
  
  const randomizer = BigInt(Math.floor(Math.random() * 1000000));
  const policyCommitment = await calculatePolicyCommitment(policy, randomizer);
  
  // Prepare circuit input
  // Set predicate type based on whether ontology is required
  const predicateTypes = requiresOntology ? [3, 0] : [0, 0]; // Type 3 = ontology, 0 = disabled
  const circuitInput = createCircuitInput(policyCommitment, {
    policy,
    requesterAttrs,
    randomizer,
    predicateTypes,
    // Simplified external predicate setup
    merkleRoots: ['0', '0'],
    credPublicKeys: ['0', '0'],
    rangeMin: [0, 0],
    rangeMax: [100, 100],
    ontologyPolicyIds: [0, 0],
    ontologyEpochs: [0, 0],
    numOperations: 3
  });
  
  // Measure proof generation time
  const proofStartTime = Date.now();
  const proof = await generateGroth16Proof(circuitInput);
  const proofGenerationTime = Date.now() - proofStartTime;
  
  // Commit policy to blockchain
  const [signer] = await ethers.getSigners();
  const commitTx = await contract.connect(signer).commitPolicy(
    policyCommitment,
    'ipfs://policy-metadata'
  );
  const commitReceipt = await commitTx.wait();
  
  // Extract policy ID from events
  const policyCommittedEvent = commitReceipt.logs.find(log => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed.name === 'PolicyCommitted';
    } catch (e) {
      return false;
    }
  });
  
  const parsedEvent = contract.interface.parseLog(policyCommittedEvent);
  const blockchainPolicyId = parsedEvent.args.policyId;
  
  // Request access with proof
  const accessTx = await contract.connect(signer).requestAccess(
    blockchainPolicyId,
    [proof.pA, proof.pB, proof.pC, proof.pubSignals]
  );
  const accessReceipt = await accessTx.wait();
  
  // Extract observable features
  const features = {
    // Transaction features
    commitGasUsed: commitReceipt.gasUsed.toString(),
    commitCalldataLength: commitTx.data.length,
    accessGasUsed: accessReceipt.gasUsed.toString(),
    accessCalldataLength: accessTx.data.length,
    
    // Proof features
    proofSize: JSON.stringify(proof).length,
    proofGenerationTime,
    
    // Event features
    commitLogsCount: commitReceipt.logs.length,
    commitLogsSize: JSON.stringify(commitReceipt.logs).length,
    accessLogsCount: accessReceipt.logs.length,
    accessLogsSize: JSON.stringify(accessReceipt.logs).length,
    
    // Timing (block numbers can reveal information)
    commitBlockNumber: commitReceipt.blockNumber,
    accessBlockNumber: accessReceipt.blockNumber,
    blockDifference: accessReceipt.blockNumber - commitReceipt.blockNumber,
  };
  
  return {
    ...policyData,
    features,
    policyCommitment,
    blockchainPolicyId: blockchainPolicyId.toString()
  };
}

/**
 * Execute dataset and collect all features
 */
async function executeDataset(dataset, contract, outputPath) {
  const fs = require('fs');
  const results = [];
  
  console.log(`Executing ${dataset.length} policy instances...`);
  
  for (let i = 0; i < dataset.length; i++) {
    if (i % 10 === 0) {
      console.log(`Progress: ${i}/${dataset.length}`);
    }
    
    try {
      const result = await executePolicy(dataset[i], contract);
      results.push(result);
    } catch (error) {
      console.error(`Error executing policy ${i}:`, error.message);
      // Continue with next policy
    }
  }
  
  // Save results
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} results to ${outputPath}`);
  
  return results;
}

module.exports = {
  DUO_TERMS,
  ICD10_CHAPTERS,
  ONTOLOGY_LINKED_TERMS,
  isOntologyLinked,
  generatePolicy,
  generateRequesterAttrs,
  generateDataset,
  executePolicy,
  executeDataset
};
