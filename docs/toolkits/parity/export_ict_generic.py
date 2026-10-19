"""Expected bundles for the ICT Generic always-on parity gate: for every case
Excel scored, the case itself, the toolkit's Summary Scorecard (with each
line's formula chain for a reviewer), and the cells and table columns the ICT
referee reads (Toolkit/src/lib/parity/toolkitParity.ict_generic.ts).
Synthetic cases only.

  py -3 export_ict_generic.py               # every out/ict_generic/*.excel.json
  py -3 export_ict_generic.py <case id> ...
"""
import sys, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from export_review_bundle import chain  # noqa: E402  (shared formula-chain walker)

ROWS = [19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
        43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 58, 59, 61, 62, 63, 64, 65, 67, 68, 70, 74, 76]

# Kept in step with ICT_REFEREE_CELLS / ICT_REFEREE_TABLE_COLUMNS in toolkitParity.ict_generic.ts.
REFEREE_CELLS = (
    [("Ownership Scorecard", r) for r in ("I10", "I12", "J7", "J10", "J12", "J13", "D1")]
    + [("Ownership Data", "W3"), ("ESD Scorecard", "D2")]
    + [("Skills Toolkit", r) for r in ("D6", "D7", "D9")]
    + [("Skills Calcs", f"{c}{r}") for r in range(57, 63) for c in "DE"]
    + [("Skills Calcs", f"{c}{r}") for r in list(range(20, 26)) + list(range(31, 37)) for c in "DEIKLOP"]
    + [("Skills Calcs", "D37"), ("Skills Calcs", "E37")]
    + [("Procurement Scorecard", "C3"), ("Procurement Scorecard", "C4")]
    + [("Procurement Scorecard", f"{c}{r}") for r in (9, 10, 11, 12, 13, 15) for c in "CDH"]
)
TABLE_COLUMNS = {
    "tblOwnershipData": ["Shareholder", "Share %", "BO%", "Outstaning Debt"],
    "tblESDData": ["Pillar", "Contribution Type", "Amount", "Recognised Amount"],
    "tblSkillsData": ["Within FY?", "Black", "LAI", "Employment?.calcs", "Race.calcs", "Gender.calcs"],
    "tblMCData": ["Employee?", "Black?", "Race.calcs", "Gender.calcs", "Disabled.calcs"],
    "tblPPData": [
        "Company Size\n[Scenario].Calcs", "Black Ownership\n[Scenario].Calcs", "Black Female ownership\n[Scenario].Calcs",
        "Black Designated Group  ownership\n[Scenario].Calcs", "First-time supplier? (Yes/No)",
        "All Spend\nadjusted", "All Spend adjusted \nPLUS x1.2 Factor",
    ],
}


def export(case_id):
    excel = json.load(open(os.path.join(HERE, "out", "ict_generic", f"{case_id}.excel.json"), encoding="utf-8"))
    case = json.load(open(os.path.join(HERE, "cases", "ict_generic", f"{case_id}.case.json"), encoding="utf-8"))
    sheets = excel["sheets"]
    lines = {}
    for row in ROWS:
        lines[str(row)] = {
            "label": (sheets["Summary Scorecard"].get(f"B{row}") or {}).get("v"),
            "weighting": (sheets["Summary Scorecard"].get(f"C{row}") or {}).get("v"),
            "chain": chain(sheets, "Summary Scorecard", f"F{row}"),
        }
    cells = {"Summary Scorecard": {}}
    for row in range(18, 80):
        for col in "BCFJ":
            e = sheets["Summary Scorecard"].get(f"{col}{row}")
            if e is not None:
                cells["Summary Scorecard"][f"{col}{row}"] = {"v": e.get("v")}
    for sheet, ref in REFEREE_CELLS:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    tables = {}
    for name, cols in TABLE_COLUMNS.items():
        t = excel["tables"].get(name)
        if not t:
            continue
        idx = [t["headers"].index(c) for c in cols]
        tables[name] = {"headers": cols, "rows": [[r[i] for i in idx] for r in t["rows"]]}
    sample = {k: v for k, v in case.items() if k != "tables"}
    sample["tables"] = {k: v for k, v in case["tables"].items() if k != "tblEAPAll"}
    out_dir = os.path.join(HERE, "expected", "ict_generic")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{case_id}.json")
    json.dump({"template": "ict_generic", "lines": lines, "cells": cells, "tables": tables, "sampleCase": sample},
              open(out, "w", encoding="utf-8"), indent=1, default=str)
    print("wrote", out)


if __name__ == "__main__":
    ids = sys.argv[1:] or sorted(re.sub(r"\.excel\.json$", "", f) for f in os.listdir(os.path.join(HERE, "out", "ict_generic"))
                                 if f.endswith(".excel.json"))
    for i in ids:
        export(i)
