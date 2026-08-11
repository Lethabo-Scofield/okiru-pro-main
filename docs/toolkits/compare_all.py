"""
Compare extracted Excel toolkit values against sectorConfig.ts hardcoded values.
Outputs a concise markdown-ready comparison for all 6 sectors.
"""
import json
import os
import re
import sys

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


# Live engine values, dumped from the real sectorConfig.ts. CODEBASE_VALUES below
# is only a FALLBACK for when the dump is absent — it is a hand-copied snapshot
# and it drifts: it still claimed RCOGP QSE = 124 long after the live config
# moved to 108, so the comparison was scoring the Excel toolkits against a stale
# transcription rather than against the engine. Regenerate the dump with:
#
#   cd apps/web && SECTOR_DUMP=../../docs/toolkits/live_sector_config.json \
#     npx vitest run src/__tests__/liveSectorConfigDump.harness.test.ts --pool=forks
LIVE_DUMP_PATH = os.path.join(TOOLKIT_DIR, "live_sector_config.json")

# compare_all's sector keys → the exported const name in sectorConfig.ts.
LIVE_CONFIG_NAMES = {
    "RCOGP_Generic": "RCOGP_GENERIC",
    "ICT_Generic": "ICT_GENERIC",
    "FSC_Generic": "FSC_GENERIC",
    "AGRI_Generic": "AGRI_GENERIC",
    "RCOGP_QSE": "RCOGP_QSE",
    "ICT_QSE": "ICT_QSE",
}

# Deltas where the engine INTENTIONALLY differs from the Empowered toolkit
# because the gazette says otherwise. These are not defects and must not be
# "fixed" to match the toolkit — doing so reintroduces points the gazette does
# not award. Source: docs/calculator-audit-2026-07-26.md (first-hand gazette
# text extraction, with page citations), items 9 and 11.
#
# Keyed (sector, table, criterion) → why.
TEMPLATE_TENSION = {
    ("AGRI_Generic", "summary", "Grand Total"):
        "GG 41306 pp.33-34: MC is the generic 19-pt structure, so the total is 128. "
        "The toolkit's 132 carries +4 phantom MC points (audit item 11).",
    ("AGRI_Generic", "summary", "Management Control"):
        "GG 41306 pp.33-34: 19 pts, not the toolkit's 23 (audit item 11).",
    ("AGRI_Generic", "mc", "Board Black"):
        "GG 41306: board black = 2, not the toolkit's 3 (audit item 11).",
    ("AGRI_Generic", "mc", "Board BW"):
        "GG 41306: board BW = 1, not the toolkit's 2 (audit item 11).",
    ("AGRI_Generic", "mc", "Other Exec Black"):
        "GG 41306: other exec black = 2, not the toolkit's 3 (audit item 11).",
    ("AGRI_Generic", "mc", "Other Exec BW"):
        "GG 41306: other exec BW = 1, not the toolkit's 2 (audit item 11).",
    ("FSC_Generic", "summary", "Grand Total"):
        "FS200: MC is 20, so the total is 119, not the toolkit's 120 (audit item 9).",
    ("FSC_Generic", "summary", "Management Control"):
        "FS200 §3.4.1: 20 pts, not the toolkit's 21 (audit item 9).",
    ("FSC_Generic", "mc", "Board Black"):
        "FS200: board black = 1 pt, not the toolkit's 2 (audit item 9).",
}

_live_cache = None


def load_live_dump():
    global _live_cache
    if _live_cache is None:
        if os.path.exists(LIVE_DUMP_PATH):
            with open(LIVE_DUMP_PATH, "r", encoding="utf-8") as f:
                _live_cache = json.load(f)
        else:
            _live_cache = {}
    return _live_cache


def codebase_values(sector_key):
    """Engine-side values for a sector: live dump when available, snapshot otherwise."""
    live = load_live_dump().get(LIVE_CONFIG_NAMES.get(sector_key, ""), {})
    compare = live.get("compare")
    if compare:
        # Drop nulls so an absent live field falls back rather than reporting a
        # spurious "N/A" against a real Excel number.
        return {k: v for k, v in compare.items() if v is not None}
    return CODEBASE_VALUES.get(sector_key, {})


def load_json(sector_key):
    """Return the extracted workbook as a flat {sheet_name: rows} mapping.

    extract_fast.py now wraps its output as
      {"<SECTOR_KEY>": {"file", "sheet_count", "all_sheets", "extracted_sheets"}}
    but every extract_* helper below iterates `data.items()` expecting sheet names
    at the top level. Unwrapping here (rather than in each helper) is what keeps
    the comparison working across both formats — without it find_sheet() matches
    nothing and EVERY Excel column silently reports "N/A", which reads as
    "nothing to compare" instead of "the extractor's output moved".
    """
    path = os.path.join(TOOLKIT_DIR, SECTORS[sector_key]["file"])
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Legacy flat format: sheet names already at the top level.
    sheets = data
    if "extracted_sheets" in data:
        sheets = data["extracted_sheets"]
    elif len(data) == 1:
        inner = next(iter(data.values()))
        if isinstance(inner, dict) and "extracted_sheets" in inner:
            sheets = inner["extracted_sheets"]

    return {name: _normalize_rows(rows) for name, rows in sheets.items()}


def _normalize_rows(rows):
    """Coerce a sheet's rows to the legacy {row_key: {"c<col>": value}} mapping.

    extract_fast.py emits [{"row": N, "cells": {"2": v, ...}}, ...]; the extractors
    below index rows by "c2"/"c3". Translating once here keeps both formats
    readable by the same comparison code.
    """
    if not isinstance(rows, list):
        return rows
    out = {}
    for entry in rows:
        if not isinstance(entry, dict):
            continue
        cells = entry.get("cells")
        if not isinstance(cells, dict):
            continue
        out[str(entry.get("row"))] = {f"c{col}": val for col, val in cells.items()}
    return out


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
            # Match the pillar HEADER row only — by exact label. The Summary sheet
            # lists each pillar header ("Enterprise development" = 7) immediately
            # above its own indicator rows ("Annual value of Enterprise Development
            # contributions" = 5, "Graduation…" = 1, "Jobs created…" = 1). A
            # substring test matches those sub-lines too and the last one wins, so
            # ED was being read as 5 — its BASE — and reported as a mismatch
            # against the config's 7, when the toolkit's own pillar total is 7.
            if "grand total" in lower and pts > 50:
                result["grand_total"] = pts
            elif lower == "ownership":
                result["ownership"] = pts
            elif lower in ("management control", "management control & employment equity"):
                result["mc"] = pts
            elif lower == "employment equity":
                result["ee"] = pts
            elif lower == "skills development":
                result["skills"] = pts
            elif lower == "preferential procurement":
                result["pp"] = pts
            elif lower == "supplier development":
                result["sd"] = pts
            elif lower == "enterprise development":
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

    pts_col = find_points_column(rows) or "c6"
    result = {}
    # The occupational band lives in column c3 as a section header ("Senior
    # Manager" / "Middle Manager" / "Junior Manager"); column c4 says
    # "Black employees in senior management" for ALL THREE bands. Matching on c4
    # alone therefore hit Senior, Middle and Junior in turn and the last write
    # won, so "Senior" was reported as the JUNIOR row's 1 point instead of 2.
    section = None
    for row_key, row in rows.items():
        c4 = row.get("c4", "")
        c3 = row.get("c3", "")
        c6 = row.get(pts_col)
        if not isinstance(c4, str):
            c4 = ""
        if not isinstance(c3, str):
            c3 = ""
        lower4 = c4.lower().strip()
        lower3 = c3.lower().strip()

        if lower3 in ("senior manager", "middle manager", "junior manager"):
            section = lower3.split()[0]  # senior | middle | junior

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
                result[f"{section or 'senior'}_pts"] = pts
            elif "black female employees in senior management" in lower4:
                result[f"{section or 'senior'}_bw_pts"] = pts
            elif "grand total" in lower3:
                result["grand_total"] = pts
            elif "employees with disab" in lower3 or "living with diab" in lower4 or "disab" in lower4:
                result["disabled_pts"] = pts

    return result


def extract_mc_from_summary(data):
    """MC criterion points as stated on the Summary Scorecard sheet.

    Preferred over the MC Scorecard sheet for the same reason as Skills: the
    Summary is internally consistent with its own pillar header, and its labels
    name each occupational band explicitly ("…in middle management") instead of
    reusing "senior management" for all three bands.

    Where the two sheets disagree the Summary wins — FSC's MC sheet totals 22
    with disabled = 2, while its Summary totals 21 with disabled = 1, and only
    the Summary reconciles with that toolkit's 120-point grand total.
    """
    sheet_name, rows = find_sheet(data, "Summary Scorecard")
    if not rows:
        return {}

    LABELS = [
        ("exercisable voting rights", True, "board_bw_pts"),
        ("exercisable voting rights", False, "board_black_pts"),
        ("executive directors", True, "exec_bw_pts"),
        ("executive directors", False, "exec_black_pts"),
        ("other executive management", True, "other_exec_bw_pts"),
        ("other executive management", False, "other_exec_black_pts"),
        ("in senior management", True, "senior_bw_pts"),
        ("in senior management", False, "senior_pts"),
        ("in middle management", True, "middle_bw_pts"),
        ("in middle management", False, "middle_pts"),
        ("in junior management", True, "junior_bw_pts"),
        ("in junior management", False, "junior_pts"),
    ]

    result = {}
    in_mc = False
    for row_key, row in rows.items():
        label = row.get("c2")
        if not isinstance(label, str):
            continue
        lower = label.lower().strip()
        if lower.startswith("management control"):
            in_mc = True
            continue
        if not in_mc:
            continue
        if lower in ("skills development", "employment equity", "ownership"):
            break

        raw = row.get("c3")
        if raw is None:
            continue
        try:
            pts = float(raw)
        except (ValueError, TypeError):
            continue

        # "african" rows are EAP sub-detail, not scored indicators.
        if "african" in lower:
            continue
        is_female = "female" in lower or "women" in lower
        if "disab" in lower or "bilit" in lower:
            result["disabled_pts"] = pts
            continue
        for needle, female, key in LABELS:
            if needle in lower and female == is_female:
                result[key] = pts
                break

    return result


def extract_skills_from_summary(data):
    """Skills criterion points as stated on the Summary Scorecard sheet.

    Preferred over the Skills Scorecard sheet, which in an UNFILLED template can
    show 0 for a criterion whose formula has not evaluated — ICT's disabled-
    learning row reads 0 there, making that sheet's own total 21 while the
    Summary states 25 (8+4+4+4+5). The Summary carries the target weightings and
    is internally consistent, so it is the trustworthy source for a
    weighting-vs-weighting comparison.
    """
    sheet_name, rows = find_sheet(data, "Summary Scorecard")
    if not rows:
        return {}

    result = {}
    in_skills = False
    for row_key, row in rows.items():
        label = row.get("c2")
        if not isinstance(label, str):
            continue
        lower = label.lower().strip()
        if lower == "skills development":
            in_skills = True
            continue
        if not in_skills:
            continue
        # Next pillar header ends the Skills block.
        if lower in ("preferential procurement", "supplier development",
                     "enterprise development", "socioeconomic development"):
            break

        raw = row.get("c3")
        if raw is None:
            continue
        try:
            pts = float(raw)
        except (ValueError, TypeError):
            continue

        is_disability = "bilit" in lower or "disabled" in lower
        # The QSE toolkits split learning spend into a general line and a Black
        # FEMALE line (15 + 7 + 3 disabled + 5 absorption = 30). Without excluding
        # "female" here the female line overwrites the general one and the
        # comparison reads learning as 7 against the config's 15.
        is_female = "female" in lower or "women" in lower
        if "expenditure on learning" in lower and not is_disability and not is_female:
            result["learning_pts"] = pts
        elif "expenditure on learning" in lower and is_female and not is_disability:
            result["bursary_pts"] = pts
        elif "expenditure on learning" in lower and is_disability:
            result["disabled_pts"] = pts
        elif "unemployed" in lower and "absorption" not in lower:
            result["unemployed_pts"] = pts
        elif "participating in learnership" in lower or "number of black" in lower:
            result["learnership_pts"] = pts
        elif "absorption" in lower:
            result["absorption_pts"] = pts

    return result


def find_points_column(rows):
    """Column key holding the TARGET points, located from the sheet's own header.

    Each scorecard sheet puts Points in a different column (Procurement c3,
    MC c6, Skills c6, ESD c5) and the layout differs between the six Empowered
    toolkits, so hardcoding a column silently reads the wrong one — that is how
    Procurement came to report "0.15 points" (the 15% TARGET) for the QSE row.

    Every sheet lays out Target | Actual | Gap | Prior Year, each with its own
    "Points" column, so the FIRST header cell equal to "Points" is the target.
    """
    best = None
    for row in rows.values():
        for col, val in row.items():
            if isinstance(val, str) and val.strip().lower() == "points":
                idx = int(col[1:]) if col[1:].isdigit() else 9999
                if best is None or idx < best[0]:
                    best = (idx, col)
    return best[1] if best else None


def row_text(row, *cols):
    """Lowercased label text for a row, joined across candidate label columns."""
    parts = []
    for c in cols:
        v = row.get(c)
        if isinstance(v, str):
            parts.append(v)
    return " ".join(parts).lower().strip()


def is_bonus_header(text):
    """True for the toolkit's own 'Bonus' section divider.

    The Empowered toolkits separate base from bonus with a labelled divider row
    (Procurement "Bonus:", ESD "Bonus"). Everything below it is bonus — which is
    exactly the base/bonus separation our scorecard has to reproduce.
    """
    return text.rstrip(":").strip() == "bonus"


def extract_skills_points(data):
    """Extract Skills scorecard criterion points."""
    sheet_name, rows = find_sheet(data, "Skills Scorecard")
    if not rows:
        return {}

    pts_col = find_points_column(rows) or "c6"
    result = {}
    for row_key, row in rows.items():
        lower = row_text(row, "c2", "c3")
        raw = row.get(pts_col)
        if not lower:
            continue

        if raw is not None:
            try:
                pts = float(raw)
            except (ValueError, TypeError):
                continue

            # Match on "bilit", not "disabled". The toolkits write "Black people
            # living with disbilities" — a TYPO, missing the 'a' (the MC sheet has
            # "diabilities", missing the 's'). Any test spelling the word
            # correctly misses the row, so the disability line falls through to
            # the general learning-programmes slot and overwrites it. That is the
            # ICT "Learning Programmes 0 vs 8" and the AgriBEE "4 vs 8".
            is_disability = "bilit" in lower or "living with" in lower
            if "expenditure on learning" in lower and not is_disability:
                result["learning_pts"] = pts
            elif "expenditure on learning" in lower and is_disability:
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

    pts_col = find_points_column(rows) or "c3"
    result = {}
    in_bonus = False
    base_total = 0.0
    bonus_total = 0.0
    for row_key, row in rows.items():
        lower = row_text(row, "c2")
        raw = row.get(pts_col)
        if not lower:
            continue
        if is_bonus_header(lower):
            in_bonus = True
            continue

        if raw is not None:
            try:
                pts = float(raw)
            except (ValueError, TypeError):
                continue

            is_total = "grand total" in lower or lower == "total"
            if not is_total:
                if in_bonus:
                    bonus_total += pts
                else:
                    base_total += pts

            if "empowering supplier" in lower and "qse" not in lower and "eme" not in lower and "51%" not in lower and "30%" not in lower and "designated" not in lower:
                result["all_pts"] = pts
            elif "qse" in lower:
                result["qse_pts"] = pts
            elif "eme" in lower:
                result["eme_pts"] = pts
            # "designated group" MUST be tested before "51%": the designated-group
            # bonus row reads "…at least 51% black owned designated group
            # suppliers", so a "51%" test first captures the bonus row and
            # overwrites the real BO51 line (reporting BO51 = 2 instead of 11).
            elif "designated group" in lower:
                result["dg_pts"] = pts
            elif "51%" in lower or "51% black" in lower:
                result["bo51_pts"] = pts
            elif "30%" in lower or "black female" in lower or "black women" in lower:
                result["bwo30_pts"] = pts
            elif is_total:
                result["grand_total"] = pts

    result["base_total"] = base_total
    result["bonus_total"] = bonus_total
    return result


def extract_esd_points(data):
    """Extract ESD scorecard criterion points."""
    result = {}
    sheet_name, rows = find_sheet(data, "ESD Scorecard")
    if rows:
        pts_col = find_points_column(rows) or "c5"
        in_bonus = False
        base_total = 0.0
        bonus_total = 0.0
        for row_key, row in rows.items():
            lower = row_text(row, "c2")
            raw = row.get(pts_col)
            if not lower:
                continue
            if is_bonus_header(lower):
                in_bonus = True
                continue
            if raw is not None:
                try:
                    pts = float(raw)
                except (ValueError, TypeError):
                    continue

                is_total = "grand total" in lower or lower == "total"
                if not is_total:
                    if in_bonus:
                        bonus_total += pts
                    else:
                        base_total += pts

                if "supplier development" in lower and "enterprise" not in lower:
                    result["sd_pts"] = pts
                elif "enterprise development" in lower and "supplier" not in lower:
                    result["ed_pts"] = pts
                elif "graduation" in lower:
                    result["grad_bonus"] = pts
                elif "creation" in lower and "job" in lower:
                    result["jobs_bonus"] = pts
        result["base_total"] = base_total
        result["bonus_total"] = bonus_total

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



def verdict(sector_key, table, label, excel_val, cb_val, discrepancies):
    """YES / **NO** / GAZETTE, recording a discrepancy only for a real **NO**.

    A GAZETTE row is a deliberate divergence from the toolkit (see
    TEMPLATE_TENSION) — reported, but never counted as a defect.
    """
    if excel_val == cb_val:
        return "YES"
    reason = TEMPLATE_TENSION.get((sector_key, table, label))
    if reason:
        return "GAZETTE"
    discrepancies.append(f"  - {label}: Excel={excel_val}, Code={cb_val}")
    return "**NO**"


def compare_sector(sector_key):
    data = load_json(sector_key)
    if not data:
        return f"### {SECTORS[sector_key]['label']}\n\n**ERROR**: Could not load extracted JSON.\n\n"

    cb = codebase_values(sector_key)
    lines = []
    lines.append(f"### {SECTORS[sector_key]['label']}")
    lines.append("")

    summary = extract_summary_pillar_points(data)
    # Summary values win where present — see extract_mc_from_summary.
    mc_data = {**extract_mc_points(data), **extract_mc_from_summary(data)}
    # Summary values win where present — see extract_skills_from_summary.
    skills_data = {**extract_skills_points(data), **extract_skills_from_summary(data)}
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
            match = verdict(sector_key, "summary", label, excel_val, cb_val, discrepancies)
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
            # Now separable from Senior (all three bands share a c4 label), so
            # they can finally be compared rather than silently skipped.
            ("Middle", "middle_pts", "mc_middle_pts"),
            ("Middle BW", "middle_bw_pts", "mc_middle_bw_pts"),
            ("Junior", "junior_pts", "mc_junior_pts"),
            ("Junior BW", "junior_bw_pts", "mc_junior_bw_pts"),
            ("Disabled", "disabled_pts", "ee_disabled_pts"),
        ]
        for label, excel_key, cb_key in mc_map:
            excel_val = mc_data.get(excel_key)
            cb_val = cb.get(cb_key)
            if excel_val is not None and cb_val is not None:
                match = verdict(sector_key, "mc", label, excel_val, cb_val, discrepancies)
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
                match = verdict(sector_key, "skills", label, excel_val, cb_val, discrepancies)
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
            # NOT compared for FSC: the toolkit lists three separate 2-pt bonus
            # rows (intermediated professionals, stock brokers, designated group)
            # whose combined award the toolkit CAPS at 4 — its PP pillar header is
            # 24, not 20 base + 6. Our config models that cap as a single
            # dgMaxPts: 4, so comparing it against the toolkit's 2-pt DG row
            # reports a difference that does not exist; the pillar totals agree.
            ("Designated Group", "dg_pts", "pp_dg_pts"),
        ]
        if sector_key.startswith("FSC"):
            pp_map = [m for m in pp_map if m[0] != "Designated Group"]
        for label, excel_key, cb_key in pp_map:
            excel_val = pp_data.get(excel_key)
            cb_val = cb.get(cb_key)
            if excel_val is not None and cb_val is not None:
                match = verdict(sector_key, "pp", label, excel_val, cb_val, discrepancies)
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


def reachable_table():
    """Per-sector element weighting vs bonus vs maximum reachable score.

    The Codes state an element's weighting and its bonus points separately, and
    bonus is earned ON TOP of the weighting — so the highest attainable score can
    exceed the target. Transport QSE is the clearest case: target 100, reachable
    107, which is how a certificate reports 102 out of 100.
    """
    live = load_live_dump()
    if not live:
        return ""
    rows = [
        "## Target vs maximum reachable (live `sectorConfig.ts`)",
        "",
        "| Sector | Target (denominator) | Bonus available | Max reachable |",
        "|--------|---------------------:|----------------:|--------------:|",
    ]
    for name, v in live.items():
        target = v.get("totalMaxPoints")
        reach = v.get("reachableMax")
        bonus = v.get("bonusAvailable", 0)
        flag = " **← bonus lifts above target**" if isinstance(reach, (int, float)) and isinstance(target, (int, float)) and reach > target else ""
        rows.append(f"| {name} | {target} | {bonus} | {reach}{flag} |")
    rows += [
        "",
        "Where target == reachable the sector's `totalMaxPoints` already includes its "
        "bonus points; the split still matters per element, because an entity on full "
        "base points must read 100% of that element rather than short of a merged cap.",
        "",
        "---",
        "",
    ]
    return "\n".join(rows)


def main():
    output = [reachable_table()]
    for sector_key in SECTORS:
        output.append(compare_sector(sector_key))

    result = "\n".join(output)
    out_path = os.path.join(TOOLKIT_DIR, "comparison_output.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"Wrote comparison to: {out_path}")
    # The console on this machine is cp1252; any non-latin-1 char in the report
    # (e.g. the "<-" arrow, en dashes) raises UnicodeEncodeError and exits 1 even
    # though the file wrote correctly as UTF-8. Echo defensively.
    enc = sys.stdout.encoding or "utf-8"
    sys.stdout.write(result[:5000].encode(enc, errors="replace").decode(enc))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
