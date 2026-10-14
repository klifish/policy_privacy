#!/usr/bin/env bash
# Run one capture as N concurrent shards against a single deployment, then
# merge them (experiments/capture/merge_shards.js).
#
#   experiments/capture/run_shards.sh <capture root> <b2_padded|b1_unpadded> <N> [definitions.json]
#
# 1. Prepare (once): write the definitions to <root> (generated from
#    UNIFIED_CONFIG_PATH, or copied from the given definitions file), deploy the
#    contracts with the default deployer key and write <root>/contract.json.
# 2. Run shards 0..N-1 concurrently in <root>/shards/shard-<i>. Shard 0 uses the
#    default keys (AMOY_PRIVATE_KEY / TPS_PRIVATE_KEY from .env, or the local
#    accounts); shard i>=1 uses SHARD_<i>_DEPLOYER_KEY and SHARD_<i>_TPS_KEY from
#    SHARD_KEYS_FILE (default .env.shards). A finished shard leaves DONE.
# 3. Merge into <root>.
#
# Rerunning the same command resumes: preparation and finished shards are
# skipped, unfinished shards continue from their checkpoints.
#
# Env: NETWORK (default polygonAmoy), PROTOCOL_CIRCUITS_DIR (required),
# UNIFIED_CONFIG_PATH (needed when no definitions file is given),
# TPS_POLLING_INTERVAL_MS (default 1000 on polygonAmoy), SHARD_PORT_BASE (3101).
set -uo pipefail

if [[ $# -lt 3 ]]; then
  sed -n '2,22p' "$0"
  exit 2
fi
ROOT="$(mkdir -p "$1" && cd "$1" && pwd)"
PROFILE="$2"
N="$3"
DEFS="${4:-}"
NETWORK="${NETWORK:-polygonAmoy}"
KEYS="${SHARD_KEYS_FILE:-.env.shards}"
PORT_BASE="${SHARD_PORT_BASE:-3101}"
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
: "${PROTOCOL_CIRCUITS_DIR:?set PROTOCOL_CIRCUITS_DIR}"
if [[ "$NETWORK" == "polygonAmoy" && -z "${TPS_POLLING_INTERVAL_MS:-}" ]]; then
  export TPS_POLLING_INTERVAL_MS=1000
fi
mkdir -p "$ROOT/shards"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$ROOT/run_shards.log"; }

# A shard whose capture process died can leave its TPS child on the shard's
# port, which would stop the resumed shard from starting its own TPS.
free_port() {
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$1" 2>/dev/null || true)"
  fi
  if [[ -n "${pids// /}" ]]; then
    log "stopping stale process(es) $pids on port $1"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

shard_key() {  # shard_key <i> <DEPLOYER|TPS>
  local line
  line="$(grep -E "^SHARD_$1_$2_KEY=" "$KEYS" 2>/dev/null | head -1)"
  [[ -n "$line" ]] || { echo "missing SHARD_$1_$2_KEY in $KEYS" >&2; return 1; }
  echo "${line#*=}"
}

if [[ ! -f "$ROOT/contract.json" ]]; then
  log "prepare: definitions and deployment ($PROFILE, $NETWORK)"
  if ! env CAPTURE_PREPARE_ONLY=1 UNIFIED_ARTIFACT_DIR="$ROOT" PROTECTION_PROFILE="$PROFILE" \
      ${DEFS:+UNIFIED_DATASET_PATH="$DEFS"} \
      npx hardhat run --no-compile experiments/capture/run.js --network "$NETWORK" > "$ROOT/prepare.log" 2>&1; then
    log "prepare failed; see $ROOT/prepare.log"
    exit 1
  fi
fi
CONTRACT="$(node -e "process.stdout.write(require(process.argv[1]).policyPrivacyAddress)" "$ROOT/contract.json")"
log "contract $CONTRACT; launching $N shards"

pids=()
for i in $(seq 0 $((N - 1))); do
  dir="$ROOT/shards/shard-$i"
  mkdir -p "$dir"
  if [[ -f "$dir/DONE" ]]; then
    log "shard $i already done"
    continue
  fi
  free_port $((PORT_BASE + i))
  keys=()
  if [[ $i -gt 0 ]]; then
    dk="$(shard_key "$i" DEPLOYER)" || exit 1
    tk="$(shard_key "$i" TPS)" || exit 1
    keys=(CAPTURE_DEPLOYER_KEY="$dk" CAPTURE_TPS_KEY="$tk")
  fi
  (
    if env ${keys[@]+"${keys[@]}"} CAPTURE_SHARD="$i/$N" CAPTURE_CONTRACT_ADDRESS="$CONTRACT" \
        UNIFIED_DATASET_PATH="$ROOT/policy_definitions.json" UNIFIED_CONFIG_PATH="$ROOT/config.json" \
        UNIFIED_ARTIFACT_DIR="$dir" PROTECTION_PROFILE="$PROFILE" TPS_PORT=$((PORT_BASE + i)) \
        npx hardhat run --no-compile experiments/capture/run.js --network "$NETWORK" >> "$dir/run.log" 2>&1; then
      touch "$dir/DONE"
    else
      exit 1
    fi
  ) &
  pids+=("$!")
done

failed=0
for pid in "${pids[@]}"; do
  wait "$pid" || failed=1
done
if [[ $failed -ne 0 ]]; then
  log "a shard failed; see $ROOT/shards/shard-*/run.log, then rerun this command to resume"
  exit 1
fi
log "all shards done; merging"
node experiments/capture/merge_shards.js "$ROOT" 2>&1 | tee -a "$ROOT/run_shards.log"
exit "${PIPESTATUS[0]}"
