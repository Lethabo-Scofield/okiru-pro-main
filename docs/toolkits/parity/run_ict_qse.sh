#!/usr/bin/env bash
# Score ICT QSE cases through Excel, skipping cases whose Excel dump already
# exists. Each queued slot fills up to BATCH cases (one Excel run at a time).
#   bash docs/toolkits/parity/run_ict_qse.sh <heavy.sh> [case-id ...]
#   BATCH=4 bash docs/toolkits/parity/run_ict_qse.sh <heavy.sh>
#   bash docs/toolkits/parity/run_ict_qse.sh --inner <case-id ...>   (fills now, no queue)
set -u
cd "$(dirname "$0")/../../.."
TPL="docs/toolkits/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx"
OUT=docs/toolkits/parity/out/ict_qse
mkdir -p "$OUT"
if [ "$1" = "--inner" ]; then
  shift
  for id in "$@"; do
    [ -s "$OUT/$id.excel.json" ] && { echo "skip $id"; continue; }
    py -3 docs/toolkits/parity/toolkit_oracle.py fill "$TPL" \
      "docs/toolkits/parity/cases/ict_qse/$id.case.json" "$OUT/$id.excel.json" 2>&1 | grep -v "still protected" | tail -2
  done
  exit 0
fi
HEAVY=$1; shift
BATCH=${BATCH:-1}
ids=()
for id in "$@"; do ids+=("$id"); done
if [ ${#ids[@]} -eq 0 ]; then
  for f in docs/toolkits/parity/cases/ict_qse/*.case.json; do ids+=("$(basename "$f" .case.json)"); done
fi
todo=()
for id in "${ids[@]}"; do [ -s "$OUT/$id.excel.json" ] || todo+=("$id"); done
i=0
while [ $i -lt ${#todo[@]} ]; do
  chunk=("${todo[@]:$i:$BATCH}")
  bash "$HEAVY" excel bash docs/toolkits/parity/run_ict_qse.sh --inner "${chunk[@]}" 2>&1 | grep -v "waiting for a free"
  i=$((i + BATCH))
done
echo "done"
