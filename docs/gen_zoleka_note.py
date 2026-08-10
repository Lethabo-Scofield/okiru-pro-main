# -*- coding: utf-8 -*-
"""Render the Construction Phase-1 Inputs validation request as a PDF for Zoleka.

Framing: the indicators / weights / targets are ALREADY verified (her signed PDF).
The new template columns are input fields that feed those verified indicators.
Only the CALCULATION METHOD needs her sign-off.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)

NAVY = colors.HexColor("#1f3a5f")
BLUE = colors.HexColor("#2e5e9e")
LIGHT = colors.HexColor("#eef3fa")
GREEN = colors.HexColor("#1d7a4d")
GREENBG = colors.HexColor("#eaf6ef")
GREY = colors.HexColor("#6b7280")
TICK = colors.HexColor("#fafbfd")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=18.5, textColor=NAVY, spaceAfter=2, leading=22)
SUB = ParagraphStyle("SUB", parent=styles["Normal"], fontSize=10, textColor=GREY, spaceAfter=1, leading=13)
SEC = ParagraphStyle("SEC", parent=styles["Heading1"], fontSize=13, textColor=BLUE, spaceBefore=12, spaceAfter=4, leading=16)
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=5)
CELL = ParagraphStyle("CELL", parent=styles["Normal"], fontSize=8.6, leading=11)
CELLB = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")
SMALL = ParagraphStyle("SMALL", parent=styles["Normal"], fontSize=8.8, textColor=GREY, leading=12)
BULLET = ParagraphStyle("BULLET", parent=BODY, leftIndent=12, spaceAfter=3)
NOTE = ParagraphStyle("NOTE", parent=BODY, fontSize=9.5, textColor=colors.HexColor("#1d4e37"), leading=13,
                      backColor=GREENBG, borderPadding=7, spaceBefore=4, spaceAfter=6)

story = []

def make_table(data, widths, tick_col=None, header_color=NAVY):
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, colors.HexColor("#d6dee9")),
        ("BACKGROUND", (0,0), (-1,0), header_color),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("TOPPADDING", (0,0), (-1,0), 5), ("BOTTOMPADDING", (0,0), (-1,0), 5),
    ]
    for r in range(1, len(data)):
        if r % 2 == 0:
            cmds.append(("BACKGROUND", (0,r), (-1,r), LIGHT))
    if tick_col is not None:
        cmds += [("BACKGROUND", (tick_col,1), (tick_col,-1), TICK),
                 ("LINEBEFORE", (tick_col,0), (tick_col,-1), 0.5, colors.HexColor("#b9c6da")),
                 ("GRID", (tick_col,1), (tick_col,-1), 0.4, colors.HexColor("#c9d4e4"))]
    t.setStyle(TableStyle(cmds))
    return t

# ---- header ----
story.append(Paragraph("Construction Inputs &mdash; How We Capture &amp; Calculate", H1))
story.append(Paragraph("Validation request (calculation method only)", ParagraphStyle("x", parent=H1, fontSize=11.5, textColor=BLUE, spaceAfter=3)))
story.append(Paragraph("<b>For:</b> Zoleka Mnanzana (B-BBEE expert) &nbsp;&middot;&nbsp; <b>From:</b> okiru-pro engineering &nbsp;&middot;&nbsp; <b>Date:</b> 25 June 2026", SUB))
story.append(Paragraph("<b>Re:</b> Follow-up to your signed <i>Construction Scorecard Verification</i> (24 June 2026)", SUB))
story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceBefore=7, spaceAfter=8))

story.append(Paragraph(
    "Thank you for verifying the construction scorecards. <b>Nothing in this note changes any indicator, weight or "
    "target you approved</b> &mdash; our engine now matches your signed scorecard exactly. This note is only about "
    "<b>how we capture and calculate the inputs</b> for a handful of your indicators that the import template had no "
    "data field for. Please confirm our method, or correct it.", BODY))

# ---- 1. already verified ----
story.append(Paragraph("1. What you already verified &mdash; no action needed", SEC))
story.append(Paragraph(
    "Every <b>indicator, weight and target</b> on all three scorecards (Contractor 123 / BEP 123 / QSE 110 points). "
    "These are official, from the Construction Sector Code, and signed off on 24 June 2026. <b>They are not in question "
    "here.</b>", BODY))

# ---- 2. mapping ----
story.append(Paragraph("2. The new template columns feed YOUR verified indicators", SEC))
story.append(Paragraph(
    "To score some of those official indicators, our import template needed input fields it didn't have. The columns "
    "below are <b>data-entry fields only &mdash; not new scorecard items</b>. Each maps directly to an indicator you "
    "already verified:", BODY))
hM = [Paragraph(x, CELLB) for x in ["New input column (where)", "Feeds this official indicator (you verified)"]]
rowsM = [
    ("Professionally Registered? (Y/N) &mdash; Employees", "MC: <i>Black Professionally Registered Employees</i> (2 pts, 50%) + Skills bonus (2 pts, 60%)"),
    ("Youth (under 35)? (Y/N) &mdash; Employees", "MC: <i>Bonus &mdash; Black Youth Employees</i> (2 pts, 30%)"),
    ("Registered with Industry Body? (Y/N) &mdash; Skills", "Skills: <i>Black Candidates Registered with Industry Bodies</i> (3 pts, 60%); QSE registration bonus (1 pt, 50%)"),
    ("Management Level (Exec/Sr/Mid/Junior) &mdash; Skills", "Skills: <i>Black Management (Exec/Sr/Mid)</i> (2 pts, 15%) + <i>(Junior)</i> (1 pt, 10%)"),
    ("Mentorship? (Y/N) &mdash; Skills", "Skills: <i>Mentorship Programme</i> (3 pts, Yes)"),
    ("Promoted via Mentorship? (Y/N) &mdash; Skills", "Skills: <i>Bonus &mdash; Mentorship Programme Promotions</i> (2 pts, 15%)"),
    ("Supplier/Contractor Dev Programme? (Y/N) &mdash; ESD", "ESD: <i>Supplier &amp; Contractor Development Programmes</i> (5 pts, Annex CSC 400)"),
]
dataM = [hM] + [[Paragraph(a, CELL), Paragraph(b, CELL)] for (a,b) in rowsM]
story.append(make_table(dataM, [62*mm, 104*mm], header_color=GREEN))
story.append(Paragraph("If a column is left blank, the indicator simply scores 0 &mdash; we never assume or fabricate a value.", SMALL))

# ---- 3. why ----
story.append(Paragraph("3. Why we added them", SEC))
story.append(Paragraph(
    "Without these input fields, the official indicators above were scoring <b>0 for every entity</b> &mdash; there was "
    "nowhere to capture the data. Adding the columns lets a construction entity actually <b>earn those points when it "
    "provides the evidence</b>. The columns appear only on construction forms; they are hidden from all other sectors.", BODY))

# ---- 4. what to verify ----
story.append(Paragraph("4. What we need you to verify &mdash; calculation method only", SEC))
story.append(Paragraph(
    "The code names each indicator and target; we had to choose <b>how to compute it from the captured data</b>. "
    "Please tick &ldquo;OK?&rdquo; where our method is correct, or write the correct basis.", BODY))

story.append(Paragraph("A. How we calculate the new-column indicators", ParagraphStyle("ssec", parent=styles["Heading2"], fontSize=10.5, textColor=NAVY, spaceBefore=6, spaceAfter=3)))
hA = [Paragraph(x, CELLB) for x in ["Indicator", "Our calculation method", "OK?"]]
rowsA = [
    ("Black Professionally Registered (50%)", "(Black &amp; registered) &divide; <b>all</b> employees &times; 100 &mdash; or should it be &divide; <b>black</b> employees?"),
    ("Bonus: Registered as Professionals (60%)", "(Black &amp; registered) &divide; <b>black</b> employees &times; 100"),
    ("Black Youth Employees (30%)", "(Black youth) &divide; <b>all</b> employees &times; 100"),
    ("Industry-Body Candidates (60% / QSE 50%)", "(Black industry-registered learners) &divide; <b>black learners</b> &times; 100 &mdash; <b>headcount</b> based (not spend)"),
    ("Black Management skills: Exec+Sr+Mid (15%) / Junior (10%)", "(Skills <b>spend</b> on black learners at that level) &divide; <b>total black skills spend</b> &times; 100"),
    ("Mentorship Programme (3 pts, Yes)", "Scored as <b>present</b> if any black learner is on a mentorship programme &mdash; is presence enough?"),
    ("Mentorship Promotions (15%)", "(Black learners promoted via mentorship) &divide; <b>black learners</b> &times; 100"),
    ("Supplier &amp; Contractor Dev Programmes (Annex CSC 400)", "Scored as <b>present</b> if any SD contribution is a recognised programme &mdash; does Annex CSC 400 set specific qualifying criteria?"),
]
dataA = [hA] + [[Paragraph(a, CELL), Paragraph(b, CELL), Paragraph("", CELL)] for (a,b) in rowsA]
story.append(make_table(dataA, [56*mm, 95*mm, 15*mm], tick_col=2))

story.append(Paragraph("B. Interpretations of data you already collect", ParagraphStyle("ssec2", parent=styles["Heading2"], fontSize=10.5, textColor=NAVY, spaceBefore=8, spaceAfter=3)))
hB = [Paragraph(x, CELLB) for x in ["Indicator", "Our basis", "OK?"]]
rowsB = [
    ("QSE &ldquo;Voting + Economic &ge; 40%&rdquo; bonus", "We take the <b>lower of</b> black voting % and black economic % (both must reach the target)"),
    ("Black New Entrants (5% / 6%)", "Measured on black new-entrant <b>economic interest %</b>"),
    ("Black Disabilities on Programmes (3% / 5%)", "Black-disabled skills spend &divide; <b>total black skills spend</b> &times; 100"),
    ("Absorption bonus (100%)", "Black learners absorbed &divide; <b>total black learners</b> &times; 100"),
    ("PP from &ge;35% / &ge;51% Black-Women-Owned", "<b>Recognised</b> spend with suppliers at/above that threshold"),
]
dataB = [hB] + [[Paragraph(a, CELL), Paragraph(b, CELL), Paragraph("", CELL)] for (a,b) in rowsB]
story.append(make_table(dataB, [56*mm, 95*mm, 15*mm], tick_col=2))

story.append(Paragraph("C. Two things to re-confirm on your own numbers", ParagraphStyle("ssec3", parent=styles["Heading2"], fontSize=10.5, textColor=NAVY, spaceBefore=8, spaceAfter=3)))
story.append(Paragraph(
    "<b>1. QSE Skills &mdash; &ldquo;secondary tier = 25% of Leviable&rdquo; (7 pts).</b> You ticked this, but 25% of "
    "leviable (payroll) on skills is a level almost no entity can reach, so that 7-point line scores near-zero for "
    "everyone. <b>Is 25% intended, or should it be 2.5%</b>?", BULLET))
story.append(Paragraph(
    "<b>2. Skills &mdash; &ldquo;African People (per Stats SA EAP)&rdquo;.</b> We haven't wired this yet. Please state the "
    "exact basis &mdash; <b>African learner spend as a % contribution to the provincial EAP African target</b>, or "
    "something else.", BULLET))

story.append(HRFlowable(width="100%", thickness=0.7, color=BLUE, spaceBefore=12, spaceAfter=6))
story.append(Paragraph("To recap: your indicators, weights and targets are unchanged. We only need your tick (or correction) on the calculation method above. We update the engine before construction scoring is used for compliance.", SMALL))
story.append(Spacer(1, 14))
story.append(Paragraph("Confirmed by: _______________________________ &nbsp;&nbsp;&nbsp; Date: _______________", BODY))

doc = SimpleDocTemplate("docs/Construction-Phase1-Inputs-Validation-Request.pdf", pagesize=A4,
                        leftMargin=15*mm, rightMargin=15*mm, topMargin=14*mm, bottomMargin=14*mm,
                        title="Construction Inputs — Validation Request (calculation method)", author="okiru-pro")
doc.build(story)
print("OK wrote docs/Construction-Phase1-Inputs-Validation-Request.pdf")
