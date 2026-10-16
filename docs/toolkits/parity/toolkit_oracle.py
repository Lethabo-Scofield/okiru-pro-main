"""Excel as the referee: read (or fill + recalculate) an Empower B-BBEE toolkit
through Excel itself and dump every input table and every scorecard cell.

  py -3 toolkit_oracle.py read <workbook.xlsx> <out.json> [--recalc]
  py -3 toolkit_oracle.py fill <template.xlsx> <case.json> <out.json>

case.json (fill): {"cells": {"Sheet!A1": value, ...},
                   "tables": {"tblMCData": [{"Header": value, ...}, ...], ...}}
Only input columns are written; Excel's calculated columns refill themselves.
"""
import sys, json, datetime, time, shutil, os, tempfile
import pythoncom, pywintypes, win32com.client as w

DUMP_SHEETS = [
    "Client Information", "Financials", "Ownership - Company Value Data", "TMPS",
    "Summary Scorecard", "Ownership Scorecard", "Ownership Calcs Formula",
    "Scorecard Calculations", "MC Scorecard", "MC Scorecard (Exco + Senior)", "MC Calcs",
    "Skills Scorecard", "Procurement Scorecard", "ESD and SED Calcs", "ESD Scorecard",
    "SED Scorecard", "YES", "EAP",
]
MAX_ROWS, MAX_COLS = 400, 60
SKIP_SHEETS = {"Risks & Points of Clarification", "Employee ROI", "MC Report Data", "PP Report Data", "ESD Report Data", "SED Report Data", "Industry Norms"}

def conv(v):
    if isinstance(v, (datetime.datetime, pywintypes.TimeType)):
        try:
            return datetime.datetime(v.year, v.month, v.day, v.hour, v.minute, v.second).isoformat()
        except Exception:
            return str(v)
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return v
    return v

def col_letter(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s

def grid(rng):
    v = rng.Value
    if not isinstance(v, tuple):
        return [[v]]
    return [list(r) for r in v]

def dump(wb):
    out = {"tables": {}, "sheets": {}}
    names = [ws.Name for ws in wb.Worksheets]
    for ws in wb.Worksheets:
        for lo in ws.ListObjects:
            if ws.Name.lower().startswith("empower"):
                continue
            headers = [c.Value for c in lo.HeaderRowRange.Cells]
            rows = []
            if lo.DataBodyRange is not None:
                vals = grid(lo.DataBodyRange)
                rows = [[conv(x) for x in r] for r in vals]
            out["tables"][lo.Name] = {"sheet": ws.Name, "address": lo.Range.Address, "headers": headers, "rows": rows}
    for name in names:
        if name.lower().startswith("empower") or name in SKIP_SHEETS:
            continue
        ws = wb.Worksheets(name)
        rng = ws.Range(ws.Cells(1, 1), ws.Cells(MAX_ROWS, MAX_COLS))
        vals = grid(rng)
        forms = rng.Formula
        cells = {}
        for r in range(MAX_ROWS):
            for c in range(MAX_COLS):
                v = vals[r][c]
                f = forms[r][c]
                if v in (None, "") and (f in (None, "")):
                    continue
                ref = f"{col_letter(c + 1)}{r + 1}"
                entry = {"v": conv(v)}
                if isinstance(f, str) and f.startswith("="):
                    entry["f"] = f
                cells[ref] = entry
        out["sheets"][name] = cells
    return out

def open_excel():
    pythoncom.CoInitialize()
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.EnableEvents = False
    xl.AutomationSecurity = 3
    return xl

EXCEL_EPOCH = datetime.date(1899, 12, 30)


def set_value(rng, v):
    # ISO dates go in as Excel serial numbers. pywintypes.Time shifts a local
    # midnight across the UTC offset and lands on the previous day.
    if isinstance(v, str) and len(v) == 10 and v[4] == "-" and v[7] == "-":
        y, m, d = map(int, v.split("-"))
        rng.Value = float((datetime.date(y, m, d) - EXCEL_EPOCH).days)
    else:
        rng.Value = v

def unprotect_all(wb):
    """The templates protect their scorecard sheets (no password). Only the
    temporary copy is unprotected; the template file is never written."""
    locked = []
    for ws in wb.Worksheets:
        if ws.ProtectContents:
            try:
                ws.Unprotect("")
            except pywintypes.com_error:
                locked.append(ws.Name)
    return locked


def fill(wb, case):
    locked = unprotect_all(wb)
    if locked:
        print("still protected:", locked)
    for addr, v in case.get("cells", {}).items():
        sheet, ref = addr.rsplit("!", 1)
        set_value(wb.Worksheets(sheet.strip("'")).Range(ref), v)
    for tname, rows in case.get("tables", {}).items():
        lo = None
        for ws in wb.Worksheets:
            for cand in ws.ListObjects:
                if cand.Name == tname:
                    lo = cand
        if lo is None:
            raise KeyError(f"table {tname} not in workbook")
        headers = [c.Value for c in lo.HeaderRowRange.Cells]
        # Input columns: those whose first body cell holds no formula.
        input_cols = {}
        body = lo.DataBodyRange
        for i, h in enumerate(headers):
            first = body.Cells(1, i + 1) if body is not None else None
            if first is None or not first.HasFormula:
                input_cols[h] = i + 1
        n = max(1, len(rows))
        top = lo.HeaderRowRange.Cells(1, 1)
        ws = lo.Parent
        new_range = ws.Range(top, ws.Cells(top.Row + n, top.Column + len(headers) - 1))
        # Clear existing input values, then resize.
        if body is not None:
            for h, ci in input_cols.items():
                body.Columns(ci).ClearContents()
        lo.Resize(new_range)
        # Address cells from the header row: an empty table has no body range
        # until something is written into it.
        for r, row in enumerate(rows):
            unknown = [k for k in row if k not in input_cols]
            if unknown:
                raise KeyError(f"{tname}: not input columns: {unknown}")
            for h, v in row.items():
                if v is None:
                    continue
                set_value(ws.Cells(top.Row + 1 + r, top.Column + input_cols[h] - 1), v)

def main():
    mode = sys.argv[1]
    t0 = time.time()
    xl = open_excel()
    try:
        if mode == "read":
            src, outp = sys.argv[2], sys.argv[3]
            wb = xl.Workbooks.Open(os.path.abspath(src), UpdateLinks=0, ReadOnly=True)
            if "--recalc" in sys.argv:
                xl.CalculateFull()
        elif mode == "fill":
            tpl, case_path, outp = sys.argv[2], sys.argv[3], sys.argv[4]
            tmp = os.path.join(tempfile.gettempdir(), f"oracle_{os.getpid()}.xlsx")
            shutil.copyfile(tpl, tmp)
            wb = xl.Workbooks.Open(tmp, UpdateLinks=0)
            xl.Calculation = -4135  # manual while writing
            fill(wb, json.load(open(case_path, encoding="utf-8")))
            xl.Calculation = -4105
            xl.CalculateFull()
            if "--keep" in sys.argv:
                keep = outp.replace(".json", ".xlsx")
                wb.SaveCopyAs(os.path.abspath(keep))
        else:
            raise SystemExit("mode must be read or fill")
        data = dump(wb)
        data["_meta"] = {"mode": mode, "seconds": round(time.time() - t0, 1)}
        json.dump(data, open(outp, "w", encoding="utf-8"), default=str)
        wb.Close(False)
        print(f"ok {mode} in {round(time.time()-t0,1)}s -> {outp}")
    finally:
        xl.Quit()

if __name__ == "__main__":
    main()
