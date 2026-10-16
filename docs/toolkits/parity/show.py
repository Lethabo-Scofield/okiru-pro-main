import json, sys, re
d = json.load(open(sys.argv[1], encoding='utf-8'))
sheet = sys.argv[2]
rows = sys.argv[3] if len(sys.argv) > 3 else None
lo, hi = (map(int, rows.split('-')) if rows else (1, 9999))
cells = d['sheets'][sheet]
def key(ref):
    m = re.match(r'([A-Z]+)(\d+)', ref); col = 0
    for ch in m.group(1): col = col*26 + ord(ch)-64
    return int(m.group(2)), col
for ref in sorted(cells, key=key):
    r, c = key(ref)
    if lo <= r <= hi:
        e = cells[ref]; v = e['v']
        if isinstance(v, float): v = round(v, 6)
        print(f"{ref:6} {str(v)[:50]:50} {e.get('f','')[:220]}")
