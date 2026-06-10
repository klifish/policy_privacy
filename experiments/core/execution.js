'use strict';

const fs = require('fs');

const { executePolicy } = require('./data_generator');

// --- Checkpoint helpers (used internally) ---

function saveCheckpoint(checkpointPath, phase, step, data) {
  const checkpoint = { timestamp: new Date().toISOString(), phase, step, data };
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function loadCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  } catch (error) {
    console.warn(`Failed to load checkpoint: ${error.message}`);
    return null;
  }
}

function clearCheckpoint(checkpointPath) {
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }
}

/**
 * Execute a dataset sequentially against an on-chain contract, with optional
 * progress reporting and checkpoint support.
 *
 * @param {Array}  dataset     - Policy instances to execute.
 * @param {object} contract    - Deployed PolicyPrivacy contract instance.
 * @param {string} outputPath  - File path to write JSON results to.
 * @param {object} [options]
 * @param {object} [options.progressTracker]      - ProgressTracker instance (core/progress.js).
 * @param {string} [options.checkpointPath]       - File path for resume checkpoints. When set,
 *                                                  a checkpoint is written every 10 executions
 *                                                  and the run can be resumed from where it left off.
 * @param {boolean} [options.clearCheckpointOnDone=false] - Delete the checkpoint file on success.
 * @returns {Promise<Array>} Resolved execution results (failures are skipped, not thrown).
 */
async function executeDatasetWithProgress(dataset, contract, outputPath, options = {}) {
  const { progressTracker, checkpointPath, clearCheckpointOnDone = false } = options;

  let results = [];
  let startIndex = 0;

  if (checkpointPath) {
    const checkpoint = loadCheckpoint(checkpointPath);
    if (checkpoint && checkpoint.phase === 'execution' && checkpoint.data) {
      results = checkpoint.data.results || [];
      startIndex = checkpoint.data.lastIndex + 1;
      console.log(`\n   Resuming from checkpoint: ${results.length} policies already executed`);
    }
  }

  console.log(`Executing ${dataset.length - startIndex} policy instances sequentially (${startIndex} already done)...`);

  for (let i = startIndex; i < dataset.length; i++) {
    const policyData = dataset[i];
    try {
      const result = await executePolicy(policyData, contract);
      results.push(result);

      if (checkpointPath && (i + 1) % 10 === 0) {
        saveCheckpoint(checkpointPath, 'execution', 'executing_dataset', {
          lastIndex: i,
          results,
          dataset
        });
      }

      if (progressTracker) {
        progressTracker.updateSubProgress(i + 1, dataset.length,
          ` | Executed ${i + 1}/${dataset.length} policies`);
      }
    } catch (error) {
      console.error(`\nError executing policy ${i}:`, error.message);
      if (progressTracker) {
        progressTracker.updateSubProgress(i + 1, dataset.length,
          ` | Executed ${i + 1}/${dataset.length} policies (1 failed)`);
      }
    }
  }

  if (progressTracker) {
    progressTracker.updateSubProgress(dataset.length, dataset.length, ' | Complete');
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n   Saved ${results.length}/${dataset.length} execution results to ${outputPath}`);

  if (clearCheckpointOnDone && checkpointPath) {
    clearCheckpoint(checkpointPath);
  }

  return results;
}

module.exports = { executeDatasetWithProgress };
