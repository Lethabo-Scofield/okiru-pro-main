"""
Compare extracted Excel toolkit values against sectorConfig.ts hardcoded values.
Reads the actual JSON structure from extract_fast.py output.
"""
import json
import os

TOOLKIT_DIR = os.path.dirname(os.path.abspath(__file__))

SECTORS = [
    ("RCOGP_Generic", "RCOGP Generic"),
    ("ICT_Generic", "ICT Generic"),
    ("FSC_Generic", "FSC Generic"),
    ("AGRI_Generic", "AGRI Generic (AgriBEE)"),
    ("RCOGP_QSE", "RCOGP QSE"),
    ("ICT_QSE", "ICT QSE"),
]

CODEBASE = {
    "RCOGP_Generic": {
        "grand_total": 120,
        "pillars": {"Ownership": 25, "Management Control": 19, "Skills Development": 25, 
                    "Preferential Procurement": 29, "Supplier Development": 10, 
                    "Enterprise Development": 7, "SED": 5},
        "mc": {"Board Black": (2, 0.50), "Board BW": (1, 0.25), "Exec Black": (2, 0.50), "Exec BW": (2, 0.30),
               "Other Exec Black": (2, 0.60), "Other Exec BW": (1, 0.30), "Senior": (2,), "Senior BW": (1,),
               "Middle": (2,), "Middle BW": (1,), "Junior": (1,), "Junior BW": (1,), "Disabled": (2, 0.03)},
        "skills": {"Learning Programmes": 6, "Bursary": 4, "Disabled Learning": 4, "Learnerships": 6, "Absorption": 5},
        "pp": {"All Suppliers": 5, "QSE": 3, "EME": 4, "BO51": 11, "BWO30": 4, "Designated Group": 2},
        "esd": {"SD": 10, "ED": 5, "Grad Bonus": 1, "Jobs Bonus": 1},
        "sed": 5,
        "notes": "MC is combined MC+EE (no separate EE pillar), Grand total = 120",
    },
    "ICT_Generic": {
        "grand_total": 133,
        "pillars": {"Ownership": 25, "Management Control": 23, "Employment Equity": 15,
                    "Skills Development": 25, "Preferential Procurement": 25,
                    "Supplier Development": 10, "Enterprise Development": 5, "SED": 5},
        "mc": {"Board Black": (2, 0.50), "Board BW": (1, 0.25), "Exec Black": (3, 0.50), "Exec BW": (2, 0.30),
               "Other Exec Black": (2, 0.60), "Other Exec BW": (1, 0.30), "Senior": (6,), "Senior BW": (3,),
               "Middle": (5,), "Middle BW": (2,), "Junior": (2,), "Junior BW": (1,), "Disabled": (2, 0.02)},
        "skills": {"Learning Programmes": 6, "Bursary": 4, "Disabled Learning": 4, "Learnerships": 6, "Absorption": 5},
        "pp": {"All Suppliers": 5, "QSE": 3, "EME": 4, "BO51": 9, "BWO30": 4, "Designated Group": 2},
        "esd": {"SD": 10, "ED": 5, "Grad Bonus": 0, "Jobs Bonus": 0},
        "sed": 5,
        "notes": "MC + separate EE, Grand total = 133",
    },
    "FSC_Generic": {
        "grand_total": 149,
        "pillars": {"Ownership": 25, "Management Control": 20, "Employment Equity": 12,
                    "Skills Development": 20, "Preferential Procurement": 20,
                    "Supplier Development": 10, "Enterprise Development": 5, "SED": 5,
                    "Empowerment Financing": 15, "Access to Financial Services": 12, "Consumer Education": 5},
        "mc": {"Board Black": (2, 0.50), "Board BW": (1, 0.25), "Exec Black": (3, 0.50), "Exec BW": (2, 0.30),
               "Other Exec Black": (2, 0.60), "Other Exec BW": (1, 0.30)},
        "skills": {"Learning Programmes": 5, "Bursary": 3, "Disabled Learning": 3, "Learnerships": 5, "Absorption": 4},
        "pp": {"All Suppliers": 5, "QSE": 3, "EME": 3, "BO51": 5, "BWO30": 4, "Designated Group": 2},
        "esd": {"SD": 10, "ED": 5},
        "sed": 5,
        "notes": "FSC has unique pillars: Empowerment Financing, AFS, Consumer Education",
    },
    "AGRI_Generic": {
        "grand_total": 132,
        "pillars": {"Ownership": 25, "Management Control": 19, "Employment Equity": 11,
                    "Skills Development": 25, "Preferential Procurement": 25,
                    "Supplier Development": 10, "Enterprise Development": 5, "SED": 5},
        "mc": {"Board Black": (2, 0.50), "Board BW": (1, 0.25), "Exec Black": (2, 0.50), "Exec BW": (1, 0.30),
               "Other Exec Black": (2, 0.60), "Other Exec BW": (1, 0.30)},
        "skills": {"Learning Programmes": 6, "Bursary": 4, "Disabled Learning": 4, "Learnerships": 6, "Absorption": 5},
        "pp": {"All Suppliers": 5, "QSE": 3, "EME": 4, "BO51": 9, "BWO30": 4, "Designated Group": 2},
        "esd": {"SD": 10, "ED": 5},
        "sed": 5,
        "notes": "AgriBEE, MC+EE separate, Grand total = 132",
    },
    "RCOGP_QSE": {
        "grand_total": 124,
        "pillars": {"Ownership": 25, "Management Control": 19,
                    "Skills Development": 25, "Preferential Procurement": 25,
                    "Supplier Development": 15, "Enterprise Development": 10, "SED": 5},
        "mc": {"Board Black": (3, 0.50), "Board BW": (2, 0.25), "Exec Black": (4, 0.50), "Exec BW": (4, 0.30),
               "Other Exec Black": (3, 0.60), "Other Exec BW": (2, 0.30)},
        "skills": {"Learning Programmes": 6, "Bursary": 4, "Disabled Learning": 4, "Learnerships": 6, "Absorption": 5},
        "pp": {"All Suppliers": 5, "QSE": 3, "EME": 4, "BO51": 9, "BWO30": 4, "Designated Group": 2},
        "esd": {"SD": 15, "ED": 10},
        "sed": 5,
        "notes": "QSE - no EE pillar, MC combined, higher SD/ED",
    },
    "ICT_QSE": {
        "grand_total": 124,
        "pillars": {"Ownership": 25, "Management Control": 19,
                    "Skills Development": 25, "Preferential Procurement": 25,
                    "Supplier Development": 15, "Enterprise Development": 10, "SED": 5},
        "mc": {"Board Black": (3, 0.50), "Board BW": (2, 0.25), "Exec Black": (4, 0.50), "Exec BW": (4, 0.30),
               "Other Exec Black": (3, 0.60), "Other Exec BW": (2, 0.30)},
        "skills": {"Learning Programmes": 6, "Bursary": 4, "Disabled Learning": 4, "Learnerships": 6, "Absorption": 5},
        "pp": {"All Suppliers": 5, "QSE": 3, "EME": 4, "BO51": 9, "BWO30": 4, "Designated Group": 2},
        "esd": {"SD": 15, "ED": 10},
        "sed": 5,
        "notes": "QSE - same structure as RCOGP QSE for ICT",
    },
}


def load_data(sector_key):
    path = os.path.join(TOOLKIT_DIR, f"extracted_{sector_key}.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get(sector_key, {}).get("extracted_sheets", {})


def get_sheet(data, *keywords):
    for sheet_name in data:
        lower = sheet_name.lower()
        if all(k.lower() in lower for k in keywords):
            return sheet_name, data[sheet_name]
    return None, None


def get_rows_dict(rows_list):
    """Convert list of {row, cells} to dict keyed by row number."""
    return {r["row"]: r["cells"] for r in rows_list}


def extract_summary(data):
    """Get pillar points from Summary Scorecard."""
    _, rows_list = get_sheet(data, "Summary", "Scorecard")
    if not rows_list:
        return {}
    rows = get_rows_dict(rows_list)

    result = {}
    for row_num, cells in sorted(rows.items()):
        c2 = cells.get("2", "")
        c3 = cells.get("3")
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()
        if c3 is None:
            continue
        try:
            pts = float(c3)
        except (ValueError, TypeError):
            continue

        if "grand total" in lower and pts > 50:
            result["Grand Total"] = pts
        elif lower == "ownership":
            result["Ownership"] = pts
        elif "management control" in lower:
            result["Management Control"] = pts
        elif "employment equity" in lower:
            result["Employment Equity"] = pts
        elif "skills development" in lower:
            result["Skills Development"] = pts
        elif "preferential procurement" in lower:
            result["Preferential Procurement"] = pts
        elif "supplier development" in lower:
            result["Supplier Development"] = pts
        elif "enterprise development" in lower and "supplier" not in lower:
            result["Enterprise Development"] = pts
        elif "socioeconomic" in lower or "socio-economic" in lower:
            result["SED"] = pts
        elif "empowerment financing" in lower or "ef &" in lower:
            result["Empowerment Financing"] = pts
        elif "access to financial" in lower:
            result["Access to Financial Services"] = pts
        elif "consumer education" in lower:
            result["Consumer Education"] = pts
    return result


def extract_mc(data):
    """Get MC criterion points."""
    # Find the MC Scorecard (not the Exco+Senior variant)
    target_name = None
    for name in data:
        if "mc scorecard" in name.lower() and "exco" not in name.lower():
            target_name = name
            break
    if not target_name:
        for name in data:
            if "mc scorecard" in name.lower():
                target_name = name
                break
    if not target_name:
        return {}

    rows = get_rows_dict(data[target_name])
    result = {}
    for row_num, cells in sorted(rows.items()):
        c4 = cells.get("4", "")
        c3 = cells.get("3", "")
        c5 = cells.get("5")
        c6 = cells.get("6")
        if not isinstance(c4, str):
            c4 = ""
        if not isinstance(c3, str):
            c3 = ""
        lower4 = c4.lower().strip()
        lower3 = c3.lower().strip()

        if c6 is not None:
            try:
                pts = float(c6)
            except (ValueError, TypeError):
                continue

            target_pct = None
            if c5 is not None:
                try:
                    target_pct = float(c5)
                except (ValueError, TypeError):
                    pass

            if "voting rights" in lower4 and "black board" in lower4 and "female" not in lower4:
                result["Board Black"] = (pts, target_pct)
            elif "voting rights" in lower4 and "black female board" in lower4:
                result["Board BW"] = (pts, target_pct)
            elif "black executive director" in lower4 and "female" not in lower4:
                result["Exec Black"] = (pts, target_pct)
            elif "black female executive director" in lower4:
                result["Exec BW"] = (pts, target_pct)
            elif "black other executive" in lower4 and "female" not in lower4:
                result["Other Exec Black"] = (pts, target_pct)
            elif "black female other executive" in lower4:
                result["Other Exec BW"] = (pts, target_pct)
            elif "black employees in senior" in lower4 and "female" not in lower4:
                result["Senior"] = (pts, target_pct)
            elif "black female employees in senior" in lower4:
                result["Senior BW"] = (pts, target_pct)
            elif "black employees in middle" in lower4 and "female" not in lower4:
                result["Middle"] = (pts, target_pct)
            elif "black female employees in middle" in lower4:
                result["Middle BW"] = (pts, target_pct)
            elif "black employees in junior" in lower4 and "female" not in lower4:
                result["Junior"] = (pts, target_pct)
            elif "black female employees in junior" in lower4:
                result["Junior BW"] = (pts, target_pct)
            elif "disab" in lower4 or "disab" in lower3:
                result["Disabled"] = (pts, target_pct)
            elif "grand total" in lower3:
                result["Grand Total"] = (pts, None)
    return result


def extract_skills(data):
    """Get Skills criterion points."""
    _, rows_list = get_sheet(data, "Skills", "Scorecard")
    if not rows_list:
        return {}
    rows = get_rows_dict(rows_list)
    result = {}
    for row_num, cells in sorted(rows.items()):
        c2 = cells.get("2", cells.get("3", ""))
        c4 = cells.get("4", cells.get("5"))
        c3_target = cells.get("3")
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()
        if c4 is not None:
            try:
                pts = float(c4)
            except (ValueError, TypeError):
                continue
            if "expenditure on learning" in lower and "disabled" not in lower:
                result["Learning Programmes"] = pts
            elif "expenditure on learning" in lower and "disabled" in lower:
                result["Disabled Learning"] = pts
            elif ("number of black" in lower and "learnership" in lower) or "learnerships" in lower:
                result["Learnerships"] = pts
            elif "number of unemployed" in lower or "training as per" in lower:
                result["Unemployed Training"] = pts
            elif "absorption" in lower:
                result["Absorption"] = pts
            elif "total" in lower and pts > 10:
                result["Grand Total"] = pts
    return result


def extract_pp(data):
    """Get Procurement criterion points."""
    _, rows_list = get_sheet(data, "Procurement", "Scorecard")
    if not rows_list:
        return {}
    rows = get_rows_dict(rows_list)
    result = {}
    for row_num, cells in sorted(rows.items()):
        c2 = cells.get("2", cells.get("3", ""))
        c4 = cells.get("4", cells.get("5"))
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()
        if c4 is not None:
            try:
                pts = float(c4)
            except (ValueError, TypeError):
                continue
            if "empowering supplier" in lower and "qse" not in lower and "eme" not in lower and "51%" not in lower and "30%" not in lower and "designated" not in lower:
                result["All Suppliers"] = pts
            elif "qse" in lower:
                result["QSE"] = pts
            elif "eme" in lower:
                result["EME"] = pts
            elif "51%" in lower:
                result["BO51"] = pts
            elif "30%" in lower or ("black female" in lower and "ownership" in lower):
                result["BWO30"] = pts
            elif "designated group" in lower:
                result["Designated Group"] = pts
            elif "grand total" in lower:
                result["Grand Total"] = pts
    return result


def extract_esd(data):
    _, rows_list = get_sheet(data, "ESD", "Scorecard")
    if not rows_list:
        return {}
    rows = get_rows_dict(rows_list)
    result = {}
    for row_num, cells in sorted(rows.items()):
        c2 = cells.get("2", cells.get("3", ""))
        c4 = cells.get("4", cells.get("5"))
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()
        if c4 is not None:
            try:
                pts = float(c4)
            except (ValueError, TypeError):
                continue
            if "supplier development" in lower and "enterprise" not in lower and pts > 0:
                result["SD"] = pts
            elif "enterprise development" in lower and "supplier" not in lower and pts > 0:
                result["ED"] = pts
            elif "graduation" in lower:
                result["Grad Bonus"] = pts
            elif "creation" in lower and "job" in lower:
                result["Jobs Bonus"] = pts
    return result


def extract_industry_norms_count(data):
    _, rows_list = get_sheet(data, "Industry", "Norm")
    if not rows_list:
        return 0, []
    count = 0
    samples = []
    for row in rows_list:
        cells = row["cells"]
        # Look for rows with industry names and norm percentages
        vals = list(cells.values())
        str_vals = [v for v in vals if isinstance(v, str) and len(v) > 3]
        num_vals = [v for v in vals if isinstance(v, (int, float)) and 0 < v < 50]
        if str_vals and num_vals:
            name = str_vals[0]
            if not any(kw in name.lower() for kw in ["industry", "norm", "source", "note", "publication", "quarter", "input"]):
                count += 1
                if len(samples) < 5:
                    samples.append(f"{name}: {num_vals[0]}%")
    return count, samples


def process_sector(sector_key, label):
    data = load_data(sector_key)
    if not data:
        return f"### {label}\n\n**ERROR**: Could not load extracted data.\n\n---\n\n"

    cb = CODEBASE[sector_key]
    lines = [f"### {label}", ""]

    # Summary
    summary = extract_summary(data)
    lines.append("#### Pillar Max Points")
    lines.append("")
    lines.append("| Pillar | Excel Toolkit | Codebase | Match? |")
    lines.append("|--------|:---:|:---:|:---:|")

    discrepancies = []
    
    # Grand total
    excel_gt = summary.get("Grand Total")
    cb_gt = cb["grand_total"]
    if excel_gt:
        match = "YES" if excel_gt == cb_gt else "**NO**"
        if excel_gt != cb_gt:
            discrepancies.append(f"Grand Total: Excel={int(excel_gt)}, Code={cb_gt}")
        lines.append(f"| Grand Total | {int(excel_gt)} | {cb_gt} | {match} |")
    else:
        lines.append(f"| Grand Total | _(not found)_ | {cb_gt} | ? |")

    all_pillar_names = set(list(cb["pillars"].keys()) + list(summary.keys()))
    all_pillar_names.discard("Grand Total")
    for pname in ["Ownership", "Management Control", "Employment Equity", "Skills Development",
                   "Preferential Procurement", "Supplier Development", "Enterprise Development", "SED",
                   "Empowerment Financing", "Access to Financial Services", "Consumer Education"]:
        if pname not in all_pillar_names:
            continue
        excel_val = summary.get(pname)
        cb_val = cb["pillars"].get(pname)
        if excel_val is not None and cb_val is not None:
            match = "YES" if excel_val == cb_val else "**NO**"
            if excel_val != cb_val:
                discrepancies.append(f"{pname}: Excel={int(excel_val)}, Code={cb_val}")
            lines.append(f"| {pname} | {int(excel_val)} | {cb_val} | {match} |")
        elif excel_val is not None:
            lines.append(f"| {pname} | {int(excel_val)} | _(missing)_ | **MISSING** |")
            discrepancies.append(f"{pname}: Excel={int(excel_val)}, Code=MISSING")
        elif cb_val is not None:
            lines.append(f"| {pname} | _(not in Excel)_ | {cb_val} | ? |")

    lines.append("")

    # MC
    mc = extract_mc(data)
    if mc:
        lines.append("#### Management Control Details")
        lines.append("")
        lines.append("| Criterion | Excel Pts | Codebase Pts | Match? |")
        lines.append("|-----------|:---:|:---:|:---:|")
        mc_total_excel = mc.get("Grand Total", (None,))[0]
        if mc_total_excel:
            lines.append(f"| **MC+EE Total** | **{int(mc_total_excel)}** | - | - |")
        for crit in ["Board Black", "Board BW", "Exec Black", "Exec BW",
                      "Other Exec Black", "Other Exec BW", "Senior", "Senior BW",
                      "Middle", "Middle BW", "Junior", "Junior BW", "Disabled"]:
            excel_data = mc.get(crit)
            cb_data = cb["mc"].get(crit)
            if excel_data and cb_data:
                e_pts = excel_data[0]
                c_pts = cb_data[0]
                match = "YES" if e_pts == c_pts else "**NO**"
                if e_pts != c_pts:
                    discrepancies.append(f"MC {crit}: Excel={int(e_pts)}pts, Code={c_pts}pts")
                e_tgt = f" ({excel_data[1]:.0%})" if excel_data[1] else ""
                c_tgt = f" ({cb_data[1]:.0%})" if len(cb_data) > 1 and cb_data[1] else ""
                lines.append(f"| {crit} | {int(e_pts)}{e_tgt} | {c_pts}{c_tgt} | {match} |")
            elif excel_data:
                lines.append(f"| {crit} | {int(excel_data[0])} | _(missing)_ | **MISSING** |")
                discrepancies.append(f"MC {crit}: not in codebase")
        lines.append("")

    # Skills
    skills = extract_skills(data)
    if skills:
        lines.append("#### Skills Development Details")
        lines.append("")
        lines.append("| Criterion | Excel Pts | Codebase Pts | Match? |")
        lines.append("|-----------|:---:|:---:|:---:|")
        for crit in ["Learning Programmes", "Disabled Learning", "Learnerships", "Unemployed Training", "Absorption"]:
            e_pts = skills.get(crit)
            c_pts = cb["skills"].get(crit)
            if e_pts is not None and c_pts is not None:
                match = "YES" if e_pts == c_pts else "**NO**"
                if e_pts != c_pts:
                    discrepancies.append(f"Skills {crit}: Excel={int(e_pts)}, Code={c_pts}")
                lines.append(f"| {crit} | {int(e_pts)} | {c_pts} | {match} |")
            elif e_pts is not None:
                lines.append(f"| {crit} | {int(e_pts)} | _(not mapped)_ | ? |")
        lines.append("")

    # PP
    pp = extract_pp(data)
    if pp:
        lines.append("#### Procurement Details")
        lines.append("")
        lines.append("| Criterion | Excel Pts | Codebase Pts | Match? |")
        lines.append("|-----------|:---:|:---:|:---:|")
        for crit in ["All Suppliers", "QSE", "EME", "BO51", "BWO30", "Designated Group"]:
            e_pts = pp.get(crit)
            c_pts = cb["pp"].get(crit)
            if e_pts is not None and c_pts is not None:
                match = "YES" if e_pts == c_pts else "**NO**"
                if e_pts != c_pts:
                    discrepancies.append(f"PP {crit}: Excel={int(e_pts)}, Code={c_pts}")
                lines.append(f"| {crit} | {int(e_pts)} | {c_pts} | {match} |")
            elif e_pts is not None:
                lines.append(f"| {crit} | {int(e_pts)} | _(missing)_ | **MISSING** |")
        lines.append("")

    # ESD
    esd = extract_esd(data)
    if esd:
        lines.append("#### ESD Details")
        lines.append("")
        lines.append("| Criterion | Excel Pts | Codebase Pts | Match? |")
        lines.append("|-----------|:---:|:---:|:---:|")
        for crit in ["SD", "ED", "Grad Bonus", "Jobs Bonus"]:
            e_pts = esd.get(crit)
            c_pts = cb.get("esd", {}).get(crit)
            if e_pts is not None and c_pts is not None:
                match = "YES" if e_pts == c_pts else "**NO**"
                if e_pts != c_pts:
                    discrepancies.append(f"ESD {crit}: Excel={int(e_pts)}, Code={c_pts}")
                lines.append(f"| {crit} | {int(e_pts)} | {c_pts} | {match} |")
            elif e_pts is not None:
                lines.append(f"| {crit} | {int(e_pts)} | _(missing)_ | **MISSING** |")
        lines.append("")

    # Industry Norms
    norm_count, norm_samples = extract_industry_norms_count(data)
    if norm_count > 0:
        lines.append(f"#### Industry Norms: {norm_count} entries found in Excel")
        lines.append("")
        lines.append("Sample entries:")
        for s in norm_samples:
            lines.append(f"  - {s}")
        lines.append("")
        lines.append("> **Codebase uses fabricated `STANDARD_INDUSTRY_NORMS`** with 17 generic entries (Retail=4%, Manufacturing=6%, etc.) that do NOT come from any Excel toolkit. The Excel toolkits contain SARS-sourced quarterly norms with different industry classifications and values.")
        lines.append("")

    # Discrepancy summary
    if discrepancies:
        lines.append(f"#### DISCREPANCIES FOUND: {len(discrepancies)}")
        lines.append("")
        for d in discrepancies:
            lines.append(f"- {d}")
        lines.append("")
    else:
        lines.append("#### No discrepancies found in extracted values.")
        lines.append("")

    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def main():
    output_parts = []
    for sector_key, label in SECTORS:
        output_parts.append(process_sector(sector_key, label))

    result = "\n".join(output_parts)
    out_path = os.path.join(TOOLKIT_DIR, "comparison_output.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"Wrote: {out_path}")
    print(result)


if __name__ == "__main__":
    main()
