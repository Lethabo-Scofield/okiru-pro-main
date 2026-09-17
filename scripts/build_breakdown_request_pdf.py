"""
Build the "indicator breakdowns we still need" request PDF for Zoleka.

The gap list is COMPUTED from docs/toolkits/live_sector_config.json, not typed by
hand: a pillar counts as itemised when the enriched config carries subElements
that sum to its weighting. Construction is excluded because its detail lives in
constructionIndicators.ts (25 / 52 / 49 indicators summing to 110 / 123 / 123)
rather than in subElements, and asking for it would waste her time.

Regenerate:
  cd apps/web && SECTOR_DUMP=../../docs/toolkits/live_sector_config.json \
    npx vitest run src/__tests__/liveSectorConfigDump.harness.test.ts --pool=forks
  python scripts/build_breakdown_request_pdf.py
"""
import json
import os
from datetime import date

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table

# Reuse the reference document's tokens so both share one visual language.
from build_sector_reference_pdf import (  # noqa: E402
    AccentRule, BODY, C, CELL, H1, H2, SMALL, SP, T,
    base_table_style, n,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUMP = os.path.join(ROOT, "docs", "toolkits", "live_sector_config.json")
OUT = os.path.join(ROOT, "docs", "Okiru-Indicator-Breakdowns-Requested.pdf")

LABEL = {
    "RCOGP_GENERIC": "RCOGP Generic", "RCOGP_QSE": "RCOGP QSE",
    "ICT_GENERIC": "ICT Generic", "ICT_QSE": "ICT QSE",
    "AGRI_GENERIC": "AgriBEE", "FSC_GENERIC": "FSC Others",
    "FSC_QSE": "FSC QSE", "FSC_BANKS": "FSC Banks",
    "FSC_LTI": "FSC Long-Term", "FSC_STI": "FSC Short-Term",
    "MAC_GENERIC": "MAC Generic", "MAC_QSE": "MAC QSE",
    "TRANSPORT_GENERIC": "Transport (Road Freight) Large",
    "TRANSPORT_QSE": "Transport (Road Freight) QSE",
    "CONSTRUCTION_QSE": "Construction QSE",
    "CONSTRUCTION_CONTRACTOR": "Construction Contractor",
    "CONSTRUCTION_BEP": "Construction BEP",
}

PILLAR_LABEL = {
    "ownership": "Ownership",
    "managementControl": "Management Control",
    "employmentEquity": "Employment Equity",
    "skillsDevelopment": "Skills Development",
    "preferentialProcurement": "Preferential Procurement",
    "supplierDevelopment": "Supplier Development",
    "enterpriseDevelopment": "Enterprise Development",
    "socioEconomicDevelopment": "Socio-Economic Development",
    "responsibleSocialMarketing": "Responsible Social Marketing",
}

# Construction's indicators are held in constructionIndicators.ts, so its pillars
# read as "no subElements" while being fully itemised. Excluded deliberately.
COVERED_ELSEWHERE = {"CONSTRUCTION_QSE", "CONSTRUCTION_CONTRACTOR", "CONSTRUCTION_BEP"}


def footer(canvas, doc):
    """Own footer — the reference document's hardcodes its title and "of 3"."""
    canvas.saveState()
    canvas.setFont("Helvetica", T["micro"])
    canvas.setFillColor(C["footer_text"])
    w, _ = landscape(A4)
    canvas.drawString(18.5 * mm, 8 * mm, "Okiru - Indicator Breakdowns Requested")
    canvas.drawRightString(w - 14 * mm, 8 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(C["footer_rule"])
    canvas.setLineWidth(0.4)
    canvas.line(14 * mm, 11.5 * mm, w - 14 * mm, 11.5 * mm)
    canvas.setFillColor(C["title_rule"])
    canvas.rect(14 * mm, 7.6 * mm, 2.6 * mm, 2.2, stroke=0, fill=1)
    canvas.restoreState()


def gaps(data):
    """Sectors whose pillars carry no itemised indicator rows."""
    out = {}
    for key, v in data.items():
        if key in COVERED_ELSEWHERE:
            continue
        missing = [
            (p, d["max"])
            for p, d in v["pillars"].items()
            if d["max"] > 0 and d["breakdownRows"] == 0
        ]
        if missing:
            out[key] = missing
    return out


def build():
    with open(DUMP, encoding="utf-8") as f:
        data = json.load(f)

    doc = SimpleDocTemplate(
        OUT, pagesize=landscape(A4),
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=10 * mm, bottomMargin=14 * mm,
        title="Okiru - Indicator Breakdowns Requested",
        author="Okiru", subject="Scorecards where Okiru holds pillar totals but no indicator detail",
    )
    story = []
    story.append(Paragraph("Indicator Breakdowns We Still Need", H1))
    story.append(Spacer(1, SP["xs"]))
    story.append(AccentRule())
    story.append(Spacer(1, SP["sm"]))
    story.append(Paragraph(
        f"Prepared for Zoleka Mnanzana, {date.today().isoformat()}. Okiru implements 17 scorecards. For "
        "most of them we hold the individual indicators that make up each element; the scorecards below are "
        "the ones where we have only the element total.", SMALL))

    g = gaps(data)
    total_pillars = sum(len(v) for v in g.values())

    story.append(Paragraph(
        f"1. Scorecards with no indicator detail ({len(g)} scorecards, {total_pillars} elements)", H2))
    story.append(Paragraph(
        "For each element below we have the weighting but not the indicators inside it, so we cannot show a "
        "client how the score was arrived at. What we need per element: each indicator, its points, and its "
        "compliance target.", BODY))
    story.append(Spacer(1, SP["sm"]))

    rows = [["Scorecard", "Total", "Elements needing indicator detail (points)"]]
    for key, missing in g.items():
        detail = ",  ".join(f"{PILLAR_LABEL.get(p, p)} ({n(pts)})" for p, pts in missing)
        rows.append([
            LABEL.get(key, key),
            n(data[key]["totalMaxPoints"]),
            Paragraph(detail, CELL),
        ])
    t = Table(rows, colWidths=[46 * mm, 18 * mm, 205 * mm], repeatRows=1, hAlign="LEFT")
    st = base_table_style(3)
    st.add("ALIGN", (2, 0), (2, -1), "LEFT")
    st.add("VALIGN", (0, 1), (-1, -1), "MIDDLE")
    t.setStyle(st)
    story.append(t)

    story.append(Paragraph("2. Specific questions on scorecards we do hold", H2))
    story.append(Paragraph(
        "These are not missing breakdowns — they are single figures where your correction and our "
        "configuration disagree, or where we could not tell which indicator moves.", BODY))
    story.append(Spacer(1, SP["sm"]))

    q = [
        ["Scorecard", "Question", "What we hold"],
        ["ICT Generic",
         Paragraph("You have Management Control at 12; we have 13. The element total (23) is agreed, so it "
                   "is the split that differs — which indicator moves, and by how much?", CELL),
         Paragraph("Board 3+2, Exec dir 2+1, Other exec 3+2 = 13, plus EE bands 10.", CELL)],
        ["FSC (all)",
         Paragraph("You have MC 8 and EE 12. We hold a collapsed form. Please confirm the indicators and "
                   "points for both halves.", CELL),
         Paragraph("Board 1+1, Exec dir 2+1, Other exec 10+4, Disabled 1 = 20.", CELL)],
        ["FSC Banks / Long-Term / Short-Term",
         Paragraph("Ownership carries 5 bonus points (23 + 5 = 28). We need the five bonus INDICATORS — "
                   "raising the cap without them makes the points unearnable, so we have held off.", CELL),
         Paragraph("Ownership 23, no bonus indicators configured.", CELL)],
        ["MAC (both)",
         Paragraph("The extract gives weightings and targets only. We need the B-BBEE level thresholds, the "
                   "priority elements and their sub-minimums. We have assumed the Amended Codes ladder and "
                   "40% sub-minimums — please confirm or correct.", CELL),
         Paragraph("Generic 124 + 14 bonus; QSE 105 + 10 bonus.", CELL)],
        ["MAC (both)",
         Paragraph("Responsible Social Marketing: how is it evidenced and scored? Generic is 5 points on "
                   "sector-initiative contributions; QSE splits 3 (no adverse RSM ruling) + 2 (attending "
                   "initiatives).", CELL),
         Paragraph("Element carried at 5 pts; not yet scored.", CELL)],
    ]
    qt = Table(q, colWidths=[46 * mm, 125 * mm, 98 * mm], repeatRows=1, hAlign="LEFT")
    qst = base_table_style(3)
    qst.add("ALIGN", (0, 0), (-1, -1), "LEFT")
    qst.add("VALIGN", (0, 1), (-1, -1), "TOP")
    qt.setStyle(qst)
    story.append(qt)

    story.append(Paragraph("3. Already covered — no action needed", H2))
    story.append(Paragraph(
        "<b>Construction (QSE, Contractor, BEP)</b> is fully itemised: 25, 52 and 49 indicators summing "
        "exactly to 110, 123 and 123. The Preferential Procurement and Supplier Development tables you sent "
        "should be checked against the 10 Enterprise &amp; Supplier Development indicators we already hold "
        "rather than supplied again — our element totals (38 Contractor, 30 BEP) already match yours.<br/>"
        "<b>RCOGP, ICT, AgriBEE, FSC Others / Banks / Long-Term / Short-Term and both Transport scorecards</b> "
        "all carry indicator detail that reconciles to the element weighting.", BODY))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"Wrote {OUT}")
    return g


if __name__ == "__main__":
    build()
