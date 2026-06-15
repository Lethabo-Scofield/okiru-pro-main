import json, re
from pathlib import Path
from collections import defaultdict

extracted = Path(__file__).parent / "extracted"
refs = defaultdict(set)
formulas_by_sheet = {}

for fp in sorted(extracted.glob("*.json")):
    d = json.load(open(fp, encoding="utf-8"))
    sn = d["sheet_name"]
    n = 0
    for row in d.get("rows", []):
        for c in row.get("cells", {}).values():
            f = c.get("formula")
            if f:
                n += 1
                for m in re.findall(r"'([^']+)'!|([A-Za-z_][A-Za-z0-9_]*)!", f):
                    tgt = m[0] or m[1]
                    if tgt and tgt not in ("IF", "SUM", "MIN", "MAX", "IFERROR", "COUNTIF", "COUNTA", "TEXT", "ROUND", "ABS", "AND", "OR", "AVERAGE", "SUMIF"):
                        refs[sn].add(tgt)
    formulas_by_sheet[sn] = n

print("FORMULA COUNTS")
for k, v in sorted(formulas_by_sheet.items(), key=lambda x: -x[1]):
    print(f"{v:4d}  {k}")

print("\nCROSS-SHEET REFS")
for src in sorted(refs):
    tgts = sorted(refs[src])
    if tgts:
        extra = "..." if len(tgts) > 20 else ""
        print(f"{src} -> {', '.join(tgts[:20])}{extra}")

for sheet in ["E_Scorecard", "S_Scorecard", "G_Scorecard", "S_Data", "E_Data", "Carbon_Tax", "B_BBEE_ESG"]:
    fp = extracted / f"{sheet}.json"
    if not fp.exists():
        continue
    d = json.load(open(fp, encoding="utf-8"))
    print(f"\n=== {sheet} indicators ===")
    for row in d["rows"]:
        a = row["cells"].get("1", {}).get("value")
        b = row["cells"].get("2", {}).get("value")
        dval = row["cells"].get("4", {}).get("value")
        if a and b and str(a) not in ("Indicator",) and not str(a).startswith("──"):
            try:
                float(str(b).replace("%", ""))
                print(f"  {a} | max={b} | score={dval}")
            except ValueError:
                if str(a).upper().startswith("TOTAL") or "SCORE" in str(a).upper():
                    print(f"  ** {a} | {b} | {dval}")
