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
  GENERAL_RESEARCH: 0,         // DUO:0000042 - General research use (non-ontology-linked)
  DISEASE_SPECIFIC: 1,         // DUO:0000007 - Disease-specific research (ontology-linked → ICD-10)
  RESEARCH_SPECIFIC: 2,        // DUO:0000012 - Research specific restrictions (ontology-linked → OBI)
  POPULATION_ANCESTRY: 3,      // DUO:0000011 - Population origins/ancestry (ontology-linked → HANCESTRO)
  GEOGRAPHICAL_RESTRICTION: 4, // DUO:0000022 - Geographical restriction (ontology-linked → ISO 3166)
  CLINICAL_CARE: 5,            // DUO:0000043 - Clinical care use (ontology-linked → SNOMED CT)
  COMMERCIAL_USE: 6            // DUO:0000046 - Commercial purpose (non-ontology-linked)
};

// Ontology-linked DUO terms with their corresponding external ontology namespaces
// Each ontology-linked term requires verification against a specific external ontology
const ONTOLOGY_LINKED_TERMS = new Map([
  [DUO_TERMS.DISEASE_SPECIFIC, 'ICD10'],        // Disease ontology (ICD-10)
  [DUO_TERMS.RESEARCH_SPECIFIC, 'OBI'],         // Ontology for Biomedical Investigations
  [DUO_TERMS.POPULATION_ANCESTRY, 'HANCESTRO'], // Human Ancestry Ontology
  [DUO_TERMS.GEOGRAPHICAL_RESTRICTION, 'ISO3166'], // Country codes
  [DUO_TERMS.CLINICAL_CARE, 'SNOMED']           // SNOMED CT clinical terminology
]);

// External Ontology Namespaces
// Each namespace represents a different external ontology that can be linked to DUO terms
const ONTOLOGY_NAMESPACES = {
  ICD10: 0,      // ICD-10 disease classification
  OBI: 1,        // Ontology for Biomedical Investigations (research design types)
  HANCESTRO: 2,  // Human Ancestry Ontology
  ISO3166: 3,    // ISO 3166 country and region codes
  SNOMED: 4      // SNOMED CT clinical terminology
};

// ICD-10 Chapters (for Disease Specific Research - DUO:0000007)
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

// OBI Research Design Types (for Research Specific - DUO:0000012)
const OBI_RESEARCH_TYPES = {
  RCT: 0,                    // OBI:0000175 - Randomized Controlled Trial
  COHORT_STUDY: 1,           // OBI:0001185 - Cohort Study
  CASE_CONTROL: 2,           // OBI:0001556 - Case-Control Study
  CROSS_SECTIONAL: 3,        // OBI:0001548 - Cross-Sectional Study
  LONGITUDINAL: 4            // OBI:0001546 - Longitudinal Study
};

// HANCESTRO Ancestry Groups (for Population Origins - DUO:0000011)
const HANCESTRO_GROUPS = {
  EUROPEAN: 0,               // HANCESTRO:0005 - European
  AFRICAN: 1,                // HANCESTRO:0008 - African
  ASIAN: 2,                  // HANCESTRO:0010 - Asian
  HISPANIC_LATIN: 3,         // HANCESTRO:0014 - Hispanic or Latin American
  NATIVE_AMERICAN: 4         // HANCESTRO:0013 - Native American
};

// ISO 3166 Geographic Regions (for Geographical Restriction - DUO:0000022)
const ISO3166_REGIONS = {
  NORTH_AMERICA: 0,          // USA, Canada, Mexico
  EUROPE: 1,                 // European countries
  ASIA: 2,                   // Asian countries
  OCEANIA: 3,                // Australia, New Zealand
  AFRICA: 4                  // African countries
};

// SNOMED CT Clinical Terms (for Clinical Care - DUO:0000043)
const SNOMED_TERMS = {
  DIAGNOSTIC: 0,             // Diagnostic procedures
  THERAPEUTIC: 1,            // Therapeutic procedures
  PREVENTIVE: 2,             // Preventive care
  PALLIATIVE: 3,             // Palliative care
  EMERGENCY: 4               // Emergency care
};

/**
 * Check if a DUO term is ontology-linked (requires external ontology)
 */
function isOntologyLinked(duoTerm) {
  return ONTOLOGY_LINKED_TERMS.has(duoTerm);
}

/**
 * Get the ontology namespace for an ontology-linked DUO term
 */
function getOntologyNamespace(duoTerm) {
  return ONTOLOGY_LINKED_TERMS.get(duoTerm);
}

/**
 * Get the ontology values for a given namespace
 */
function getOntologyValues(namespace) {
  switch (namespace) {
    case 'ICD10':
      return Object.values(ICD10_CHAPTERS);
    case 'OBI':
      return Object.values(OBI_RESEARCH_TYPES);
    case 'HANCESTRO':
      return Object.values(HANCESTRO_GROUPS);
    case 'ISO3166':
      return Object.values(ISO3166_REGIONS);
    case 'SNOMED':
      return Object.values(SNOMED_TERMS);
    default:
      return [];
  }
}

/**
 * Generate a policy configuration
 * Policy format: [attr0, attr1, attr2, op1, op2, ...padding]
 * We encode DUO terms as attributes and ontology terms as external predicates
 */
function generatePolicy(duoTerm, ontologyValue = null) {
  // Check if this DUO term requires ontology linking
  const requiresOntology = isOntologyLinked(duoTerm);
  const namespace = requiresOntology ? getOntologyNamespace(duoTerm) : null;
  
  if (requiresOntology && ontologyValue !== null) {
    // Ontology-linked policy: DUO term AND external ontology verification
    // RPN encoding: [0, 2, 5, 0, 0, 0, 0, 0, 0, 0]
    // Translation: attr0 AND external_predicate_0
    // where: 0=attr0 (DUO term), 2=external_pred_0 (ontology), 5=AND
    const policy = [0, 2, 5, 0, 0, 0, 0, 0, 0, 0];
    
    return {
      policy,
      duoTerm,
      ontologyNamespace: namespace,
      ontologyValue,
      requiresOntology: true,
      description: `DUO:${Object.keys(DUO_TERMS)[duoTerm]}, ${namespace}:${ontologyValue}`
    };
  } else {
    // Non-ontology-linked policy: only DUO term
    // RPN encoding: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    // Translation: attr0 (just the DUO term attribute)
    const policy = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    return {
      policy,
      duoTerm,
      ontologyNamespace: null,
      ontologyValue: null,
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
    executionsPerPolicy = 10,
    satisfyRatio = 0.5  // 50% satisfy, 50% don't satisfy
  } = config;
  
  const dataset = [];
  
  // Generate policies based on DUO term type
  for (const duoTerm of duoTerms) {
    if (isOntologyLinked(duoTerm)) {
      // Ontology-linked DUO terms: pair with each value from their ontology
      const namespace = getOntologyNamespace(duoTerm);
      const ontologyValues = getOntologyValues(namespace);
      
      for (const ontologyValue of ontologyValues) {
        const policyConfig = generatePolicy(duoTerm, ontologyValue);
        
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
      // Non-ontology-linked DUO terms: no ontology pairing needed
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
  ONTOLOGY_LINKED_TERMS,
  ONTOLOGY_NAMESPACES,
  ICD10_CHAPTERS,
  OBI_RESEARCH_TYPES,
  HANCESTRO_GROUPS,
  ISO3166_REGIONS,
  SNOMED_TERMS,
  isOntologyLinked,
  getOntologyNamespace,
  getOntologyValues,
  generatePolicy,
  generateRequesterAttrs,
  generateDataset,
  executePolicy,
  executeDataset
};
