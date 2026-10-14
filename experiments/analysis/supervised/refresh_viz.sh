#!/usr/bin/env bash
# Refresh a supervised-attack protocol dashboard: probe, then rebuild the HTML.
#
#   ./refresh_viz.sh                 # PCH, 30 seeds
#   ./refresh_viz.sh spp             # SPP, 30 seeds
#   ./refresh_viz.sh pch --seeds 10  # any probe flag passes through
#
# Runs from anywhere; auto-locates its own directory and the venv.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
PY="$ROOT/.venv/bin/python"
RESULTS="$ROOT/experiments/results/supervised"
cd "$ROOT"

# First positional arg (if not a flag) selects the experiment; default pch.
EXP="pch"
if [[ "${1:-}" != "" && "${1:-}" != -* ]]; then EXP="$1"; shift; fi
EXP="$(echo "$EXP" | tr '[:upper:]' '[:lower:]')"

case "$EXP" in
  pch) PROBE="viz_probe";     DATA="viz_data.json";     OUT="pch_protocol_viz.html" ;;
  spp) PROBE="spp_viz_probe"; DATA="viz_data_spp.json"; OUT="spp_protocol_viz.html" ;;
  pi) echo "the PI dashboard showed the retired pooled-pair attack; PI is now a within-pair attack (pi_supervised.py) with no dashboard" >&2; exit 2 ;;
  *) echo "unknown experiment '$EXP' (expected: pch | spp)" >&2; exit 2 ;;
esac

echo "[1/2] probing $EXP ($PROBE $*) ..."
"$PY" -m "experiments.analysis.supervised.$PROBE" "$@"

echo "[2/2] building dashboard ..."
"$PY" -m experiments.analysis.supervised.build_viz_html --data "$RESULTS/$DATA" --out "$RESULTS/$OUT"

HTML="$RESULTS/$OUT"
echo "Done -> $HTML"
if command -v open >/dev/null 2>&1; then open "$HTML"; fi
