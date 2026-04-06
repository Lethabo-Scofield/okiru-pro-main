"""
Analyze extracted scorecard values - find summary scorecard pillar totals
and individual scorecard criteria with targets and max points.
"""
import json
import sys
from pathlib import Path

TOOLKIT_DIR = Path(__file__).parent


def find_summary_pillars(sheets_data):
    """Find pillar names, targets, and max points from Summary Scorecard."""
    for sheet_name, rows in sheets_data.items():
        if "summary" in sheet_name.lower():
            print(f"\n  === {sheet_name} ===")
            for entry in rows:
                cells = entry["cells"]
                vals = list(cells.values())
                if any(isinstance(v, str) and len(v) > 3 for v in vals):
                    row_str = " | ".join(f"c{k}={v}" for k, v in sorted(cells.items()))
                    print(f"    Row {entry['row']}: {row_str}")


def find_pillar_criteria(sheets_data):
    """Find criteria details from individual pillar scorecards."""
    pillar_sheets = {}
    for sheet_name, rows in sheets_data.items():
        sn = sheet_name.lower()
        if "scorecard" in sn and "summary" not in sn and "calc" not in sn:
            pillar_sheets[sheet_name] = rows
        elif sn.strip() == "yes":
            pillar_sheets[sheet_name] = rows

    for sheet_name, rows in pillar_sheets.items():
        print(f"\n  === {sheet_name} ===")
        for entry in rows:
            cells = entry["cells"]
            row_str = " | ".join(f"c{k}={v}" for k, v in sorted(cells.items()))
            print(f"    Row {entry['row']}: {row_str}")


def find_industry_norms(sheets_data):
    """Extract industry norms table."""
    for sheet_name, rows in sheets_data.items():
        if "norm" in sheet_name.lower():
            print(f"\n  === {sheet_name} ===")
            for entry in rows:
                cells = entry["cells"]
                row_str = " | ".join(f"c{k}={v}" for k, v in sorted(cells.items()))
                print(f"    Row {entry['row']}: {row_str}")


def find_eap(sheets_data):
    """Extract EAP data."""
    for sheet_name, rows in sheets_data.items():
        if "eap" in sheet_name.lower():
            print(f"\n  === {sheet_name} ===")
            for entry in rows[:30]:
                cells = entry["cells"]
                row_str = " | ".join(f"c{k}={v}" for k, v in sorted(cells.items()))
                print(f"    Row {entry['row']}: {row_str}")


def main():
    files = sorted(TOOLKIT_DIR.glob("extracted_*.json"))
    if not files:
        print("No extracted files found")
        return

    for fp in files:
        name = fp.stem.replace("extracted_", "")
        print(f"\n{'='*70}")
        print(f" {name}")
        print(f"{'='*70}")

        with open(fp) as f:
            data = json.load(f)

        for toolkit_key, toolkit_data in data.items():
            if "error" in toolkit_data:
                print(f"  ERROR: {toolkit_data['error']}")
                continue

            print(f"\n  File: {toolkit_data['file']}")
            print(f"  Sheets: {toolkit_data['sheet_count']}")
            sheets = toolkit_data.get("extracted_sheets", {})

            print(f"\n  --- SUMMARY SCORECARD ---")
            find_summary_pillars(sheets)

            print(f"\n  --- PILLAR SCORECARDS ---")
            find_pillar_criteria(sheets)

            print(f"\n  --- INDUSTRY NORMS ---")
            find_industry_norms(sheets)

            if "--eap" in sys.argv:
                print(f"\n  --- EAP ---")
                find_eap(sheets)


if __name__ == "__main__":
    main()
