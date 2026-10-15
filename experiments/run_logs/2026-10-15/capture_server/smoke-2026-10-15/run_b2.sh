#!/usr/bin/env bash
cd /root/policy-privacy/policy_privacy
( while true; do echo "$(date +%s) $(ps -eo rss=,args= | awk "/hardhat run|tps\/index.js|bin\/prover/ && !/awk/ {s+=\$1} END {print s}") $(free -m | awk "/Mem:/ {print \$7}")"; sleep 2; done ) > /root/policy-privacy/smoke-2026-10-15/mem_b2.log 2>&1 &
SAMPLER=$!
NETWORK=polygonAmoy PROTOCOL_CIRCUITS_DIR=$PWD/build/protocol/v3.0.0-rc2/circuits RAPIDSNARK_PROVER=/root/rapidsnark/package/bin/prover PROVER_BACKEND=rapidsnark UNIFIED_CONFIG_PATH=experiments/capture/configs/unified_dataset_config_decoupled_smoke.json experiments/capture/run_shards.sh /root/policy-privacy/smoke-2026-10-15/b2 b2_padded 4
echo "EXIT $?" >> /root/policy-privacy/smoke-2026-10-15/b2/run_shards.log
kill $SAMPLER
