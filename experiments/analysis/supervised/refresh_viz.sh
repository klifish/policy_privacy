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
  pi)  PROBE="pi_viz_probe";  DATA="viz_data_pi.json";  OUT="pi_protocol_viz.html" ;;
  *) echo "unknown experiment '$EXP' (expected: pch | spp | pi)" >&2; exit 2 ;;
esac

# PI: prefer the of-record pi_pairs.json so the dashboard matches the
# authoritative verdict, instead of a freshly generated random draw. Only inject
# --pairs when the caller didn't already pass one.
EXTRA=()
if [[ "$EXP" == "pi" && "$*" != *"--pairs"* ]]; then
  OFRECORD="$RESULTS/pi_pairs_generated.json"
  if [[ -f "$OFRECORD" ]]; then EXTRA=(--pairs "$OFRECORD"); echo "(using of-record pi_pairs.json)"; fi
fi

echo "[1/2] probing $EXP ($PROBE $* ${EXTRA[*]:-}) ..."
if [[ ${#EXTRA[@]} -gt 0 ]]; then
  "$PY" -m "experiments.analysis.supervised.$PROBE" "$@" "${EXTRA[@]}"
else
  "$PY" -m "experiments.analysis.supervised.$PROBE" "$@"
fi

echo "[2/2] building dashboard ..."
"$PY" -m experiments.analysis.supervised.build_viz_html --data "$RESULTS/$DATA" --out "$RESULTS/$OUT"

HTML="$RESULTS/$OUT"
echo "Done -> $HTML"
if command -v open >/dev/null 2>&1; then open "$HTML"; fi
