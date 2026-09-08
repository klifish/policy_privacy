const express = require('express');
const { ethers } = require('hardhat');
const router = express.Router();

/**
 * @route POST /api/policy/commit
 * @desc Commit a new privacy policy
 * @access Public
 */
router.post('/commit', async (req, res, next) => {
  try {
    const { dataSubjectAddress, policyCommitment, metadataURI } = req.body;

    // Validate input
    if (!dataSubjectAddress || !ethers.isAddress(dataSubjectAddress)) {
      return res.status(400).json({
        error: 'Invalid data subject address',
        message: 'Valid Ethereum address is required'
      });
    }

    if (!policyCommitment || typeof policyCommitment !== 'string') {
      return res.status(400).json({
        error: 'Invalid policy commitment',
        message: 'Policy commitment is required'
      });
    }

    // Convert commitment to proper format
    let commitmentBN;
    try {
      commitmentBN = BigInt(policyCommitment);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid commitment format',
        message: 'Policy commitment must be a valid number'
      });
    }

    const paramsCommitmentValue = req.body.paramsCommitment ?? 0;
    let paramsCommitmentBN;
    try {
      paramsCommitmentBN = BigInt(paramsCommitmentValue);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid paramsCommitment format',
        message: 'Parameters commitment must be a valid number'
      });
    }

    // Submit to smart contract
    // Use first Hardhat test account which has plenty of ETH by default
    const defaultHardhatKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY || defaultHardhatKey, req.provider);
    const contractWithSigner = req.contract.connect(signer);

    const tx = await contractWithSigner.commitPolicy(commitmentBN, paramsCommitmentBN, metadataURI || '');
    const receipt = await tx.wait();

    // Extract policy ID from events
    const policyCommittedEvent = receipt.logs.find(log => {
      try {
        const parsed = req.contract.interface.parseLog(log);
        return parsed.name === 'PolicyCommitted';
      } catch (e) {
        return false;
      }
    });

    if (!policyCommittedEvent) {
      throw new Error('Failed to extract policy ID from transaction');
    }

    const parsedEvent = req.contract.interface.parseLog(policyCommittedEvent);
    const policyId = parsedEvent.args.policyId.toString();

    res.status(201).json({
      message: 'Policy committed successfully',
      policyId,
      commitment: policyCommitment,
      paramsCommitment: paramsCommitmentBN.toString(),
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed.toString()
    });

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    }
    next(error);
  }
});

/**
 * @route GET /api/policy/:id
 * @desc Get policy details
 * @access Public
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid policy ID',
        message: 'Valid policy ID is required'
      });
    }

    // Get policy from smart contract
    const policyDetails = await req.contract.getPolicy(id);

    if (policyDetails[0] === '0x0000000000000000000000000000000000000000') {
      return res.status(404).json({
        error: 'Policy not found',
        message: 'No policy found with the specified ID'
      });
    }

    const policy = {
      policyId: id,
      dataSubject: policyDetails[0],
      commitment: policyDetails[1].toString(),
      paramsCommitment: policyDetails[2].toString(),
      isActive: policyDetails[3],
      timestamp: new Date(Number(policyDetails[4]) * 1000).toISOString(),
      metadataURI: policyDetails[5]
    };

    res.json(policy);

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    }
    next(error);
  }
});

/**
 * @route POST /api/policy/:id/revoke
 * @desc Revoke a policy
 * @access Public
 */
router.post('/:id/revoke', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dataSubjectAddress } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid policy ID',
        message: 'Valid policy ID is required'
      });
    }

    if (!dataSubjectAddress || !ethers.isAddress(dataSubjectAddress)) {
      return res.status(400).json({
        error: 'Invalid data subject address',
        message: 'Valid Ethereum address is required'
      });
    }

    // Get policy details first
    const policyDetails = await req.contract.getPolicy(id);
    if (policyDetails[0] === '0x0000000000000000000000000000000000000000') {
      return res.status(404).json({
        error: 'Policy not found',
        message: 'No policy found with the specified ID'
      });
    }

    if (policyDetails[0].toLowerCase() !== dataSubjectAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Only the data subject can revoke this policy'
      });
    }

    if (!policyDetails[3]) {
      return res.status(400).json({
        error: 'Policy already inactive',
        message: 'Policy is already revoked or inactive'
      });
    }

    // Revoke policy
    // Use first Hardhat test account which has plenty of ETH by default
    const defaultHardhatKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY || defaultHardhatKey, req.provider);
    const contractWithSigner = req.contract.connect(signer);

    const tx = await contractWithSigner.revokePolicy(id);
    const receipt = await tx.wait();

    res.json({
      message: 'Policy revoked successfully',
      policyId: id,
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed.toString()
    });

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    }
    next(error);
  }
});

/**
 * @route GET /api/policy/subject/:address
 * @desc Get all policies for a data subject
 * @access Public
 */
router.get('/subject/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    const { status, limit = 10, offset = 0 } = req.query;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address',
        message: 'Valid Ethereum address is required'
      });
    }

    // Get policy IDs from smart contract
    const policyIds = await req.contract.getSubjectPolicies(address);
    
    // Fetch details for each policy
    const policies = [];
    const startIndex = parseInt(offset);
    const endIndex = Math.min(startIndex + parseInt(limit), policyIds.length);

    for (let i = startIndex; i < endIndex; i++) {
      try {
        const policyId = policyIds[i].toString();
        const policyDetails = await req.contract.getPolicy(policyId);
        
        const policy = {
          policyId,
          dataSubject: policyDetails[0],
          commitment: policyDetails[1].toString(),
          paramsCommitment: policyDetails[2].toString(),
          isActive: policyDetails[3],
          timestamp: new Date(Number(policyDetails[4]) * 1000).toISOString(),
          metadataURI: policyDetails[5]
        };

        // Filter by status if specified
        if (!status || (status === 'active' && policy.isActive) || (status === 'inactive' && !policy.isActive)) {
          policies.push(policy);
        }
      } catch (error) {
        console.warn(`Failed to fetch policy ${policyIds[i]}:`, error.message);
      }
    }

    res.json({
      policies,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: policyIds.length
      }
    });

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    }
    next(error);
  }
});

/**
 * @route GET /api/policy/:id/access-requests
 * @desc Get access requests for a specific policy
 * @access Public
 */
router.get('/:id/access-requests', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid policy ID',
        message: 'Valid policy ID is required'
      });
    }

    // Check if policy exists
    const policyDetails = await req.contract.getPolicy(id);
    if (policyDetails[0] === '0x0000000000000000000000000000000000000000') {
      return res.status(404).json({
        error: 'Policy not found',
        message: 'No policy found with the specified ID'
      });
    }

    // Get next request ID to determine range
    const nextRequestId = await req.contract.nextRequestId();
    const accessRequests = [];
    
    // Scan through requests to find ones for this policy
    // Note: This is inefficient for large datasets - in production, use events or indexing
    const startCheck = Math.max(1, parseInt(offset) + 1);
    const endCheck = Math.min(parseInt(nextRequestId), startCheck + parseInt(limit));

    for (let requestId = startCheck; requestId < endCheck; requestId++) {
      try {
        const request = await req.contract.accessRequests(requestId);
        if (request.policyId.toString() === id) { // policyId matches
          accessRequests.push({
            requestId: requestId.toString(),
            submitter: request.submitter,
            requesterId: request.requesterId.toString(),
            resourceId: request.resourceId.toString(),
            contextHash: request.contextHash.toString(),
            policyId: request.policyId.toString(),
            timestamp: new Date(Number(request.timestamp) * 1000).toISOString(),
            isProcessed: request.isProcessed,
            isGranted: request.isGranted
          });
        }
      } catch (error) {
        // Request might not exist, continue
      }
    }

    res.json({
      accessRequests,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: accessRequests.length // This is approximate
      }
    });

  } catch (error) {
    if (error.message.includes('revert')) {
      error.type = 'blockchain';
    }
    next(error);
  }
});

module.exports = router;
