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
    "MC Toolkit": (109, 113),
    "EF & ESD Scorecard - Banks": (1, 30),
    "EF & ESD Scorecard - Long Term": (1, 30),
    "AFS Scorecard - Banks": (1, 40),
    "AFS Scorecard - Long Term": (1, 40),
    "AFS Scorecard - Short Term": (1, 40),
}
# The columns of each table the referee reads.
NL = "\n"


def _SCEN(k):
    return f"{k}{NL}[Scenario].Calcs"


TABLES = {
    "tblOwnershipData": ["Shareholder", "Share %", "BO%", "Outstaning Debt", "Loan Term"],
    "tblMCData": ["Data Date", "Disabled.calcs", "Black?", "Employee?"],
    "tblSkillsData": ["Data Date", "Learner Name *", "Black", "Black Females?", "Africans?", "Disabled.calcs",
                      "Management Position.calcs", "Cat A-F Spend", "Salaries (BCD)", "Cat G Spend",
                      "Other Legitimate Cost", "All Spend", "LAI", "Completed LAI (Unemployed)",
                      "Absorbed LAI [Unemployed]", "Within FY?"],
    "tblPPData": ["Data Date", "Supplier Name *", f"All Spend{NL}adjusted", _SCEN("Company Size"), _SCEN("Black Ownership"),
                  _SCEN("Black Female ownership"), _SCEN("Black Designated Group  ownership"),
                  _SCEN("Supplier development recipient? (Yes/No)"), _SCEN("3 year contract in place? (Yes/No)"),
                  f"First-time supplier? (Yes/No){NL}[Scenario]", "First-time supplier? (Yes/No)",
                  "Stock broker? (Yes/No)", "Fund manager? (Yes/No)", "Intermediary? (Yes/No)"],
    "tblESDData": ["Pillar", "Contribution Type", "Amount", "Recognised Amount", "Qualify?", "End of Month",
                   "Graduated to Supplier Development?", "At least 1 job created?",
                   "Stock brokers, Fund managers or Intermediaries? (Yes/No)"],
    "tblAFSDataShortTerm": ["Policy Type (Adjusted)", "Policy Line", "Number of Qualifying Policies",
                            "Compliance Percentage", "End of month"],
}
# Text cells the referee reads beyond the Summary Scorecard and Client
# Information: the period each ESD reading is filtered by.
TEXT_CELLS = {("ESD Scorecard", "I16"), ("EF & ESD Scorecard - Banks", "I27"), ("EF & ESD Scorecard - Long Term", "I27")}
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
        # Values only, and of the labels only those the referee reads (sub-sector, reinsurer).
        cells[sheet] = {ref: {"v": e.get("v")} for ref, e in src.items()
                        if lo <= int(ROW.match(ref).group(1)) <= hi and e.get("v") not in (None, "")
                        and (not isinstance(e.get("v"), str)
                             or sheet in ("Summary Scorecard", "Client Information", "AFS Scorecard - Short Term")
                             or (sheet, ref) in TEXT_CELLS)}
    tables = {}
    for name, cols in TABLES.items():
        t = excel["tables"].get(name)
        if not t or not t["rows"] or name not in case["tables"]:
            continue
        idx = [t["headers"].index(c) for c in cols]
        tables[name] = {"headers": cols, "rows": [[r[i] for i in idx] for r in t["rows"]]}
    sample = {k: v for k, v in case.items() if k != "tables"}
    sample["tables"] = {k: v for k, v in case["tables"].items() if k != "tblEAPAll"}
    json.dump({"template": case.get("template"), "subsector": case.get("subsector"), "lines": lines,
               "cells": cells, "tables": tables, "sampleCase": sample},
              open(out_path, "w", encoding="utf-8"), separators=(",", ":"), default=str)
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
