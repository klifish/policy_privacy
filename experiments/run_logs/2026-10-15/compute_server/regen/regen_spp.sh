#!/usr/bin/env bash
# Rerun the SPP supervised analysis and the criterion sensitivity after the
# shallowest-match dataset lookup fix.
set -u
export PATH=/opt/node/bin:$PATH
cd /root/policy_privacy
W=/root/regen
log() { echo "[$(date "+%F %T")] $*" | tee -a "$W/logs/driver.log"; }
step() { local n=$1; shift; log "start $n"; "$@" > "$W/logs/$n.log" 2>&1; local c=$?; log "done $n (exit $c)"; }
step spp_fix npm run analysis:spp
step criterion_sensitivity_fix npm run analysis:criterion-sensitivity
log "SPP FIX COMPLETE"
