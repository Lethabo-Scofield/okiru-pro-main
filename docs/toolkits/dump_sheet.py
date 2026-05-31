"""Dump extracted scorecard sheet rows in readable form.
Usage: py dump_sheet.py <TOOLKIT> <sheet substring>
"""
import json, sys

def get_column_letter(n):
    s = ''
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s

fmap = {
 'RCOGP_Generic':'extracted_RCOGP_Generic.json',
 'RCOGP_QSE':'extracted_RCOGP_QSE.json',
 'AGRI_Generic':'extracted_AGRI_Generic.json',
 'ICT_Generic':'extracted_ICT_Generic.json',
 'ICT_QSE':'extracted_ICT_QSE.json',
 'FSC_Generic':'extracted_FSC_Generic.json',
}

MAXROWS = 48

def dump(tk, sub):
    d = json.load(open(fmap[tk], encoding='utf-8'))
    data = d[tk]['extracted_sheets']
    for sn, rows in data.items():
        if sub.lower() in sn.lower():
            print(f"\n########## {tk} :: {sn} ##########")
            for r in rows[:MAXROWS]:
                cells = r['cells']
                parts = []
                for c in sorted(cells, key=lambda x:int(x)):
                    v = cells[c]
                    if v is None: continue
                    parts.append(f"{get_column_letter(int(c))}={v}")
                if parts:
                    print(f"r{r['row']:>3}: " + " | ".join(parts))

if __name__ == '__main__':
    tk = sys.argv[1]
    for sub in (sys.argv[2:] or ['']):
        dump(tk, sub)
