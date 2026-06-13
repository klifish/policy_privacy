'use strict';

/**
 * HTTP client for the Trusted Proof Service.
 *
 * Used by API route handlers to:
 *   - provision a policy (Stage 2)
 *   - request a proof   (Stage 4)
 */

const http = require('http');
const https = require('https');

function getTpsBase() {
    return process.env.TPS_URL || 'http://localhost:3001';
}

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(getTpsBase() + path);
        const payload = body ? JSON.stringify(body) : undefined;
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(Object.assign(new Error(parsed.error || 'TPS error'), {
                            status: res.statusCode,
                            body: parsed
                        }));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`TPS returned non-JSON: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/**
 * Stage 2: provision policy-bound proving material to the TPS.
 *
 * @param {string|number} policyId
 * @param {object} material  { penc, randomizer, paramsCommitment, merkleRoots, ... }
 */
async function provision(policyId, material) {
    return request('POST', '/tps/provision', { policyId, material });
}

/**
 * Stage 4: ask the TPS to generate a ZK proof.
 *
 * @param {object} params
 *   { policyId, resourceId, nonce, policyCommitment, evidence }
 * @returns {Promise<{pA, pB, pC, pubSignals, sessionId}>}
 */
async function prove(params) {
    return request('POST', '/tps/prove', params);
}

/**
 * Health check – useful for startup verification.
 */
async function health() {
    return request('GET', '/tps/health');
}

module.exports = { provision, prove, health };
