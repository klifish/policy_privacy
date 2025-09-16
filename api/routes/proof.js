const express = require('express');
const path = require('path');
const { generateGroth16Proof, calculatePolicyCommitment } = require('../../test/utils/proofGenerator');
const router = express.Router();

/**
 * @route POST /api/proof/generate
 * @desc Generate a Groth16 zero-knowledge proof
 * @access Public
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { policy, randomizer, requesterAttrs, merkleProofs, credentials, rangeProofs } = req.body;

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

    // Calculate policy commitment
    const policyCommitment = await calculatePolicyCommitment(policy, BigInt(randomizer));

    // Create circuit input
    const circuitInput = {
      // Policy commitment inputs
      policy,
      randomizer: randomizer.toString(),
      
      // Requester attributes
      requesterAttrs,
      
      // Merkle proofs (optional)
      merkleRoots: merkleProofs?.roots || Array(8).fill('0'),
      merklePathElements: merkleProofs?.pathElements || Array(8).fill(Array(10).fill('0')),
      merklePathIndices: merkleProofs?.pathIndices || Array(8).fill(Array(10).fill(0)),
      
      // Credential signatures (optional)
      credentialMessages: credentials?.messages || Array(3).fill('0'),
      credentialSignatures: credentials?.signatures || Array(3).fill(['0', '0']),
      credentialPubKeys: credentials?.pubKeys || Array(3).fill(['0', '0']),
      
      // Range proofs (optional)
      rangeValues: rangeProofs?.values || Array(3).fill('0'),
      rangeBounds: rangeProofs?.bounds || Array(3).fill(['0', '100'])
    };

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

    if (!Array.isArray(proof.pubSignals) || proof.pubSignals.length !== 15) {
      return res.status(400).json({
        error: 'Invalid proof format',
        message: 'pubSignals must be an array of 15 elements'
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
          merkleRoots: formattedProof.pubSignals.slice(2, 10),
          other: formattedProof.pubSignals.slice(10)
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
    const { policy, randomizer } = req.body;

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

    const commitment = await calculatePolicyCommitment(policy, BigInt(randomizer));

    res.json({
      message: 'Policy commitment calculated',
      commitment: commitment.toString(),
      policy,
      randomizer: randomizer.toString()
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