#!/usr/bin/env bash
# Score every ICT QSE case through Excel, one queued run at a time, skipping
# cases whose Excel dump already exists.
#   bash docs/toolkits/parity/run_ict_qse.sh <heavy.sh> [case-id ...]
set -u
HEAVY=$1; shift
cd "$(dirname "$0")/../../.."
TPL="docs/toolkits/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx"
OUT=docs/toolkits/parity/out/ict_qse
mkdir -p "$OUT"
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  for f in docs/toolkits/parity/cases/ict_qse/*.case.json; do ids+=("$(basename "$f" .case.json)"); done
fi
for id in "${ids[@]}"; do
  [ -s "$OUT/$id.excel.json" ] && { echo "skip $id"; continue; }
  bash "$HEAVY" excel py -3 docs/toolkits/parity/toolkit_oracle.py fill "$TPL" \
    "docs/toolkits/parity/cases/ict_qse/$id.case.json" "$OUT/$id.excel.json" 2>&1 | grep -v "waiting for a free" | tail -2
done
echo "done"
