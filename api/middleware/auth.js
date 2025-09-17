/**
 * Authentication middleware for PolicyPrivacy API
 * 
 * In a production environment, this would implement:
 * - JWT token validation
 * - API key authentication
 * - Rate limiting per user
 * - Role-based access control
 */

const { ethers } = require('hardhat');

// For demo purposes, we'll use a simple API key or address-based auth
const authMiddleware = (req, res, next) => {
  // Skip auth for certain endpoints
  const publicEndpoints = [
    '/docs',
    '/proof/circuit-info',
    '/health',
    '/'
  ];

  const method = req.method;
  const path = req.path;
  const endpoint = `${method}:${path}`;

  // Check if path matches any public endpoint (exact match or starts with)
  const isPublicEndpoint = publicEndpoints.some(ep => 
    path === ep || 
    path.endsWith(ep) || 
    endpoint === `GET:${ep}` ||
    endpoint === `${method}:${ep}`
  );

  if (isPublicEndpoint) {
    return next();
  }

  // Check for API key in headers
  const apiKey = req.headers['x-api-key'];
  const authorization = req.headers['authorization'];

  // Simple API key validation (in production, use proper authentication)
  if (apiKey) {
    // Validate API key format (simple validation for demo)
    if (apiKey.length >= 32) {
      req.auth = { type: 'api-key', key: apiKey };
      return next();
    }
  }

  // Check for bearer token
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.substring(7);
    // In production, validate JWT token here
    if (token.length > 0) {
      req.auth = { type: 'bearer', token };
      return next();
    }
  }

  // Check for Ethereum address in request body for signature-based auth
  const { providerAddress, requesterAddress, dataSubjectAddress } = req.body;
  const address = providerAddress || requesterAddress || dataSubjectAddress;

  if (address && ethers.isAddress(address)) {
    // In production, verify signature here
    req.auth = { type: 'address', address };
    return next();
  }

  // For demo purposes, allow requests without auth for public endpoints
  // In production, this should return 401 Unauthorized
  req.auth = { type: 'none' };
  next();
};

module.exports = authMiddleware;