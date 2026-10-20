"""Expected bundles for the ICT QSE parity gate: for every Excel-scored ICT QSE
case, the Summary Scorecard (labels, weightings, toolkit points, levels), the
cells and table rows the referee reworks the toolkit's faulty formulas from,
the formula chain behind each scored line, and the case itself. Synthetic
cases only.

  py -3 docs/toolkits/parity/export_ict_qse.py            (every case with a dump)
  py -3 docs/toolkits/parity/export_ict_qse.py iq_1 iq_2

Reads cases/ict_qse/<id>.case.json and out/ict_qse/<id>.excel.json, writes
expected/ict_qse/<id>.json. Read by
apps/web/Toolkit/src/lib/calculators/__tests__/toolkitParity.ict_qse.expected.test.ts.
"""
import sys, os, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from export_review_bundle import chain  # noqa: E402

# Summary Scorecard rows with points (lines and element totals) and the levels.
LINE_ROWS = [20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 34, 35, 36, 37, 40, 41, 42, 45, 48, 49, 50, 51, 54]
TOTAL_ROWS = [19, 27, 33, 39, 44, 47, 53, 56]
SUMMARY_FROM, SUMMARY_TO = 18, 64
# Keep the same as ICT_QSE_REFEREE_CELLS in Toolkit/src/lib/parity/toolkitParity.ict_qse.ts.
REFEREE_CELLS = [
    ("Client Information", "C23"),
    ("Ownership Scorecard", "D1"), ("Ownership Scorecard", "I9"),
    ("Ownership Scorecard", "J7"), ("Ownership Scorecard", "J9"), ("Ownership Scorecard", "J10"),
    ("Ownership Data", "W3"),
    ("MC Scorecard (Exco + Senior)", "D28"), ("MC Scorecard (Exco + Senior)", "E28"), ("MC Scorecard (Exco + Senior)", "J28"),
    ("Procurement Scorecard", "C3"), ("Procurement Scorecard", "C4"),
    ("Procurement Scorecard", "C9"), ("Procurement Scorecard", "D9"), ("Procurement Scorecard", "I9"),
    ("Procurement Scorecard", "C10"), ("Procurement Scorecard", "D10"), ("Procurement Scorecard", "I10"),
    ("Procurement Scorecard", "C12"), ("Procurement Scorecard", "D12"), ("Procurement Scorecard", "I12"),
    ("ESD Scorecard", "D2"), ("ESD Scorecard", "E12"), ("ESD Scorecard", "F12"),
]
REFEREE_TABLES = ("tblOwnershipData", "tblPPData", "tblESDData")


def export(case_id):
    case = json.load(open(os.path.join(HERE, "cases", "ict_qse", f"{case_id}.case.json"), encoding="utf-8"))
    excel = json.load(open(os.path.join(HERE, "out", "ict_qse", f"{case_id}.excel.json"), encoding="utf-8"))
    sheets = excel["sheets"]
    summary = sheets["Summary Scorecard"]
    lines = {}
    for row in LINE_ROWS + TOTAL_ROWS:
        lines[str(row)] = {
            "label": (summary.get(f"B{row}") or {}).get("v"),
            "weighting": (summary.get(f"C{row}") or {}).get("v"),
            "chain": chain(sheets, "Summary Scorecard", f"F{row}"),
        }
    cells = {"Summary Scorecard": {}}
    for row in range(SUMMARY_FROM, SUMMARY_TO + 1):
        for col in "BCF":
            e = summary.get(f"{col}{row}")
            if e is not None:
                cells["Summary Scorecard"][f"{col}{row}"] = {"v": e.get("v")}
    for sheet, ref in REFEREE_CELLS:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    tables = {k: excel["tables"][k] for k in REFEREE_TABLES if k in excel["tables"]}
    out = os.path.join(HERE, "expected", "ict_qse", f"{case_id}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({"template": case.get("template"), "lines": lines, "cells": cells, "tables": tables, "sampleCase": case},
              open(out, "w", encoding="utf-8"), indent=1, default=str)
    print("wrote", out)


def main():
    ids = sys.argv[1:]
    if not ids:
        ids = sorted(os.path.basename(p)[:-len(".excel.json")]
                     for p in glob.glob(os.path.join(HERE, "out", "ict_qse", "*.excel.json"))
                     if not os.path.basename(p).startswith("template"))
    for case_id in ids:
        export(case_id)


if __name__ == "__main__":
    main()
