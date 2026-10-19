"""Random but valid ICT QSE toolkit cases (BBBEE Toolkit (ICT QSE)_Template_v.1.1),
written in the toolkit's own vocabulary (sheet cells + table rows). Synthetic
only: invented names, no ID numbers, nothing from any client file.

  py -3 gen_case_ict_qse.py <seed> <out.case.json> [--profile small|full|max|empty|debt|esd|firsttime|deemed]

  py -3 gen_case_ict_qse.py --all    writes the standard set into cases/ict_qse/

The template differs from RCOGP Generic: its Client Information sheet is laid
out differently (revenue C16, NPAT C17, industry norm C8, deemed-NPAT override
C22, "combine executive and senior management" C23), the Financials sheet keeps
four prior years (rows 4-7), every scorecard has its own period picker, Skills
Data asks "Employed?" (Yes/No), Procurement Data asks "First-time supplier?",
ESD Data asks "ICT Company?", jobs created and the beneficiary's workforce,
and SED Data asks "ICT Specific Initiative?".
"""
import sys, json, random, datetime, os

HERE = os.path.dirname(os.path.abspath(__file__))
FY_START, FY_END = "2025-03-01", "2026-02-28"
DATA_DATE = FY_END
OWN_TYPES = ['Strategic Partner', 'Private Equity', 'Employee Share Ownership Plan (ESOP)',
             'Broad Based Ownership Scheme (BBOS)']
DESIGS = ['Non-executive Director', 'Executive Director', 'Other Executive Manager', 'Senior Manager',
          'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled']
DESIG_W = [2, 3, 2, 4, 6, 9, 10, 8]
RACES = ['African', 'Coloured', 'Indian', 'White']
RACE_W = [60, 12, 6, 22]
SIZES = ['Generic', 'QSE', 'EME']

# The template's own contribution vocabularies ('ESD and SED Calcs' tables),
# read from the blank-template dump so the labels are exactly the toolkit's.
SD_TYPES = [
    "Grant Contribution",
    "Direct Cost incurred in support of Enterprise and Supplier Development beneficiaries",
    "Overhead costs incurred in supporting Enterprise and Supplier Development beneficiary",
    "Interest free loan with no security requirements",
    "Standard Load to Enterprise and Supplier Development beneficiaries",
    "Guarantees provided on behalf of Enterprise and Supplier Development beneficiaries",
    "Lower insterest Rate than prime on Standard Loan to Enterprise and Supplier Development beneficiaries",
    "Minority Investment in Enterprise and Supplier Development beneficiaries",
    "Enterprise and Supplier Development Investment with lower dividend to fanacier",
    "Professional services rendered at no cost and supporting Enterprise and Supplier Development beneficiaries",
    "Professional services rendered at discount and supporting Enterprise and Supplier Development beneficiaries",
    "Time of employees productively deployed in assisting Enterprise and Supplier Development beneficiaries",
    "Shorter payment periods for Enterprise and Supplier Development beneficiaries",
]
ED_TYPES = [
    "Grant Contribution",
    "Direct Cost incurred in support of Enterprise and Supplier Development beneficiaries",
    "Discounts in addition to normal business practice supporting Enterprise and Supplier Development beneficiaries",
    "Overhead costs incurred in supporting Enterprise and Supplier Development beneficiaries",
    "Interest free loan with no security requirements",
    "Standard Load to Enterprise and Supplier Development beneficiaries",
    "Guarantees provided on behalf of an Enterprise and Supplier Development beneficiaries",
    "Lower insterest Rate than prime on Standard Loan to Enterprise and Supplier Development beneficiaries",
    "Minority Investment in an Enterprise and Supplier Development beneficiaries",
    "Enterprise and Supplier Development Investment with lower dividend to fanacier",
    "Professional services rendered at no cost and supporting Enterprise and Supplier Development beneficiaries",
    "Professional services rendered at discount and supporting Enterprise and Supplier Development beneficiaries",
    "Time of employees productively deployed in assisting Enterprise and Supplier Development beneficiaries",
]
SED_TYPES = [
    "Grant Contribution",
    "Direct Cost incurred in support of Socioeconomic Development beneficiaries",
    "Discounts in addition to normal business practice supporting Socioeconomic Development beneficiaries",
    "Overhead costs incurred in supporting Socioeconomic Development beneficiaries",
    "Professional services rendered at no cost and supporting Socioeconomic Development beneficiaries",
    "Professional services rendered at discount and supporting Socioeconomic Development beneficiaries",
    "Time of employees productively deployed in assisting Socioeconomic Development beneficiaries",
]
LOWER_RATE = ("Lower insterest", "Enterprise and Supplier Development Investment with lower")
SHORTER = "Shorter payment"

# Every scorecard filters its data by its own period picker; "Current YTD"
# selects the latest data date, which every generated row carries. The
# procurement scorecard also asks whether to score actual or projected spend.
PERIOD_CELLS = {
    "Ownership Scorecard!D13": "Year", "Ownership Scorecard!D14": "Current YTD",
    "MC Toolkit!C3": "Year", "MC Toolkit!C4": "Current YTD",
    "MC Scorecard!J17": "Year", "MC Scorecard!J18": "Current YTD",
    "MC Scorecard (Exco + Senior)!J17": "Year", "MC Scorecard (Exco + Senior)!J18": "Current YTD",
    "Skills Toolkit!D8": "Current YTD", "Skills Scorecard!M12": "Current YTD",
    "Procurement Scorecard!C15": "Year", "Procurement Scorecard!C16": "Current YTD",
    "Procurement Scorecard!E6": "Actual",
    "ESD Scorecard!F20": "Year", "ESD Scorecard!F21": "Current YTD",
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


def client_cells(rng, seed, revenue, npat, combine, profile):
    cells = dict(PERIOD_CELLS)
    cells.update({
        "Client Information!C3": f"Parity case ICT QSE {seed}",
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C8": round(rng.uniform(0.03, 0.12), 4),
        "Client Information!C16": revenue, "Client Information!C17": npat,
        "Client Information!C23": combine,
    })
    sdl = rng.uniform(2_500, 11_000) if profile != 'max' else 2_000
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = round(sdl * rng.uniform(0.9, 1.1), 2)
    # Leviable amount = MAX(SDL x 100, total payroll): sometimes the payroll is larger.
    if profile != 'max' and rng.random() < 0.3:
        cells["Client Information!C14"] = round(sdl * 12 * 100 * rng.uniform(1.05, 1.4), 2)
    # Four prior years; a missing year is left blank, as a new company would.
    for i in range(4):
        if profile != 'max' and rng.random() < 0.15:
            continue
        rev = round(revenue * rng.uniform(0.7, 1.2))
        cells[f"Financials!C{4 + i}"] = round(rev * rng.uniform(-0.04, 0.15))
        cells[f"Financials!E{4 + i}"] = rev
    return cells


def ownership(rng, profile):
    n_sh = rng.randint(1, 4)
    if profile == 'max':
        n_sh = 1
    shares = [rng.randint(10, 100) * 100 for _ in range(n_sh)]
    total_shares = sum(shares)
    company_value = rng.randint(5, 60) * 1_000_000
    price = round(company_value / total_shares, 2)
    rows = []
    for i in range(n_sh):
        if profile == 'max':
            bo, bwo, bdg, bne = 1.0, 1.0, 0.05, 0.0
        else:
            bo = pct(rng, 0, 1, 0.25)
            bwo = round(bo * pct(rng, 0, 1, 0.25), 4)
            bdg = round(bo * rng.choice([0, 0, 0.05, 0.1, 0.3]), 4)
            bne = round(bo * rng.choice([0, 0, 0.05, 0.2, 1.0]), 4)
        stake = company_value * shares[i] / total_shares
        debt = 0
        if profile == 'debt':
            # Most holders carry acquisition debt, one deep under water, and a
            # non-black holder's debt (the toolkit nets it as a negative stake).
            debt = round(stake * rng.choice([0.2, 0.7, 0.95, 1.3]))
            if i == n_sh - 1 and n_sh > 1:
                bo, bwo, bdg, bne = 0.0, 0.0, 0.0, 0.0
        elif profile != 'max' and rng.random() < 0.35:
            debt = round(stake * rng.uniform(0.1, 0.7))
        row = {
            "Data Date": DATA_DATE, "Shareholder": f"Holder {i + 1}",
            "Ownership Type": rng.choice(OWN_TYPES),
            "Outstaning Debt": debt,
            "BO%": bo, "BWO%": bwo, "BDG%": bdg, "BNE%": bne,
            "Number of Share": shares[i],
            # The toolkit's share % is this holding's VALUE over the sum of values.
            "Share Value": round(shares[i] * price, 2),
            "Original Date": d(rng.randint(2014, 2024), rng.randint(1, 12), 1),
        }
        if debt:
            row["Loan Date"] = d(rng.randint(2016, 2025), rng.randint(1, 12), 1)
        rows.append(row)
    if profile == 'debt' and n_sh == 1:
        rows[0]["BO%"] = 1.0
    val = [{"Date": DATA_DATE, "Company Asset Value": company_value, "Total Shares": total_shares,
            "Share Value": price}]
    return rows, val


def management(rng, profile, small):
    n_emp = rng.randint(8, 18) if small else rng.randint(18, 40)
    rows, directors = [], []
    for i in range(n_emp):
        des = rng.choices(DESIGS, DESIG_W)[0]
        if profile == 'max':
            race, gender, foreign = 'African', 'Female', 'No'
        else:
            race, gender, foreign = rng.choices(RACES, RACE_W)[0], rng.choice(['Male', 'Female']), yn(rng, 0.04)
        row = {"Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}",
               "Gender *": gender, "Race *": race,
               "Designation *": des, "Disabled *": yn(rng, 0.06), "Foreign *": foreign}
        if des in ('Non-executive Director', 'Executive Director'):
            directors.append(row)
        rows.append(row)
    # Every layout needs executives and senior/middle/junior managers to exist.
    for des in ('Executive Director', 'Senior Manager', 'Middle Manager', 'Junior Manager'):
        if not any(r["Designation *"] == des for r in rows):
            r = rows[rng.randrange(len(rows))]
            r["Designation *"] = des
            if des == 'Executive Director' and r not in directors:
                directors.append(r)
    directors = [r for r in rows if r["Designation *"] in ('Non-executive Director', 'Executive Director')]
    if directors:
        w = [rng.randint(1, 5) for _ in directors]
        s = sum(w)
        for row, wi in zip(directors, w):
            row["Voting Rights (Directors only) *"] = round(wi / s, 4)
    return rows


def skills(rng, profile, small):
    if profile == 'empty':
        return []
    n_tr = rng.randint(4, 10) if small else rng.randint(10, 26)
    rows = []
    for i in range(n_tr):
        cat = rng.choice('ABCDEFG') if not (profile == 'max' and i < 3) else 'BCD'[i]
        if profile == 'max':
            race, gender, foreign, disabled = 'African', 'Female', 'No', 'Yes'
        else:
            race, gender = rng.choices(RACES, RACE_W)[0], rng.choice(['Male', 'Female'])
            foreign, disabled = yn(rng, 0.04), yn(rng, 0.12)
        employed = yn(rng, 0.55)
        completed = yn(rng, 0.75)
        lai = cat in 'BCD'
        absorbed = 'Yes' if lai and completed == 'Yes' and employed == 'No' and rng.random() < 0.6 else 'No'
        if profile == 'max' and lai:
            employed, completed, absorbed = 'No', 'Yes', 'Yes'
        heavy_other = profile != 'max' and rng.random() < 0.25
        rows.append({
            "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": cat,
            "ABET": 'No', "Mandatory Training?": yn(rng, 0.1),
            "Learner Name *": f"Learner {i + 1}", "Gender *": gender, "Race *": race,
            "Disabled?*": disabled, "Foreign?*": foreign, "Age": rng.randint(19, 50),
            "Employed?": employed, "Completed?": completed, "Absorbed?": absorbed,
            "Course Cost": round(rng.uniform(2_000, 45_000), 2),
            # F & G courses and the "other" costs share a 15% cap; some rows carry a lot.
            "Travel Cost": round(rng.uniform(5_000, 40_000), 2) if heavy_other else (round(rng.uniform(0, 4_000), 2) if rng.random() < 0.3 else 0),
            "Accommodation Cost": round(rng.uniform(1_000, 9_000), 2) if rng.random() < 0.15 else 0,
            "Catering Cost": round(rng.uniform(200, 3_000), 2) if rng.random() < 0.15 else 0,
            "Stationery Cost": round(rng.uniform(100, 1_500), 2) if rng.random() < 0.1 else 0,
            "Training Facility Cost": round(rng.uniform(1_000, 8_000), 2) if rng.random() < 0.1 else 0,
            "Salary Cost (stipend and category B,C,D only)": round(rng.uniform(10_000, 70_000), 2) if lai and rng.random() < 0.6 else 0,
            "Other Costs": round(rng.uniform(500, 6_000), 2) if rng.random() < 0.15 else 0,
            "Start Date (format: dd/mm/yyyy)": rdate(rng, FY_START, "2025-09-30"),
            "End Date (format: dd/mm/yyyy)": rdate(rng, "2025-10-01", FY_END),
        })
    return rows


def procurement(rng, profile, small):
    n_sup = rng.randint(6, 12) if small else rng.randint(12, 35)
    rows = []
    total_spend = 0
    for i in range(n_sup):
        size = rng.choices(SIZES, [4, 3, 3])[0]
        if profile == 'max':
            lvl, bo, bwo, bdg = 1, 1.0, 1.0, 0.0
        else:
            lvl = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'])
            bo = rng.choice([0, 0.1, 0.26, 0.3, 0.51, 0.6, 1.0])
            bwo = round(bo * rng.choice([0, 0.3, 0.5, 1.0]), 4)
            bdg = round(bo * rng.choice([0, 0, 0.5, 0.9, 1.0]), 4)
        first_time_p = 0.5 if profile == 'firsttime' else 0.15
        sd = yn(rng, 0.15)
        three = yn(rng, 0.2)
        first = yn(rng, first_time_p)
        if profile == 'firsttime' and size in ('QSE', 'EME') and i % 2 == 0:
            # The branch the toolkit never reads: first-time, not an SD
            # beneficiary, no three-year contract, ≥51% black owned.
            sd, three, first, bo = 'No', 'No', 'Yes', max(bo, 0.6)
        spend = round(rng.uniform(40_000, 2_500_000), 2)
        total_spend += spend
        rows.append({
            "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}", "Current Company Size *": size,
            "B-BBEE Level": lvl, "Empowering Supplier? (Yes/No)": yn(rng, 0.7),
            "Current Black ownership": bo, "Current Black Female ownership": bwo,
            "Black Designated Group  ownership": bdg,
            "Supplier development recipient? (Yes/No)": sd,
            "3 year contract in place? (Yes/No)3": three,
            "First-time supplier? (Yes/No)": first,
            "Spend *": spend,
        })
    # TMPS: usually above the listing; sometimes below it (the listing then rules).
    factor = rng.uniform(0.85, 1.4) if profile != 'max' else 1.0
    incl = [{"Inclusions": "Cost of Sales", "Amount": round(total_spend * factor * 0.7, 2)},
            {"Inclusions": "Operating Expenses", "Amount": round(total_spend * factor * 0.3, 2)}]
    excl = []
    if profile != 'max' and rng.random() < 0.4:
        excl = [{"Exclusions": "Salaries and wages", "Amount": round(total_spend * 0.05, 2)}]
    buffer = round(rng.choice([0.05, 0.1, 0.2]), 2) if profile != 'max' and rng.random() < 0.3 else None
    return rows, incl, excl, buffer


def esd(rng, profile, small, npat):
    if profile == 'empty':
        return []
    n = rng.randint(2, 4) if small else rng.randint(3, 8)
    if profile == 'esd':
        n = 9
    rows = []
    scale = max(abs(npat), 400_000) * 0.006
    for i in range(n):
        pillar = rng.choice(['Supplier Development', 'Enterprise Development'])
        if profile == 'esd':
            pillar = 'Supplier Development' if i < 5 else 'Enterprise Development'
        if profile == 'max':
            pillar = 'Supplier Development' if i % 2 == 0 else 'Enterprise Development'
        types = SD_TYPES if pillar == 'Supplier Development' else ED_TYPES
        ctype = rng.choice(types)
        if profile == 'esd':
            forced = [SD_TYPES[7], SD_TYPES[6], SD_TYPES[12], SD_TYPES[8], SD_TYPES[5],
                      ED_TYPES[8], ED_TYPES[7], ED_TYPES[2], ED_TYPES[12]]
            ctype = forced[i]
        if profile == 'max':
            ctype = types[0]
        row = {
            "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i + 1}",
            "Current Black ownership %": rng.choice([0.3, 0.51, 1.0]),
            "Current Size": rng.choice(['EME', 'QSE']),
            "ICT Company?": yn(rng, 0.7),
            "Contribution Description*": f"Contribution {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type": ctype,
            "Amount": round(scale * rng.uniform(0.3, 2.5), 2) if profile != 'max' else round(max(npat, 1) * 0.05, 2),
            "Graduated to Supplier Development?": yn(rng, 0.2) if profile != 'max' else 'No',
        }
        if ctype.startswith(LOWER_RATE):
            prime = rng.choice([0.105, 0.1075, 0.11])
            row["Prime Rate"] = prime
            row["Actual Interest Rate"] = round(prime - rng.choice([0.01, 0.025, 0.04, 0.06]), 4)
            row["Amount"] = round(row["Amount"] * 10, 2)
        if ctype.startswith(SHORTER):
            inv = rdate(rng)
            days = rng.choice([0, 3, 7, 14, 20])
            pay = (datetime.date.fromisoformat(inv) + datetime.timedelta(days=days)).isoformat()
            row["Invoice date (format: dd/mm/yyyy)"] = inv
            row["Payment date (format: dd/mm/yyyy)"] = pay
            row["Amount"] = round(row["Amount"] * 6, 2)
        # Jobs created against the beneficiary's workforce: up to 10% earns
        # one point, 11% or more two.
        if profile == 'esd' and i in (1, 6):
            row["Number of jobs Created"], row["Total Workforce"] = (1, 20) if i == 1 else (4, 20)
        elif profile != 'max' and rng.random() < 0.3:
            wf = rng.randint(10, 60)
            row["Number of jobs Created"] = rng.randint(1, max(1, wf // 4))
            row["Total Workforce"] = wf
        rows.append(row)
    return rows


def sed(rng, profile, small, npat):
    if profile in ('empty', 'max'):
        return []
    n = rng.randint(1, 3) if small else rng.randint(2, 7)
    scale = max(abs(npat), 400_000) * 0.004
    rows = []
    for i in range(n):
        rows.append({
            "Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED {i + 1}",
            "Description of Spend *": f"SED spend {i + 1}",
            "ICT Specific Initiative?": yn(rng, 0.75),
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type *": rng.choice(SED_TYPES),
            "% of Spend Benefiting Black Individuals *": rng.choice([0.5, 0.75, 0.9, 1.0]),
            "Amount": round(scale * rng.uniform(0.3, 2.0), 2),
        })
    return rows


def make(seed, profile="full"):
    rng = random.Random(seed * 7919 + 17)
    small = profile in ('small', 'empty')
    revenue = rng.randint(10, 50) * 1_000_000
    if profile == 'deemed':
        npat = round(revenue * rng.uniform(-0.02, 0.004))
    elif profile == 'max':
        npat = round(revenue * 0.08)
    else:
        npat = round(revenue * (rng.uniform(-0.03, 0.01) if rng.random() < 0.2 else rng.uniform(0.02, 0.14)))
    combine = 'Yes' if (profile == 'max' or rng.random() < 0.45) else 'No'
    if profile in ('small', 'debt'):
        combine = 'No' if seed % 2 else 'Yes'
    cells = client_cells(rng, seed, revenue, npat, combine, profile)
    if profile == 'deemed' and seed % 2 == 0:
        cells["Client Information!C22"] = round(revenue * 0.03)
    if profile != 'max' and rng.random() < 0.4:
        cells["Skills Toolkit!D6"] = round(rng.uniform(150_000, 700_000), 2)
        cells["Skills Toolkit!D7"] = round(rng.uniform(15_000, 150_000), 2)

    own_rows, own_val = ownership(rng, profile)
    mc_rows = management(rng, profile, small)
    sk_rows = skills(rng, profile, small)
    pp_rows, incl, excl, buffer = procurement(rng, profile, small)
    if buffer is not None:
        cells["Procurement Scorecard!D4"] = buffer
    # The deemed NPAT the ESD and SED targets use is not known here; scale
    # contributions on the reported NPAT (or a floor) so points spread.
    esd_rows = esd(rng, profile, small, npat)
    sed_rows = sed(rng, profile, small, npat)

    tables = {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": incl,
        "tblESDData": esd_rows, "tblSED": sed_rows,
    }
    if excl:
        tables["tblExclusions"] = excl
    return {"template": "ict_qse", "seed": seed, "profile": profile, "cells": cells, "tables": tables}


# The standard set: twelve random cases across two sizes, and one case for each
# edge the random ones may miss. The 'max' case lands its corrected total on
# exactly 100 points (every line at its maximum except SED, which has no rows,
# the ED graduation and jobs bonuses, and the designated-group supplier bonus),
# so the level lookup is tested right on a threshold.
STANDARD = [(s, 'full' if s % 3 else 'small') for s in range(1, 13)] + [
    (101, 'max'), (102, 'empty'), (103, 'debt'), (104, 'esd'), (105, 'firsttime'),
    (106, 'deemed'), (107, 'deemed'), (108, 'debt'),
]


if __name__ == "__main__":
    if sys.argv[1] == "--all":
        out_dir = os.path.join(HERE, "cases", "ict_qse")
        os.makedirs(out_dir, exist_ok=True)
        for seed, profile in STANDARD:
            path = os.path.join(out_dir, f"iq_{seed}.case.json")
            json.dump(make(seed, profile), open(path, "w", encoding="utf-8"), indent=1)
            print("wrote", path, profile)
        sys.exit(0)
    seed = int(sys.argv[1])
    out = sys.argv[2]
    profile = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "full"
    json.dump(make(seed, profile), open(out, "w", encoding="utf-8"), indent=1)
    print("wrote", out)
