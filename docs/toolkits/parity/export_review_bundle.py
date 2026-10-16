"""Build the Calculation Review page's toolkit reference from an Excel-scored
case: for every Summary Scorecard line, the cell, its formula and the chain of
cells that formula reads (a few levels deep), with the toolkit's value for the
sample company. Synthetic case only.

  py -3 export_review_bundle.py out/gen_1.excel.json cases/gen_1.case.json <out.json>
"""
import sys, json, re

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
                      [("Scorecard Calculations", r) for r in ("F6", "G6", "F7", "G7", "F8", "G8")]:
        e = sheets.get(sheet, {}).get(ref)
        cells.setdefault(sheet, {})[ref] = {"v": e.get("v") if e else None}
    json.dump({"template": case.get("template"), "lines": lines, "cells": cells, "sampleCase": sample},
              open(sys.argv[3], "w", encoding="utf-8"), indent=1, default=str)
    print("wrote", sys.argv[3], len(lines), "lines")


if __name__ == "__main__":
    main()
