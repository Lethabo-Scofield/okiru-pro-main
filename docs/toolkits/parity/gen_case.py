"""Random but valid RCOGP Generic toolkit cases, written in the toolkit's own
vocabulary (sheet cells + table rows). Synthetic only: no client data.

  py -3 gen_case.py <seed> <out.case.json> [--profile small|full]
"""
import sys, json, random, datetime, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
FY_START, FY_END = "2025-03-01", "2026-02-28"
DATA_DATE = FY_END
PROVINCES = ['Limpopo', 'KwaZulu-Natal', 'Free State', 'Mpumalanga', 'North West', 'Eastern Cape',
             'Northern Cape', 'Gauteng', 'Western Cape', 'National']
OWN_TYPES = ['Strategic Partner', 'Private Equity', 'Employee Share Ownership Plan (ESOP)',
             'Broad Based Ownership Scheme (BBOS)']
DESIGS = ['Non-executive Director', 'Executive Director', 'Other Executive Manager', 'Senior Manager',
          'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled']
DESIG_W = [3, 2, 2, 4, 8, 14, 20, 15]
RACES = ['African', 'Coloured', 'Indian', 'White']
RACE_W = [60, 12, 6, 22]
SIZES = ['Generic', 'QSE', 'EME']
VOC = json.load(open(os.path.join(HERE, 'vocab_contrib.json'), encoding='utf-8'))


def our_eap_rows():
    """Our EAP table (apps/web/Toolkit/.../eapNorms.ts RAW_EAP_NORMS) as
    tblEAPAll rows. The parity run loads the SAME workforce data into the
    toolkit so a difference can only come from the formulas. (The shipped
    template's 2025 rows carry trailing spaces in the province names, so its
    own 2025 lookups return 0 for every province.)"""
    src = open(os.path.join(HERE, '..', '..', '..', 'apps', 'web', 'Toolkit', 'src', 'lib',
                            'calculators', 'eapNorms.ts'), encoding='utf-8').read()
    raw = json.loads(re.search(r'RAW_EAP_NORMS: EapNorms = (\{.*?\n\});', src, re.S).group(1))
    rows = []
    for year, provinces in raw.items():
        for prov, g in provinces.items():
            rows.append({"Year": int(year), "Province": prov,
                         **{k: g[k] for k in ('AM', 'CM', 'IM', 'WM', 'AF', 'CF', 'IF', 'WF')}})
    return rows

# Every scorecard sheet filters its data by a period picker; "Current YTD"
# selects the latest data date, which every generated row carries.
PERIOD_CELLS = {
    "Ownership Scorecard!D16": "Year", "Ownership Scorecard!D17": "Current YTD",
    "MC Toolkit!C4": "Year", "MC Toolkit!C5": "Current YTD",
    "MC Scorecard!K14": "Year", "MC Scorecard!K15": "Current YTD",
    "MC Scorecard (Exco + Senior)!K14": "Year", "MC Scorecard (Exco + Senior)!K15": "Current YTD",
    "Skills Scorecard!M11": "Current YTD", "Skills Toolkit!D8": "Current YTD",
    "Procurement Scorecard!C18": "Year", "Procurement Scorecard!C19": "Current YTD",
    "ESD Scorecard!F13": "Year", "ESD Scorecard!F14": "Current YTD",
    "SED Scorecard!H9": "Year", "SED Scorecard!H10": "Current YTD",
}


def d(y, m, dd):
    return datetime.date(y, m, dd).isoformat()


def rdate(rng, start=FY_START, end=FY_END):
    a = datetime.date.fromisoformat(start)
    b = datetime.date.fromisoformat(end)
    return (a + datetime.timedelta(days=rng.randint(0, (b - a).days))).isoformat()


def pct(rng, lo=0.0, hi=1.0, step=0.05):
    n = int(round((hi - lo) / step))
    return round(lo + step * rng.randint(0, n), 4)


def yn(rng, p):
    return 'Yes' if rng.random() < p else 'No'


def make(seed, profile="full"):
    rng = random.Random(seed)
    small = profile == "small"
    revenue = rng.randint(60, 900) * 1_000_000
    npat = round(revenue * rng.uniform(0.02, 0.14))
    cells = dict(PERIOD_CELLS)
    cells.update({
        "Client Information!C3": f"Parity case {seed}",
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C7": 2025,
        "Client Information!C8": rng.choice(PROVINCES),
        "Client Information!C10": round(rng.uniform(0.03, 0.12), 4),
        "Client Information!C14": DATA_DATE,
        "Client Information!C18": revenue, "Client Information!C19": npat,
        "Client Information!C25": rng.choice(['Yes', 'No']),
    })
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = round(rng.uniform(15_000, 90_000), 2)
    for i in range(3):
        rev = round(revenue * rng.uniform(0.7, 1.2))
        cells[f"Financials!C{4 + i}"] = round(rev * rng.uniform(-0.02, 0.15))
        cells[f"Financials!E{4 + i}"] = rev

    # Ownership
    n_sh = rng.randint(1, 4)
    shares = [rng.randint(10, 100) * 100 for _ in range(n_sh)]
    total_shares = sum(shares)
    company_value = rng.randint(20, 400) * 1_000_000
    price = round(company_value / total_shares, 2)
    own_rows = []
    for i in range(n_sh):
        bo = pct(rng, 0, 1, 0.25)
        debt = rng.choice([0, 0, round(company_value * shares[i] / total_shares * rng.uniform(0.1, 0.6))])
        row = {
            "Data Date": DATA_DATE, "Shareholder": f"Holder {i + 1}",
            "Ownership Type": rng.choice(OWN_TYPES),
            "Outstaning Debt": debt,
            "BO%": bo, "BWO%": round(bo * pct(rng, 0, 1, 0.25), 4),
            "BDG%": round(bo * rng.choice([0, 0, 0.1, 0.3]), 4),
            "BNE%": round(bo * rng.choice([0, 0, 0.2, 1.0]), 4),
            "Number of Share": shares[i],
            # The toolkit's share % is this holding's VALUE over the sum of values.
            "Share Value": round(shares[i] * price, 2),
            "Original Date": d(rng.randint(2014, 2024), rng.randint(1, 12), 1),
        }
        if debt:
            row["Loan Date"] = d(rng.randint(2016, 2025), rng.randint(1, 12), 1)
        own_rows.append(row)
    own_val = [{"Date": DATA_DATE, "Company Asset Value": company_value, "Total Shares": total_shares,
                "Share Value": price}]

    # Management control
    n_emp = rng.randint(12, 25) if small else rng.randint(30, 90)
    mc_rows, directors = [], []
    for i in range(n_emp):
        des = rng.choices(DESIGS, DESIG_W)[0]
        row = {"Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}",
               "Gender *": rng.choice(['Male', 'Female']), "Race *": rng.choices(RACES, RACE_W)[0],
               "Designation *": des, "Disabled *": yn(rng, 0.04), "Foreign *": yn(rng, 0.03)}
        if des in ('Non-executive Director', 'Executive Director'):
            directors.append(row)
        mc_rows.append(row)
    if directors:
        w = [rng.randint(1, 5) for _ in directors]
        s = sum(w)
        for row, wi in zip(directors, w):
            row["Voting Rights (Directors only) *"] = round(wi / s, 4)

    # Skills
    n_tr = rng.randint(3, 8) if small else rng.randint(8, 30)
    sk_rows = []
    for i in range(n_tr):
        cat = rng.choice('ABCDEFG')
        status = rng.choices(['Permanent', 'Fixed-Term', 'Unemployed'], [6, 2, 2])[0]
        completed = yn(rng, 0.7)
        sk_rows.append({
            "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": cat,
            "ABET": 'No', "Mandatory Training?": yn(rng, 0.1),
            "Bursary - Higher Education?": 'Yes' if cat == 'A' and rng.random() < 0.5 else 'No',
            "Invoice / Transaction Date * (format: dd/mm/yyyy)": rdate(rng),
            "Learner Name *": f"Learner {i + 1}", "Gender *": rng.choice(['Male', 'Female']),
            "Race *": rng.choices(RACES, RACE_W)[0], "Disabled?*": yn(rng, 0.08), "Foreign?*": yn(rng, 0.03),
            "Age": rng.randint(19, 50),
            "Employment status at the start of the training program": status,
            "Y.E.S. Employee?": yn(rng, 0.1), "Completed?": completed,
            "Absorbed?": 'Yes' if status == 'Unemployed' and completed == 'Yes' and rng.random() < 0.5 else 'No',
            "Course Cost": round(rng.uniform(2_000, 60_000), 2),
            "Travel Cost": round(rng.uniform(0, 5_000), 2) if rng.random() < 0.3 else 0,
            "Accommodation Cost": 0, "Catering Cost": 0, "Stationery Cost": 0, "Training Facility Cost": 0,
            "Salary Cost (stipend and category B,C,D only)": round(rng.uniform(10_000, 80_000), 2) if cat in 'BCD' and rng.random() < 0.6 else 0,
            "Other Costs": 0,
            "Start Date (format: dd/mm/yyyy)": rdate(rng, FY_START, "2025-09-30"),
            "End Date (format: dd/mm/yyyy)": rdate(rng, "2025-10-01", FY_END),
        })

    # Procurement
    n_sup = rng.randint(6, 12) if small else rng.randint(15, 60)
    pp_rows = []
    total_spend = 0
    for i in range(n_sup):
        size = rng.choices(SIZES, [4, 3, 3])[0]
        lvl = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'])
        bo = rng.choice([0, 0.1, 0.26, 0.3, 0.51, 0.6, 1.0])
        spend = round(rng.uniform(50_000, 9_000_000), 2)
        total_spend += spend
        pp_rows.append({
            "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}", "Current Company Size *": size,
            "B-BBEE Level": lvl, "Empowering Supplier? (Yes/No)": yn(rng, 0.7),
            "Date of first procurement (format: dd/mm/yyyy)": d(rng.randint(2018, 2025), rng.randint(1, 12), 1),
            "Size at first procurement": rng.choice(SIZES),
            "Current Black ownership": bo,
            "Current Black Female ownership": round(bo * rng.choice([0, 0.3, 0.5, 1.0]), 4),
            "Flow through Black ownership": 0,
            "Black Designated Group  ownership": round(bo * rng.choice([0, 0, 0.5, 1.0]), 4),
            "Supplier development recipient? (Yes/No)2": yn(rng, 0.15),
            "3 year contract in place? (Yes/No)3": yn(rng, 0.2),
            "Spend *": spend,
        })
    tmps_incl = [{"Inclusions": "Cost of Sales", "Amount": round(total_spend * rng.uniform(1.0, 1.4), 2)}]

    # Enterprise and supplier development
    n_esd = rng.randint(1, 3) if small else rng.randint(2, 8)
    esd_rows = []
    for i in range(n_esd):
        pillar = rng.choice(['Supplier Development', 'Enterprise Development'])
        types = VOC['tblSDContributions'] if pillar == 'Supplier Development' else VOC['tblEDContributions']
        simple = [t for t in types if not t.startswith((
            'Lower insterest', 'Enterprise and Supplier Development Investment with lower',
            'Shorter payment', 'Time of employees'))]
        esd_rows.append({
            "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i + 1}",
            "Date of First Assistance (format: dd/mm/yyyy) *": d(rng.randint(2019, 2025), rng.randint(1, 12), 1),
            "Black ownership when first assisted *": rng.choice([0.51, 1.0]),
            "Size when first assisted *": rng.choice(['EME', 'QSE']),
            "Current Black ownership %": rng.choice([0.51, 1.0]), "Current Size": rng.choice(['EME', 'QSE']),
            "Contribution Description*": f"Contribution {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type": rng.choice(simple),
            "Amount": round(rng.uniform(20_000, 1_500_000), 2),
            "At least 1 job created?": yn(rng, 0.3), "Graduated to Supplier Development?": yn(rng, 0.2),
        })

    # Socio-economic development
    n_sed = rng.randint(1, 3) if small else rng.randint(2, 8)
    sed_rows = []
    for i in range(n_sed):
        sed_rows.append({
            "Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED {i + 1}",
            "Description of Spend *": f"SED spend {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type *": rng.choice([t for t in VOC['tblSEDContributions'] if not t.startswith('Time of employees')]),
            "% of Spend Benefiting Black Individuals *": rng.choice([0.5, 0.75, 0.9, 1.0]),
            "Amount": round(rng.uniform(5_000, 400_000), 2),
        })

    return {"template": "rcogp_generic", "seed": seed, "cells": cells, "tables": {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": tmps_incl,
        "tblESDData": esd_rows, "tblSED": sed_rows, "tblEAPAll": our_eap_rows()}}


if __name__ == "__main__":
    seed = int(sys.argv[1])
    out = sys.argv[2]
    profile = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "full"
    json.dump(make(seed, profile), open(out, "w", encoding="utf-8"), indent=1)
    print("wrote", out)
