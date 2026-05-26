'use strict';

/**
 * TPS service entry point.
 * Start with:  node tps/index.js
 */

const express = require('express');
const tpsRouter = require('./server');

const PORT = process.env.TPS_PORT || 3001;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/tps', tpsRouter);

app.listen(PORT, () => {
    console.log(`[TPS] Trusted Proof Service listening on port ${PORT}`);
    console.log(`[TPS] POST /tps/provision  – provider provisions policy material`);
    console.log(`[TPS] POST /tps/prove      – requester requests proof generation`);
    console.log(`[TPS] GET  /tps/health     – health check`);
});

module.exports = app;
