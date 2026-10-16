import sys, json, os, pythoncom, win32com.client as w
pythoncom.CoInitialize()
xl = w.DispatchEx("Excel.Application"); xl.Visible=False; xl.DisplayAlerts=False; xl.EnableEvents=False; xl.AutomationSecurity=3
try:
    wb = xl.Workbooks.Open(os.path.abspath(sys.argv[1]), UpdateLinks=0, ReadOnly=True)
    out = {}
    for ws in wb.Worksheets:
        if ws.Name.lower().startswith('empower'): continue
        for lo in ws.ListObjects:
            hdr=[c.Value for c in lo.HeaderRowRange.Cells]; body=lo.DataBodyRange
            inputs=[]; formulas={}
            for i,h in enumerate(hdr):
                cell = body.Cells(1,i+1) if body is not None else None
                if cell is not None and cell.HasFormula: formulas[h]=cell.Formula
                else: inputs.append(h)
            out[lo.Name]={"sheet":ws.Name,"inputs":inputs,"formulas":formulas}
    json.dump(out, open(sys.argv[2],'w',encoding='utf-8'), indent=1)
    for k,v in out.items(): print(k, '| INPUTS:', v['inputs'])
    wb.Close(False)
finally:
    xl.Quit()
