"""Random but valid FSC toolkit cases (BBBEE Toolkit (FSC) Template v1.0),
written in the toolkit's own vocabulary (sheet cells + table rows).
Synthetic only: invented names, no ID numbers, no client data.

  py -3 gen_case_fsc.py <seed> <out.case.json> [--profile small|full|edge]
                        [--subsector Others|Banks|Long-Term Insurers|Short-Term Insurers]

The FSC template differs from RCOGP Generic in layout (Client Information
inputs sit in column D, per-level payroll, Management Position on every
training row, stock-broker / fund-manager / intermediary suppliers, a combined
SED & Consumer Education table) and in three inputs it expects typed in:
  - 'Procurement Data'[All Spend adjusted] has no formula in the shipped
    template (its one body row holds a typed number). The case types what the
    column evidently means: Spend x the recognition level of the supplier's
    B-BBEE level (Validation!B27:C35).
  - 'Skills Toolkit'!D3 (leviable amount) and D6 (headcount) are typed, not
    linked, and LOCKED on a password-protected sheet: the template ships with
    another company's figures in them (R6.53bn, 14,212) and no user can change
    them. The case leaves them; the referee reworks the four lines that read
    them from the workbook's own leviable amount and headcount.
"""
import sys, json, random, datetime, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_case import our_eap_rows, d, rdate, pct, yn, PROVINCES, RACES, RACE_W  # noqa: E402

FY_START, FY_END = "2025-03-01", "2026-02-28"
DATA_DATE = FY_END
DESIGS = ['Non-executive Director', 'Executive Director', 'Other Executive Manager', 'Senior Manager',
          'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled']
DESIG_W = [3, 2, 3, 4, 8, 14, 20, 15]
OWN_TYPES = ['Strategic Partner', 'Private Equity', 'Employee Share Ownership Plan (ESOP)',
             'Broad Based Ownership Scheme (BBOS)']
SIZES = ['Generic', 'QSE', 'EME']
# 'Procurement Data'[All Spend adjusted] as the toolkit's own recognition table means it.
RECOGNITION = {1: 1.35, 2: 1.25, 3: 1.10, 4: 1.0, 5: 0.8, 6: 0.6, 7: 0.5, 8: 0.1, 'Non-compliant': 0}
# Skills Data[Management Position *] (its own dropdown).
POSITIONS = ['Executive Management', 'Senior Management', 'Middle Management', 'Junior Management',
             'Non-Management', 'Unemployed']
# The FSC template's own contribution lists ('ESD and SED Calcs' A2:A16, A21:A33, A38:A44).
SD_TYPES = [
    "Grant Contribution",
    "Bad Debt written-offs incurred from the financing of Enterprise and Supplier Development",
    "Direct Cost incurred in support of Enterprise and Supplier Development beneficiaries",
    "Overhead costs incurred in supporting Enterprise and Supplier Development beneficiary",
    "Interest free loan with no security requirements",
    "Prime Loan to Enterprise and Supplier Development beneficiaries",
    "Guarantees provided on behalf of Enterprise and Supplier Development beneficiaries",
    "Minority Investment in Enterprise and Supplier Development beneficiaries",
    "Professional services rendered at no cost and supporting Enterprise and Supplier Development beneficiaries",
    "Professional services rendered at discount and supporting Enterprise and Supplier Development beneficiaries",
]
ED_TYPES = [
    "Grant Contribution",
    "Direct Cost incurred in support of Enterprise and Supplier Development beneficiaries",
    "Discounts in addition to normal business practice supporting Enterprise and Supplier Development beneficiaries",
    "Overhead costs incurred in supporting Enterprise and Supplier Development beneficiaries",
    "Interest free loan with no security requirements",
    "Prime Loan to Enterprise and Supplier Development beneficiaries",
    "Guarantees provided on behalf of an Enterprise and Supplier Development beneficiaries",
    "Minority Investment in an Enterprise and Supplier Development beneficiaries",
    "Professional services rendered at no cost and supporting Enterprise and Supplier Development beneficiaries",
    "Professional services rendered at discount and supporting Enterprise and Supplier Development beneficiaries",
]
SED_TYPES = [
    "Grant Contribution",
    "Direct Cost incurred in support of Socioeconomic Development beneficiaries",
    "Discounts in addition to normal business practice supporting Socioeconomic Development beneficiaries",
    "Overhead costs incurred in supporting Socioeconomic Development beneficiaries",
    "Professional services rendered at no cost and supporting Socioeconomic Development beneficiaries",
    "Professional services rendered at discount and supporting Socioeconomic Development beneficiaries",
]
SED_PILLARS = ['Socioeconomic Development', 'Consumer Education', 'Fundisa Retail Fund']

# Every scorecard sheet filters its data by a period picker; "Current YTD"
# selects the latest data date, which every generated row carries.
PERIOD_CELLS = {
    "Ownership Scorecard!F23": "Year", "Ownership Scorecard!F24": "Current YTD",
    "MC Toolkit!C4": "Year", "MC Toolkit!C5": "Current YTD",
    "Skills Toolkit!D10": "Current YTD",
    "Procurement Scorecard!E23": "Year", "Procurement Scorecard!E24": "Current YTD",
    "ESD Scorecard!F15": "Year", "ESD Scorecard!F16": "Current YTD",
    "SED & CE Scorecard!H14": "Year", "SED & CE Scorecard!H15": "Current YTD",
}


def make(seed, profile="full", subsector="Others"):
    rng = random.Random(seed)
    small = profile == "small"
    edge = profile == "edge"
    revenue = rng.randint(80, 1500) * 1_000_000
    npat = round(revenue * (rng.uniform(-0.03, 0.01) if rng.random() < 0.25 else rng.uniform(0.02, 0.16)))
    province = rng.choice(PROVINCES)
    cells = dict(PERIOD_CELLS)
    cells.update({
        "Client Information!D3": f"Parity FSC case {seed}",
        "Client Information!D4": FY_START, "Client Information!E4": FY_END,
        "Client Information!D7": subsector,
        "Client Information!D9": 2025,
        "Client Information!D10": province,
        "Client Information!D12": round(rng.uniform(0.03, 0.14), 4),
        "Client Information!D20": revenue, "Client Information!D21": npat,
        "MC Toolkit!C8": rng.choice(['Yes', 'Yes', 'No']),
        "Procurement Scorecard!G9": "Actual",
    })
    if subsector == "Others" and rng.random() < 0.25:
        cells["Client Information!D8"] = "Reinsurers"
    # Payroll per management level (prior / current year) and the SDL months.
    payroll = {}
    for row, lo, hi in ((20, 8, 40), (21, 15, 70), (22, 20, 120), (23, 25, 200)):
        cur = rng.randint(lo, hi) * 1_000_000
        payroll[row] = cur
        cells[f"Client Information!H{row}"] = round(cur * rng.uniform(0.85, 1.0))
        cells[f"Client Information!I{row}"] = cur
    total_payroll = sum(payroll.values())
    sdl = 0
    for i in range(12):
        v = round(total_payroll / 100 / 12 * rng.uniform(0.9, 1.1), 2)
        cells[f"Client Information!H{4 + i}"] = v
        sdl += v * 100
    cells["Client Information!D18"] = total_payroll
    leviable = max(round(sdl, 2), total_payroll)
    for i in range(3):
        rev = round(revenue * rng.uniform(0.7, 1.2))
        cells[f"Financials!C{4 + i}"] = round(rev * rng.uniform(-0.04, 0.16))
        cells[f"Financials!E{4 + i}"] = rev

    # Ownership
    n_sh = rng.randint(1, 4)
    shares = [rng.randint(10, 100) * 100 for _ in range(n_sh)]
    total_shares = sum(shares)
    company_value = rng.randint(50, 900) * 1_000_000
    price = round(company_value / total_shares, 2)
    company_value = round(price * total_shares, 2)
    own_rows = []
    for i in range(n_sh):
        bo = pct(rng, 0, 1, 0.25)
        debt = rng.choice([0, round(company_value * shares[i] / total_shares * rng.uniform(0.1, 0.7))])
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
            # Some loans are ten years old or more: the toolkit's graduation
            # table stops at year 9.
            row["Loan Date"] = d(rng.randint(2012, 2025), rng.randint(1, 12), 1)
        own_rows.append(row)
    # 'Ownership Scorecard'!B3 ("company value to use") is locked on "Share
    # Value"; the debt netting divides by the asset value, so the two agree.
    own_val = [{"Date": DATA_DATE, "Company Asset Value": company_value,
                "Total Shares": total_shares, "Share Value": price}]

    # Management control. Some cases leave a management band empty: the
    # toolkit then reallocates that band's points.
    n_emp = rng.randint(14, 30) if small else rng.randint(35, 110)
    drop = set()
    if edge or rng.random() < 0.35:
        drop = set(rng.sample(['Senior Manager', 'Middle Manager', 'Junior Manager'], rng.randint(1, 3)))
    mc_rows = []
    for i in range(n_emp):
        des = rng.choices(DESIGS, DESIG_W)[0]
        while des in drop:
            des = rng.choices(DESIGS, DESIG_W)[0]
        mc_rows.append({"Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}",
                        "Gender *": rng.choice(['Male', 'Female']), "Race *": rng.choices(RACES, RACE_W)[0],
                        "Designation *": des, "Disabled *": yn(rng, 0.05), "Foreign *": yn(rng, 0.03)})
    staff = [r for r in mc_rows if r["Designation *"] != 'Non-executive Director']
    headcount = len(staff)

    # Skills
    n_tr = rng.randint(4, 10) if small else rng.randint(12, 40)
    sk_rows = []
    for i in range(n_tr):
        cat = rng.choice('ABCDEFG')
        pos = rng.choices(POSITIONS, [2, 3, 4, 5, 6, 5])[0]
        employed = 'No' if pos == 'Unemployed' else 'Yes'
        completed = yn(rng, 0.7)
        sk_rows.append({
            "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": cat,
            "ABET": 'No', "Mandatory Training?": yn(rng, 0.1),
            "Learner Name *": f"Learner {i + 1}", "Gender *": rng.choice(['Male', 'Female']),
            "Race *": rng.choices(RACES, RACE_W)[0], "Disabled?*": yn(rng, 0.1), "Foreign?*": yn(rng, 0.03),
            "Management Position *": pos, "Age": rng.randint(19, 55), "Employed?": employed,
            "Y.E.S. Employee?": yn(rng, 0.1), "Completed?": completed,
            "Absorbed?": 'Yes' if employed == 'No' and completed == 'Yes' and rng.random() < 0.5 else 'No',
            "Course Cost": round(rng.uniform(5_000, 400_000), 2),
            "Travel Cost": round(rng.uniform(0, 30_000), 2) if rng.random() < 0.4 else 0,
            "Accommodation Cost": round(rng.uniform(0, 20_000), 2) if rng.random() < 0.2 else 0,
            "Catering Cost": 0, "Stationery Cost": 0, "Training Facility Cost": 0,
            "Salary Cost (category BCD only)": round(rng.uniform(20_000, 200_000), 2) if cat in 'BCD' and rng.random() < 0.6 else 0,
            "Other Costs": round(rng.uniform(0, 15_000), 2) if rng.random() < 0.2 else 0,
            "Start Date (format: dd/mm/yyyy)": rdate(rng, FY_START, "2025-09-30"),
            "End Date (format: dd/mm/yyyy)": rdate(rng, "2025-10-01", FY_END),
        })

    # Training manager's salary and training overhead, shared out by the
    # workforce demographics: the template's own "auto generated" row holds
    # typed figures, so the case types the manual row from its MC data.
    if rng.random() < 0.4:
        cells["Skills Toolkit!D8"] = round(rng.uniform(300_000, 1_500_000), 2)
        cells["Skills Toolkit!D9"] = round(rng.uniform(50_000, 600_000), 2)
        bands = [('Other Executive Manager', 'Senior Manager', 'Executive Director'), ('Middle Manager',),
                 ('Junior Manager',), ('Semi-skilled', 'Unskilled')]
        cols = iter('BCDEFGHIJKLMN')
        black = lambda r: r["Race *"] in ('African', 'Coloured', 'Indian') and r["Foreign *"] != 'Yes'
        for band in bands:
            inb = [r for r in staff if r["Designation *"] in band and black(r)]
            for v in (len(inb), sum(1 for r in inb if r["Gender *"] == 'Female'), sum(1 for r in inb if r["Race *"] == 'African')):
                cells[f"Employee Demographics!{next(cols)}4"] = round(v / headcount, 6) if headcount else 0
        cells[f"Employee Demographics!{next(cols)}4"] = round(sum(1 for r in staff if black(r) and r["Disabled *"] == 'Yes') / headcount, 6) if headcount else 0
    if edge and rng.random() < 0.5:
        cells["Client Information!D26"] = round(abs(npat) * rng.uniform(0.6, 1.5) + 1_000_000)

    # Procurement
    n_sup = rng.randint(6, 12) if small else rng.randint(15, 60)
    pp_rows = []
    total_spend = 0
    for i in range(n_sup):
        size = rng.choices(SIZES, [4, 3, 3])[0]
        lvl = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'])
        bo = rng.choice([0, 0.1, 0.26, 0.3, 0.51, 0.6, 1.0])
        spend = round(rng.uniform(50_000, 12_000_000), 2)
        total_spend += spend
        special = rng.random()
        pp_rows.append({
            "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}", "Current Company Size *": size,
            "B-BBEE Level": lvl, "Empowering Supplier? (Yes/No)": yn(rng, 0.7),
            "Current Black ownership": bo,
            "Current Black Female ownership": round(bo * rng.choice([0, 0.3, 0.5, 1.0]), 4),
            "Black Designated Group  ownership": round(bo * rng.choice([0, 0, 0.5, 0.9, 1.0]), 4),
            "Supplier development recipient? (Yes/No)": yn(rng, 0.15),
            "3 year contract in place? (Yes/No)3": yn(rng, 0.2),
            "First-time supplier? (Yes/No)": yn(rng, 0.15),
            "Stock broker? (Yes/No)": 'Yes' if special < 0.08 else 'No',
            "Fund manager? (Yes/No)": 'Yes' if 0.08 <= special < 0.14 else 'No',
            "Intermediary? (Yes/No)": 'Yes' if 0.14 <= special < 0.22 else 'No',
            "Spend *": spend,
            "All Spend\nadjusted": round(spend * RECOGNITION[lvl], 2),
        })
    tmps_incl = [{"Inclusions": "Cost of Sales", "Amount": round(total_spend * rng.uniform(1.0, 1.4), 2)}]
    # Bonus rows 18/19 measure against the total allocated trade value.
    if rng.random() < 0.8:
        cells["Procurement Scorecard!E5"] = round(total_spend * rng.uniform(0.3, 1.2), 2)

    # Enterprise and supplier development
    n_esd = 0 if edge and rng.random() < 0.5 else (rng.randint(1, 3) if small else rng.randint(2, 9))
    esd_rows = []
    for i in range(n_esd):
        pillar = rng.choice(['Supplier Development', 'Enterprise Development'])
        types = SD_TYPES if pillar == 'Supplier Development' else ED_TYPES
        esd_rows.append({
            "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i + 1}",
            "Current Black ownership %": rng.choice([0.3, 0.51, 0.51, 1.0, 1.0]),
            "Current Size": rng.choice(['EME', 'QSE', 'QSE', 'Generic']),
            "Contribution Description*": f"Contribution {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Stock brokers, Fund managers or Intermediaries? (Yes/No)": yn(rng, 0.25),
            "Contribution Type": rng.choice(types),
            "Amount": round(rng.uniform(50_000, 4_000_000), 2),
            "At least 1 job created?": yn(rng, 0.3), "Graduated to Supplier Development?": yn(rng, 0.2),
        })

    # Socio-economic development and consumer education
    n_sed = 0 if edge and rng.random() < 0.5 else (rng.randint(1, 3) if small else rng.randint(2, 9))
    sed_rows = []
    for i in range(n_sed):
        sed_rows.append({
            "Data Date": DATA_DATE, "Pillar": rng.choice(SED_PILLARS),
            "Beneficiary Name *": f"Beneficiary SED {i + 1}",
            "Description of Spend *": f"SED spend {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type *": rng.choice(SED_TYPES),
            "% of Spend Benefiting Black Individuals *": rng.choice([0.5, 0.75, 0.9, 1.0]),
            "Amount": round(rng.uniform(20_000, 1_500_000), 2),
        })

    return {"template": "fsc", "subsector": subsector, "seed": seed, "cells": cells, "tables": {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": tmps_incl,
        "tblESDData": esd_rows, "tblSEDnCEData": sed_rows, "tblEAPAll": our_eap_rows()}}


if __name__ == "__main__":
    seed = int(sys.argv[1])
    out = sys.argv[2]
    profile = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "full"
    subsector = sys.argv[sys.argv.index("--subsector") + 1] if "--subsector" in sys.argv else "Others"
    json.dump(make(seed, profile, subsector), open(out, "w", encoding="utf-8"), indent=1)
    print("wrote", out)
