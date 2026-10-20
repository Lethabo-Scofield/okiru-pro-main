"""Expected bundles for the AgriBEE Generic always-on parity gate: for every
Excel-scored case, the Summary Scorecard (each line's cell, formula and the
chain of cells it reads), the extra cells the referee reads, the columns of
the tables it reworks the toolkit's faulty formulas from, and the case itself.
Synthetic cases only.

  py -3 export_agri_generic.py <out/agri_generic> <cases/agri_generic> <expected/agri_generic>
"""
import sys, json, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_review_bundle import chain  # noqa: E402

ROWS = [19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
        43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 58, 59, 61, 62, 63, 64, 66, 67, 69, 73, 75]

# Must match AGRI_REFEREE_CELLS in Toolkit/src/lib/parity/toolkitParity.agri_generic.ts.
REFEREE_CELLS = [
    ("Ownership Scorecard", "D1"), ("Ownership Scorecard", "J7"), ("Ownership Scorecard", "J16"),
    ("Ownership Data", "W3"),
    ("MC Toolkit", "C7"),
    ("Skills Toolkit", "D11"),
    *[("Skills Calcs", f"{c}{r}") for r in range(40, 46) for c in "DE"],
    ("Procurement Scorecard", "C3"), ("Procurement Scorecard", "C4"),
    ("ESD Scorecard", "D2"),
]

# The columns the referee reads from each table.
REFEREE_COLUMNS = {
    "tblOwnershipData": ["Shareholder", "Share %", "BO%", "Outstaning Debt", "Loan Term"],
    "tblMCData": ["Employee?", "Black?", "Disabled *", "Gender.calcs"],
    "tblSkillsData": ["Within FY?", "Black", "LAI", "Employment?.calcs", "Race.calcs", "Gender.calcs"],
    "tblPPData": ["All Spend\nadjusted", "Current Company Size *", "Current Black ownership",
                  "Current Black Female ownership", "Black Designated Group  ownership",
                  "Supplier development recipient? (Yes/No)", "3 year contract in place? (Yes/No)3",
                  "First-time supplier? (Yes/No)"],
    "tblESDData": ["Pillar", "Contribution Type", "Amount", "Recognised Amount"],
}


def export(excel_path, case_path, out_path):
    excel = json.load(open(excel_path, encoding="utf-8"))
    case = json.load(open(case_path, encoding="utf-8"))
    sheets = excel["sheets"]
    lines = {}
    for row in ROWS:
        lines[str(row)] = {
            "label": (sheets["Summary Scorecard"].get(f"B{row}") or {}).get("v"),
            "weighting": (sheets["Summary Scorecard"].get(f"C{row}") or {}).get("v"),
            "chain": chain(sheets, "Summary Scorecard", f"F{row}"),
        }
    sample = {k: v for k, v in case.items() if k != "tables"}
    sample["tables"] = {k: v for k, v in case["tables"].items() if k != "tblEAPAll"}
    cells = {"Summary Scorecard": {}}
    for row in range(18, 78):
        for col in "BCF":
            e = sheets["Summary Scorecard"].get(f"{col}{row}")
            if e is not None:
                cells["Summary Scorecard"][f"{col}{row}"] = {"v": e.get("v")}
    for sheet, ref in REFEREE_CELLS:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    tables = {}
    for name, cols in REFEREE_COLUMNS.items():
        t = excel["tables"].get(name)
        if not t:
            continue
        idx = [t["headers"].index(c) for c in cols]
        tables[name] = {"headers": cols, "rows": [[r[i] for i in idx] for r in t["rows"]]}
    json.dump({"template": case.get("template"), "lines": lines, "cells": cells, "tables": tables, "sampleCase": sample},
              open(out_path, "w", encoding="utf-8"), indent=1, default=str)


def main():
    out_dir, case_dir, exp_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(exp_dir, exist_ok=True)
    n = 0
    for f in sorted(os.listdir(case_dir)):
        if not f.endswith(".case.json"):
            continue
        cid = f[: -len(".case.json")]
        excel_path = os.path.join(out_dir, f"{cid}.excel.json")
        if not os.path.exists(excel_path):
            print("no Excel result yet:", cid)
            continue
        export(excel_path, os.path.join(case_dir, f), os.path.join(exp_dir, f"{cid}.json"))
        n += 1
    print("wrote", n, "expected bundles to", exp_dir)


if __name__ == "__main__":
    main()
