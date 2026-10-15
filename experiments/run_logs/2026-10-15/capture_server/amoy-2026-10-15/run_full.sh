#!/usr/bin/env bash
# Amoy capture 2026-10-15: the full B2 (padded) capture, then the full B1
# (unpadded) replay of it, 4 shards each. Every step leaves a .done marker
# and is skipped on a rerun; a failed capture is resumed up to 3 times.
set -u
REPO=/root/policy-privacy/policy_privacy
cd "$REPO"
D=$REPO/experiments/data/polygonAmoy-2026-10-15
A=$REPO/experiments/ablation/gas_padding/polygonAmoy-2026-10-15
W=/root/policy-privacy/amoy-2026-10-15
log() { echo "[$(date "+%F %T")] $*" | tee -a "$W/driver.log"; }
export NETWORK=polygonAmoy PROTOCOL_CIRCUITS_DIR=$REPO/build/protocol/v3.0.0-rc2/circuits \
  RAPIDSNARK_PROVER=/root/rapidsnark/package/bin/prover PROVER_BACKEND=rapidsnark
( while true; do
    echo "$(date +%s) $(ps -eo rss=,args= | awk "/hardhat run|tps\/index.js|bin\/prover/ && !/awk/ {s+=\$1} END {print s+0}") $(free -m | awk "/Mem:/ {print \$7}")"
    sleep 10
  done ) >> "$W/mem.log" 2>&1 &
SAMPLER=$!
trap "kill $SAMPLER 2>/dev/null" EXIT
step() {
  local name=$1; shift
  if [[ -f "$W/$name.done" ]]; then log "skip $name"; return 0; fi
  log "start $name"
  if "$@" >> "$W/$name.log" 2>&1; then touch "$W/$name.done"; log "done $name"; return 0; fi
  log "FAILED $name"; return 1
}
retry() {
  local name=$1; shift
  for attempt in 1 2 3; do
    step "$name" "$@" && return 0
    log "resuming $name (attempt $attempt failed)"; sleep 60
  done
  return 1
}
step fund_b2 node scripts/shard_wallets.js fund --count=4 --executions=1977 --profile=b2_padded || exit 1
retry capture_b2 env UNIFIED_CONFIG_PATH=experiments/capture/configs/unified_dataset_config_decoupled.json \
  experiments/capture/run_shards.sh "$D" b2_padded 4 || exit 1
step prepare_b1 node experiments/ablation/gas_padding/prepare.js --source-dir="$D" --output-dir="$A" --all || exit 1
step fund_b1 node scripts/shard_wallets.js fund --count=4 --executions=1977 --profile=b1_unpadded || exit 1
retry capture_b1 env UNIFIED_CONFIG_PATH="$A/shared/source_config.json" \
  experiments/capture/run_shards.sh "$A/b1_unpadded" b1_unpadded 4 "$A/shared/policy_definitions.json" || exit 1
step verify_ablation node experiments/ablation/gas_padding/verify.js "$A" || exit 1
log "ALL DONE"
