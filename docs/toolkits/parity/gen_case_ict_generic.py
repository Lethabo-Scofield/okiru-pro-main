"""Random but valid ICT Generic toolkit cases (BBBEE Toolkit (ICT Generic)
Template v1.4), written in the toolkit's own vocabulary (sheet cells + table
rows). Synthetic only: invented names, no ID numbers, no client data.

  py -3 gen_case_ict_generic.py <seed> <out.case.json> [--profile <name>]
  py -3 gen_case_ict_generic.py --all <out_dir>      # the standard case set

Profiles switch on the features a scored line reads, so every input is
exercised somewhere in the set:
  full       random company, every table populated
  small      few rows everywhere
  lowown     no black ownership (net value sub-minimum fails -> discounted)
  rich       high black ownership, spend and contributions (lines at their caps)
  empty_esd  no ESD and no SED rows, a loss-making year (deemed NPAT)
  disabled   disabled-learner spend measured against the EAP split ('Skills
             Toolkit'!D9 = Yes) plus training-admin costs
  admin      training-manager salary and overhead with disabled black staff in
             every group (the admin share of the disabled line)
  jobs       ESD beneficiaries creating jobs in both tiers, graduations,
             lower-interest / lower-dividend / shorter-payment contributions
  suppliers  first-time, Supplier Development and 3-year-contract suppliers,
             a procurement buffer and TMPS exclusions
"""
import sys, json, random, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_case import (  # noqa: E402  (shared helpers; gen_case's own behaviour is unchanged)
    our_eap_rows, d, rdate, pct, yn, VOC, PROVINCES, OWN_TYPES, DESIGS, DESIG_W, RACES, RACE_W,
    SIZES, FY_START, FY_END, DATA_DATE,
)

# The period pickers every ICT scorecard filters by ("Current YTD" = the latest
# data date, which every generated row carries). The ESD picker sits at F20:F21
# in this template (F13:F14 in RCOGP Generic).
PERIOD_CELLS = {
    "Ownership Scorecard!D16": "Year", "Ownership Scorecard!D17": "Current YTD",
    "MC Toolkit!C4": "Year", "MC Toolkit!C5": "Current YTD",
    "MC Scorecard!K14": "Year", "MC Scorecard!K15": "Current YTD",
    "MC Scorecard (Exco + Senior)!K14": "Year", "MC Scorecard (Exco + Senior)!K15": "Current YTD",
    "Skills Toolkit!D8": "Current YTD",
    "Procurement Scorecard!C18": "Year", "Procurement Scorecard!C19": "Current YTD",
    "ESD Scorecard!F20": "Year", "ESD Scorecard!F21": "Current YTD",
    "SED Scorecard!H9": "Year", "SED Scorecard!H10": "Current YTD",
    # Ships blank in this template (RCOGP Generic ships "Actual"); blank scores
    # every procurement line 0.
    "Procurement Scorecard!E6": "Actual",
}

# The standard set: (seed, profile). At least twelve, every profile at least once.
STANDARD_SET = [
    (101, "full"), (102, "small"), (103, "disabled"), (104, "admin"), (105, "lowown"),
    (106, "rich"), (107, "empty_esd"), (108, "jobs"), (109, "suppliers"), (110, "full"),
    (111, "disabled"), (112, "admin"), (113, "rich"), (114, "small"), (115, "jobs"),
    (116, "suppliers"),
]

SIMPLE_ESD_EXCLUDED = ('Lower insterest', 'Enterprise and Supplier Development Investment with lower',
                       'Shorter payment')


def make(seed, profile="full"):
    rng = random.Random(seed * 7919 + len(profile))
    small = profile == "small"
    rich = profile in ("rich",)
    revenue = rng.randint(60, 900) * 1_000_000
    if profile == "empty_esd":
        npat = round(revenue * rng.uniform(-0.04, -0.005))
    elif rng.random() < 0.25:
        npat = round(revenue * rng.uniform(-0.03, 0.01))
    else:
        npat = round(revenue * rng.uniform(0.02, 0.14))
    cells = dict(PERIOD_CELLS)
    cells.update({
        "Client Information!C3": f"ICT parity case {seed}",
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C7": 2025,
        "Client Information!C8": rng.choice(PROVINCES),
        "Client Information!C10": round(rng.uniform(0.03, 0.12), 4),
        "Client Information!C14": DATA_DATE,
        "Client Information!C18": revenue, "Client Information!C19": npat,
        # Disabled-learner spend against the EAP split only with the verifier's
        # sign-off ("Yes"); "No" is the plain 0.3% of leviable amount.
        "Skills Toolkit!D9": "Yes" if profile == "disabled" else "No",
    })
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = round(rng.uniform(15_000, 90_000), 2)
    if profile in ("admin", "disabled") or rng.random() < 0.3:
        cells["Skills Toolkit!D6"] = round(rng.uniform(200_000, 900_000), 2)
        cells["Skills Toolkit!D7"] = round(rng.uniform(20_000, 200_000), 2)
    for i in range(3):
        rev = round(revenue * rng.uniform(0.7, 1.2))
        cells[f"Financials!C{4 + i}"] = round(rev * rng.uniform(-0.04, 0.15))
        cells[f"Financials!E{4 + i}"] = rev
    if profile == "suppliers":
        cells["Procurement Scorecard!D4"] = round(rng.choice([0.05, 0.1, 0.2]), 2)

    # ---- Ownership
    n_sh = rng.randint(1, 4)
    shares = [rng.randint(10, 100) * 100 for _ in range(n_sh)]
    total_shares = sum(shares)
    company_value = rng.randint(20, 400) * 1_000_000
    price = round(company_value / total_shares, 2)
    own_rows = []
    for i in range(n_sh):
        if profile == "lowown":
            bo = 0.0
        elif rich:
            bo = rng.choice([0.75, 1.0])
        else:
            bo = pct(rng, 0, 1, 0.25)
        debt = 0 if profile == "lowown" else rng.choice(
            [0, 0, round(company_value * shares[i] / total_shares * rng.uniform(0.1, 0.6))])
        row = {
            "Data Date": DATA_DATE, "Shareholder": f"Holder {i + 1}",
            "Ownership Type": rng.choice(OWN_TYPES),
            "Outstaning Debt": debt,
            "BO%": bo, "BWO%": round(bo * pct(rng, 0, 1, 0.25), 4),
            "BDG%": round(bo * rng.choice([0, 0, 0.1, 0.3]), 4),
            "BNE%": round(bo * rng.choice([0, 0, 0.2, 1.0]), 4),
            "Number of Share": shares[i],
            "Share Value": round(shares[i] * price, 2),
            "Original Date": d(rng.randint(2014, 2024), rng.randint(1, 12), 1),
        }
        if debt:
            row["Loan Date"] = d(rng.randint(2016, 2025), rng.randint(1, 12), 1)
        own_rows.append(row)
    own_val = [{"Date": DATA_DATE, "Company Asset Value": company_value, "Total Shares": total_shares,
                "Share Value": price}]

    # ---- Management control
    n_emp = rng.randint(12, 25) if small else rng.randint(30, 90)
    p_disabled = 0.3 if profile in ("admin", "disabled") else 0.05
    mc_rows, directors = [], []
    for i in range(n_emp):
        des = rng.choices(DESIGS, DESIG_W)[0]
        race_w = [85, 6, 4, 5] if rich else RACE_W
        row = {"Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}",
               "Gender *": rng.choice(['Male', 'Female']), "Race *": rng.choices(RACES, race_w)[0],
               "Designation *": des, "Disabled *": yn(rng, p_disabled), "Foreign *": yn(rng, 0.03)}
        if des in ('Non-executive Director', 'Executive Director'):
            directors.append(row)
        mc_rows.append(row)
    if profile == "admin":
        # A disabled black employee in every group, so each group's share of
        # the training-admin costs is in play on the disabled line.
        k = len(mc_rows)
        for j, (race, gender) in enumerate([(r, g) for g in ('Male', 'Female') for r in ('African', 'Coloured', 'Indian')]):
            mc_rows.append({"Data Date": DATA_DATE, "Full Name *": f"Employee {k + j + 1}", "Gender *": gender,
                            "Race *": race, "Designation *": rng.choice(['Semi-skilled', 'Junior Manager', 'Unskilled']),
                            "Disabled *": "Yes", "Foreign *": "No"})
    if directors:
        w = [rng.randint(1, 5) for _ in directors]
        s = sum(w)
        for row, wi in zip(directors, w):
            row["Voting Rights (Directors only) *"] = round(wi / s, 4)

    # ---- Skills
    n_tr = rng.randint(3, 8) if small else rng.randint(10, 32)
    p_dis_learner = 0.35 if profile in ("admin", "disabled") else 0.08
    sk_rows = []
    for i in range(n_tr):
        cat = rng.choices('ABCDEFG', [2, 3, 3, 3, 2, 2, 2])[0]
        employed = yn(rng, 0.6)
        completed = yn(rng, 0.7)
        lai = cat in 'BCD'
        absorbed = 'Yes' if lai and completed == 'Yes' and rng.random() < 0.5 else 'No'
        # Every so often an employed learner is marked absorbed too: the toolkit
        # counts absorption only for learners who were not employed.
        if lai and employed == 'Yes' and completed == 'Yes' and rng.random() < 0.2:
            absorbed = 'Yes'
        mult = 2.5 if rich else 1.0
        sk_rows.append({
            "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": cat,
            "ABET": 'No', "Mandatory Training?": yn(rng, 0.1),
            "Learner Name *": f"Learner {i + 1}", "Gender *": rng.choice(['Male', 'Female']),
            "Race *": rng.choices(RACES, [70, 12, 8, 10] if rich else RACE_W)[0],
            "Disabled?*": yn(rng, p_dis_learner), "Foreign?*": yn(rng, 0.04),
            "Age": rng.randint(19, 50),
            "Employed?": employed, "Completed?": completed, "Absorbed?": absorbed,
            "Course Cost": round(rng.uniform(2_000, 60_000) * mult, 2),
            "Travel Cost": round(rng.uniform(0, 8_000), 2) if rng.random() < 0.35 else 0,
            "Accommodation Cost": round(rng.uniform(0, 6_000), 2) if rng.random() < 0.15 else 0,
            "Catering Cost": round(rng.uniform(0, 2_000), 2) if rng.random() < 0.1 else 0,
            "Stationery Cost": 0, "Training Facility Cost": round(rng.uniform(0, 5_000), 2) if rng.random() < 0.1 else 0,
            "Salary Cost (stipend and category B,C,D only)": round(rng.uniform(10_000, 80_000) * mult, 2) if lai and rng.random() < 0.6 else 0,
            "Other Costs": round(rng.uniform(0, 3_000), 2) if rng.random() < 0.1 else 0,
            "Start Date (format: dd/mm/yyyy)": rdate(rng, FY_START, "2025-09-30"),
            "End Date (format: dd/mm/yyyy)": rdate(rng, "2025-10-01", FY_END),
        })

    # ---- Procurement
    n_sup = rng.randint(6, 12) if small else rng.randint(15, 60)
    p_first = 0.35 if profile == "suppliers" else 0.12
    pp_rows = []
    total_spend = 0
    for i in range(n_sup):
        size = rng.choices(SIZES, [4, 3, 3])[0]
        lvl = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'])
        bo = rng.choice([0.51, 0.6, 1.0, 1.0]) if rich else rng.choice([0, 0.1, 0.26, 0.3, 0.51, 0.6, 1.0])
        spend = round(rng.uniform(50_000, 9_000_000), 2)
        total_spend += spend
        pp_rows.append({
            "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}", "Current Company Size *": size,
            "B-BBEE Level": lvl, "Empowering Supplier? (Yes/No)": yn(rng, 0.7),
            "Current Black ownership": bo,
            "Current Black Female ownership": round(bo * rng.choice([0, 0.3, 0.5, 1.0]), 4),
            "Black Designated Group  ownership": round(bo * rng.choice([0, 0, 0.5, 0.9, 1.0]), 4),
            "Supplier development recipient? (Yes/No)": yn(rng, 0.2 if profile == "suppliers" else 0.12),
            "3 year contract in place? (Yes/No)3": yn(rng, 0.25 if profile == "suppliers" else 0.15),
            "First-time supplier? (Yes/No)": yn(rng, p_first),
            "Spend *": spend,
        })
    tmps_incl = [{"Inclusions": "Cost of Sales", "Amount": round(total_spend * rng.uniform(0.8, 1.1), 2)},
                 {"Inclusions": "Operating Expenses", "Amount": round(total_spend * rng.uniform(0.05, 0.3), 2)}]
    tables_extra = {}
    if profile == "suppliers" or rng.random() < 0.3:
        tables_extra["tblExclusions"] = [
            {"Exclusions": "Taxes and Levies", "Amount": round(total_spend * rng.uniform(0.01, 0.05), 2)},
            {"Exclusions": "Imports", "Amount": round(total_spend * rng.uniform(0.0, 0.08), 2)},
        ]

    # ---- Enterprise and supplier development
    n_esd = 0 if profile == "empty_esd" else (rng.randint(1, 3) if small else rng.randint(3, 9))
    esd_rows = []
    for i in range(n_esd):
        pillar = rng.choice(['Supplier Development', 'Enterprise Development'])
        types = VOC['tblSDContributions'] if pillar == 'Supplier Development' else VOC['tblEDContributions']
        if profile == "jobs":
            ctype = rng.choice(types)
        else:
            ctype = rng.choice([t for t in types if not t.startswith(SIMPLE_ESD_EXCLUDED)])
        amount = round(rng.uniform(20_000, 1_500_000) * (3 if rich else 1), 2)
        row = {
            "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i + 1}",
            "Current Black ownership %": rng.choice([0.3, 0.51, 1.0]),
            # The template's list offers QSE and EME only.
            "Current Size": rng.choice(['EME', 'QSE']),
            "ICT Company?": yn(rng, 0.7),
            "Contribution Description*": f"Contribution {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type": ctype,
            "Amount": amount,
        }
        # Offered on Enterprise Development rows only (its list is keyed on the pillar).
        if pillar == 'Enterprise Development':
            row["Graduated to Supplier Development?"] = yn(rng, 0.3)
        if ctype.startswith(('Lower insterest', 'Enterprise and Supplier Development Investment with lower')):
            row["Prime Rate"] = 0.1075
            row["Actual Interest Rate"] = rng.choice([0.0, 0.05, 0.08, 0.1])
        if ctype.startswith('Shorter payment'):
            inv = rdate(rng, FY_START, "2026-01-31")
            row["Invoice date (format: dd/mm/yyyy)"] = inv
            row["Payment date (format: dd/mm/yyyy)"] = (
                __import__('datetime').date.fromisoformat(inv) + __import__('datetime').timedelta(days=rng.choice([0, 3, 7, 14, 20]))
            ).isoformat()
        r = rng.random()
        if profile == "jobs" or r < 0.4:
            workforce = rng.randint(5, 60)
            # Below 11%, at least 11%, or none at all.
            jobs = rng.choice([0, max(1, int(workforce * 0.05)), max(1, int(workforce * 0.10)), int(workforce * 0.2) + 1])
            row["Number of jobs Created"] = jobs
            row["Total Workforce"] = workforce
        esd_rows.append(row)
    if profile == "jobs" and esd_rows:
        # One beneficiary in each jobs tier.
        esd_rows[0].update({"Number of jobs Created": 2, "Total Workforce": 40})
        if len(esd_rows) > 1:
            esd_rows[1].update({"Number of jobs Created": 9, "Total Workforce": 30})

    # ---- Socio-economic development
    n_sed = 0 if profile == "empty_esd" else (rng.randint(1, 3) if small else rng.randint(2, 8))
    sed_rows = []
    for i in range(n_sed):
        sed_rows.append({
            "Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED {i + 1}",
            "Description of Spend *": f"SED spend {i + 1}",
            "ICT Specific Initiative?": yn(rng, 0.95 if rich else 0.75),
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type *": rng.choice(VOC['tblSEDContributions']),
            "% of Spend Benefiting Black Individuals *": rng.choice([0.5, 0.75, 0.9, 1.0]),
            "Amount": round(rng.uniform(5_000, 400_000) * (4 if rich else 1), 2),
        })

    tables = {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": tmps_incl,
        "tblESDData": esd_rows, "tblSED": sed_rows, "tblEAPAll": our_eap_rows(),
    }
    tables.update(tables_extra)
    return {"template": "ict_generic", "seed": seed, "profile": profile, "cells": cells, "tables": tables}


if __name__ == "__main__":
    if sys.argv[1] == "--all":
        out_dir = sys.argv[2]
        os.makedirs(out_dir, exist_ok=True)
        for seed, profile in STANDARD_SET:
            path = os.path.join(out_dir, f"ict_{seed}_{profile}.case.json")
            json.dump(make(seed, profile), open(path, "w", encoding="utf-8"), indent=1)
            print("wrote", path)
    else:
        seed = int(sys.argv[1])
        out = sys.argv[2]
        profile = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "full"
        json.dump(make(seed, profile), open(out, "w", encoding="utf-8"), indent=1)
        print("wrote", out)
