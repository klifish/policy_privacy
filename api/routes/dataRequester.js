const express = require('express');
const { ethers } = require('hardhat');
const { v4: uuidv4 } = require('uuid');
const proofUtils = require('../utils/proofUtils');
const router = express.Router();

// In-memory storage for demo (use database in production)
const dataRequesters = new Map();
const accessRequests = new Map();

/**
 * @route POST /api/data-requester/register
 * @desc Register a new data requester
 * @access Public
 */
router.post('/register', async (req, res, next) => {
  try {
    const { address, metadata } = req.body;

    // Validate input
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address',
        message: 'Valid Ethereum address is required'
      });
    }

    if (!metadata || !metadata.name) {
      return res.status(400).json({
        error: 'Invalid metadata',
        message: 'Requester name is required'
      });
    }

    // Check if requester already exists
    if (dataRequesters.has(address)) {
      return res.status(409).json({
        error: 'Requester exists',
        message: 'Data requester already registered with this address'
      });
    }

    // Register the requester
    const requesterId = uuidv4();
    const requester = {
      id: requesterId,
      address,
      metadata,
      registeredAt: new Date().toISOString(),
      status: 'active',
      totalRequests: 0,
      successfulRequests: 0
    };

    dataRequesters.set(address, requester);

    res.status(201).json({
      message: 'Data requester registered successfully',
      requesterId,
      address,
      status: 'active'
    });

  } catch (error) {
    error.type = 'validation';
    next(error);
  }
});

/**
 * @route POST /api/data-requester/request
 * @desc Request access to data using zero-knowledge proof
 * @access Public
 */
router.post('/request', async (req, res, next) => {
  try {
    const { requesterAddress, policyId, proof, attributes, purpose } = req.body;

    // Validate input
    if (!requesterAddress || !ethers.isAddress(requesterAddress)) {
      return res.status(400).json({
        error: 'Invalid requester address',
        message: 'Valid Ethereum address is required'
      });
    }

    if (!policyId || isNaN(policyId)) {
      return res.status(400).json({
        error: 'Invalid policy ID',
        message: 'Valid policy ID is required'
      });
    }

    if (!proof || !proof.pA || !proof.pB || !proof.pC || !proof.pubSignals) {
      return res.status(400).json({
        error: 'Invalid proof',
        message: 'Complete Groth16 proof (pA, pB, pC, pubSignals) is required'
      });
    }

    // Check if requester is registered
    if (!dataRequesters.has(requesterAddress)) {
      return res.status(404).json({
        error: 'Requester not found',
        message: 'Data requester must be registered first'
      });
    }

    // Validate proof format
    try {
      proofUtils.validateProofFormat(proof);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid proof format',
        message: error.message
      });
    }

    // Check if policy exists and is active
    const policyDetails = await req.contract.getPolicy(policyId);
    if (!policyDetails[3]) { // isActive
      return res.status(400).json({
        error: 'Policy inactive',
        message: 'The specified policy is not active'
      });
    }

    // Submit access request to smart contract
    // Use first Hardhat test account which has plenty of ETH by default
    const defaultHardhatKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY || defaultHardhatKey, req.provider);
    const contractWithSigner = req.contract.connect(signer);

    // Convert proof components to proper format
    const formattedProof = proofUtils.formatProofForContract(proof);

    const tx = await contractWithSigner.requestAccess(
      policyId,
      formattedProof.pA,
      formattedProof.pB,
      formattedProof.pC,
      formattedProof.pubSignals
    );
    
    const receipt = await tx.wait();

    // Extract request ID and result from events
    let isGranted = false;
    let requestId = null;

    for (const log of receipt.logs) {
      try {
        const parsed = req.contract.interface.parseLog(log);
        if (parsed.name === 'AccessRequested') {
          requestId = parsed.args.requestId.toString();
        } else if (parsed.name === 'AccessGranted') {
          isGranted = true;
        }
      } catch (e) {
        // Ignore unparseable logs
      }
    }

    // Store access request record
    const accessRequestId = uuidv4();
    const accessRequest = {
      id: accessRequestId,
      contractRequestId: requestId,
      requesterAddress,
      policyId: policyId.toString(),
      proof,
      attributes: attributes || {},
      purpose: purpose || '',
      requestedAt: new Date().toISOString(),
      status: isGranted ? 'granted' : 'denied',
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed.toString()
    };

    accessRequests.set(accessRequestId, accessRequest);

    // Update requester stats
    const requester = dataRequesters.get(requesterAddress);
    requester.totalRequests += 1;
    if (isGranted) {
      requester.successfulRequests += 1;
    }

    res.status(200).json({
      message: `Access request ${isGranted ? 'granted' : 'denied'}`,
      accessRequestId,
      contractRequestId: requestId,
      status: isGranted ? 'granted' : 'denied',
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed.toString(),
      canAccessData: isGranted
    });

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    } else if (error.message.includes('proof')) {
      error.type = 'proof';
    }
    next(error);
  }
});

/**
 * @route GET /api/data-requester/requests
 * @desc List access requests for a requester
 * @access Public
 */
router.get('/requests', async (req, res, next) => {
  try {
    const { requesterAddress, status, limit = 10, offset = 0 } = req.query;

    if (!requesterAddress || !ethers.isAddress(requesterAddress)) {
      return res.status(400).json({
        error: 'Invalid requester address',
        message: 'Valid Ethereum address is required'
      });
    }

    // Check if requester exists
    if (!dataRequesters.has(requesterAddress)) {
      return res.status(404).json({
        error: 'Requester not found',
        message: 'Data requester not registered'
      });
    }

    // Filter requests by requester
    const requesterRequests = Array.from(accessRequests.values())
      .filter(request => request.requesterAddress === requesterAddress)
      .filter(request => !status || request.status === status)
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
      .slice(offset, offset + parseInt(limit));

    res.json({
      requests: requesterRequests,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: Array.from(accessRequests.values()).filter(request => request.requesterAddress === requesterAddress).length
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/data-requester/requests/:id
 * @desc Get specific access request details
 * @access Public
 */
router.get('/requests/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const accessRequest = accessRequests.get(id);

    if (!accessRequest) {
      return res.status(404).json({
        error: 'Request not found',
        message: 'No access request found with the specified ID'
      });
    }

    // Get additional details from smart contract if contract request ID exists
    if (accessRequest.contractRequestId) {
      try {
        const contractRequest = await req.contract.accessRequests(accessRequest.contractRequestId);
        accessRequest.contractDetails = {
          requester: contractRequest[0],
          policyId: contractRequest[1].toString(),
          timestamp: new Date(Number(contractRequest[2]) * 1000).toISOString(),
          isProcessed: contractRequest[3],
          isGranted: contractRequest[4]
        };
      } catch (error) {
        console.warn('Failed to fetch contract request details:', error.message);
      }
    }

    res.json(accessRequest);

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/data-requester/stats/:address
 * @desc Get requester statistics
 * @access Public
 */
router.get('/stats/:address', async (req, res, next) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address',
        message: 'Valid Ethereum address is required'
      });
    }

    const requester = dataRequesters.get(address);
    if (!requester) {
      return res.status(404).json({
        error: 'Requester not found',
        message: 'Data requester not registered'
      });
    }

    const requesterRequests = Array.from(accessRequests.values())
      .filter(request => request.requesterAddress === address);

    const stats = {
      totalRequests: requesterRequests.length,
      grantedRequests: requesterRequests.filter(r => r.status === 'granted').length,
      deniedRequests: requesterRequests.filter(r => r.status === 'denied').length,
      successRate: requesterRequests.length > 0 ? 
        (requesterRequests.filter(r => r.status === 'granted').length / requesterRequests.length * 100).toFixed(2) + '%' : '0%',
      registeredAt: requester.registeredAt
    };

    res.json(stats);

  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/data-requester/validate-attributes
 * @desc Validate requester attributes before generating proof
 * @access Public
 */
router.post('/validate-attributes', async (req, res, next) => {
  try {
    const { attributes, requiredAttributes } = req.body;

    if (!attributes || typeof attributes !== 'object') {
      return res.status(400).json({
        error: 'Invalid attributes',
        message: 'Attributes object is required'
      });
    }

    if (!requiredAttributes || !Array.isArray(requiredAttributes)) {
      return res.status(400).json({
        error: 'Invalid required attributes',
        message: 'Required attributes array is required'
      });
    }

    const validation = {
      isValid: true,
      missingAttributes: [],
      providedAttributes: Object.keys(attributes),
      validationResults: {}
    };

    // Check required attributes
    for (const required of requiredAttributes) {
      if (!(required in attributes)) {
        validation.isValid = false;
        validation.missingAttributes.push(required);
      }
      validation.validationResults[required] = required in attributes;
    }

    res.json({
      message: 'Attribute validation completed',
      validation
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
