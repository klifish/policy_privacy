const express = require('express');
const path = require('path');
const { generateGroth16Proof, calculatePolicyCommitment, createCircuitInput } = require('../../test/utils/proofGenerator');
const router = express.Router();

/**
 * @route POST /api/proof/generate
 * @desc Generate a Groth16 zero-knowledge proof
 * @access Public
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { policy, randomizer, requesterAttrs, merkleProofs, credentials, rangeProofs, numOperations } = req.body;

    // Validate input
    if (!policy || !Array.isArray(policy) || policy.length !== 10) {
      return res.status(400).json({
        error: 'Invalid policy',
        message: 'Policy must be an array of 10 elements'
      });
    }

    if (!randomizer) {
      return res.status(400).json({
        error: 'Invalid randomizer',
        message: 'Randomizer is required for policy commitment'
      });
    }

    if (!requesterAttrs || !Array.isArray(requesterAttrs)) {
      return res.status(400).json({
        error: 'Invalid requester attributes',
        message: 'Requester attributes array is required'
      });
    }

    // Calculate policy commitment. numOperations is part of the commitment
    // preimage, so the same value must be used here and in the circuit input.
    const effectiveNumOperations = numOperations ?? 3;
    const policyCommitment = await calculatePolicyCommitment(
      policy,
      BigInt(randomizer),
      effectiveNumOperations
    );

    // Create circuit input using the proper function
    const circuitInput = createCircuitInput(policyCommitment, {
      policy,
      requesterAttrs,
      randomizer: BigInt(randomizer),
      // Optional parameters - use defaults if not provided
      predicateTypes: [0, 0], // M=2 elements
      merkleRoots: merkleProofs?.roots?.slice(0, 2) || ['0', '0'], // M=2 elements
      credPublicKeys: credentials?.pubKeys?.slice(0, 2) || ['0', '0'], // M=2 elements
      rangeMin: rangeProofs?.bounds?.slice(0, 2)?.map(b => b[0]) || [0, 0], // M=2 elements
      rangeMax: rangeProofs?.bounds?.slice(0, 2)?.map(b => b[1]) || [100, 100], // M=2 elements
      ontologyPolicyIds: [0, 0], // M=2 elements
      ontologyEpochs: [0, 0], // M=2 elements
      numOperations: effectiveNumOperations
    });

    console.log('Generating proof with commitment:', policyCommitment.toString());
    
    const startTime = Date.now();
    
    // Generate the proof using the real proof generator
    const proof = await generateGroth16Proof(circuitInput);
    
    const generationTime = Date.now() - startTime;
    
    res.json({
      message: 'Proof generated successfully',
      proof: {
        pA: proof.pA,
        pB: proof.pB,
        pC: proof.pC,
        pubSignals: proof.pubSignals
      },
      metadata: {
        policyCommitment: policyCommitment.toString(),
        generationTimeMs: generationTime,
        circuitParameters: {
          N: 3,
          M: 2,
          DEPTH: 10,
          K: 3,
          MERKLE_LEVELS: 8,
          RANGE_BITS: 32
        }
      }
    });

  } catch (error) {
    console.error('Proof generation error:', error);
    error.type = 'proof';
    next(error);
  }
});

/**
 * @route POST /api/proof/verify
 * @desc Verify a Groth16 zero-knowledge proof
 * @access Public
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { proof, expectedPolicyCommitment } = req.body;

    if (!proof || !proof.pA || !proof.pB || !proof.pC || !proof.pubSignals) {
      return res.status(400).json({
        error: 'Invalid proof',
        message: 'Complete Groth16 proof (pA, pB, pC, pubSignals) is required'
      });
    }

    // Validate proof format
    if (!Array.isArray(proof.pA) || proof.pA.length !== 2) {
      return res.status(400).json({
        error: 'Invalid proof format',
        message: 'pA must be an array of 2 elements'
      });
    }

    if (!Array.isArray(proof.pB) || proof.pB.length !== 2 || 
        !Array.isArray(proof.pB[0]) || proof.pB[0].length !== 2 ||
        !Array.isArray(proof.pB[1]) || proof.pB[1].length !== 2) {
      return res.status(400).json({
        error: 'Invalid proof format',
        message: 'pB must be a 2x2 array'
      });
    }

    if (!Array.isArray(proof.pC) || proof.pC.length !== 2) {
      return res.status(400).json({
        error: 'Invalid proof format',
        message: 'pC must be an array of 2 elements'
      });
    }

    if (!Array.isArray(proof.pubSignals) || proof.pubSignals.length !== 33) {
      return res.status(400).json({
        error: 'Invalid proof format',
        message: 'pubSignals must be an array of 33 elements'
      });
    }

    // Convert to contract format
    const formattedProof = {
      pA: proof.pA.map(x => BigInt(x).toString()),
      pB: proof.pB.map(row => row.map(x => BigInt(x).toString())),
      pC: proof.pC.map(x => BigInt(x).toString()),
      pubSignals: proof.pubSignals.map(x => BigInt(x).toString())
    };

    // Verify proof using smart contract
    const isValid = await req.contract.verifyProof(
      formattedProof.pA,
      formattedProof.pB,
      formattedProof.pC,
      formattedProof.pubSignals
    );

    // Extract key information from public signals
    const isAuthorized = formattedProof.pubSignals[0] === '1';
    const policyCommitment = formattedProof.pubSignals[1];
    const paramsCommitment = formattedProof.pubSignals[2];

    // Check policy commitment if provided
    let commitmentMatch = true;
    if (expectedPolicyCommitment) {
      commitmentMatch = policyCommitment === BigInt(expectedPolicyCommitment).toString();
    }

    res.json({
      message: 'Proof verification completed',
      isValid,
      isAuthorized,
      commitmentMatch,
      details: {
        policyCommitment,
        expectedPolicyCommitment: expectedPolicyCommitment || null,
        pubSignals: {
          isAuthorized: formattedProof.pubSignals[0],
          policyCommitment: formattedProof.pubSignals[1],
          paramsCommitment: formattedProof.pubSignals[2],
          merkleRoots: formattedProof.pubSignals.slice(3, 8),
          credPublicKeys: formattedProof.pubSignals.slice(8, 13),
          rangeMin: formattedProof.pubSignals.slice(13, 18),
          rangeMax: formattedProof.pubSignals.slice(18, 23),
          ontologyPolicyIds: formattedProof.pubSignals.slice(23, 28),
          ontologyEpochs: formattedProof.pubSignals.slice(28, 33)
        }
      }
    });

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    } else {
      error.type = 'proof';
    }
    next(error);
  }
});

/**
 * @route POST /api/proof/policy-commitment
 * @desc Calculate policy commitment hash
 * @access Public
 */
router.post('/policy-commitment', async (req, res, next) => {
  try {
    const { policy, randomizer, numOperations } = req.body;

    if (!policy || !Array.isArray(policy) || policy.length !== 10) {
      return res.status(400).json({
        error: 'Invalid policy',
        message: 'Policy must be an array of 10 elements'
      });
    }

    if (!randomizer) {
      return res.status(400).json({
        error: 'Invalid randomizer',
        message: 'Randomizer is required'
      });
    }

    // The program length is bound into the commitment preimage.
    const effectiveNumOperations = numOperations ?? policy.filter((t) => t !== 0).length;
    const commitment = await calculatePolicyCommitment(
      policy,
      BigInt(randomizer),
      effectiveNumOperations
    );

    res.json({
      message: 'Policy commitment calculated',
      commitment: commitment.toString(),
      policy,
      randomizer: randomizer.toString(),
      numOperations: effectiveNumOperations
    });

  } catch (error) {
    error.type = 'proof';
    next(error);
  }
});

/**
 * @route GET /api/proof/circuit-info
 * @desc Get circuit parameters and information
 * @access Public
 */
router.get('/circuit-info', (req, res) => {
  res.json({
    circuit: 'PolicyPrivacyMain',
    parameters: {
      N: 3,           // Number of attributes
      M: 2,           // Number of policy predicates
      DEPTH: 10,      // Policy expression tree depth
      K: 3,           // Number of external predicates
      MERKLE_LEVELS: 8,   // Merkle tree depth
      RANGE_BITS: 32  // Range proof bit length
    },
    proofSystem: 'Groth16',
    publicSignals: {
      0: 'isAuthorized',
      1: 'policyCommitment',
      '2-9': 'merkleRoots[8]',
      '10-14': 'additionalOutputs[5]'
    },
    description: 'Zero-knowledge proof system for privacy-preserving consent management',
    setupFiles: {
      wasmPath: 'build/circuits/policy_privacy_main_js/policy_privacy_main.wasm',
      zkeyPath: 'build/circuits/policy_privacy_main_final.zkey'
    }
  });
});

module.exports = router;
