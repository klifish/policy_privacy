#!/usr/bin/env bash
cd /root/policy-privacy/policy_privacy
NETWORK=polygonAmoy PROTOCOL_CIRCUITS_DIR=$PWD/build/protocol/v3.0.0-rc2/circuits RAPIDSNARK_PROVER=/root/rapidsnark/package/bin/prover PROVER_BACKEND=rapidsnark UNIFIED_CONFIG_PATH=/root/policy-privacy/smoke-2026-10-15/abl/shared/source_config.json experiments/capture/run_shards.sh /root/policy-privacy/smoke-2026-10-15/abl/b1_unpadded b1_unpadded 4 /root/policy-privacy/smoke-2026-10-15/abl/shared/policy_definitions.json
echo "EXIT $?" >> /root/policy-privacy/smoke-2026-10-15/abl/b1_unpadded/run_shards.log
