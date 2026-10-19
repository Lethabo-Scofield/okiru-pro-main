"""Random but valid RCOGP QSE toolkit cases (Empower template v1.1), written in
the toolkit's own vocabulary (sheet cells + table rows). Synthetic only: the
companies, people and suppliers are invented; no client data, no ID numbers.

  py -3 gen_case_rcogp_qse.py <seed> <out.case.json> [--profile small|full]
  py -3 gen_case_rcogp_qse.py --edge <name> <out.case.json>
  py -3 gen_case_rcogp_qse.py --all <cases dir>      (the committed set)

The QSE template differs from the Generic one (gen_case.py) in where its
inputs live and which columns it has:
  - Client Information: revenue C16, NPAT C17, industry norm (manual) C8,
    deemed NPAT override C22, total payroll C14; four prior years on
    Financials rows 4-7;
  - Skills Data has "Employed?" (Yes/No) and no bursary, YES or invoice-date
    columns; Procurement Data has "First-time supplier?" and no flow-through
    or first-procurement columns; ESD Data has no first-assistance columns;
  - no EAP table (Management Control uses flat targets);
  - its period pickers sit in other cells (QSE_PERIOD_CELLS), and the
    procurement "Actual or Projected" choice (E6) ships blank, which scores
    every procurement line 0 until it is set.
"""
import sys, json, random, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_case import (  # noqa: E402  (shared vocabulary and helpers; behaviour unchanged)
    FY_START, FY_END, DATA_DATE, OWN_TYPES, DESIGS, DESIG_W, RACES, RACE_W, SIZES, VOC,
    d, rdate, pct, yn,
)

TEMPLATE = "rcogp_qse"

# "Current YTD" selects the latest data date; every generated row carries it.
QSE_PERIOD_CELLS = {
    "Ownership Scorecard!D13": "Year", "Ownership Scorecard!D14": "Current YTD",
    "MC Toolkit!C3": "Year", "MC Toolkit!C4": "Current YTD",
    "Skills Toolkit!D8": "Current YTD",
    "Procurement Scorecard!C15": "Year", "Procurement Scorecard!C16": "Current YTD",
    "Procurement Scorecard!E6": "Actual",
    "ESD Scorecard!F13": "Year", "ESD Scorecard!F14": "Current YTD",
    "SED Scorecard!H9": "Year", "SED Scorecard!H10": "Current YTD",
}

SKIP_ESD_TYPES = ('Time of employees',)
LOWER_INTEREST = 'Lower insterest Rate than prime on Standard Loan to Enterprise and Supplier Development beneficiaries'
SHORTER_PAYMENT = 'Shorter payment periods for Enterprise and Supplier Development beneficiaries'
SD_MINORITY = 'Minority Investment in Enterprise and Supplier Development beneficiaries'
ED_MINORITY = 'Minority Investment in an Enterprise and Supplier Development beneficiaries'
GUARANTEE_SD = 'Guarantees provided on behalf of Enterprise and Supplier Development beneficiaries'


def esd_types(pillar):
    types = VOC['tblSDContributions'] if pillar == 'Supplier Development' else VOC['tblEDContributions']
    return [t for t in types if not t.startswith(SKIP_ESD_TYPES)]


def make(seed, profile="full"):
    rng = random.Random(seed * 7919 + 13)
    small = profile == "small"
    revenue = rng.randint(10, 50) * 1_000_000
    norm = round(rng.uniform(0.03, 0.12), 4)
    # Some entities trade below a quarter of the industry norm, so the deemed
    # NPAT rule is exercised; some have a loss year in their history.
    npat = round(revenue * (rng.uniform(-0.02, 0.01) if rng.random() < 0.25 else rng.uniform(0.03, 0.15)))
    cells = dict(QSE_PERIOD_CELLS)
    cells.update({
        "Client Information!C3": f"QSE parity case {seed}",
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C8": norm,
        "Client Information!C16": revenue, "Client Information!C17": npat,
    })
    sdl = rng.uniform(2_000, 12_000)
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = round(sdl * rng.uniform(0.9, 1.1), 2)
    if rng.random() < 0.25:
        # A total payroll above the SDL-derived figure: the toolkit's leviable
        # amount is the larger of the two (Financials!I3).
        cells["Client Information!C14"] = round(sdl * 100 * 12 * rng.uniform(1.05, 1.4), 2)
    if rng.random() < 0.4:
        cells["Skills Toolkit!D6"] = round(rng.uniform(150_000, 600_000), 2)
        cells["Skills Toolkit!D7"] = round(rng.uniform(10_000, 120_000), 2)
    n_prior = rng.choice([0, 2, 3, 4, 4])
    for i in range(n_prior):
        rev = round(revenue * rng.uniform(0.7, 1.2))
        cells[f"Financials!C{4 + i}"] = round(rev * rng.uniform(-0.04, 0.15))
        cells[f"Financials!E{4 + i}"] = rev

    # Ownership
    n_sh = rng.randint(1, 4)
    shares = [rng.randint(10, 100) * 100 for _ in range(n_sh)]
    total_shares = sum(shares)
    company_value = rng.randint(5, 60) * 1_000_000
    price = round(company_value / total_shares, 2)
    own_rows = []
    for i in range(n_sh):
        bo = pct(rng, 0, 1, 0.25)
        debt = rng.choice([0, 0, round(company_value * shares[i] / total_shares * rng.uniform(0.1, 0.7))])
        row = {
            "Data Date": DATA_DATE, "Shareholder": f"Holder {i + 1}",
            "Ownership Type": rng.choice(OWN_TYPES),
            "Outstaning Debt": debt,
            "BO%": bo, "BWO%": round(bo * pct(rng, 0, 1, 0.25), 4),
            "BDG%": round(bo * rng.choice([0, 0, 0.02, 0.1, 0.3]), 4),
            "BNE%": round(bo * rng.choice([0, 0, 0.05, 0.2, 1.0]), 4),
            "Number of Share": shares[i],
            "Share Value": round(shares[i] * price, 2),
            "Original Date": d(rng.randint(2014, 2024), rng.randint(1, 12), 1),
        }
        if debt:
            row["Loan Date"] = d(rng.randint(2016, 2025), rng.randint(1, 12), 1)
        own_rows.append(row)
    own_val = [{"Date": DATA_DATE, "Company Asset Value": company_value, "Total Shares": total_shares,
                "Share Value": price}]

    # Management control
    n_emp = rng.randint(8, 20) if small else rng.randint(20, 50)
    mc_rows = []
    for i in range(n_emp):
        des = rng.choices(DESIGS, DESIG_W)[0]
        mc_rows.append({
            "Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}",
            "Gender *": rng.choice(['Male', 'Female']), "Race *": rng.choices(RACES, RACE_W)[0],
            "Designation *": des, "Disabled *": yn(rng, 0.05), "Foreign *": yn(rng, 0.04),
        })

    # Skills
    n_tr = rng.randint(3, 8) if small else rng.randint(8, 22)
    sk_rows = []
    for i in range(n_tr):
        cat = rng.choice('ABCDEFG')
        employed = yn(rng, 0.6)
        completed = yn(rng, 0.7)
        sk_rows.append({
            "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i + 1}", "Category *": cat,
            "ABET": 'No', "Mandatory Training?": yn(rng, 0.1),
            "Learner Name *": f"Learner {i + 1}", "Gender *": rng.choice(['Male', 'Female']),
            "Race *": rng.choices(RACES, RACE_W)[0], "Disabled?*": yn(rng, 0.12), "Foreign?*": yn(rng, 0.04),
            "Age": rng.randint(19, 50),
            "Employed?": employed, "Completed?": completed,
            "Absorbed?": 'Yes' if employed == 'No' and completed == 'Yes' and rng.random() < 0.6 else 'No',
            "Course Cost": round(rng.uniform(2_000, 40_000), 2),
            "Travel Cost": round(rng.uniform(0, 6_000), 2) if rng.random() < 0.35 else 0,
            "Accommodation Cost": round(rng.uniform(0, 4_000), 2) if rng.random() < 0.2 else 0,
            "Catering Cost": round(rng.uniform(0, 2_000), 2) if rng.random() < 0.2 else 0,
            "Stationery Cost": 0, "Training Facility Cost": 0,
            "Salary Cost (stipend and category B,C,D only)": round(rng.uniform(10_000, 60_000), 2) if cat in 'BCD' and rng.random() < 0.6 else 0,
            "Other Costs": round(rng.uniform(0, 3_000), 2) if rng.random() < 0.15 else 0,
            "Start Date (format: dd/mm/yyyy)": rdate(rng, FY_START, "2025-09-30"),
            "End Date (format: dd/mm/yyyy)": rdate(rng, "2025-10-01", FY_END),
        })

    # Procurement
    n_sup = rng.randint(5, 12) if small else rng.randint(12, 35)
    pp_rows = []
    total_spend = 0
    for i in range(n_sup):
        size = rng.choices(SIZES, [3, 4, 4])[0]
        lvl = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'])
        bo = rng.choice([0, 0.1, 0.26, 0.3, 0.51, 0.6, 1.0])
        spend = round(rng.uniform(30_000, 2_500_000), 2)
        total_spend += spend
        pp_rows.append({
            "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i + 1}", "Current Company Size *": size,
            "B-BBEE Level": lvl, "Empowering Supplier? (Yes/No)": yn(rng, 0.7),
            "Current Black ownership": bo,
            "Current Black Female ownership": round(bo * rng.choice([0, 0.3, 0.5, 1.0]), 4),
            "Black Designated Group  ownership": round(bo * rng.choice([0, 0, 0.5, 0.9, 1.0]), 4),
            "Supplier development recipient? (Yes/No)": yn(rng, 0.2),
            "3 year contract in place? (Yes/No)3": yn(rng, 0.2),
            "First-time supplier? (Yes/No)": yn(rng, 0.2),
            "Spend *": spend,
        })
    tmps_incl = [{"Inclusions": "Cost of Sales", "Amount": round(total_spend * rng.uniform(0.85, 1.4), 2)}]
    tmps_excl = []
    if rng.random() < 0.3:
        tmps_excl.append({"Exclusions": "Imports", "Amount": round(total_spend * rng.uniform(0.02, 0.1), 2)})
    if rng.random() < 0.3:
        cells["Procurement Scorecard!D4"] = rng.choice([0.05, 0.1, 0.2])

    # Enterprise and supplier development
    npat_ref = max(abs(npat), revenue * norm / 4)
    n_esd = rng.randint(1, 3) if small else rng.randint(2, 7)
    esd_rows = []
    for i in range(n_esd):
        pillar = rng.choice(['Supplier Development', 'Enterprise Development'])
        ctype = rng.choice(esd_types(pillar))
        row = {
            "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i + 1}",
            "Current Black ownership %": rng.choice([0.3, 0.51, 1.0]), "Current Size": rng.choice(['EME', 'QSE']),
            "Contribution Description*": f"Contribution {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type": ctype,
            "Amount": round(npat_ref * rng.uniform(0.001, 0.012), 2),
            "At least 1 job created?": yn(rng, 0.25), "Graduated to Supplier Development?": yn(rng, 0.2),
        }
        if ctype == LOWER_INTEREST:
            prime = rng.choice([0.105, 0.1075, 0.11])
            row.update({"Prime Rate": prime, "Actual Interest Rate": round(prime - rng.choice([0.01, 0.02, 0.04]), 4)})
        if ctype == SHORTER_PAYMENT:
            inv = rdate(rng, FY_START, "2026-01-31")
            days = rng.choice([3, 7, 10, 14, 20])
            row.update({"Invoice date (format: dd/mm/yyyy)": inv,
                        "Payment date (format: dd/mm/yyyy)": _plus_days(inv, days)})
        esd_rows.append(row)

    # Socio-economic development
    n_sed = rng.randint(0, 2) if small else rng.randint(1, 6)
    sed_rows = []
    for i in range(n_sed):
        sed_rows.append({
            "Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED {i + 1}",
            "Description of Spend *": f"SED spend {i + 1}",
            "Date of Transaction * (format: dd/mm/yyyy)": rdate(rng),
            "Contribution Type *": rng.choice([t for t in VOC['tblSEDContributions'] if not t.startswith('Time of employees')]),
            "% of Spend Benefiting Black Individuals *": rng.choice([0.5, 0.75, 0.9, 1.0]),
            "Amount": round(npat_ref * rng.uniform(0.001, 0.008), 2),
        })

    return {"template": TEMPLATE, "seed": seed, "profile": profile, "cells": cells, "tables": {
        "tblOwnershipData": own_rows, "tblCompanyValuation": own_val, "tblMCData": mc_rows,
        "tblSkillsData": sk_rows, "tblPPData": pp_rows, "tblInclusions": tmps_incl, "tblExclusions": tmps_excl,
        "tblESDData": esd_rows, "tblSED": sed_rows}}


def _plus_days(iso, days):
    import datetime
    return (datetime.date.fromisoformat(iso) + datetime.timedelta(days=days)).isoformat()


# ── Edge cases ───────────────────────────────────────────────────────────────

def _mc(rows):
    return [{"Data Date": DATA_DATE, "Full Name *": f"Employee {i + 1}", "Gender *": g, "Race *": r,
             "Designation *": des, "Disabled *": dis, "Foreign *": 'No'}
            for i, (des, r, g, dis) in enumerate(rows)]


def _learner(i, cat, race, gender, course, *, salary=0, other=0, disabled='No', employed='Yes',
             completed='Yes', absorbed='No', foreign='No'):
    return {
        "Data Date": DATA_DATE, "Training Program Name *": f"Programme {i}", "Category *": cat,
        "ABET": 'No', "Mandatory Training?": 'No', "Learner Name *": f"Learner {i}",
        "Gender *": gender, "Race *": race, "Disabled?*": disabled, "Foreign?*": foreign, "Age": 24,
        "Employed?": employed, "Completed?": completed, "Absorbed?": absorbed,
        "Course Cost": course, "Travel Cost": 0, "Accommodation Cost": 0, "Catering Cost": 0,
        "Stationery Cost": 0, "Training Facility Cost": 0,
        "Salary Cost (stipend and category B,C,D only)": salary, "Other Costs": other,
        "Start Date (format: dd/mm/yyyy)": "2025-04-01", "End Date (format: dd/mm/yyyy)": "2026-01-31",
    }


def _supplier(i, size, level, bo, spend, *, bwo=0, bdg=0, sd='No', three='No', first='No', emp='Yes'):
    return {
        "Data Date": DATA_DATE, "Supplier Name *": f"Supplier {i}", "Current Company Size *": size,
        "B-BBEE Level": level, "Empowering Supplier? (Yes/No)": emp,
        "Current Black ownership": bo, "Current Black Female ownership": bwo,
        "Black Designated Group  ownership": bdg,
        "Supplier development recipient? (Yes/No)": sd, "3 year contract in place? (Yes/No)3": three,
        "First-time supplier? (Yes/No)": first, "Spend *": spend,
    }


def _esd(i, pillar, ctype, amount, *, bo=1.0, size='EME', jobs='No', grad='No', **extra):
    row = {
        "Data Date": DATA_DATE, "Pillar": pillar, "Beneficiary Name": f"Beneficiary {i}",
        "Current Black ownership %": bo, "Current Size": size,
        "Contribution Description*": f"Contribution {i}",
        "Date of Transaction * (format: dd/mm/yyyy)": "2025-08-15",
        "Contribution Type": ctype, "Amount": amount,
        "At least 1 job created?": jobs, "Graduated to Supplier Development?": grad,
    }
    row.update(extra)
    return row


def _sed(i, ctype, amount, black=1.0):
    return {"Data Date": DATA_DATE, "Beneficiary Name *": f"Beneficiary SED {i}",
            "Description of Spend *": f"SED spend {i}", "Date of Transaction * (format: dd/mm/yyyy)": "2025-09-01",
            "Contribution Type *": ctype, "% of Spend Benefiting Black Individuals *": black, "Amount": amount}


def _holder(i, bo, value, shares, *, bwo=0, bdg=0, bne=0, debt=0, loan=None, kind='Strategic Partner'):
    row = {"Data Date": DATA_DATE, "Shareholder": f"Holder {i}", "Ownership Type": kind,
           "Outstaning Debt": debt, "BO%": bo, "BWO%": bwo, "BDG%": bdg, "BNE%": bne,
           "Number of Share": shares, "Share Value": value, "Original Date": "2018-06-01"}
    if loan:
        row["Loan Date"] = loan
    return row


def _base(name, revenue=20_000_000, npat=2_000_000, norm=0.06, monthly_sdl=5_000):
    cells = dict(QSE_PERIOD_CELLS)
    cells.update({
        "Client Information!C3": name,
        "Client Information!C4": FY_START, "Client Information!D4": FY_END,
        "Client Information!C8": norm,
        "Client Information!C16": revenue, "Client Information!C17": npat,
    })
    for i in range(12):
        cells[f"Client Information!G{4 + i}"] = monthly_sdl
    return cells


GRANT = 'Grant Contribution'
SED_GRANT = 'Grant Contribution'


def edge(name):
    """Hand-built cases for the edges a random draw rarely hits."""
    if name == "zero":
        # Nothing black anywhere, empty Skills / ESD / SED registers.
        cells = _base("QSE edge: zero", npat=-300_000)
        own = [_holder(1, 0, 10_000_000, 1000)]
        mc = _mc([('Executive Director', 'White', 'Male', 'No'), ('Senior Manager', 'White', 'Female', 'No'),
                  ('Middle Manager', 'White', 'Male', 'No'), ('Semi-skilled', 'White', 'Male', 'No')])
        pp = [_supplier(1, 'Generic', 'Non-compliant', 0, 900_000), _supplier(2, 'Generic', 8, 0, 400_000)]
        tables = {"tblOwnershipData": own, "tblMCData": mc, "tblSkillsData": [], "tblPPData": pp,
                  "tblInclusions": [{"Inclusions": "Cost of Sales", "Amount": 1_500_000}],
                  "tblESDData": [], "tblSED": []}
        value = 10_000_000
    elif name in ("threshold75", "qse_rule", "full", "skills_fail"):
        # threshold75: every line full or zero so the total is exactly 75.00 —
        #   the Level 5 boundary (toolkit's strict "<" drops it to Level 6);
        # qse_rule: Ownership and Skills pass, Supplier Development is empty
        #   (fails its sub-minimum) — a QSE needs Ownership plus Skills OR ESD;
        # skills_fail: Ownership and every ESD line pass, Skills misses its
        #   sub-minimum — again no discount for a QSE;
        # full: every line at its maximum (108, Level 1).
        npat = 2_000_000
        cells = _base(f"QSE edge: {name}", npat=npat, monthly_sdl=5_000)   # leviable R6m
        own = [_holder(1, 1.0, 6_000_000, 600, bwo=0.4, bdg=0.05, bne=0.0),
               _holder(2, 1.0, 4_000_000, 400, bwo=0.0, bdg=0.0, bne=0.1)]
        value = 10_000_000
        mc = _mc([('Executive Director', 'African', 'Female', 'No'), ('Other Executive Manager', 'Indian', 'Male', 'No'),
                  ('Senior Manager', 'Coloured', 'Female', 'No'), ('Middle Manager', 'African', 'Male', 'No'),
                  ('Junior Manager', 'White', 'Male', 'No'), ('Semi-skilled', 'African', 'Male', 'Yes'),
                  ('Non-executive Director', 'White', 'Male', 'No')])
        sk = [
            _learner(1, 'B', 'African', 'Female', 70_000, salary=40_000, employed='No', absorbed='Yes'),
            _learner(2, 'C', 'African', 'Male', 60_000, employed='No', absorbed='Yes'),
            _learner(3, 'A', 'Coloured', 'Female', 30_000, disabled='Yes'),
        ]
        sup_full = [_supplier(1, 'EME', 1, 1.0, 4_000_000, bwo=0.6, bdg=0.6),
                    _supplier(2, 'QSE', 2, 0.6, 3_000_000, bwo=0.3)]
        if name == "threshold75":
            pp = [_supplier(1, 'Generic', 'Non-compliant', 0, 5_000_000)]
            esd = [_esd(1, 'Enterprise Development', GRANT, 25_000)]
            sed = []
        elif name == "qse_rule":
            pp = sup_full
            esd = [_esd(1, 'Enterprise Development', GRANT, 25_000)]
            sed = [_sed(1, SED_GRANT, 8_000)]
        elif name == "skills_fail":
            # R40 000 of black spend against a R180 000 target, nothing for
            # black women or disabled learners: Skills scores well under 10.
            sk = [_learner(1, 'C', 'African', 'Male', 40_000)]
            pp = sup_full
            esd = [_esd(1, 'Enterprise Development', GRANT, 15_000), _esd(2, 'Supplier Development', GRANT, 12_000)]
            sed = [_sed(1, SED_GRANT, 8_000)]
        else:
            pp = sup_full
            esd = [_esd(1, 'Enterprise Development', GRANT, 25_000, grad='Yes', jobs='Yes'),
                   _esd(2, 'Supplier Development', GRANT, 25_000)]
            sed = [_sed(1, SED_GRANT, 25_000)]
        tables = {"tblOwnershipData": own, "tblMCData": mc, "tblSkillsData": sk, "tblPPData": pp,
                  "tblInclusions": [{"Inclusions": "Cost of Sales", "Amount": sum(s["Spend *"] for s in pp)}],
                  "tblESDData": esd, "tblSED": sed}
    elif name == "own_fail_l8":
        # Ownership net value below its 3.2 sub-minimum, total in the Level 8
        # band: the discount takes it to Non-compliant.
        cells = _base("QSE edge: ownership sub-minimum, Level 8", npat=1_500_000, monthly_sdl=4_000)
        own = [_holder(1, 0.3, 8_000_000, 800, bwo=0.15), _holder(2, 0, 2_000_000, 200)]
        value = 10_000_000
        mc = _mc([('Executive Director', 'African', 'Male', 'No'), ('Executive Director', 'White', 'Male', 'No'),
                  ('Senior Manager', 'African', 'Female', 'No'), ('Middle Manager', 'Indian', 'Male', 'No'),
                  ('Junior Manager', 'White', 'Female', 'No')])
        sk = [_learner(1, 'C', 'African', 'Male', 20_000), _learner(2, 'D', 'Coloured', 'Female', 9_000)]
        pp = [_supplier(1, 'QSE', 2, 0.55, 1_000_000), _supplier(2, 'Generic', 8, 0.2, 3_000_000)]
        esd = [_esd(1, 'Supplier Development', GRANT, 9_000), _esd(2, 'Enterprise Development', GRANT, 6_000)]
        sed = [_sed(1, SED_GRANT, 15_000)]
        tables = {"tblOwnershipData": own, "tblMCData": mc, "tblSkillsData": sk, "tblPPData": pp,
                  "tblInclusions": [{"Inclusions": "Cost of Sales", "Amount": 6_000_000}],
                  "tblESDData": esd, "tblSED": sed}
    elif name == "bonus":
        # Every bonus and every computed factor: absorption, designated-group
        # suppliers, ED graduation and jobs, the 1.2 factor on each route
        # (first-time supplier alone included), a Supplier Development minority
        # investment, lower interest, shorter payments, guarantees; a TMPS
        # buffer and exclusions; payroll above the SDL figure; training-admin
        # costs; a manual deemed NPAT.
        cells = _base("QSE edge: bonuses", npat=900_000, monthly_sdl=3_000)
        cells.update({"Client Information!C14": 4_500_000, "Client Information!C22": 1_800_000,
                      "Skills Toolkit!D6": 420_000, "Skills Toolkit!D7": 60_000,
                      "Procurement Scorecard!D4": 0.1})
        own = [_holder(1, 0.6, 5_000_000, 500, bwo=0.3, bdg=0.2, bne=0.3), _holder(2, 0.25, 5_000_000, 500, bwo=0.25)]
        value = 10_000_000
        mc = _mc([('Executive Director', 'African', 'Female', 'No'), ('Other Executive Manager', 'White', 'Male', 'No'),
                  ('Senior Manager', 'Indian', 'Female', 'No'), ('Middle Manager', 'African', 'Male', 'Yes'),
                  ('Middle Manager', 'White', 'Female', 'No'), ('Junior Manager', 'Coloured', 'Male', 'No'),
                  ('Unskilled', 'African', 'Female', 'Yes'), ('Semi-skilled', 'African', 'Male', 'No')])
        sk = [
            _learner(1, 'B', 'African', 'Female', 15_000, salary=30_000, employed='No', absorbed='Yes'),
            _learner(2, 'C', 'African', 'Male', 12_000, salary=20_000, employed='No', absorbed='No'),
            _learner(3, 'D', 'White', 'Male', 10_000, employed='No', absorbed='Yes'),
            _learner(4, 'D', 'Indian', 'Female', 8_000, employed='No', completed='No'),
            _learner(5, 'F', 'African', 'Female', 25_000, other=6_000, disabled='Yes'),
            _learner(6, 'G', 'Coloured', 'Male', 18_000, other=4_000),
            _learner(7, 'E', 'African', 'Male', 5_000, other=2_500, foreign='Yes'),
            _learner(8, 'B', 'African', 'Male', 9_000, salary=12_000, employed='Yes', absorbed='Yes'),
        ]
        pp = [
            _supplier(1, 'EME', 1, 1.0, 600_000, bwo=0.6, bdg=0.8, sd='Yes'),
            _supplier(2, 'QSE', 2, 0.6, 500_000, bwo=0.3, three='Yes'),
            _supplier(3, 'EME', 1, 0.51, 400_000, bwo=0.51, first='Yes'),
            _supplier(4, 'QSE', 3, 0.3, 700_000, first='Yes'),
            _supplier(5, 'Generic', 4, 0.6, 900_000, sd='Yes', three='Yes', first='Yes', emp='No'),
            _supplier(6, 'Generic', 6, 0, 1_200_000),
        ]
        esd = [
            _esd(1, 'Supplier Development', SD_MINORITY, 12_000),
            _esd(2, 'Supplier Development', LOWER_INTEREST, 150_000, **{"Prime Rate": 0.105, "Actual Interest Rate": 0.07}),
            _esd(3, 'Supplier Development', SHORTER_PAYMENT, 40_000, **{"Invoice date (format: dd/mm/yyyy)": "2025-07-01",
                                                                         "Payment date (format: dd/mm/yyyy)": "2025-07-06"}),
            _esd(4, 'Enterprise Development', ED_MINORITY, 10_000, grad='Yes'),
            _esd(5, 'Enterprise Development', 'Guarantees provided on behalf of an Enterprise and Supplier Development beneficiaries', 8_000, jobs='Yes'),
            _esd(6, 'Supplier Development', GUARANTEE_SD, 5_000, bo=0.3, size='QSE'),
        ]
        sed = [_sed(1, SED_GRANT, 6_000, 0.8),
               _sed(2, 'Overhead costs incurred in supporting Socioeconomic Development beneficiaries', 5_000)]
        tables = {"tblOwnershipData": own, "tblMCData": mc, "tblSkillsData": sk, "tblPPData": pp,
                  "tblInclusions": [{"Inclusions": "Cost of Sales", "Amount": 4_800_000}],
                  "tblExclusions": [{"Exclusions": "Imports", "Amount": 300_000}],
                  "tblESDData": esd, "tblSED": sed}
    elif name == "debt":
        # Three indebted holders (one of them not black) after a debt-free one:
        # the toolkit nets the first indebted row one way and the rest another.
        cells = _base("QSE edge: acquisition debt", npat=2_500_000, monthly_sdl=6_000)
        for i, (c, e) in enumerate([(1_800_000, 19_000_000), (2_100_000, 18_500_000), (-400_000, 16_000_000)]):
            cells[f"Financials!C{4 + i}"] = c
            cells[f"Financials!E{4 + i}"] = e
        value = 20_000_000
        own = [_holder(1, 0.5, 4_000_000, 400, bwo=0.5),
               _holder(2, 1.0, 6_000_000, 600, bwo=0.4, bdg=0.1, debt=2_000_000, loan="2021-03-01"),
               _holder(3, 0.75, 6_000_000, 600, bwo=0.25, bne=0.75, debt=4_500_000, loan="2023-09-01"),
               _holder(4, 0, 4_000_000, 400, debt=1_000_000, loan="2022-01-01", kind='Private Equity')]
        mc = _mc([('Executive Director', 'African', 'Male', 'No'), ('Other Executive Manager', 'Coloured', 'Female', 'No'),
                  ('Senior Manager', 'White', 'Male', 'No'), ('Middle Manager', 'African', 'Female', 'No'),
                  ('Junior Manager', 'African', 'Male', 'No'), ('Junior Manager', 'Indian', 'Female', 'No')])
        sk = [_learner(1, 'C', 'African', 'Female', 80_000), _learner(2, 'B', 'African', 'Male', 30_000, salary=50_000,
                                                                        employed='No', absorbed='Yes')]
        pp = [_supplier(1, 'QSE', 1, 0.8, 3_000_000, bwo=0.4), _supplier(2, 'Generic', 3, 0.3, 6_000_000)]
        esd = [_esd(1, 'Supplier Development', GRANT, 20_000), _esd(2, 'Enterprise Development', GRANT, 30_000)]
        sed = [_sed(1, SED_GRANT, 20_000)]
        tables = {"tblOwnershipData": own, "tblMCData": mc, "tblSkillsData": sk, "tblPPData": pp,
                  "tblInclusions": [{"Inclusions": "Cost of Sales", "Amount": 10_000_000}],
                  "tblESDData": esd, "tblSED": sed}
    elif name == "yes":
        # The YES sheet filled in so the entity qualifies (prior-year level 4,
        # measured level 2, Ownership and the chosen priority element — Skills
        # — above 40%): the toolkit adds its tier reward on its own rows
        # (YES points, YES level); the B-BBEE total and both levels must not move.
        case = edge("qse_rule")
        case["cells"]["Client Information!C3"] = "QSE edge: YES inputs"
        case["cells"].update({"YES!C3": "No", "YES!C4": "2025-05-01", "YES!C17": 4, "YES!C18": 2,
                              "YES!C22": "Tier 2 (1 Level up) + 3 points", "YES!A9": "Yes"})
        case["profile"] = "edge:yes"
        return case
    else:
        raise SystemExit(f"unknown edge case {name}")
    tables["tblCompanyValuation"] = [{"Date": DATA_DATE, "Company Asset Value": value,
                                      "Total Shares": sum(h["Number of Share"] for h in tables["tblOwnershipData"]),
                                      "Share Value": round(value / sum(h["Number of Share"] for h in tables["tblOwnershipData"]), 2)}]
    return {"template": TEMPLATE, "seed": None, "profile": f"edge:{name}", "cells": cells, "tables": tables}


EDGES = ["zero", "threshold75", "qse_rule", "skills_fail", "full", "own_fail_l8", "bonus", "debt", "yes"]
RANDOM = [(101, "full"), (102, "small"), (103, "full"), (104, "small"), (105, "full"),
          (106, "full"), (107, "small"), (108, "full")]


if __name__ == "__main__":
    if sys.argv[1] == "--all":
        out_dir = sys.argv[2]
        os.makedirs(out_dir, exist_ok=True)
        for seed, prof in RANDOM:
            json.dump(make(seed, prof), open(os.path.join(out_dir, f"qse_{seed}.case.json"), "w", encoding="utf-8"), indent=1)
        for e in EDGES:
            json.dump(edge(e), open(os.path.join(out_dir, f"qse_edge_{e}.case.json"), "w", encoding="utf-8"), indent=1)
        print("wrote", len(RANDOM) + len(EDGES), "cases to", out_dir)
    elif sys.argv[1] == "--edge":
        json.dump(edge(sys.argv[2]), open(sys.argv[3], "w", encoding="utf-8"), indent=1)
        print("wrote", sys.argv[3])
    else:
        seed = int(sys.argv[1])
        out = sys.argv[2]
        profile = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "full"
        json.dump(make(seed, profile), open(out, "w", encoding="utf-8"), indent=1)
        print("wrote", out)
