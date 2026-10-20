"""Random but valid AgriBEE Generic toolkit cases (BBBEE Toolkit (Agri Generic)
Master v1.0.1), written in the toolkit's own vocabulary: sheet cells + table
rows. Synthetic only: invented names, no ID numbers, no client data.

  py -3 gen_case_agri_generic.py <seed> <out.case.json> [--profile full|small|edge|lean|discount|boundary|factors|coverage|coverage-low]
  py -3 gen_case_agri_generic.py --all <out_dir>      (the standard case set)

Profiles:
  full     a mid-sized agri business, every table filled.
  small    few rows everywhere.
  edge     thresholds and corner inputs: suppliers at exactly 51% / 30%,
           first-time suppliers without a 3-year contract, acquisition debt on
           a non-black holder and on loans older than eight years, a disabled
           non-executive director, training that ended before the year began,
           lower-interest / shorter-payment / employee-time / minority-
           investment contributions, mixed agri-initiative SED rows.
  lean     empty ESD and SED tables, no training-admin costs, no debt.
  discount sub-minimums failed on purpose (tiny skills, procurement and SD
           spend), and the scarce-and-critical declarations answered "No".
  boundary every line full or empty, so the total is exactly 80.00 (a level
           boundary).
  factors  development and socio-economic spend below target, so every
           benefit factor (computed or fixed) shows in the points.
  coverage acquisition debt on non-black and partly black holders in later
           register rows, TMPS exclusions, stationery costs, foreign black
           learners and employees, the spend declaration "No" with the
           headcount one "Yes".
  coverage-low  the same, with black ownership well below target so the
           later-row debt netting shows in the points.
"""
import sys, json, random, datetime, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_case import (  # noqa: E402  (shared helpers; gen_case's behaviour is unchanged)
    FY_START, FY_END, DATA_DATE, PROVINCES, OWN_TYPES, DESIGS, DESIG_W, RACES, RACE_W, SIZES, VOC,
    our_eap_rows, d, rdate, pct, yn,
)

# Every scorecard sheet filters its data by a period picker; "Current YTD"
# selects the latest data date, which every generated row carries. The Agri
# ownership picker sits one row lower than RCOGP's (D19/D20, not D16/D17).
PERIOD_CELLS = {
    "Ownership Scorecard!D19": "Year", "Ownership Scorecard!D20": "Current YTD",
    "MC Toolkit!C4": "Year", "MC Toolkit!C5": "Current YTD",
    "MC Scorecard!K14": "Year", "MC Scorecard!K15": "Current YTD",
    "MC Scorecard (Exco + Senior)!K14": "Year", "MC Scorecard (Exco + Senior)!K15": "Current YTD",
    "Skills Toolkit!D8": "Current YTD", "Skills Scorecard!Q11": "Current YTD",
    "Procurement Scorecard!C18": "Year", "Procurement Scorecard!C19": "Current YTD",
    "ESD Scorecard!F13": "Year", "ESD Scorecard!F14": "Current YTD",
    "SED Scorecard!H9": "Year", "SED Scorecard!H10": "Current YTD",
}

# Every Procurement Scorecard line reads 0 unless this says "Actual" (G9:G15).
PROCUREMENT_BASIS = {"Procurement Scorecard!E6": "Actual"}

LOWER_INTEREST = 'Lower insterest Rate than prime on Standard Loan to Enterprise and Supplier Development beneficiaries'
LOWER_DIVIDEND = 'Enterprise and Supplier Development Investment with lower dividend to fanacier'
SHORTER_PAYMENT = 'Shorter payment periods for Enterprise and Supplier Development beneficiaries'
EMPLOYEE_TIME = 'Time of employees productively deployed in assisting Enterprise and Supplier Development beneficiaries'
SD_MINORITY = 'Minority Investment in Enterprise and Supplier Development beneficiaries'
TMPS_INCLUSIONS = ['Cost of Sales', 'Operating Expenses', 'Cash used in Operations', 'Capital Expenses', 'Finance Costs']


def simple_types(pillar):
    types = VOC['tblSDContributions'] if pillar == 'Supplier Development' else VOC['tblEDContributions']
    computed = (LOWER_INTEREST, LOWER_DIVIDEND, SHORTER_PAYMENT)
    return sorted(set(t for t in types if t not in computed))


def make(seed, profile="full"):
    rng = random.Random(seed)
    small = profile in ("small", "lean")
    edge = profile == "edge"
    lean = profile == "lean"
    discount = profile == "discount"

    revenue = rng.randint(60, 900) * 1_000_000
    npat = round(revenue * (rng.uniform(-0.03, 0.01) if rng.random() < 0.25 else rng.uniform(0.02, 0.14)))
    cells = dict(PERIOD_CELLS)
    cells.update(PROCUREMENT_BASIS)
    cells.update({
        "Client Information!C3": f"Agri parity case {seed}",
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C7": 2025,
        "Client Information!C8": rng.choice(PROVINCES),
        "Client Information!C10": round(rng.uniform(0.03, 0.12), 4),
        "Client Information!C14": DATA_DATE,
        "Client Information!C18": revenue, "Client Information!C19": npat,
        # Scarce and critical skills declarations: each gates its Skills lines.
        "Skills Toolkit!D10": "No" if discount else "Yes",
        "Skills Toolkit!D11": "No" if discount else "Yes",
    })
    if seed % 7 == 3 and not discount:
        cells["Skills Toolkit!D11"] = "No"   # spend lines still score; headcount lines do not
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = round(rng.uniform(15_000, 90_000), 2)
    if not lean and rng.random() < 0.6:
        cells["Skills Toolkit!D6"] = round(rng.uniform(200_000, 900_000), 2)
        cells["Skills Toolkit!D7"] = round(rng.uniform(20_000, 200_000), 2)
    for i in range(3):
        rev = round(revenue * rng.uniform(0.7, 1.2))
        cells[f"Financials!C{4 + i}"] = round(rev * rng.uniform(-0.04, 0.15))
        cells[f"Financials!E{4 + i}"] = rev
    if rng.random() < 0.2:
        cells["Procurement Scorecard!D4"] = rng.choice([0.05, 0.1])

    # ---------------- Ownership ----------------
    n_sh = rng.randint(1, 4) if not edge else 4
    shares = [rng.randint(10, 100) * 100 for _ in range(n_sh)]
    total_shares = sum(shares)
    company_value = rng.randint(20, 400) * 1_000_000
    price = round(company_value / total_shares, 2)
    own_rows = []
    for i in range(n_sh):
        bo = pct(rng, 0, 1, 0.25)
        if edge and i == 0:
            bo = 0.0          # a white holder carrying acquisition debt
        stake = company_value * shares[i] / total_shares
        if lean:
            debt = 0
        elif edge:
            # Debt everywhere: the non-black holder, a stake netted pro rata
            # (debt above 60% of it), and ordinary stakes.
            debt = round(stake * (rng.uniform(0.65, 0.9) if i == 1 else rng.uniform(0.1, 0.55)))
        else:
            debt = rng.choice([0, 0, round(stake * rng.uniform(0.1, 0.75))])
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
            # Some loans are more than eight years old: the toolkit's graduation
            # table stops at year 9, so those read a factor of 0.
            y = rng.randint(2012, 2016) if (edge and i == 2) else rng.randint(2015, 2025)
            row["Loan Date"] = d(y, rng.randint(1, 12), 1)
        own_rows.append(row)
    own_val = [{"Date": DATA_DATE, "Company Asset Value": company_value, "Total Shares": total_shares,
                "Share Value": price}]

    # ---------------- Management control ----------------
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
    if edge:
        mc_rows.append({"Data Date": DATA_DATE, "Full Name *": "Director Disabled", "Gender *": "Female",
                        "Race *": "African", "Designation *": "Non-executive Director",
                        "Disabled *": "Yes", "Foreign *": "No"})
        directors.append(mc_rows[-1])
    if directors:
        w = [rng.randint(1, 5) for _ in directors]
        s = sum(w)
        for row, wi in zip(directors, w):
            row["Voting Rights (Directors only) *"] = round(wi / s, 4)

    # ---------------- Skills ----------------
    n_tr = rng.randint(3, 8) if small else rng.randint(8, 30)
    if discount:
        n_tr = 2
    sk_rows = []
    for i in range(n_tr):
        cat = rng.choice('ABCDEFG')
        employed = 'No' if rng.random() < 0.35 else 'Yes'
        completed = yn(rng, 0.7)
        absorbed = 'No'
        if completed == 'Yes' and cat in 'BCD':
            absorbed = 'Yes' if (employed == 'No' and rng.random() < 0.6) or rng.random() < 0.05 else 'No'
        start, end = rdate(rng, FY_START, "2025-09-30"), rdate(rng, "2025-10-01", FY_END)
        if edge and i == 0:
            start, end = "2024-06-01", "2025-02-15"   # ended before the year began: not Within FY
        sk_rows.append({
            "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": cat,
            "ABET": 'No', "Mandatory Training?": yn(rng, 0.1),
            "Training Provider": f"Provider {rng.randint(1, 6)}",
            "Scarce or Critical Skills?": yn(rng, 0.9),
            "Learner Name *": f"Learner {i + 1}", "Gender *": rng.choice(['Male', 'Female']),
            "Race *": rng.choices(RACES, RACE_W)[0], "Disabled?*": yn(rng, 0.1), "Foreign?*": yn(rng, 0.03),
            "Age": rng.randint(19, 50),
            "Employed?": employed, "Completed?": completed, "Absorbed?": absorbed,
            "Course Cost": round(rng.uniform(2_000, 60_000) * (0.05 if discount else 1), 2),
            "Travel Cost": round(rng.uniform(0, 8_000), 2) if rng.random() < 0.4 else 0,
            "Accommodation Cost": round(rng.uniform(0, 6_000), 2) if rng.random() < 0.2 else 0,
            "Catering Cost": round(rng.uniform(0, 3_000), 2) if rng.random() < 0.2 else 0,
            "Stationery Cost": 0, "Training Facility Cost": round(rng.uniform(0, 5_000), 2) if rng.random() < 0.1 else 0,
            "Salary Cost (stipend and category B,C,D only)": round(rng.uniform(10_000, 80_000), 2) if rng.random() < 0.5 else 0,
            "Other Costs": round(rng.uniform(0, 4_000), 2) if rng.random() < 0.15 else 0,
            "Start Date (format: dd/mm/yyyy)": start,
            "End Date (format: dd/mm/yyyy)": end,
        })

    # ---------------- Procurement ----------------
    n_sup = rng.randint(6, 12) if small else rng.randint(15, 60)
    pp_rows = []
    total_spend = 0
    for i in range(n_sup):
        size = rng.choices(SIZES, [4, 3, 3])[0]
        lvl = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'])
        bo = rng.choice([0, 0.1, 0.26, 0.3, 0.51, 0.6, 1.0])
        bwo = round(bo * rng.choice([0, 0.3, 0.5, 1.0]), 4)
        if edge and i < 3:
            bo, bwo = 0.51, 0.30                       # exactly on both thresholds
        spend = round(rng.uniform(50_000, 9_000_000) * (0.02 if discount else 1), 2)
        total_spend += spend
        sd_rec = yn(rng, 0.15)
        three = yn(rng, 0.2)
        first = yn(rng, 0.25)
        if edge and i in (3, 4):
            size, bo, sd_rec, three, first = rng.choice(['QSE', 'EME']), 0.6, 'No', 'No', 'Yes'
        pp_rows.append({
            "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}", "Current Company Size *": size,
            "B-BBEE Level": lvl, "Empowering Supplier? (Yes/No)": yn(rng, 0.7),
            "Current Black ownership": bo,
            "Current Black Female ownership": bwo,
            "Black Designated Group  ownership": round(bo * rng.choice([0, 0, 0.5, 0.9, 1.0]), 4) if not (edge and i == 0) else 0.51,
            "Supplier development recipient? (Yes/No)": sd_rec,
            "3 year contract in place? (Yes/No)3": three,
            "First-time supplier? (Yes/No)": first,
            "Spend *": spend,
        })
    cost_of_sales = round(total_spend * rng.uniform(1.0, 1.4), 2)
    opex = round(total_spend * rng.uniform(0, 0.2), 2) if rng.random() < 0.5 else 0
    tmps_incl = [{"Inclusions": name, "Amount": amt} for name, amt in
                 zip(TMPS_INCLUSIONS, [cost_of_sales, opex, None, None, None])]

    # ---------------- Enterprise and supplier development ----------------
    n_esd = 0 if lean else (rng.randint(1, 3) if small else rng.randint(2, 8))
    if discount:
        n_esd = 1
    esd_rows = []
    for i in range(n_esd):
        pillar = rng.choice(['Supplier Development', 'Enterprise Development'])
        if discount:
            pillar = 'Enterprise Development'
        ctype = rng.choice(simple_types(pillar))
        if not edge:
            ctype = rng.choice([t for t in simple_types(pillar) if t != EMPLOYEE_TIME])
        row = {
            "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i + 1}",
            "Current Black ownership %": rng.choice([0.3, 0.51, 1.0]),
            "Current Size": rng.choice(['EME', 'QSE', 'Generic']),
            "Agri Company?": yn(rng, 0.7),
            "Contribution Description*": f"Contribution {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type": ctype,
            "Amount": round(rng.uniform(20_000, 1_500_000) * (0.02 if discount else 1), 2),
            "At least 1 job created?": yn(rng, 0.3), "Graduated to Supplier Development?": yn(rng, 0.2),
        }
        esd_rows.append(row)
    if edge:
        # The computed benefit factors, and the SD minority investment the
        # toolkit's lookup reads at 0.
        txn = rdate(rng)
        esd_rows.append({**esd_rows[0], "Beneficiary Name": "Beneficiary LI", "Pillar": "Enterprise Development",
                         "Contribution Type": LOWER_INTEREST, "Amount": 900_000.0,
                         "Prime Rate": 0.1075, "Actual Interest Rate": 0.065})
        esd_rows.append({**esd_rows[0], "Beneficiary Name": "Beneficiary LD", "Pillar": "Supplier Development",
                         "Contribution Type": LOWER_DIVIDEND, "Amount": 700_000.0,
                         "Prime Rate": 0.1075, "Actual Interest Rate": 0.04})
        esd_rows.append({**esd_rows[0], "Beneficiary Name": "Beneficiary SP", "Pillar": "Supplier Development",
                         "Contribution Type": SHORTER_PAYMENT, "Amount": 2_500_000.0,
                         "Invoice date (format: dd/mm/yyyy)": txn,
                         "Payment date (format: dd/mm/yyyy)": (datetime.date.fromisoformat(txn) + datetime.timedelta(days=6)).isoformat()})
        esd_rows.append({**esd_rows[0], "Beneficiary Name": "Beneficiary MI", "Pillar": "Supplier Development",
                         "Contribution Type": SD_MINORITY, "Amount": 1_200_000.0})

    # ---------------- Socio-economic development ----------------
    n_sed = 0 if lean else (rng.randint(1, 3) if small else rng.randint(2, 8))
    sed_rows = []
    for i in range(n_sed):
        sed_rows.append({
            "Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED {i + 1}",
            "Description of Spend *": f"SED spend {i + 1}",
            "Agri Specific Initiative?": 'Yes' if (rng.random() < (0.5 if edge else 0.85)) else 'No',
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type *": rng.choice(VOC['tblSEDContributions']),
            "% of Spend Benefiting Black Individuals *": rng.choice([0.5, 0.75, 0.9, 1.0]),
            "Amount": round(rng.uniform(5_000, 900_000), 2),
        })

    return {"template": "agri_generic", "seed": seed, "profile": profile, "cells": cells, "tables": {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": tmps_incl,
        "tblESDData": esd_rows, "tblSED": sed_rows, "tblEAPAll": our_eap_rows()}}


def make_boundary(seed):
    """Every line full or empty, so the total lands exactly on 80.00, the
    Level 4 boundary: Ownership 25 (no debt), Management Control 0 (an
    all-white register), Skills 0 (white learners only — and so discounted),
    Procurement 25 (no designated-group supplier), SD 10, ED 5 (no bonuses),
    SED 15."""
    rng = random.Random(seed)
    cells = dict(PERIOD_CELLS)
    cells.update(PROCUREMENT_BASIS)
    cells.update({
        "Client Information!C3": f"Agri boundary case {seed}",
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C7": 2025, "Client Information!C8": "Western Cape",
        "Client Information!C10": 0.05, "Client Information!C14": DATA_DATE,
        "Client Information!C18": 200_000_000, "Client Information!C19": 20_000_000,
        "Skills Toolkit!D10": "Yes", "Skills Toolkit!D11": "Yes",
    })
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = 40_000.0
    for i in range(3):
        cells[f"Financials!C{4 + i}"] = 18_000_000
        cells[f"Financials!E{4 + i}"] = 190_000_000
    own_rows = [{
        "Data Date": DATA_DATE, "Shareholder": f"Holder {i + 1}", "Ownership Type": "Strategic Partner",
        "Outstaning Debt": 0, "BO%": 1.0, "BWO%": 1.0, "BDG%": 0.1, "BNE%": 0.1,
        "Number of Share": 500, "Share Value": 250_000.0, "Original Date": "2018-03-01",
    } for i in range(2)]
    own_val = [{"Date": DATA_DATE, "Company Asset Value": 500_000.0, "Total Shares": 1000, "Share Value": 500.0}]
    mc_rows = [{"Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}", "Gender *": rng.choice(['Male', 'Female']),
                "Race *": "White", "Designation *": DESIGS[i % len(DESIGS)], "Disabled *": "No", "Foreign *": "No"}
               for i in range(30)]
    directors = [r for r in mc_rows if r["Designation *"] in ('Non-executive Director', 'Executive Director')]
    for r in directors:
        r["Voting Rights (Directors only) *"] = round(1 / len(directors), 4)
    sk_rows = [{
        "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": "B",
        "ABET": "No", "Mandatory Training?": "No", "Training Provider": "Provider 1",
        "Scarce or Critical Skills?": "Yes", "Learner Name *": f"Learner {i + 1}", "Gender *": "Male",
        "Race *": "White", "Disabled?*": "No", "Foreign?*": "No", "Age": 30, "Employed?": "No",
        "Completed?": "Yes", "Absorbed?": "Yes", "Course Cost": 20_000.0, "Travel Cost": 0, "Accommodation Cost": 0,
        "Catering Cost": 0, "Stationery Cost": 0, "Training Facility Cost": 0,
        "Salary Cost (stipend and category B,C,D only)": 10_000.0, "Other Costs": 0,
        "Start Date (format: dd/mm/yyyy)": "2025-04-01", "End Date (format: dd/mm/yyyy)": "2025-12-31",
    } for i in range(3)]
    pp_rows = [{
        "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}",
        "Current Company Size *": "QSE" if i % 2 else "EME", "B-BBEE Level": 1,
        "Empowering Supplier? (Yes/No)": "Yes", "Current Black ownership": 1.0,
        "Current Black Female ownership": 1.0, "Black Designated Group  ownership": 0,
        "Supplier development recipient? (Yes/No)": "No", "3 year contract in place? (Yes/No)3": "No",
        "First-time supplier? (Yes/No)": "No", "Spend *": 1_000_000.0,
    } for i in range(10)]
    tmps_incl = [{"Inclusions": name, "Amount": amt} for name, amt in
                 zip(TMPS_INCLUSIONS, [10_000_000.0, None, None, None, None])]
    esd_rows = [{
        "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {pillar[:2]}",
        "Current Black ownership %": 1.0, "Current Size": "EME", "Agri Company?": "Yes",
        "Contribution Description*": "Grant", "Date of Transaction * (format: dd/mm/yyyy)": "2025-06-30",
        "Contribution Type": "Grant Contribution", "Amount": 50_000_000.0,
        "At least 1 job created?": "No", "Graduated to Supplier Development?": "No",
    } for pillar in ("Supplier Development", "Enterprise Development")]
    sed_rows = [{
        "Data Date": DATA_DATE, "Beneficiary Name *": "Beneficiary SED 1", "Description of Spend *": "Grant",
        "Agri Specific Initiative?": "Yes", "Date of Transaction * (format: dd/mm/yyyy)": "2025-07-31",
        "Contribution Type *": "Grant Contribution", "% of Spend Benefiting Black Individuals *": 1.0,
        "Amount": 50_000_000.0,
    }]
    return {"template": "agri_generic", "seed": seed, "profile": "boundary", "cells": cells, "tables": {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": tmps_incl,
        "tblESDData": esd_rows, "tblSED": sed_rows, "tblEAPAll": our_eap_rows()}}


def make_factors(seed):
    """An ordinary company whose development and socio-economic spend stays
    BELOW target, so every benefit factor shows in the points: below-prime
    loans, lower-dividend investments, shorter payment terms, employee time,
    guarantees, overheads, a Supplier Development minority investment, and
    every socio-economic contribution type (one row not an agri initiative)."""
    case = make(seed, "full")
    cells = case["cells"]
    cells["Client Information!C18"] = 800_000_000
    cells["Client Information!C19"] = 80_000_000
    for i in range(3):
        cells[f"Financials!C{4 + i}"] = 70_000_000
        cells[f"Financials!E{4 + i}"] = 750_000_000
    base = {"Data Date": DATA_DATE, "Current Black ownership %": 1.0, "Current Size": "EME", "Agri Company?": "Yes",
            "Date of Transaction * (format: dd/mm/yyyy)": "2025-08-15",
            "At least 1 job created?": "No", "Graduated to Supplier Development?": "No"}
    sd, ed = "Supplier Development", "Enterprise Development"
    rows = [
        (ed, LOWER_INTEREST, 900_000.0, {"Prime Rate": 0.1075, "Actual Interest Rate": 0.065}),
        (sd, LOWER_DIVIDEND, 700_000.0, {"Prime Rate": 0.1075, "Actual Interest Rate": 0.04}),
        (sd, SHORTER_PAYMENT, 2_500_000.0, {"Invoice date (format: dd/mm/yyyy)": "2025-09-01",
                                            "Payment date (format: dd/mm/yyyy)": "2025-09-07"}),
        (ed, SHORTER_PAYMENT, 1_000_000.0, {"Invoice date (format: dd/mm/yyyy)": "2025-09-01",
                                            "Payment date (format: dd/mm/yyyy)": "2025-09-30"}),
        (sd, SD_MINORITY, 1_200_000.0, {}),
        (ed, EMPLOYEE_TIME, 300_000.0, {}),
        (sd, 'Guarantees provided on behalf of Enterprise and Supplier Development beneficiaries', 400_000.0, {}),
        (ed, 'Guarantees provided on behalf of an Enterprise and Supplier Development beneficiaries', 250_000.0, {}),
        (ed, 'Overhead costs incurred in supporting Enterprise and Supplier Development beneficiaries', 200_000.0, {}),
        (sd, 'Interest free loan with no security requirements', 150_000.0, {}),
        (ed, 'Discounts in addition to normal business practice supporting Enterprise and Supplier Development beneficiaries', 60_000.0, {}),
    ]
    case["tables"]["tblESDData"] = [
        {**base, "Pillar": p, "Beneficiary Name": f"Beneficiary F{i + 1}", "Contribution Description*": f"Contribution F{i + 1}",
         "Contribution Type": t, "Amount": a, **extra}
        for i, (p, t, a, extra) in enumerate(rows)]
    case["tables"]["tblSED"] = [{
        "Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED F{i + 1}", "Description of Spend *": f"SED F{i + 1}",
        "Agri Specific Initiative?": "No" if i == 2 else "Yes", "Date of Transaction * (format: dd/mm/yyyy)": "2025-10-10",
        "Contribution Type *": t, "% of Spend Benefiting Black Individuals *": 0.75, "Amount": 120_000.0,
    } for i, t in enumerate(VOC['tblSEDContributions'])]
    case["profile"] = "factors"
    return case


TMPS_EXCLUSIONS = ['Taxes and Levies', 'Movements in provisions (e.g. leave, bonus etc.)', 'Salaries and wages',
                   'Pass-through third party procurement', 'Broker commissions',
                   'Discount allowed/Discount Recvd disallowed', 'Inter-entity charges', 'Imports',
                   'Depreciation & Amortisation', 'Amortisation', 'Municipality', 'Bad debts', 'Impairment',
                   'Enterprise and Supplier Development']


def make_coverage(seed, low_black=False):
    """An ordinary company that also reaches the inputs the other profiles
    leave alone: acquisition debt on a non-black holder and on a partly black
    holder in LATER rows of the register (the toolkit nets those rows another
    way), TMPS exclusions, stationery costs, foreign black learners and
    employees, and the spend declaration answered "No" while the headcount one
    is "Yes". Odd seeds let spend + buffer outweigh the TMPS; even seeds keep
    the TMPS (after exclusions) the larger.

    low_black ("coverage-low"): black ownership kept well below the 25%
    targets, so the later-row debt netting moves the economic-interest and
    net-value points instead of disappearing under their caps; on even seeds
    the partly black holder's loan is more than eight years old."""
    case = make(seed, "full")
    rng = random.Random(seed * 7919)
    cells, tables = case["cells"], case["tables"]

    # Ownership: four holders; debt on the first (black, more than 60% of its
    # stake), the second (not black) and the third (partly black).
    if low_black:
        shares = [1000, 5000, 2500, 1500]
        spec = [(0.5, 0.7), (0.0, 0.3), (0.3, 0.2), (0.2, 0.0)]
    else:
        shares = [rng.randint(10, 60) * 100 for _ in range(4)]
        spec = [(1.0, 0.7), (0.0, 0.3), (0.4, 0.2), (0.8, 0.0)]   # (BO%, debt as a share of the stake)
    total_shares = sum(shares)
    company_value = rng.randint(50, 300) * 1_000_000
    price = round(company_value / total_shares, 2)
    own_rows = []
    for i, (bo, debt_share) in enumerate(spec):
        stake = shares[i] * price
        row = {
            "Data Date": DATA_DATE, "Shareholder": f"Holder {i + 1}", "Ownership Type": OWN_TYPES[i % len(OWN_TYPES)],
            "Outstaning Debt": round(stake * debt_share), "BO%": bo,
            "BWO%": round(bo * rng.choice([0.25, 0.5, 1.0]), 4),
            "BDG%": round(bo * rng.choice([0, 0.1, 0.3]), 4), "BNE%": round(bo * rng.choice([0, 0.2, 1.0]), 4),
            "Number of Share": shares[i], "Share Value": round(stake, 2),
            "Original Date": d(rng.randint(2016, 2023), rng.randint(1, 12), 1),
        }
        if debt_share:
            row["Loan Date"] = d(rng.randint(2018, 2024), rng.randint(1, 12), 1)
            if low_black and seed % 2 == 0 and i == 2:
                row["Loan Date"] = "2014-06-01"
        own_rows.append(row)
    tables["tblOwnershipData"] = own_rows
    tables["tblCompanyValuation"] = [{"Date": DATA_DATE, "Company Asset Value": company_value,
                                      "Total Shares": total_shares, "Share Value": price}]

    # Management control: a foreign black senior manager (not black for B-BBEE).
    tables["tblMCData"].append({"Data Date": DATA_DATE, "Full Name *": "Employee Foreign", "Gender *": "Female",
                                "Race *": "African", "Designation *": "Senior Manager",
                                "Disabled *": "No", "Foreign *": "Yes"})

    # Skills: stationery on some rows, a foreign black unemployed learner, and
    # the spend declaration "No" on odd seeds.
    for r in tables["tblSkillsData"]:
        if rng.random() < 0.4:
            r["Stationery Cost"] = round(rng.uniform(200, 3_000), 2)
    tables["tblSkillsData"].append({**tables["tblSkillsData"][0], "Training Program Name *": "Programme Foreign",
                                    "Learner Name *": "Learner Foreign", "Category *": "B", "Race *": "African",
                                    "Foreign?*": "Yes", "Employed?": "No", "Completed?": "Yes", "Absorbed?": "Yes",
                                    "Course Cost": 25_000.0, "Stationery Cost": 800.0,
                                    "Start Date (format: dd/mm/yyyy)": "2025-04-01",
                                    "End Date (format: dd/mm/yyyy)": "2025-12-31"})
    cells["Skills Toolkit!D10"] = "No" if seed % 2 else "Yes"
    cells["Skills Toolkit!D11"] = "Yes"

    # TMPS with exclusions.
    total_spend = sum(r["Spend *"] for r in tables["tblPPData"])
    if seed % 2:
        cos, excl, buffer = total_spend * 1.05, {"Salaries and wages": 0.08, "Imports": 0.04}, 0.05
    else:
        cos, excl, buffer = total_spend * 1.4, {"Salaries and wages": 0.1, "Imports": 0.03, "Bad debts": 0.02}, None
    tables["tblInclusions"] = [{"Inclusions": name, "Amount": amt} for name, amt in
                               zip(TMPS_INCLUSIONS, [round(cos, 2), None, None, None, None])]
    tables["tblExclusions"] = [{"Exclusions": name, "Amount": round(total_spend * excl[name], 2) if name in excl else None}
                               for name in TMPS_EXCLUSIONS]
    if buffer is None:
        cells.pop("Procurement Scorecard!D4", None)
    else:
        cells["Procurement Scorecard!D4"] = buffer
    case["profile"] = "coverage-low" if low_black else "coverage"
    return case


def build(seed, profile):
    if profile == "boundary":
        return make_boundary(seed)
    if profile == "factors":
        return make_factors(seed)
    if profile == "coverage":
        return make_coverage(seed)
    if profile == "coverage-low":
        return make_coverage(seed, low_black=True)
    return make(seed, profile)


# The standard set: (seed, profile).
STANDARD = [(101, "full"), (102, "full"), (103, "small"), (104, "edge"), (105, "full"), (106, "lean"),
            (107, "discount"), (108, "full"), (109, "small"), (110, "edge"), (111, "full"), (112, "full"),
            (113, "small"), (114, "edge"), (115, "full"), (116, "discount"), (117, "boundary"), (118, "factors"),
            (119, "coverage"), (120, "coverage"), (121, "coverage-low"), (122, "coverage-low")]


if __name__ == "__main__":
    if sys.argv[1] == "--all":
        out_dir = sys.argv[2]
        os.makedirs(out_dir, exist_ok=True)
        for seed, profile in STANDARD:
            p = os.path.join(out_dir, f"agri_{seed}.case.json")
            case = build(seed, profile)
            json.dump(case, open(p, "w", encoding="utf-8"), indent=1)
            print("wrote", p, profile)
    else:
        seed = int(sys.argv[1])
        out = sys.argv[2]
        profile = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "full"
        case = build(seed, profile)
        json.dump(case, open(out, "w", encoding="utf-8"), indent=1)
        print("wrote", out)
