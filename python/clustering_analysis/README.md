# Python clustering privacy cross-checks

The clustering pipeline is label-free and intentionally uses the complete
dataset rather than a train/test split. It clusters the two policy-dependent gas
features (`commitGasUsed`, `accessGasUsed`) and compares clusters with hidden
labels only after fitting.

The authoritative runner is:

```bash
python/.venv/bin/python python/clustering_analysis/run_all_clustering.py
```

Defaults are 20 K-Means initializations, 200 label permutations, and 500
policy-level bootstrap draws. PCH reports primary-DUO multiclass and ICD-10
multiclass attacks; these complement, rather than duplicate, the supervised
one-vs-rest tasks. SPP reports four targets. PI uses 133 balanced 30-vs-30 pairs,
BH-FDR q-values, and a policy-weighted bootstrap because policies recur across
pairs.

For a cheap end-to-end validation:

```bash
python/.venv/bin/python python/clustering_analysis/run_all_clustering.py \
  --data-dir /tmp/policy-privacy-clustering/data \
  --results-dir /tmp/policy-privacy-clustering/results \
  --kmeans-seeds 2 --permutations 10 --bootstraps 3
```

Every result directory includes metadata with source SHA-256, feature keys, and
randomization counts.
