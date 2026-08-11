"""
Build the 3-page Okiru sector reference PDF.

Every number is read from docs/toolkits/live_sector_config.json, which is dumped
straight out of apps/api/pipeline/sectorConfig.ts by
apps/web/src/__tests__/liveSectorConfigDump.harness.test.ts. Nothing here is
hand-typed — a hand-copied table is precisely how docs/toolkits/compare_all.py
came to claim RCOGP QSE was 124 points long after the engine moved to 108.

Regenerate:
  cd apps/web && SECTOR_DUMP=../../docs/toolkits/live_sector_config.json \
    npx vitest run src/__tests__/liveSectorConfigDump.harness.test.ts --pool=forks
  python scripts/build_sector_reference_pdf.py
"""
import json
import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUMP = os.path.join(ROOT, "docs", "toolkits", "live_sector_config.json")
OUT = os.path.join(ROOT, "docs", "Okiru-Sector-Configuration-Reference.pdf")

# ---------------------------------------------------------------------------
# Design tokens — three layers: primitive -> semantic -> component.
# Nothing below the primitive layer names a raw colour, so a brand change is a
# one-line edit rather than a search-and-replace through the layout code.
#
# The primitives are Okiru's own, read off the live application stylesheet
# (apps/web/src/index.css and the built CSS served by okiru.pro) rather than
# invented — the greys are the Toolkit's surface scale, the amber is already the
# colour the app uses for bonus badges, so this document and the product agree.
# ---------------------------------------------------------------------------

# -- Primitive ---------------------------------------------------------------
P = {
    "green_500": colors.HexColor("#00bb7f"),   # Okiru accent
    "amber_500": colors.HexColor("#f99c00"),   # app's bonus / attention colour
    "amber_050": colors.HexColor("#fdf6ea"),   # derived tint for banded rows
    "neutral_950": colors.HexColor("#0d0d0d"),
    "neutral_800": colors.HexColor("#2c2c2e"),
    "neutral_500": colors.HexColor("#636366"),
    "neutral_400": colors.HexColor("#8e8e93"),
    "neutral_200": colors.HexColor("#d1d1d6"),
    "neutral_100": colors.HexColor("#e8e9ec"),
    "neutral_050": colors.HexColor("#f5f5f5"),
    "white": colors.HexColor("#ffffff"),
}

# -- Semantic ----------------------------------------------------------------
S = {
    "text": P["neutral_950"],
    "text_muted": P["neutral_500"],
    "text_subtle": P["neutral_400"],
    "accent": P["green_500"],
    "bonus": P["amber_500"],
    "bonus_surface": P["amber_050"],
    "surface_subtle": P["neutral_050"],
    "surface_zebra": colors.HexColor("#fafafa"),
    "border": P["neutral_200"],
    "border_soft": P["neutral_100"],
}

# -- Component ---------------------------------------------------------------
C = {
    "table_header_bg": S["surface_subtle"],
    "table_header_text": S["text"],
    "table_rule": S["border_soft"],
    "table_rule_strong": S["border"],
    "table_zebra": S["surface_zebra"],
    "row_highlight_bg": S["bonus_surface"],
    "row_highlight_text": S["bonus"],
    "title_rule": S["accent"],
    "footer_text": S["text_muted"],
    "footer_rule": S["border"],
}

# -- Type scale (points, print) ----------------------------------------------
T = {"display": 17, "heading": 10.5, "body": 8.2, "table": 7.6, "small": 7.4, "micro": 7}

# -- Spacing scale (points) --------------------------------------------------
SP = {"xs": 2, "sm": 3, "md": 4, "lg": 6, "xl": 8}

# Back-compat aliases used by the layout code below.
INK, MUTED, RULE, BAND = S["text"], S["text_muted"], C["table_rule"], C["table_header_bg"]
ACCENT, BONUS, BONUS_BG = S["accent"], S["bonus"], S["bonus_surface"]

# Display order and short labels. Construction is kept last: it runs a separate
# engine (constructionScoring) with a combined ESD element.
SECTORS = [
    ("RCOGP_GENERIC", "RCOGP Generic"),
    ("RCOGP_QSE", "RCOGP QSE"),
    ("ICT_GENERIC", "ICT Generic"),
    ("ICT_QSE", "ICT QSE"),
    ("AGRI_GENERIC", "AgriBEE"),
    ("FSC_GENERIC", "FSC Others"),
    ("FSC_QSE", "FSC QSE"),
    ("FSC_BANKS", "FSC Banks"),
    ("FSC_LTI", "FSC Long-Term"),
    ("FSC_STI", "FSC Short-Term"),
    ("TRANSPORT_GENERIC", "Transport Large"),
    ("TRANSPORT_QSE", "Transport QSE"),
    ("CONSTRUCTION_QSE", "Constr. QSE"),
    ("CONSTRUCTION_CONTRACTOR", "Constr. Contractor"),
    ("CONSTRUCTION_BEP", "Constr. BEP"),
]

PILLARS = [
    ("ownership", "Own"),
    ("managementControl", "MC"),
    ("employmentEquity", "EE"),
    ("skillsDevelopment", "Skills"),
    ("preferentialProcurement", "PP"),
    ("supplierDevelopment", "SD"),
    ("enterpriseDevelopment", "ED"),
    ("socioEconomicDevelopment", "SED"),
]

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontName="Helvetica-Bold",
                    fontSize=T["display"], leading=T["display"] * 1.18, textColor=S["text"],
                    alignment=TA_LEFT, spaceAfter=SP["xs"] / 2)
SUB = ParagraphStyle("SUB", parent=styles["Normal"], fontName="Helvetica",
                     fontSize=T["body"] + 0.3, leading=T["body"] * 1.34,
                     textColor=S["text_muted"], spaceAfter=SP["md"])
H2 = ParagraphStyle("H2", parent=styles["Normal"], fontName="Helvetica-Bold",
                    fontSize=T["heading"], leading=T["heading"] * 1.24, textColor=S["text"],
                    spaceBefore=SP["xl"], spaceAfter=SP["sm"])
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontName="Helvetica",
                      fontSize=T["body"], leading=T["body"] * 1.34, textColor=S["text"])
SMALL = ParagraphStyle("SMALL", parent=BODY, fontSize=T["small"],
                       leading=T["small"] * 1.3, textColor=S["text_muted"])
CELL = ParagraphStyle("CELL", parent=BODY, fontSize=T["small"], leading=T["small"] * 1.22)


class AccentRule(Flowable):
    """Short brand rule under the page title — the one piece of Okiru green."""

    def __init__(self, width=26 * mm, thickness=2.2):
        super().__init__()
        self.width, self.thickness = width, thickness
        self.height = thickness

    def draw(self):
        self.canv.setFillColor(C["title_rule"])
        self.canv.rect(0, 0, self.width, self.thickness, stroke=0, fill=1)


def n(v):
    """Render a points value without trailing .0 noise (12.5 stays 12.5)."""
    if v is None:
        return "-"
    return str(int(v)) if float(v) == int(v) else f"{float(v):g}"


def load():
    with open(DUMP, encoding="utf-8") as f:
        return json.load(f)


def header(story, title, subtitle):
    story.append(Paragraph(title, H1))
    story.append(Spacer(1, SP["xs"]))
    story.append(AccentRule())
    story.append(Spacer(1, SP["sm"]))
    story.append(Paragraph(subtitle, SUB))


def base_table_style(ncols, header_bg=None):
    return TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", T["table"]),
        ("FONT", (0, 1), (-1, -1), "Helvetica", T["table"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), C["table_header_text"]),
        ("BACKGROUND", (0, 0), (-1, 0), header_bg or C["table_header_bg"]),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, C["table_rule_strong"]),
        ("GRID", (0, 0), (-1, -1), 0.25, C["table_rule"]),
        ("TOPPADDING", (0, 0), (-1, -1), SP["sm"]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), SP["sm"]),
        ("LEFTPADDING", (0, 0), (-1, -1), SP["md"]),
        ("RIGHTPADDING", (0, 0), (-1, -1), SP["md"]),
    ])


# ---------------------------------------------------------------- page 1
def page_pillar_matrix(story, data):
    header(
        story,
        "Okiru B-BBEE Sector Configuration - Pillar Weightings",
        f"Element weightings per scorecard, as implemented in apps/api/pipeline/sectorConfig.ts. "
        f"Generated {date.today().isoformat()} from the live configuration.",
    )

    head = ["Scorecard"] + [lbl for _, lbl in PILLARS] + ["Other", "Total"]
    rows = [head]
    shaded = []
    for i, (key, label) in enumerate(SECTORS, start=1):
        v = data.get(key)
        if not v:
            continue
        pil = v["pillars"]
        row = [label]
        for pkey, _ in PILLARS:
            p = pil.get(pkey)
            row.append(n(p["max"]) if p and p["max"] > 0 else "-")
        # Anything outside the eight standard elements (FSC's EF / AFS, YES),
        # derived so the row always adds up to the published total.
        standard = sum(pil[k]["max"] for k, _ in PILLARS if k in pil)
        other_total = v["totalMaxPoints"] - standard
        row.append(n(other_total) if other_total > 0 else "-")
        # Elective scorecards measure a subset, so the row deliberately does not
        # add up to the total — flagged rather than left looking like an error.
        total_cell = n(v["totalMaxPoints"])
        if v.get("electiveGroupSizes"):
            total_cell += " *"
        row.append(total_cell)
        rows.append(row)
        if i % 2 == 0:
            shaded.append(i)

    t = Table(rows, colWidths=[36 * mm] + [16 * mm] * len(PILLARS) + [16 * mm, 18 * mm],
              repeatRows=1, hAlign="LEFT")
    st = base_table_style(len(head))
    st.add("FONT", (-1, 1), (-1, -1), "Helvetica-Bold", T["table"])
    for r in shaded:
        st.add("BACKGROUND", (0, r), (-1, r), C["table_zebra"])
    t.setStyle(st)
    story.append(t)

    story.append(Paragraph("Reading this table", H2))
    story.append(Paragraph(
        "<b>Own</b> Ownership &nbsp;|&nbsp; <b>MC</b> Management Control &nbsp;|&nbsp; "
        "<b>EE</b> Employment Equity &nbsp;|&nbsp; <b>Skills</b> Skills Development &nbsp;|&nbsp; "
        "<b>PP</b> Preferential Procurement &nbsp;|&nbsp; <b>SD</b> Supplier Development &nbsp;|&nbsp; "
        "<b>ED</b> Enterprise Development &nbsp;|&nbsp; <b>SED</b> Socio-Economic Development. "
        "<b>Other</b> covers elements outside the standard eight - the FSC family's Empowerment Financing "
        "and Access to Financial Services, and the YES initiative.", BODY))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "A dash means the element does not exist on that scorecard, not that it is worth zero. The 2013 "
        "Amended Codes cut the scorecard from seven elements to five and folded Employment Equity into "
        "Management Control, so only Transport - whose code predates that amendment (GG 32511, 2009) - "
        "still reports the two separately.", SMALL))
    story.append(Spacer(1, SP["xs"]))
    story.append(Paragraph(
        "Two columns need a caveat. Transport has no Supplier Development element: <b>Transport Large's 15 "
        "points under SD are gazetted as Enterprise Development</b> (3% of NPAT) and occupy the SD slot only "
        "as an implementation detail. Construction combines Supplier and Enterprise Development into a "
        "single ESD element, shown under SD, and is scored by a separate engine.", SMALL))
    story.append(Spacer(1, 3))
    story.append(Paragraph(
        "<b>*</b> An elective scorecard measures only a subset of its elements, so the row does not add up "
        "to the total. Transport QSE lists all seven elements at 25 each but measures any four - a "
        "100-point denominator. See page 3, section 4.", SMALL))
    story.append(Spacer(1, 6))

    # Sub-minimums are a scoring rule, but they belong beside the weightings.
    story.append(Paragraph("Priority elements and sub-minimums", H2))
    # Grouped: most scorecards share the same set, so listing all fifteen wasted
    # a third of the page and pushed the document to four pages.
    groups: dict[tuple, list[str]] = {}
    for key, label in SECTORS:
        v = data.get(key)
        if not v:
            continue
        subs = tuple(lbl for pk, lbl in PILLARS
                     if (p := v["pillars"].get(pk)) and p.get("subMinPercent"))
        pcts = tuple(sorted({p["subMinPercent"] for pk, _ in PILLARS
                             if (p := v["pillars"].get(pk)) and p.get("subMinPercent")}))
        groups.setdefault((subs, pcts), []).append(label)

    sub_rows = [["Elements carrying a sub-minimum", "Threshold", "Applies to"]]
    for (subs, pcts), labels in groups.items():
        sub_rows.append([
            Paragraph(", ".join(subs) if subs else
                      "<font color='#636366'>none configured</font>", CELL),
            f"{n(pcts[0])}% of the element" if len(pcts) == 1 else
            (", ".join(f"{n(x)}%" for x in pcts) if pcts else "-"),
            Paragraph(", ".join(labels), CELL),
        ])
    st2 = Table(sub_rows, colWidths=[62 * mm, 34 * mm, 136 * mm], repeatRows=1, hAlign="LEFT")
    style2 = base_table_style(3)
    style2.add("ALIGN", (0, 0), (0, -1), "LEFT")
    style2.add("ALIGN", (2, 0), (2, -1), "LEFT")
    st2.setStyle(style2)
    story.append(st2)
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Missing a sub-minimum discounts the final B-BBEE level by one, applied once no matter how many "
        "are missed.", SMALL))


# ---------------------------------------------------------------- page 2
def page_base_bonus(story, data):
    header(
        story,
        "Base Weighting, Bonus Points and Maximum Reachable Score",
        "The Codes state an element's weighting and its bonus points separately. Bonus is earned ON TOP of "
        "the weighting, so a score can exceed the target.",
    )

    rows = [["Scorecard", "Target\n(denominator)", "Bonus\navailable", "Max\nreachable",
             "Elements carrying bonus (base + bonus)"]]
    for key, label in SECTORS:
        v = data.get(key)
        if not v:
            continue
        detail = []
        for pk, plbl in PILLARS:
            p = v["pillars"].get(pk)
            if p and p.get("bonus", 0) > 0:
                detail.append(f"{plbl} {n(p['base'])}+{n(p['bonus'])}")
        rows.append([
            label,
            n(v["totalMaxPoints"]),
            n(v["bonusAvailable"]) if v["bonusAvailable"] else "-",
            n(v["reachableMax"]),
            Paragraph("&nbsp;&nbsp;".join(detail) if detail else
                      "<font color='#636366'>no bonus points on this scorecard</font>", CELL),
        ])

    t = Table(rows, colWidths=[36 * mm, 26 * mm, 22 * mm, 22 * mm, 126 * mm],
              repeatRows=1, hAlign="LEFT")
    st = base_table_style(5)
    st.add("ALIGN", (4, 0), (4, -1), "LEFT")
    st.add("VALIGN", (0, 1), (-1, -1), "MIDDLE")
    # Transport QSE is the one scorecard whose reachable max exceeds its target.
    for i, (key, _) in enumerate(SECTORS, start=1):
        v = data.get(key)
        if v and v["reachableMax"] > v["totalMaxPoints"]:
            st.add("BACKGROUND", (0, i), (-1, i), C["row_highlight_bg"])
            st.add("TEXTCOLOR", (3, i), (3, i), C["row_highlight_text"])
            st.add("FONT", (3, i), (3, i), "Helvetica-Bold", T["table"])
    t.setStyle(st)
    story.append(t)

    story.append(Paragraph("Why target and reachable usually match", H2))
    story.append(Paragraph(
        "For most scorecards the gazetted total already includes the bonus points, so target and reachable "
        "are the same number. <b>Transport QSE is the exception</b>: it measures any four of seven elements "
        "at 25 points each, giving a flat 100-point denominator, and its ownership, management control and "
        "employment equity bonuses sit on top - a maximum of 107. This is why a Transport QSE certificate "
        "can legitimately report a score above 100.", BODY))
    story.append(Spacer(1, 3))
    story.append(Paragraph(
        "The split still matters on every other scorecard. An entity that earns all 20 base points of RCOGP "
        "Skills has achieved 100% of that element even though the element caps at 25 - reporting it as 20/25 "
        "understates performance against the gazette.", BODY))

    story.append(Paragraph("Where the bonus points sit", H2))
    story.append(Paragraph(
        "<b>Skills Development</b> - absorption of learners after their programme (5 points; 3 in the FSC "
        "family).&nbsp;&nbsp; <b>Preferential Procurement</b> - spend with designated-group suppliers (1-4 "
        "points; the FSC family combines three bonus rows under a 4-point cap).&nbsp;&nbsp; "
        "<b>Enterprise Development</b> - graduation of beneficiaries, jobs created, and for FSC support of "
        "black stockbrokers (2-4 points).&nbsp;&nbsp; <b>Transport</b> - black-women ownership and ESOP "
        "participation, black women in top management, and meeting EAP in every band.", BODY))


# ---------------------------------------------------------------- page 3
def page_rules(story, data):
    header(
        story,
        "Scoring Rules - How Points Are Calculated",
        "The mechanics applied by the engine, common to every sector unless stated.",
    )

    story.append(Paragraph("1. Indicator scoring", H2))
    story.append(Paragraph(
        "Each indicator scores pro-rata against its target: <b>points = (actual / target) x weighting</b>, "
        "capped at the weighting. An entity at half its target earns half the points; exceeding the target "
        "earns no more than the weighting. Element scores are the sum of their indicators, capped at the "
        "element's maximum. Bonus indicators score the same way but are added on top of the weighting.", BODY))

    story.append(Paragraph("2. Recognition of procurement spend", H2))
    story.append(Paragraph(
        "Supplier spend is recognised at the supplier's B-BBEE recognition level, not rand-for-rand: "
        "Level 1 counts 135%, Level 2 125%, Level 3 110%, Level 4 100%, Level 5 80%, Level 6 60%, "
        "Level 7 50%, Level 8 10%, non-compliant 0%.", BODY))

    story.append(Paragraph("3. Sub-minimums and discounting", H2))
    story.append(Paragraph(
        "Priority elements carry a sub-minimum - typically 40% of the element, measured on the base "
        "weighting and excluding bonus points. Missing any one discounts the final level by one, applied "
        "once regardless of how many are missed. Sub-minimums per scorecard are listed on page 1.", BODY))

    story.append(Paragraph("4. Elective elements", H2))
    elective = [(k, l) for k, l in SECTORS
                if (v := data.get(k)) and v.get("electiveGroupSizes")]
    if elective:
        names = ", ".join(l for _, l in elective)
        sizes = {k: data[k]["electiveGroupSizes"] for k, _ in elective}
        first = list(sizes.values())[0]
        cnt = list(first.values())[0] if first else 0
        story.append(Paragraph(
            f"<b>{names}</b> does not measure every element. It measures <b>any {cnt} of its seven</b>, each "
            "weighted 25, and the engine selects the best-scoring four. Elements not selected are excluded "
            "from both the score and the denominator.", BODY))
    else:
        story.append(Paragraph("No elective scorecards configured.", BODY))

    story.append(Paragraph("5. Level ladders", H2))
    ladders = {}
    for key, label in SECTORS:
        v = data.get(key)
        if not v or not v.get("levels"):
            continue
        sig = tuple((l["level"], l["min"]) for l in v["levels"])
        ladders.setdefault(sig, []).append(label)

    lrows = [["Applies to", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"]]
    for sig, labels in ladders.items():
        mins = {lvl: m for lvl, m in sig}
        lrows.append([Paragraph(", ".join(labels), CELL)] +
                     [n(mins.get(i)) if mins.get(i) is not None else "-" for i in range(1, 9)])
    lt = Table(lrows, colWidths=[104 * mm] + [16 * mm] * 8, repeatRows=1, hAlign="LEFT")
    lst = base_table_style(9)
    lst.add("ALIGN", (0, 0), (0, -1), "LEFT")
    lt.setStyle(lst)
    story.append(lt)
    story.append(Spacer(1, 3))
    story.append(Paragraph(
        "Minimum points required for each level. Levels are assessed on absolute points, so a scorecard "
        "whose bonus lifts it above the denominator keeps the excess.", SMALL))

    story.append(Paragraph("6. Deemed levels", H2))
    story.append(Paragraph(
        "An EME (turnover below the sector threshold) is deemed Level 4 on affidavit; at 51% black ownership "
        "it is deemed Level 2 and at 100% Level 1. A QSE at 51% black ownership is deemed Level 2, at 100% "
        "Level 1. A deemed level is a floor - the better of deemed and scored applies, and discounting "
        "cannot drag an entity below it. Transport is excluded: the 2009 Transport Code has no deeming "
        "provision and Transport QSEs are scored on points.", BODY))

    story.append(Spacer(1, 5))
    story.append(Paragraph(
        "Generated from the live engine configuration. Figures reflect apps/api/pipeline/sectorConfig.ts "
        "at the date shown and are verified against the sector toolkits by docs/toolkits/compare_all.py. "
        "Where the engine differs from a toolkit it follows the gazette - see docs/toolkits/TOOLKIT_BENCHMARK.md.",
        SMALL))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", T["micro"])
    canvas.setFillColor(C["footer_text"])
    w, _ = landscape(A4)
    canvas.drawString(18.5 * mm, 8 * mm, "Okiru - B-BBEE Sector Configuration Reference")
    canvas.drawRightString(w - 14 * mm, 8 * mm, f"Page {doc.page} of 3")
    canvas.setStrokeColor(C["footer_rule"])
    canvas.setLineWidth(0.4)
    canvas.line(14 * mm, 11.5 * mm, w - 14 * mm, 11.5 * mm)
    # Brand tick, matching the accent rule under each page title.
    canvas.setFillColor(C["title_rule"])
    canvas.rect(14 * mm, 7.6 * mm, 2.6 * mm, 2.2, stroke=0, fill=1)
    canvas.restoreState()


def main():
    data = load()
    doc = SimpleDocTemplate(
        OUT, pagesize=landscape(A4),
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=16 * mm,
        title="Okiru B-BBEE Sector Configuration Reference",
        author="Okiru", subject="Sector weightings, bonus points and scoring rules",
    )
    story = []
    page_pillar_matrix(story, data)
    story.append(PageBreak())
    page_base_bonus(story, data)
    story.append(PageBreak())
    page_rules(story, data)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
