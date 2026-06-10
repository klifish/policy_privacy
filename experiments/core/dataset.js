'use strict';

const { getArtifactPaths } = require('../unified/artifacts');

const EXPERIMENT_DATASET_KEYS = {
  pch: 'pchDataset',
  spp: 'sppDataset',
  pi: 'piDataset'
};

/**
 * Resolve dataset and execution-results paths for an experiment.
 *
 * When config.useUnifiedDataset is true, paths are derived from the unified
 * artifacts directory (config.unifiedDatasetDir or the default).  Any paths
 * already set on config take precedence and are left unchanged.
 *
 * @param {object} config - Experiment config (output of parseArgs).
 * @param {'pch'|'spp'|'pi'} experimentKey - Which experiment slice to load.
 * @returns {{ datasetPath: string|null, executionResultsPath: string|null, unifiedPaths: object|null }}
 */
function resolveDatasetPaths(config, experimentKey) {
  const datasetKey = EXPERIMENT_DATASET_KEYS[experimentKey];
  if (!datasetKey) {
    throw new Error(`Unknown experimentKey "${experimentKey}". Must be one of: ${Object.keys(EXPERIMENT_DATASET_KEYS).join(', ')}`);
  }

  let datasetPath = config.datasetPath || null;
  let executionResultsPath = config.executionResultsPath || null;
  let unifiedPaths = null;

  if (config.useUnifiedDataset) {
    unifiedPaths = getArtifactPaths(config.unifiedDatasetDir);
    console.log('Using unified dataset artifacts:');
    console.log(`  Base dir:   ${unifiedPaths.dir}`);
    console.log(`  Policies:   ${unifiedPaths.policyDefinitions}`);
    console.log(`  Executions: ${unifiedPaths[datasetKey]}`);
    console.log();

    if (!datasetPath) {
      datasetPath = unifiedPaths.policyDefinitions;
    }
    if (!executionResultsPath) {
      executionResultsPath = unifiedPaths[datasetKey];
    }
  }

  return { datasetPath, executionResultsPath, unifiedPaths };
}

module.exports = { resolveDatasetPaths };
