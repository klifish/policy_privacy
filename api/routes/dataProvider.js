const express = require('express');
const { ethers } = require('hardhat');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage for demo (use database in production)
const dataProviders = new Map();
const publishedData = new Map();

/**
 * @route POST /api/data-provider/register
 * @desc Register a new data provider
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
        message: 'Provider name is required'
      });
    }

    // Check if provider already exists
    if (dataProviders.has(address)) {
      return res.status(409).json({
        error: 'Provider exists',
        message: 'Data provider already registered with this address'
      });
    }

    // Register the provider
    const providerId = uuidv4();
    const provider = {
      id: providerId,
      address,
      metadata,
      registeredAt: new Date().toISOString(),
      status: 'active',
      publishedDataCount: 0
    };

    dataProviders.set(address, provider);

    res.status(201).json({
      message: 'Data provider registered successfully',
      providerId,
      address,
      status: 'active'
    });

  } catch (error) {
    error.type = 'validation';
    next(error);
  }
});

/**
 * @route POST /api/data-provider/publish
 * @desc Publish data with privacy policy
 * @access Public
 */
router.post('/publish', async (req, res, next) => {
  try {
    const { providerAddress, dataHash, policyCommitment, metadataURI, dataLocation, description } = req.body;

    // Validate input
    if (!providerAddress || !ethers.isAddress(providerAddress)) {
      return res.status(400).json({
        error: 'Invalid provider address',
        message: 'Valid Ethereum address is required'
      });
    }

    if (!dataHash || typeof dataHash !== 'string') {
      return res.status(400).json({
        error: 'Invalid data hash',
        message: 'Data hash is required'
      });
    }

    if (!policyCommitment || typeof policyCommitment !== 'string') {
      return res.status(400).json({
        error: 'Invalid policy commitment',
        message: 'Policy commitment is required'
      });
    }

    // Check if provider is registered
    if (!dataProviders.has(providerAddress)) {
      return res.status(404).json({
        error: 'Provider not found',
        message: 'Data provider must be registered first'
      });
    }

    // Commit policy to smart contract
    // Use first Hardhat test account which has plenty of ETH by default
    const defaultHardhatKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY || defaultHardhatKey, req.provider);
    const contractWithSigner = req.contract.connect(signer);

    // Convert commitment to proper format if needed
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

    // Store data publication record
    const dataId = uuidv4();
    const dataRecord = {
      id: dataId,
      providerAddress,
      dataHash,
      policyId,
      paramsCommitment: paramsCommitmentBN.toString(),
      policyCommitment,
      metadataURI: metadataURI || '',
      dataLocation: dataLocation || '',
      description: description || '',
      publishedAt: new Date().toISOString(),
      status: 'active',
      accessRequests: [],
      transactionHash: tx.hash
    };

    publishedData.set(dataId, dataRecord);

    // Update provider stats
    const provider = dataProviders.get(providerAddress);
    provider.publishedDataCount += 1;

    res.status(201).json({
      message: 'Data published successfully',
      dataId,
      policyId,
      paramsCommitment: paramsCommitmentBN.toString(),
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed.toString(),
      data: {
        id: dataId,
        policyId,
        status: 'active',
        publishedAt: dataRecord.publishedAt
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
 * @route GET /api/data-provider/data
 * @desc List published data for a provider
 * @access Public
 */
router.get('/data', async (req, res, next) => {
  try {
    const { providerAddress, status, limit = 10, offset = 0 } = req.query;

    if (!providerAddress || !ethers.isAddress(providerAddress)) {
      return res.status(400).json({
        error: 'Invalid provider address',
        message: 'Valid Ethereum address is required'
      });
    }

    // Check if provider exists
    if (!dataProviders.has(providerAddress)) {
      return res.status(404).json({
        error: 'Provider not found',
        message: 'Data provider not registered'
      });
    }

    // Filter data by provider
    const providerData = Array.from(publishedData.values())
      .filter(data => data.providerAddress === providerAddress)
      .filter(data => !status || data.status === status)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(offset, offset + parseInt(limit));

    res.json({
      data: providerData,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: Array.from(publishedData.values()).filter(data => data.providerAddress === providerAddress).length
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/data-provider/data/:id
 * @desc Get specific data details
 * @access Public
 */
router.get('/data/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const dataRecord = publishedData.get(id);

    if (!dataRecord) {
      return res.status(404).json({
        error: 'Data not found',
        message: 'No data found with the specified ID'
      });
    }

    // Get policy details from smart contract
    try {
      const policyDetails = await req.contract.getPolicy(dataRecord.policyId);
      dataRecord.policyDetails = {
        dataSubject: policyDetails[0],
        commitment: policyDetails[1].toString(),
        paramsCommitment: policyDetails[2].toString(),
        isActive: policyDetails[3],
        timestamp: new Date(Number(policyDetails[4]) * 1000).toISOString(),
        metadataURI: policyDetails[5]
      };
    } catch (error) {
      console.warn('Failed to fetch policy details:', error.message);
    }

    res.json(dataRecord);

  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/data-provider/data/:id
 * @desc Update data metadata
 * @access Public
 */
router.put('/data/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description, dataLocation, metadataURI } = req.body;

    const dataRecord = publishedData.get(id);
    if (!dataRecord) {
      return res.status(404).json({
        error: 'Data not found',
        message: 'No data found with the specified ID'
      });
    }

    // Update allowed fields
    if (description !== undefined) dataRecord.description = description;
    if (dataLocation !== undefined) dataRecord.dataLocation = dataLocation;
    if (metadataURI !== undefined) dataRecord.metadataURI = metadataURI;
    
    dataRecord.updatedAt = new Date().toISOString();

    res.json({
      message: 'Data updated successfully',
      data: dataRecord
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/data-provider/data/:id
 * @desc Remove/deactivate published data
 * @access Public
 */
router.delete('/data/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const dataRecord = publishedData.get(id);

    if (!dataRecord) {
      return res.status(404).json({
        error: 'Data not found',
        message: 'No data found with the specified ID'
      });
    }

    // Mark as inactive instead of deleting
    dataRecord.status = 'inactive';
    dataRecord.deactivatedAt = new Date().toISOString();

    res.json({
      message: 'Data deactivated successfully',
      dataId: id,
      status: 'inactive'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/data-provider/stats/:address
 * @desc Get provider statistics
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

    const provider = dataProviders.get(address);
    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
        message: 'Data provider not registered'
      });
    }

    const providerData = Array.from(publishedData.values())
      .filter(data => data.providerAddress === address);

    const stats = {
      totalDatasets: providerData.length,
      activeDatasets: providerData.filter(d => d.status === 'active').length,
      totalAccessRequests: providerData.reduce((sum, d) => sum + d.accessRequests.length, 0),
      registeredAt: provider.registeredAt
    };

    res.json(stats);

  } catch (error) {
    next(error);
  }
});

module.exports = router;
