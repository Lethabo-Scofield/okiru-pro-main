"""
Compare extracted Excel toolkit values against sectorConfig.ts hardcoded values.
Outputs a concise markdown-ready comparison for all 6 sectors.
"""
import json
import os
import re

TOOLKIT_DIR = os.path.dirname(os.path.abspath(__file__))

SECTORS = {
    "RCOGP_Generic": {
        "file": "extracted_RCOGP_Generic.json",
        "label": "RCOGP Generic",
        "scorecard_type": "Generic",
    },
    "ICT_Generic": {
        "file": "extracted_ICT_Generic.json",
        "label": "ICT Generic",
        "scorecard_type": "Generic",
    },
    "FSC_Generic": {
        "file": "extracted_FSC_Generic.json",
        "label": "FSC Generic",
        "scorecard_type": "Generic",
    },
    "AGRI_Generic": {
        "file": "extracted_AGRI_Generic.json",
        "label": "AGRI Generic (AgriBEE)",
        "scorecard_type": "Generic",
    },
    "RCOGP_QSE": {
        "file": "extracted_RCOGP_QSE.json",
        "label": "RCOGP QSE",
        "scorecard_type": "QSE",
    },
    "ICT_QSE": {
        "file": "extracted_ICT_QSE.json",
        "label": "ICT QSE",
        "scorecard_type": "QSE",
    },
}

CODEBASE_VALUES = {
    "RCOGP_Generic": {
        "grand_total": 120,
        "ownership": 25, "mc": 19, "ee": None,
        "skills": 25, "pp": 29, "sd": 10, "ed": 7, "sed": 5,
        "mc_board_black_pts": 2, "mc_board_bw_pts": 1,
        "mc_exec_black_pts": 2, "mc_exec_bw_pts": 2,
        "mc_other_exec_black_pts": 2, "mc_other_exec_bw_pts": 1,
        "mc_senior_pts": 2, "mc_senior_bw_pts": 1,
        "mc_middle_pts": 2, "mc_middle_bw_pts": 1,
        "mc_junior_pts": 1, "mc_junior_bw_pts": 1,
        "ee_disabled_pts": 2,
        "skills_learning_pts": 6, "skills_bursary_pts": 4,
        "skills_disabled_pts": 4, "skills_learnership_pts": 6,
        "skills_absorption_pts": 5,
        "pp_all_pts": 5, "pp_qse_pts": 3, "pp_eme_pts": 4,
        "pp_bo51_pts": 11, "pp_bwo30_pts": 4, "pp_dg_pts": 2,
        "esd_sd_pts": 10, "esd_ed_pts": 5,
        "esd_grad_bonus": 1, "esd_jobs_bonus": 1,
        "sed_pts": 5,
    },
    "ICT_Generic": {
        "grand_total": 133,
        "ownership": 25, "mc": 23, "ee": 15,
        "skills": 25, "pp": 25, "sd": 10, "ed": 5, "sed": 5,
        "mc_board_black_pts": 2, "mc_board_bw_pts": 1,
        "mc_exec_black_pts": 3, "mc_exec_bw_pts": 2,
        "mc_other_exec_black_pts": 2, "mc_other_exec_bw_pts": 1,
        "mc_senior_pts": 6, "mc_senior_bw_pts": 3,
        "mc_middle_pts": 5, "mc_middle_bw_pts": 2,
        "mc_junior_pts": 2, "mc_junior_bw_pts": 1,
        "ee_disabled_pts": 2,
        "skills_learning_pts": 6, "skills_bursary_pts": 4,
        "skills_disabled_pts": 4, "skills_learnership_pts": 6,
        "skills_absorption_pts": 5,
        "pp_all_pts": 5, "pp_qse_pts": 3, "pp_eme_pts": 4,
        "pp_bo51_pts": 9, "pp_bwo30_pts": 4, "pp_dg_pts": 2,
        "esd_sd_pts": 10, "esd_ed_pts": 5,
        "esd_grad_bonus": 0, "esd_jobs_bonus": 0,
        "sed_pts": 5,
    },
    "FSC_Generic": {
        "grand_total": 149,
        "ownership": 25, "mc": 20, "ee": 12,
        "skills": 20, "pp": 20, "sd": 10, "ed": 5, "sed": 5,
        "empowerment_financing": 15, "afs": 12, "consumer_ed": 5,
        "mc_board_black_pts": 2, "mc_board_bw_pts": 1,
        "mc_exec_black_pts": 3, "mc_exec_bw_pts": 2,
        "mc_other_exec_black_pts": 2, "mc_other_exec_bw_pts": 1,
        "mc_senior_pts": 5, "mc_senior_bw_pts": 2,
        "mc_middle_pts": 4, "mc_middle_bw_pts": 2,
        "mc_junior_pts": 2, "mc_junior_bw_pts": 1,
        "ee_disabled_pts": 1,
        "skills_learning_pts": 5, "skills_bursary_pts": 3,
        "skills_disabled_pts": 3, "skills_learnership_pts": 5,
        "skills_absorption_pts": 4,
        "pp_all_pts": 5, "pp_qse_pts": 3, "pp_eme_pts": 3,
        "pp_bo51_pts": 5, "pp_bwo30_pts": 4, "pp_dg_pts": 2,
        "esd_sd_pts": 10, "esd_ed_pts": 5,
        "esd_grad_bonus": 0, "esd_jobs_bonus": 0,
        "sed_pts": 5,
    },
    "AGRI_Generic": {
        "grand_total": 132,
        "ownership": 25, "mc": 19, "ee": 11,
        "skills": 25, "pp": 25, "sd": 10, "ed": 5, "sed": 5,
        "mc_board_black_pts": 2, "mc_board_bw_pts": 1,
        "mc_exec_black_pts": 2, "mc_exec_bw_pts": 1,
        "mc_other_exec_black_pts": 2, "mc_other_exec_bw_pts": 1,
        "mc_senior_pts": 5, "mc_senior_bw_pts": 2,
        "mc_middle_pts": 4, "mc_middle_bw_pts": 2,
        "mc_junior_pts": 4, "mc_junior_bw_pts": 2,
        "ee_disabled_pts": 2,
        "skills_learning_pts": 6, "skills_bursary_pts": 4,
        "skills_disabled_pts": 4, "skills_learnership_pts": 6,
        "skills_absorption_pts": 5,
        "pp_all_pts": 5, "pp_qse_pts": 3, "pp_eme_pts": 4,
        "pp_bo51_pts": 9, "pp_bwo30_pts": 4, "pp_dg_pts": 2,
        "esd_sd_pts": 10, "esd_ed_pts": 5,
        "esd_grad_bonus": 0, "esd_jobs_bonus": 0,
        "sed_pts": 5,
    },
    "RCOGP_QSE": {
        "grand_total": 124,
        "ownership": 25, "mc": 19,
        "skills": 25, "pp": 25, "sd": 15, "ed": 10, "sed": 5,
        "mc_board_black_pts": 3, "mc_board_bw_pts": 2,
        "mc_exec_black_pts": 4, "mc_exec_bw_pts": 4,
        "mc_other_exec_black_pts": 3, "mc_other_exec_bw_pts": 2,
        "ee_disabled_pts": 2,
        "skills_learning_pts": 6, "skills_bursary_pts": 4,
        "skills_disabled_pts": 4, "skills_learnership_pts": 6,
        "skills_absorption_pts": 5,
        "pp_all_pts": 5, "pp_qse_pts": 3, "pp_eme_pts": 4,
        "pp_bo51_pts": 9, "pp_bwo30_pts": 4, "pp_dg_pts": 2,
        "esd_sd_pts": 15, "esd_ed_pts": 10,
        "esd_grad_bonus": 0, "esd_jobs_bonus": 0,
        "sed_pts": 5,
    },
    "ICT_QSE": {
        "grand_total": 124,
        "ownership": 25, "mc": 19,
        "skills": 25, "pp": 25, "sd": 15, "ed": 10, "sed": 5,
        "mc_board_black_pts": 3, "mc_board_bw_pts": 2,
        "mc_exec_black_pts": 4, "mc_exec_bw_pts": 4,
        "mc_other_exec_black_pts": 3, "mc_other_exec_bw_pts": 2,
        "ee_disabled_pts": 2,
        "skills_learning_pts": 6, "skills_bursary_pts": 4,
        "skills_disabled_pts": 4, "skills_learnership_pts": 6,
        "skills_absorption_pts": 5,
        "pp_all_pts": 5, "pp_qse_pts": 3, "pp_eme_pts": 4,
        "pp_bo51_pts": 9, "pp_bwo30_pts": 4, "pp_dg_pts": 2,
        "esd_sd_pts": 15, "esd_ed_pts": 10,
        "esd_grad_bonus": 0, "esd_jobs_bonus": 0,
        "sed_pts": 5,
    },
}


def load_json(sector_key):
    path = os.path.join(TOOLKIT_DIR, SECTORS[sector_key]["file"])
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_sheet(data, *keywords):
    for sheet_name, rows in data.items():
        lower = sheet_name.lower()
        if any(k.lower() in lower for k in keywords):
            return sheet_name, rows
    return None, None


def cell_val(row, col_key):
    if row is None:
        return None
    v = row.get(col_key)
    if v is None:
        return None
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return v
    return v


def extract_summary_pillar_points(data):
    """Extract pillar max points from the Summary Scorecard sheet."""
    sheet_name, rows = find_sheet(data, "Summary Scorecard")
    if not rows:
        return {}

    result = {}
    for row_key, row in rows.items():
        c2 = row.get("c2", "")
        c3 = row.get("c3")
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()
        if c3 is not None:
            try:
                pts = float(c3)
            except (ValueError, TypeError):
                continue
            if "grand total" in lower and pts > 50:
                result["grand_total"] = pts
            elif lower == "ownership":
                result["ownership"] = pts
            elif "management control" in lower and "employment" not in lower:
                result["mc"] = pts
            elif "employment equity" in lower:
                result["ee"] = pts
            elif "skills development" in lower:
                result["skills"] = pts
            elif "preferential procurement" in lower:
                result["pp"] = pts
            elif "supplier development" in lower:
                result["sd"] = pts
            elif "enterprise development" in lower and "supplier" not in lower:
                result["ed"] = pts
            elif "socioeconomic" in lower or "socio-economic" in lower or "sed" in lower:
                result["sed"] = pts
            elif "empowerment financing" in lower or "ef &" in lower:
                result["ef"] = pts
            elif "access to financial" in lower or "afs" in lower:
                result["afs"] = pts
            elif "consumer education" in lower:
                result["consumer_ed"] = pts
    return result


def extract_mc_points(data):
    """Extract MC scorecard criterion points."""
    sheet_name, rows = find_sheet(data, "MC Scorecard")
    if sheet_name and "Exco" in sheet_name:
        for name2, rows2 in data.items():
            if "MC Scorecard" in name2 and "Exco" not in name2:
                sheet_name, rows = name2, rows2
                break
    if not rows:
        return {}

    result = {}
    for row_key, row in rows.items():
        c4 = row.get("c4", "")
        c3 = row.get("c3", "")
        c6 = row.get("c6")
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

            if "voting rights" in lower4 and "black board" in lower4:
                result["board_black_pts"] = pts
            elif "voting rights" in lower4 and "black female board" in lower4:
                result["board_bw_pts"] = pts
            elif "black executive director" in lower4 and "female" not in lower4:
                result["exec_black_pts"] = pts
            elif "black female executive director" in lower4:
                result["exec_bw_pts"] = pts
            elif "black other executive" in lower4 and "female" not in lower4:
                result["other_exec_black_pts"] = pts
            elif "black female other executive" in lower4:
                result["other_exec_bw_pts"] = pts
            elif "black employees in senior management" in lower4 and "female" not in lower4:
                result["senior_pts"] = pts
            elif "black female employees in senior management" in lower4:
                result["senior_bw_pts"] = pts
            elif "grand total" in lower3:
                result["grand_total"] = pts
            elif "employees with disab" in lower3 or "living with diab" in lower4 or "disab" in lower4:
                result["disabled_pts"] = pts

    return result


def extract_skills_points(data):
    """Extract Skills scorecard criterion points."""
    sheet_name, rows = find_sheet(data, "Skills Scorecard")
    if not rows:
        return {}

    result = {}
    for row_key, row in rows.items():
        c2 = row.get("c2", "")
        c4 = row.get("c4")
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()

        if c4 is not None:
            try:
                pts = float(c4)
            except (ValueError, TypeError):
                continue

            if "expenditure on learning" in lower and "disabled" not in lower:
                result["learning_pts"] = pts
            elif "expenditure on learning" in lower and "disabled" in lower:
                result["disabled_pts"] = pts
            elif "number of black" in lower and "learnership" in lower:
                result["learnership_pts"] = pts
            elif "number of unemployed" in lower or "training as per" in lower:
                result["unemployed_pts"] = pts
            elif "absorption" in lower:
                result["absorption_pts"] = pts
            elif "grand total" in lower or "total" == lower:
                result["grand_total"] = pts

    return result


def extract_pp_points(data):
    """Extract Procurement scorecard criterion points."""
    sheet_name, rows = find_sheet(data, "Procurement Scorecard")
    if not rows:
        return {}

    result = {}
    for row_key, row in rows.items():
        c2 = row.get("c2", "")
        c4 = row.get("c4")
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()

        if c4 is not None:
            try:
                pts = float(c4)
            except (ValueError, TypeError):
                continue

            if "empowering supplier" in lower and "qse" not in lower and "eme" not in lower and "51%" not in lower and "30%" not in lower and "designated" not in lower:
                result["all_pts"] = pts
            elif "qse" in lower:
                result["qse_pts"] = pts
            elif "eme" in lower:
                result["eme_pts"] = pts
            elif "51%" in lower or "51% black" in lower:
                result["bo51_pts"] = pts
            elif "30%" in lower or "black female" in lower or "black women" in lower:
                result["bwo30_pts"] = pts
            elif "designated group" in lower:
                result["dg_pts"] = pts
            elif "grand total" in lower:
                result["grand_total"] = pts

    return result


def extract_esd_points(data):
    """Extract ESD scorecard criterion points."""
    result = {}
    sheet_name, rows = find_sheet(data, "ESD Scorecard")
    if rows:
        for row_key, row in rows.items():
            c2 = row.get("c2", "")
            c4 = row.get("c4")
            if not isinstance(c2, str):
                continue
            lower = c2.lower().strip()
            if c4 is not None:
                try:
                    pts = float(c4)
                except (ValueError, TypeError):
                    continue
                if "supplier development" in lower and "enterprise" not in lower:
                    result["sd_pts"] = pts
                elif "enterprise development" in lower and "supplier" not in lower:
                    result["ed_pts"] = pts
                elif "graduation" in lower:
                    result["grad_bonus"] = pts
                elif "creation" in lower and "job" in lower:
                    result["jobs_bonus"] = pts

    return result


def extract_sed_points(data):
    """Extract SED scorecard criterion points."""
    sheet_name, rows = find_sheet(data, "SED Scorecard", "SED & CE")
    if not rows:
        return {}

    result = {}
    for row_key, row in rows.items():
        c2 = row.get("c2", "")
        c4 = row.get("c4")
        if not isinstance(c2, str):
            continue
        lower = c2.lower().strip()
        if c4 is not None:
            try:
                pts = float(c4)
            except (ValueError, TypeError):
                continue
            if "grand total" in lower or "total" == lower:
                result["total_pts"] = pts
            elif "socioeconomic" in lower or "socio" in lower or "sed" in lower:
                result["sed_pts"] = pts

    return result


def extract_industry_norms(data):
    """Extract industry norms from the Industry Norms sheet."""
    sheet_name, rows = find_sheet(data, "Industry Norm")
    if not rows:
        return []

    norms = []
    for row_key, row in sorted(rows.items(), key=lambda x: int(x[0].replace("row_", "")) if x[0].startswith("row_") else 0):
        c1 = row.get("c1", row.get("c2", ""))
        c2 = row.get("c2", row.get("c3", ""))
        c3 = row.get("c3", row.get("c4", ""))
        if isinstance(c1, str) and len(c1) > 3 and not any(kw in c1.lower() for kw in ["industry", "norms", "source", "note", "quarter"]):
            try:
                norm = float(c3) if c3 else float(c2)
                if 0 < norm < 100:
                    norms.append({"name": c1, "norm": norm})
            except (ValueError, TypeError):
                pass
    return norms[:5]  # just first 5 as sample


def compare_sector(sector_key):
    data = load_json(sector_key)
    if not data:
        return f"### {SECTORS[sector_key]['label']}\n\n**ERROR**: Could not load extracted JSON.\n\n"

    cb = CODEBASE_VALUES.get(sector_key, {})
    lines = []
    lines.append(f"### {SECTORS[sector_key]['label']}")
    lines.append("")

    summary = extract_summary_pillar_points(data)
    mc_data = extract_mc_points(data)
    skills_data = extract_skills_points(data)
    pp_data = extract_pp_points(data)
    esd_data = extract_esd_points(data)
    sed_data = extract_sed_points(data)
    norms = extract_industry_norms(data)

    lines.append("#### Summary Scorecard (Pillar Max Points)")
    lines.append("")
    lines.append("| Pillar | Excel | Codebase | Match? |")
    lines.append("|--------|-------|----------|--------|")

    pillar_map = [
        ("Grand Total", "grand_total", "grand_total"),
        ("Ownership", "ownership", "ownership"),
        ("Management Control", "mc", "mc"),
        ("Employment Equity", "ee", "ee"),
        ("Skills Development", "skills", "skills"),
        ("Preferential Procurement", "pp", "pp"),
        ("Supplier Development", "sd", "sd"),
        ("Enterprise Development", "ed", "ed"),
        ("SED", "sed", "sed"),
    ]

    discrepancies = []
    for label, excel_key, cb_key in pillar_map:
        excel_val = summary.get(excel_key)
        cb_val = cb.get(cb_key)
        if excel_val is not None and cb_val is not None:
            match = "YES" if excel_val == cb_val else "**NO**"
            if excel_val != cb_val:
                discrepancies.append(f"  - {label}: Excel={excel_val}, Code={cb_val}")
            lines.append(f"| {label} | {excel_val} | {cb_val} | {match} |")
        elif excel_val is not None:
            lines.append(f"| {label} | {excel_val} | N/A | - |")
        elif cb_val is not None:
            lines.append(f"| {label} | N/A | {cb_val} | - |")

    lines.append("")

    if mc_data:
        lines.append("#### Management Control Criterion Points")
        lines.append("")
        lines.append("| Criterion | Excel | Codebase | Match? |")
        lines.append("|-----------|-------|----------|--------|")
        mc_map = [
            ("Board Black", "board_black_pts", "mc_board_black_pts"),
            ("Board BW", "board_bw_pts", "mc_board_bw_pts"),
            ("Exec Black", "exec_black_pts", "mc_exec_black_pts"),
            ("Exec BW", "exec_bw_pts", "mc_exec_bw_pts"),
            ("Other Exec Black", "other_exec_black_pts", "mc_other_exec_black_pts"),
            ("Other Exec BW", "other_exec_bw_pts", "mc_other_exec_bw_pts"),
            ("Senior", "senior_pts", "mc_senior_pts"),
            ("Senior BW", "senior_bw_pts", "mc_senior_bw_pts"),
            ("Disabled", "disabled_pts", "ee_disabled_pts"),
        ]
        for label, excel_key, cb_key in mc_map:
            excel_val = mc_data.get(excel_key)
            cb_val = cb.get(cb_key)
            if excel_val is not None and cb_val is not None:
                match = "YES" if excel_val == cb_val else "**NO**"
                if excel_val != cb_val:
                    discrepancies.append(f"  - MC {label}: Excel={excel_val}, Code={cb_val}")
                lines.append(f"| {label} | {excel_val} | {cb_val} | {match} |")
            elif excel_val is not None:
                lines.append(f"| {label} | {excel_val} | N/A | - |")
        lines.append("")

    if skills_data:
        lines.append("#### Skills Development Criterion Points")
        lines.append("")
        lines.append("| Criterion | Excel | Codebase | Match? |")
        lines.append("|-----------|-------|----------|--------|")
        skills_map = [
            ("Learning Programmes", "learning_pts", "skills_learning_pts"),
            ("Disabled Learning", "disabled_pts", "skills_disabled_pts"),
            ("Learnerships", "learnership_pts", "skills_learnership_pts"),
            ("Absorption", "absorption_pts", "skills_absorption_pts"),
        ]
        for label, excel_key, cb_key in skills_map:
            excel_val = skills_data.get(excel_key)
            cb_val = cb.get(cb_key)
            if excel_val is not None and cb_val is not None:
                match = "YES" if excel_val == cb_val else "**NO**"
                if excel_val != cb_val:
                    discrepancies.append(f"  - Skills {label}: Excel={excel_val}, Code={cb_val}")
                lines.append(f"| {label} | {excel_val} | {cb_val} | {match} |")
            elif excel_val is not None:
                lines.append(f"| {label} | {excel_val} | N/A | - |")
        lines.append("")

    if pp_data:
        lines.append("#### Procurement Criterion Points")
        lines.append("")
        lines.append("| Criterion | Excel | Codebase | Match? |")
        lines.append("|-----------|-------|----------|--------|")
        pp_map = [
            ("All Suppliers", "all_pts", "pp_all_pts"),
            ("QSE", "qse_pts", "pp_qse_pts"),
            ("EME", "eme_pts", "pp_eme_pts"),
            ("BO51", "bo51_pts", "pp_bo51_pts"),
            ("BWO30", "bwo30_pts", "pp_bwo30_pts"),
            ("Designated Group", "dg_pts", "pp_dg_pts"),
        ]
        for label, excel_key, cb_key in pp_map:
            excel_val = pp_data.get(excel_key)
            cb_val = cb.get(cb_key)
            if excel_val is not None and cb_val is not None:
                match = "YES" if excel_val == cb_val else "**NO**"
                if excel_val != cb_val:
                    discrepancies.append(f"  - PP {label}: Excel={excel_val}, Code={cb_val}")
                lines.append(f"| {label} | {excel_val} | {cb_val} | {match} |")
            elif excel_val is not None:
                lines.append(f"| {label} | {excel_val} | N/A | - |")
        lines.append("")

    if norms:
        lines.append("#### Industry Norms (sample from Excel)")
        lines.append("")
        lines.append("| Industry | Excel Norm % |")
        lines.append("|----------|-------------|")
        for n in norms:
            lines.append(f"| {n['name']} | {n['norm']}% |")
        lines.append("")
        lines.append("**Codebase**: Uses generic `STANDARD_INDUSTRY_NORMS` (fabricated values like Retail=4%, Manufacturing=6%, IT Services=10% etc.) - NOT from any Excel toolkit.")
        lines.append("")

    if discrepancies:
        lines.append("#### Discrepancies Found")
        lines.append("")
        for d in discrepancies:
            lines.append(d)
        lines.append("")

    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def main():
    output = []
    for sector_key in SECTORS:
        output.append(compare_sector(sector_key))

    result = "\n".join(output)
    out_path = os.path.join(TOOLKIT_DIR, "comparison_output.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"Wrote comparison to: {out_path}")
    print(result[:5000])


if __name__ == "__main__":
    main()
