#!/usr/bin/env bash
# JS cross-check of the of-record verdicts on the 2026-10-15 Amoy data (32 cores).
set -u
export PATH=/opt/node/bin:$PATH
cd /root/policy_privacy
W=/root/regen; C=30
log() { echo "[$(date "+%F %T")] $*" | tee -a "$W/logs/driver.log"; }
step() { local n=$1; shift; log "start $n"; "$@" > "$W/logs/$n.log" 2>&1; local c=$?; log "done $n (exit $c)"; }
step js_pch node experiments/analysis/crosscheck/pch/run_experiment.js --use-unified-dataset --phase 2 --network polygonAmoy --concurrency=$C
step js_pi node experiments/analysis/crosscheck/pi/run_experiment.js --use-unified-dataset --phase 2 --network polygonAmoy --concurrency=$C
step js_spp node experiments/analysis/crosscheck/spp/run_experiment.js --use-unified-dataset --phase 2 --balance-method undersample --network polygonAmoy --concurrency=$C
step compare_js npm run analysis:compare:js
step evaluation_verify npm run evaluation:verify
log "JS CROSSCHECK COMPLETE"
