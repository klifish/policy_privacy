/**
 * Validation middleware for PolicyPrivacy API
 * Provides input validation and sanitization
 */

const { ethers } = require('hardhat');

const validationMiddleware = (req, res, next) => {
  // Add validation helpers to request object
  req.validate = {
    address: (address, fieldName = 'address') => {
      if (!address || !ethers.isAddress(address)) {
        throw new ValidationError(`Invalid ${fieldName}: must be a valid Ethereum address`);
      }
      return address.toLowerCase();
    },

    bigInt: (value, fieldName = 'value') => {
      try {
        return BigInt(value);
      } catch (e) {
        throw new ValidationError(`Invalid ${fieldName}: must be a valid integer`);
      }
    },

    array: (arr, expectedLength, fieldName = 'array') => {
      if (!Array.isArray(arr)) {
        throw new ValidationError(`Invalid ${fieldName}: must be an array`);
      }
      if (expectedLength && arr.length !== expectedLength) {
        throw new ValidationError(`Invalid ${fieldName}: must have exactly ${expectedLength} elements`);
      }
      return arr;
    },

    string: (str, minLength = 0, maxLength = Infinity, fieldName = 'string') => {
      if (typeof str !== 'string') {
        throw new ValidationError(`Invalid ${fieldName}: must be a string`);
      }
      if (str.length < minLength) {
        throw new ValidationError(`Invalid ${fieldName}: must be at least ${minLength} characters`);
      }
      if (str.length > maxLength) {
        throw new ValidationError(`Invalid ${fieldName}: must be at most ${maxLength} characters`);
      }
      return str.trim();
    },

    number: (num, min = -Infinity, max = Infinity, fieldName = 'number') => {
      const parsed = parseInt(num);
      if (isNaN(parsed)) {
        throw new ValidationError(`Invalid ${fieldName}: must be a number`);
      }
      if (parsed < min) {
        throw new ValidationError(`Invalid ${fieldName}: must be at least ${min}`);
      }
      if (parsed > max) {
        throw new ValidationError(`Invalid ${fieldName}: must be at most ${max}`);
      }
      return parsed;
    },

    proof: (proof, fieldName = 'proof') => {
      if (!proof || typeof proof !== 'object') {
        throw new ValidationError(`Invalid ${fieldName}: must be an object`);
      }

      const { pA, pB, pC, pubSignals } = proof;

      if (!Array.isArray(pA) || pA.length !== 2) {
        throw new ValidationError(`Invalid ${fieldName}.pA: must be an array of 2 elements`);
      }

      if (!Array.isArray(pB) || pB.length !== 2 || 
          !Array.isArray(pB[0]) || pB[0].length !== 2 ||
          !Array.isArray(pB[1]) || pB[1].length !== 2) {
        throw new ValidationError(`Invalid ${fieldName}.pB: must be a 2x2 array`);
      }

      if (!Array.isArray(pC) || pC.length !== 2) {
        throw new ValidationError(`Invalid ${fieldName}.pC: must be an array of 2 elements`);
      }

      if (!Array.isArray(pubSignals) || pubSignals.length !== 6) {
        throw new ValidationError(`Invalid ${fieldName}.pubSignals: must be an array of 6 elements`);
      }

      return proof;
    }
  };

  next();
};

class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.type = 'validation';
    this.details = details;
  }
}

module.exports = validationMiddleware;
