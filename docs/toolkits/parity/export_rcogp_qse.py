"""Export the RCOGP QSE expected bundles: for every Excel-scored QSE case, the
case itself, the Summary Scorecard cells, the cells and table rows the QSE
referee reads (apps/web/Toolkit/src/lib/parity/toolkitParity.rcogp_qse.ts),
and each line's formula chain for the reviewer. Synthetic cases only.

  py -3 export_rcogp_qse.py                 (every case under cases/rcogp_qse with a dump in out/rcogp_qse)
  py -3 export_rcogp_qse.py <id> [<id> ...]

Writes expected/rcogp_qse/<id>.json. The always-on gate
(toolkitParity.rcogp_qse.expected.test.ts) scores these without Excel.
"""
import sys, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from export_review_bundle import chain  # noqa: E402  (same chain walker; its behaviour is unchanged)

CASES = os.path.join(HERE, "cases", "rcogp_qse")
OUT = os.path.join(HERE, "out", "rcogp_qse")
EXPECTED = os.path.join(HERE, "expected", "rcogp_qse")

# Summary Scorecard rows: element totals, lines, grand total, levels.
ROWS = [19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 39, 40, 41, 42,
        44, 45, 47, 48, 49, 50, 52, 53, 55, 59, 61]

# Mirrors RCOGP_QSE_REFEREE_CELLS in toolkitParity.rcogp_qse.ts.
REFEREE_CELLS = (
    [("Ownership Scorecard", r) for r in ("D1", "I7", "I9", "I10", "J5", "J6", "J7", "J8", "J9", "J10")]
    + [("Ownership Data", "W3"), ("Skills Toolkit", "D8"),
       ("Skills Calcs", "D28"), ("Skills Calcs", "I28"), ("Skills Calcs", "I30")]
    + [("Procurement Scorecard", r) for r in ("C3", "C4", "F16", "I9", "I10", "I12")]
    + [("ESD Scorecard", "D2")]
)
REFEREE_TABLES = ("tblOwnershipData", "tblPPData", "tblESDData")


def export(case_id):
    excel = json.load(open(os.path.join(OUT, f"{case_id}.excel.json"), encoding="utf-8"))
    case = json.load(open(os.path.join(CASES, f"{case_id}.case.json"), encoding="utf-8"))
    sheets = excel["sheets"]
    summary = sheets["Summary Scorecard"]
    lines = {}
    for row in ROWS:
        lines[str(row)] = {
            "label": (summary.get(f"B{row}") or {}).get("v"),
            "weighting": (summary.get(f"C{row}") or {}).get("v"),
            "chain": chain(sheets, "Summary Scorecard", f"F{row}"),
        }
    cells = {"Summary Scorecard": {}}
    for row in range(18, 64):
        for col in "BCF":
            e = summary.get(f"{col}{row}")
            if e is not None:
                cells["Summary Scorecard"][f"{col}{row}"] = {"v": e.get("v")}
    for sheet, ref in REFEREE_CELLS:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    tables = {k: excel["tables"][k] for k in REFEREE_TABLES if k in excel["tables"]}
    os.makedirs(EXPECTED, exist_ok=True)
    out = os.path.join(EXPECTED, f"{case_id}.json")
    json.dump({"template": case.get("template"), "lines": lines, "cells": cells, "tables": tables, "sampleCase": case},
              open(out, "w", encoding="utf-8"), indent=1, default=str)
    return out


def main():
    ids = sys.argv[1:] or sorted(f[:-len(".case.json")] for f in os.listdir(CASES) if f.endswith(".case.json"))
    done = 0
    for case_id in ids:
        if not os.path.exists(os.path.join(OUT, f"{case_id}.excel.json")):
            print("no Excel dump for", case_id, "- skipped")
            continue
        print("wrote", export(case_id))
        done += 1
    print(done, "bundle(s)")


if __name__ == "__main__":
    main()
