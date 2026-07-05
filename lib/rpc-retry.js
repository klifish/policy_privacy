'use strict';

const { Transaction } = require('ethers');

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_INITIAL_DELAY_MS = 1500;
const DEFAULT_MAX_DELAY_MS = 20000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
    const parts = [
        error && error.message,
        error && error.shortMessage,
        error && error.code,
        error && error.error && error.error.message,
        error && error.payload && JSON.stringify(error.payload)
    ].filter(Boolean);
    return parts.join(' ');
}

function isTransientRpcError(error) {
    const text = errorText(error);
    return /Unknown block/i.test(text) ||
        /RECEIPT_NOT_AVAILABLE/i.test(text) ||
        /Receipt not available/i.test(text) ||
        /socket hang up/i.test(text) ||
        /ECONNRESET/i.test(text) ||
        /ETIMEDOUT/i.test(text) ||
        /timeout/i.test(text) ||
        /could not coalesce error/i.test(text) ||
        /SERVER_ERROR/i.test(text) ||
        /NETWORK_ERROR/i.test(text) ||
        /missing response/i.test(text);
}

function getRawTransactionFromError(error) {
    const params = error && error.payload && Array.isArray(error.payload.params)
        ? error.payload.params
        : null;
    if (!params || typeof params[0] !== 'string') {
        return null;
    }
    return params[0];
}

function getAlreadyKnownTransactionHash(error) {
    const text = errorText(error);
    if (!/already known/i.test(text) || !/eth_sendRawTransaction/i.test(text)) {
        return null;
    }

    const rawTx = getRawTransactionFromError(error);
    if (!rawTx) {
        return null;
    }

    try {
        return Transaction.from(rawTx).hash;
    } catch (_) {
        return null;
    }
}

async function retryRpc(label, operation, options = {}) {
    const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    const initialDelayMs = options.initialDelayMs || DEFAULT_INITIAL_DELAY_MS;
    const maxDelayMs = options.maxDelayMs || DEFAULT_MAX_DELAY_MS;

    let delayMs = initialDelayMs;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            if (!isTransientRpcError(error) || attempt === maxAttempts) {
                throw error;
            }

            console.warn(`[RPC retry] ${label} failed (${error.message}); retry ${attempt}/${maxAttempts - 1} in ${delayMs}ms`);
            await sleep(delayMs);
            delayMs = Math.min(maxDelayMs, Math.floor(delayMs * 1.7));
        }
    }

    throw lastError;
}

async function waitForTx(tx, confirmations = 1, options = {}) {
    const label = options.label || `wait for tx ${tx.hash}`;
    return retryRpc(label, () => tx.wait(confirmations), options);
}

async function waitForTransactionReceipt(provider, txHash, options = {}) {
    const label = options.label || `get receipt ${txHash}`;
    return retryRpc(label, async () => {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
            const error = new Error(`Receipt not available yet for ${txHash}`);
            error.code = 'RECEIPT_NOT_AVAILABLE';
            throw error;
        }
        return receipt;
    }, {
        ...options,
        maxAttempts: options.maxAttempts || 12
    });
}

module.exports = {
    isTransientRpcError,
    getAlreadyKnownTransactionHash,
    retryRpc,
    waitForTx,
    waitForTransactionReceipt
};
