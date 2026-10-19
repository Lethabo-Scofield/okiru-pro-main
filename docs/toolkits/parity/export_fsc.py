"""Export an Excel-scored FSC case as the always-on gate's expected bundle
(apps/web/Toolkit/src/lib/calculators/__tests__/toolkitParity.fsc.expected.test.ts):
the Summary Scorecard lines with the chain of cells each one reads, the cells
and table rows the FSC referee (Toolkit/src/lib/parity/toolkitParity.fsc.ts)
reworks the toolkit's faulty formulas from, and the case itself.
Synthetic cases only.

  py -3 export_fsc.py out/fsc/fsc_1.excel.json cases/fsc/fsc_1.case.json expected/fsc/fsc_1.json
  py -3 export_fsc.py --all          # every scored case under cases/fsc
"""
import sys, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from export_review_bundle import chain  # noqa: E402

LINE_ROWS = [r for r in range(20, 105) if r not in (30, 49, 59, 69, 73, 76, 82, 88, 102, 103)]
# Sheet → (first row, last row) of the cells the referee may read.
SHEETS = {
    "Summary Scorecard": (1, 115),
    "Ownership Scorecard": (1, 25),
    "Ownership Data": (1, 5),
    "Skills Toolkit": (1, 290),
    "Financials": (1, 20),
    "Client Information": (1, 26),
    "Procurement Scorecard": (1, 25),
    "ESD Scorecard": (1, 16),
    "SED & CE Scorecard": (1, 15),
    "Scorecard Calculations": (1, 20),
    "MC Toolkit": (1, 120),
    "EF & ESD Scorecard - Banks": (1, 30),
    "EF & ESD Scorecard - Long Term": (1, 30),
    "AFS Scorecard - Banks": (1, 40),
    "AFS Scorecard - Long Term": (1, 40),
    "AFS Scorecard - Short Term": (1, 40),
}
TABLES = ("tblOwnershipData", "tblMCData", "tblSkillsData", "tblPPData", "tblESDData", "tblSEDnCEData",
          "tblTransactionFinancingData")
ROW = re.compile(r"[A-Z]+(\d+)$")


def export(excel_path, case_path, out_path):
    excel = json.load(open(excel_path, encoding="utf-8"))
    case = json.load(open(case_path, encoding="utf-8"))
    sheets = excel["sheets"]
    summary = sheets["Summary Scorecard"]
    lines = {}
    for row in LINE_ROWS:
        label = (summary.get(f"B{row}") or {}).get("v")
        if label in (None, ""):
            continue
        lines[str(row)] = {
            "label": label,
            "weighting": (summary.get(f"C{row}") or {}).get("v"),
            "chain": chain(sheets, "Summary Scorecard", f"F{row}"),
        }
    cells = {}
    for sheet, (lo, hi) in SHEETS.items():
        src = sheets.get(sheet)
        if not src:
            continue
        cells[sheet] = {ref: {"v": e.get("v")} for ref, e in src.items()
                        if lo <= int(ROW.match(ref).group(1)) <= hi and e.get("v") not in (None, "")}
    tables = {k: {"headers": excel["tables"][k]["headers"], "rows": excel["tables"][k]["rows"]}
              for k in TABLES if k in excel["tables"]}
    sample = {k: v for k, v in case.items() if k != "tables"}
    sample["tables"] = {k: v for k, v in case["tables"].items() if k != "tblEAPAll"}
    json.dump({"template": case.get("template"), "subsector": case.get("subsector"), "lines": lines,
               "cells": cells, "tables": tables, "sampleCase": sample},
              open(out_path, "w", encoding="utf-8"), indent=0, default=str)
    print("wrote", out_path, len(lines), "lines")


def main():
    if sys.argv[1:] == ["--all"]:
        os.makedirs(os.path.join(HERE, "expected", "fsc"), exist_ok=True)
        for f in sorted(os.listdir(os.path.join(HERE, "cases", "fsc"))):
            if not f.endswith(".case.json"):
                continue
            cid = f[:-len(".case.json")]
            ex = os.path.join(HERE, "out", "fsc", f"{cid}.excel.json")
            if os.path.exists(ex):
                export(ex, os.path.join(HERE, "cases", "fsc", f), os.path.join(HERE, "expected", "fsc", f"{cid}.json"))
        return
    export(sys.argv[1], sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    main()
