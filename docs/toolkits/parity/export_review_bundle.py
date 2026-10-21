"""Build the Calculation Review page's toolkit reference from an Excel-scored
case: for every Summary Scorecard line, the cell, its formula and the chain of
cells that formula reads (a few levels deep), with the toolkit's value for the
sample company. Synthetic case only.

  py -3 export_review_bundle.py out/gen_1.excel.json cases/gen_1.case.json <out.json>
  py -3 export_review_bundle.py --sector <id> <case>.excel.json <case>.case.json <out.json>

The first form is RCOGP Generic, exactly as it has always been written. With
--sector, the Summary Scorecard rows come from that sector's line map
(apps/web/Toolkit/src/lib/parity/toolkitParity.<id>.ts: its lines and element
totals) plus its two level rows, and the cells and table columns kept for the
referee are the ones that sector's own expected-bundle exporter keeps
(export_<id>.py), so the page's referee reads exactly what the always-on gate
proves it needs. Sector ids: rcogp_generic, rcogp_qse, ict_generic, ict_qse,
agri_generic, fsc.
"""
import sys, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
PARITY_TS = os.path.join(HERE, "..", "..", "..", "apps", "web", "Toolkit", "src", "lib", "parity")

ROWS = [19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
        43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 58, 59, 61, 62, 63, 64, 66, 67, 69, 73, 75]
REF = re.compile(r"(?:'([^']+)'|([A-Za-z][A-Za-z0-9 ]*?))!\$?([A-Z]{1,3})\$?(\d+)|(?<![A-Za-z!$'])\$?([A-Z]{1,3})\$?(\d+)(?![\d(])")


def refs(formula, sheet):
    out = []
    for m in REF.finditer(formula or ""):
        if m.group(3):
            out.append(((m.group(1) or m.group(2)).strip(), f"{m.group(3)}{m.group(4)}"))
        elif m.group(5):
            out.append((sheet, f"{m.group(5)}{m.group(6)}"))
    seen, uniq = set(), []
    for r in out:
        if r not in seen:
            seen.add(r)
            uniq.append(r)
    return uniq


def chain(sheets, sheet, cell, depth=3, limit=10):
    steps, queue, seen = [], [(sheet, cell, 0)], set()
    while queue and len(steps) < limit:
        s, c, d = queue.pop(0)
        if (s, c) in seen:
            continue
        seen.add((s, c))
        e = sheets.get(s, {}).get(c)
        if not e:
            continue
        v = e.get("v")
        if isinstance(v, float):
            v = round(v, 6)
        steps.append({"cell": f"{s}!{c}", "formula": e.get("f"), "value": v})
        if d < depth and e.get("f"):
            for rs, rc in refs(e["f"], s):
                queue.append((rs, rc, d + 1))
    return steps


def main():
    if sys.argv[1] == "--sector":
        return export_sector(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
    excel = json.load(open(sys.argv[1], encoding="utf-8"))
    case = json.load(open(sys.argv[2], encoding="utf-8"))
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
    # The cells the referee (Toolkit/src/lib/parity/toolkitParity.ts) reads.
    cells = {"Summary Scorecard": {}}
    for row in range(18, 78):
        for col in "BCF":
            e = sheets["Summary Scorecard"].get(f"{col}{row}")
            if e is not None:
                cells["Summary Scorecard"][f"{col}{row}"] = {"v": e.get("v")}
    for sheet, ref in [("Ownership Scorecard", r) for r in ("I7", "I10", "I12", "J7", "J10", "J12")] + \
                      [("Scorecard Calculations", r) for r in ("F6", "G6", "F7", "G7", "F8", "G8")] + \
                      [("Ownership Data", "W3"), ("Ownership Scorecard", "D1"), ("ESD Scorecard", "D2")]:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    # The rows the referee reworks the toolkit's faulty debt and ESD formulas from.
    tables = {k: excel["tables"][k] for k in ("tblOwnershipData", "tblESDData") if k in excel["tables"]}
    json.dump({"template": case.get("template"), "lines": lines, "cells": cells, "tables": tables, "sampleCase": sample},
              open(sys.argv[3], "w", encoding="utf-8"), indent=1, default=str)
    print("wrote", sys.argv[3], len(lines), "lines")


# ---------------------------------------------------------------------------
# Every other toolkit-checked sector (--sector)
# ---------------------------------------------------------------------------

# Per sector: its line-map module, the Summary rows holding the achieved and
# discounted levels (they are not scorecard lines, so not in the line map), and
# the Summary Scorecard rows and columns its referee reads.
SECTORS = {
    "rcogp_generic": {"module": "toolkitParity.ts", "levels": (73, 75), "summary": (18, 77, "BCF")},
    "rcogp_qse": {"module": "toolkitParity.rcogp_qse.ts", "levels": (59, 61), "summary": (18, 63, "BCF")},
    "ict_generic": {"module": "toolkitParity.ict_generic.ts", "levels": (74, 76), "summary": (18, 79, "BCFJ")},
    "ict_qse": {"module": "toolkitParity.ict_qse.ts", "levels": (60, 62), "summary": (18, 64, "BCF")},
    "agri_generic": {"module": "toolkitParity.agri_generic.ts", "levels": (73, 75), "summary": (18, 77, "BCF")},
    "fsc": {"module": "toolkitParity.fsc.ts", "levels": (109, 111), "summary": None},
}

STATIC_ROW = re.compile(r"\brow:\s*(\d+)\b(?!\s*\+)")
MULTI_ROWS = re.compile(r"\brows:\s*\[([\d,\s]+)\]")
# FSC short-term insurers: `row: 90 + i` / `row: 100 + i` — one row per product or policy line
# offered (at most ten), which only the workbook knows.
OFFSET_ROW = re.compile(r"\brow:\s*(\d+)\s*\+\s*i\b")


def line_map_rows(sector):
    """Every Summary row the sector's line map names: its lines and its element totals."""
    src = open(os.path.join(PARITY_TS, SECTORS[sector]["module"]), encoding="utf-8").read()
    rows = {int(r) for r in STATIC_ROW.findall(src)}
    for group in MULTI_ROWS.findall(src):
        rows.update(int(r) for r in group.split(","))
    offsets = [int(r) for r in OFFSET_ROW.findall(src)]
    return rows, offsets


def referee_inputs(sector, sheets, excel, case):
    """The cells and table columns this sector's own expected-bundle exporter keeps for its referee."""
    sys.path.insert(0, HERE)
    if sector == "rcogp_generic":
        cell_refs = [("Ownership Scorecard", r) for r in ("I7", "I10", "I12", "J7", "J10", "J12")] + \
                    [("Scorecard Calculations", r) for r in ("F6", "G6", "F7", "G7", "F8", "G8")] + \
                    [("Ownership Data", "W3"), ("Ownership Scorecard", "D1"), ("ESD Scorecard", "D2")]
        whole, columns = ("tblOwnershipData", "tblESDData"), {}
    elif sector == "rcogp_qse":
        import export_rcogp_qse as m
        cell_refs, whole, columns = m.REFEREE_CELLS, m.REFEREE_TABLES, {}
    elif sector == "ict_generic":
        import export_ict_generic as m
        cell_refs, whole, columns = m.REFEREE_CELLS, (), m.TABLE_COLUMNS
    elif sector == "ict_qse":
        import export_ict_qse as m
        cell_refs, whole, columns = m.REFEREE_CELLS, m.REFEREE_TABLES, {}
    elif sector == "agri_generic":
        import export_agri_generic as m
        cell_refs, whole, columns = m.REFEREE_CELLS, (), m.REFEREE_COLUMNS
    elif sector == "fsc":
        return fsc_referee_inputs(sheets, excel, case)
    else:
        raise SystemExit(f"unknown sector {sector}")
    lo, hi, cols = SECTORS[sector]["summary"]
    cells = {"Summary Scorecard": {}}
    for row in range(lo, hi + 1):
        for col in cols:
            e = sheets["Summary Scorecard"].get(f"{col}{row}")
            if e is not None:
                cells["Summary Scorecard"][f"{col}{row}"] = {"v": e.get("v")}
    for sheet, ref in cell_refs:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    tables = {k: excel["tables"][k] for k in whole if k in excel["tables"]}
    for name, wanted in columns.items():
        t = excel["tables"].get(name)
        if not t:
            continue
        idx = [t["headers"].index(c) for c in wanted]
        tables[name] = {"headers": wanted, "rows": [[r[i] for i in idx] for r in t["rows"]]}
    return cells, tables


def fsc_referee_inputs(sheets, excel, case):
    import export_fsc as m
    cells = {}
    for sheet, (lo, hi) in m.SHEETS.items():
        src = sheets.get(sheet)
        if not src:
            continue
        cells[sheet] = {ref: {"v": e.get("v")} for ref, e in src.items()
                        if lo <= int(m.ROW.match(ref).group(1)) <= hi and e.get("v") not in (None, "")
                        and (not isinstance(e.get("v"), str)
                             or sheet in ("Summary Scorecard", "Client Information", "AFS Scorecard - Short Term")
                             or (sheet, ref) in m.TEXT_CELLS)}
    tables = {}
    for name, wanted in m.TABLES.items():
        t = excel["tables"].get(name)
        if not t or not t["rows"] or name not in case["tables"]:
            continue
        idx = [t["headers"].index(c) for c in wanted]
        tables[name] = {"headers": wanted, "rows": [[r[i] for i in idx] for r in t["rows"]]}
    return cells, tables


def export_sector(sector, excel_path, case_path, out_path):
    if sector not in SECTORS:
        raise SystemExit(f"unknown sector {sector}; one of {', '.join(SECTORS)}")
    excel = json.load(open(excel_path, encoding="utf-8"))
    case = json.load(open(case_path, encoding="utf-8"))
    sheets = excel["sheets"]
    summary = sheets["Summary Scorecard"]
    labelled = lambda r: (summary.get(f"B{r}") or {}).get("v") not in (None, "")
    rows, offsets = line_map_rows(sector)
    rows.update(SECTORS[sector]["levels"])
    # A run of rows (one per product or policy line offered) ends at the first unlabelled row.
    for base in offsets:
        r = base
        while r < base + 10 and labelled(r):
            rows.add(r)
            r += 1
    lines = {}
    for row in sorted(rows):
        lines[str(row)] = {
            "label": (summary.get(f"B{row}") or {}).get("v"),
            "weighting": (summary.get(f"C{row}") or {}).get("v"),
            "chain": chain(sheets, "Summary Scorecard", f"F{row}"),
        }
    cells, tables = referee_inputs(sector, sheets, excel, case)
    sample = {k: v for k, v in case.items() if k != "tables"}
    sample["tables"] = {k: v for k, v in case["tables"].items() if k != "tblEAPAll"}
    json.dump({"template": case.get("template"), "lines": lines, "cells": cells, "tables": tables, "sampleCase": sample},
              open(out_path, "w", encoding="utf-8"), indent=1, default=str)
    print("wrote", out_path, len(lines), "lines")


if __name__ == "__main__":
    main()
