"use strict";

const fs = require("fs");
const path = require("path");

function loadDataset(datasetPath) {
  const resolved = path.resolve(datasetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Dataset file not found: ${resolved}`);
  }
  const contents = fs.readFileSync(resolved, "utf8");
  let data;
  try {
    data = JSON.parse(contents);
  } catch (err) {
    throw new Error(`Failed to parse dataset JSON: ${err.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error("Dataset JSON must be an array of policy execution entries.");
  }
  return data;
}

function increment(map, key, delta = 1) {
  map.set(key, (map.get(key) || 0) + delta);
}

function sortDistribution(map) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

function summarizeExecutionsByPolicy(entries) {
  const perPolicy = new Map();
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const policyId = entry.policyId ?? entry.policyIndex ?? "unknown";
    if (!perPolicy.has(policyId)) {
      perPolicy.set(policyId, {
        executions: 0,
        satisfied: 0,
        unsatisfied: 0,
        executionIds: new Set(),
      });
    }
    const summary = perPolicy.get(policyId);
    summary.executions += 1;
    if (entry.satisfy) {
      summary.satisfied += 1;
    } else {
      summary.unsatisfied += 1;
    }
    if (entry.executionId !== undefined && entry.executionId !== null) {
      summary.executionIds.add(entry.executionId);
    }
  });
  return perPolicy;
}

function calculateExecutionStats(perPolicy) {
  const counts = [];
  const satisfiedRatios = [];
  let missingSatisfyCoverage = 0;
  let duplicateExecutionIds = 0;

  for (const summary of perPolicy.values()) {
    counts.push(summary.executions);
    const total = summary.executions || 1;
    satisfiedRatios.push(summary.satisfied / total);
    if (summary.satisfied === 0 || summary.unsatisfied === 0) {
      missingSatisfyCoverage += 1;
    }
    if (summary.executionIds.size !== summary.executions) {
      duplicateExecutionIds += 1;
    }
  }

  counts.sort((a, b) => a - b);
  satisfiedRatios.sort((a, b) => a - b);

  const totalPolicies = perPolicy.size || 1;
  const meanExecutions =
    counts.reduce((sum, value) => sum + value, 0) / totalPolicies;

  return {
    totalPolicies: perPolicy.size,
    minExecutions: counts[0] ?? 0,
    maxExecutions: counts[counts.length - 1] ?? 0,
    meanExecutions,
    satisfiedRatio: satisfiedRatios.reduce((sum, value) => sum + value, 0) / totalPolicies,
    policyWithoutDualCoverage: missingSatisfyCoverage,
    policiesWithDuplicateExecutionIds: duplicateExecutionIds,
  };
}

function evaluateDatasetQuality(dataset, options = {}) {
  if (!Array.isArray(dataset)) {
    throw new Error("Dataset must be an array.");
  }

  const entries = dataset;
  const totals = {
    totalEntries: entries.length,
  };

  const distributions = {
    layers: new Map(),
    duoTerms: new Map(),
    comboCodes: new Map(),
    ontologyNamespaces: new Map(),
    satisfy: new Map(),
    proofTypes: new Map(),
  };

  const issues = [];

  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      issues.push({
        type: "error",
        message: `Entry at index ${index} is not an object.`,
      });
      return;
    }

    if (!Array.isArray(entry.requesterAttrs) || entry.requesterAttrs.length === 0) {
      issues.push({
        type: "warning",
        message: `Entry ${index} is missing requester attributes.`,
      });
    }

    if (entry.requiresOntology) {
      if (entry.ontologyNamespace === null || entry.ontologyNamespace === undefined) {
        issues.push({
          type: "warning",
          message: `Entry ${index} requires ontology but has no namespace.`,
        });
      }
      if (entry.ontologyValue === null || entry.ontologyValue === undefined) {
        issues.push({
          type: "warning",
          message: `Entry ${index} requires ontology but has no ontology value.`,
        });
      }
    }

    const layer = entry.layer ?? "unknown";
    increment(distributions.layers, layer);

    if (entry.duoTerm !== undefined && entry.duoTerm !== null) {
      increment(distributions.duoTerms, entry.duoTerm);
    }

    if (Array.isArray(entry.duoTermCodes) && entry.duoTermCodes.length > 0) {
      const comboKey = entry.duoTermCodes.join("+");
      increment(distributions.comboCodes, comboKey);
    } else if (entry.attributeOrder) {
      increment(distributions.comboCodes, "unspecified");
    }

    const satisfyKey = entry.satisfy ? "satisfied" : "unsatisfied";
    increment(distributions.satisfy, satisfyKey);

    if (entry.ontologyNamespace) {
      increment(distributions.ontologyNamespaces, entry.ontologyNamespace);
    }

    const proofType = entry?.structure?.proofType ?? "unknown";
    increment(distributions.proofTypes, proofType);
  });

  const perPolicy = summarizeExecutionsByPolicy(entries);
  const executionStats = calculateExecutionStats(perPolicy);

  if (executionStats.policyWithoutDualCoverage > 0) {
    issues.push({
      type: "warning",
      message: `${executionStats.policyWithoutDualCoverage} policies only have satisfied or unsatisfied executions.`,
    });
  }

  if (executionStats.policiesWithDuplicateExecutionIds > 0) {
    issues.push({
      type: "warning",
      message: `${executionStats.policiesWithDuplicateExecutionIds} policies have duplicate executionId values.`,
    });
  }

  const quality = {
    totals: {
      totalEntries: totals.totalEntries,
      totalPolicies: executionStats.totalPolicies,
    },
    executionStats,
    distributions: {
      layers: sortDistribution(distributions.layers),
      duoTerms: sortDistribution(distributions.duoTerms),
      comboCodes: sortDistribution(distributions.comboCodes),
      ontologyNamespaces: sortDistribution(distributions.ontologyNamespaces),
      satisfy: sortDistribution(distributions.satisfy),
      proofTypes: sortDistribution(distributions.proofTypes),
    },
    issues,
  };

  if (totals.totalEntries === 0) {
    issues.push({
      type: "error",
      message: "Dataset is empty.",
    });
  }

  if (distributions.satisfy.size === 1) {
    issues.push({
      type: "warning",
      message: "Dataset only contains satisfied or unsatisfied executions. Consider balancing satisfy ratio.",
    });
  }

  return quality;
}

function formatQualityReport(quality) {
  const lines = [];
  lines.push("Dataset Quality Report");
  lines.push("=".repeat(24));
  lines.push(`Total entries: ${quality.totals.totalEntries}`);
  lines.push(`Total policies: ${quality.executionStats.totalPolicies}`);
  lines.push(
    `Executions per policy: min=${quality.executionStats.minExecutions}, max=${quality.executionStats.maxExecutions}, mean=${quality.executionStats.meanExecutions.toFixed(
      2
    )}`
  );
  lines.push(
    `Average satisfy ratio: ${(quality.executionStats.satisfiedRatio * 100).toFixed(1)}%`
  );
  if (quality.executionStats.policyWithoutDualCoverage > 0) {
    lines.push(
      `Policies missing dual coverage: ${quality.executionStats.policyWithoutDualCoverage}`
    );
  }
  if (quality.executionStats.policiesWithDuplicateExecutionIds > 0) {
    lines.push(
      `Policies with duplicate executionIds: ${quality.executionStats.policiesWithDuplicateExecutionIds}`
    );
  }

  lines.push("");
  lines.push("Distributions:");
  Object.entries(quality.distributions).forEach(([name, entries]) => {
    if (!entries.length) {
      return;
    }
    lines.push(`  ${name}:`);
    entries.slice(0, 10).forEach((entry) => {
      lines.push(`    - ${entry.value}: ${entry.count}`);
    });
    if (entries.length > 10) {
      lines.push("    - ...");
    }
  });

  if (quality.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");
    quality.issues.forEach((issue) => {
      lines.push(`  [${issue.type.toUpperCase()}] ${issue.message}`);
    });
  }

  return lines.join("\n");
}

module.exports = {
  loadDataset,
  evaluateDatasetQuality,
  formatQualityReport,
};
