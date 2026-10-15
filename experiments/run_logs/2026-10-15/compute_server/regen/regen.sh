#!/usr/bin/env bash
# Regenerate the of-record results from the 2026-10-15 Amoy data (32-core server).
set -u
export PATH=/opt/node/bin:$PATH
cd /root/policy_privacy
W=/root/regen; PY=/root/policy_privacy/.venv/bin/python
log() { echo "[$(date "+%F %T")] $*" | tee -a "$W/logs/driver.log"; }
step() { local n=$1; shift; log "start $n"; "$@" > "$W/logs/$n.log" 2>&1; local c=$?; log "done $n (exit $c)"; }
step supervised npm run analysis:supervised
step ablation_py npm run analysis:ablation
step ablation_figure "$PY" -m experiments.analysis.clustering.plot_ablation_paired
step gate_b2 "$PY" -m experiments.analysis.supervised.calldata_value_gate --data-dir experiments/data/polygonAmoy --output-dir experiments/results/value_gate/b2_padded
step gate_b1 "$PY" -m experiments.analysis.supervised.calldata_value_gate --data-dir experiments/ablation/gas_padding/polygonAmoy/b1_unpadded --output-dir experiments/results/value_gate/b1_unpadded
step clustering npm run analysis:clustering
step ablation_js node experiments/ablation/gas_padding/analyze.js --root-dir=experiments/ablation/gas_padding/polygonAmoy --concurrency=30
step criterion_sensitivity npm run analysis:criterion-sensitivity
log "REGEN COMPLETE"
