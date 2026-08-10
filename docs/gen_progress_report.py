# -*- coding: utf-8 -*-
"""Generate the Okiru Pro B-BBEE System Progress Report PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, HRFlowable)

NAVY = colors.HexColor("#1f3a5f")
BLUE = colors.HexColor("#2e5e9e")
LIGHT = colors.HexColor("#eef3fa")
GREEN = colors.HexColor("#1d7a4d")
GREY = colors.HexColor("#6b7280")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=22, textColor=NAVY, spaceAfter=4, leading=26)
SUB = ParagraphStyle("SUB", parent=styles["Normal"], fontSize=10.5, textColor=GREY, spaceAfter=2)
SEC = ParagraphStyle("SEC", parent=styles["Heading1"], fontSize=14.5, textColor=BLUE, spaceBefore=14, spaceAfter=6, leading=18)
SUBSEC = ParagraphStyle("SUBSEC", parent=styles["Heading2"], fontSize=11.5, textColor=NAVY, spaceBefore=8, spaceAfter=3)
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=4)
BULLET = ParagraphStyle("BULLET", parent=BODY, leftIndent=12, bulletIndent=2, spaceAfter=2)
CELL = ParagraphStyle("CELL", parent=styles["Normal"], fontSize=8.4, leading=10.5)
CELLB = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")
SMALL = ParagraphStyle("SMALL", parent=styles["Normal"], fontSize=8.5, textColor=GREY, leading=11)

story = []

def section(t): story.append(Paragraph(t, SEC))
def subsec(t): story.append(Paragraph(t, SUBSEC))
def body(t): story.append(Paragraph(t, BODY))
def bullets(items):
    for it in items:
        story.append(Paragraph("&bull;&nbsp;&nbsp;" + it, BULLET))

def make_table(data, col_widths, header=True, font=8.4):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    cmds = [
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 3.5), ("BOTTOMPADDING", (0,0), (-1,-1), 3.5),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, colors.HexColor("#d6dee9")),
        ("FONTSIZE", (0,0), (-1,-1), font),
    ]
    if header:
        cmds += [("BACKGROUND", (0,0), (-1,0), NAVY),
                 ("TEXTCOLOR", (0,0), (-1,0), colors.white),
                 ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
                 ("FONTSIZE", (0,0), (-1,0), font+0.4),
                 ("TOPPADDING", (0,0), (-1,0), 5), ("BOTTOMPADDING", (0,0), (-1,0), 5)]
        for r in range(1, len(data)):
            if r % 2 == 0:
                cmds.append(("BACKGROUND", (0,r), (-1,r), LIGHT))
    t.setStyle(TableStyle(cmds))
    return t

# ---------------- Cover ----------------
story.append(Spacer(1, 6))
story.append(Paragraph("Okiru Pro", H1))
story.append(Paragraph("B-BBEE Scorecard System &mdash; Progress Report", ParagraphStyle("x", parent=H1, fontSize=15, textColor=BLUE)))
story.append(Paragraph("Prepared for the Okiru team &nbsp;&middot;&nbsp; 25 June 2026", SUB))
story.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceBefore=6, spaceAfter=10))

section("1. Executive summary")
bullets([
    "<b>All B-BBEE sector changes requested by the team are done</b>, and the errors we found during testing have been fixed and deployed to production.",
    "<b>Bulk upload (Excel import) now works end-to-end</b> across every sector &mdash; a complete workbook can be imported and scored in one action.",
    "The scoring engine is <b>accurate</b>: it reproduces the real, fully-filled Lake Trading toolkit <b>to the decimal</b>, 486 automated calculator tests pass, and the construction engine matches the expert's signed verification exactly.",
    "We tested against <b>16 real workbooks across all sectors</b>. Imported scoring went from <b>0 to 12 of 14</b> reaching the expected Level&nbsp;1 (the remaining cases are explained below, and are not engine errors).",
    "<b>Much of the system still needs expert validation</b> &mdash; but now that bulk upload works, that validation is far faster and easier to do.",
])

subsec("Team &amp; current workstreams")
bullets([
    "<b>B-BBEE scorecards &amp; import</b> &mdash; sector fixes + bulk-upload + error fixes: <b>done &amp; live</b>.",
    "<b>Lethabo</b> &mdash; certificate functionality and the AI document parser.",
    "<b>Brian</b> &mdash; hunting hidden bugs across the codebase.",
])

# ---------------- Sectors ----------------
section("2. Sectors, scorecards &amp; scores")
body("Okiru Pro encodes <b>6 sector codes</b> across <b>14 scorecards</b>. Each total below is the maximum points; the elements are the scoreable pillars and their weightings. Every entity is rated B-BBEE Level&nbsp;1&ndash;8 against these.")

hdr = [Paragraph(h, CELLB) for h in ["Sector", "Scorecard", "Total pts", "Level&nbsp;1 at", "Elements (points)"]]
rows = [
    ("RCOGP", "Generic", "120", "100", "Ownership 25 · Mgmt Control 19 · Skills 25 · Procurement 29 · Supplier Dev 10 · Enterprise Dev 7 · SED 5"),
    ("RCOGP", "QSE", "108", "100", "Ownership 25 · Mgmt Control 15 · Skills 30 · Procurement 21 · Supplier Dev 5 · Enterprise Dev 7 · SED 5"),
    ("ICT", "Generic", "140", "120", "Ownership 25 · Mgmt Control 23 · Skills 25 · Procurement 27 · Supplier Dev 10 · Enterprise Dev 18 · SED 12"),
    ("ICT", "QSE", "116", "100", "Ownership 25 · Mgmt Control 15 · Skills 30 · Procurement 21 · Supplier Dev 5 · Enterprise Dev 8 · SED 12"),
    ("AgriBEE", "Generic", "132", "100", "Ownership 25 · Mgmt Control 23 · Skills 25 · Procurement 27 · Supplier Dev 10 · Enterprise Dev 7 · SED 15"),
    ("FSC", "Generic / Others", "120", "92.8", "Ownership 25 · Mgmt Control 21 · Skills 23 · Procurement 24 · Supplier Dev 10 · Enterprise Dev 9 · SED 8"),
    ("FSC", "Banks", "130", "108.1", "Ownership 25 · MC 21 · Skills 23 · Proc 24 · Supplier Dev 10 · Enterprise Dev 7 · SED 8 · Access to Financial Services 12"),
    ("FSC", "Long-Term Insurers", "132", "108.1", "Ownership 25 · MC 21 · Skills 23 · Proc 24 · Supplier Dev 10 · Enterprise Dev 9 · SED 8 · Access to Financial Services 12"),
    ("FSC", "Short-Term Insurers", "132", "103.6", "Ownership 25 · MC 21 · Skills 23 · Proc 24 · Supplier Dev 10 · Enterprise Dev 9 · SED 8 · Access to Financial Services 12"),
    ("Transport", "Generic (Large)", "108", "std bands", "Ownership 24 · Mgmt Control 11 · Employment Equity 18 · Skills 15 · Procurement 20 · Supplier Dev 15 · SED 5"),
    ("Transport", "QSE", "107", "std bands", "Ownership 28 · Mgmt Control 27 · Employment Equity 27 + elective elements (Skills / Procurement / Enterprise Dev / SED — chosen)"),
    ("Construction", "Contractor", "123", "100", "Ownership 31 · Mgmt Control 22 · Skills 26 · Enterprise &amp; Supplier Dev 38 · SED 6  (52 indicators)"),
    ("Construction", "BEP", "123", "100", "Ownership 31 · Mgmt Control 22 · Skills 34 · Enterprise &amp; Supplier Dev 30 · SED 6  (49 indicators)"),
    ("Construction", "QSE", "110", "100", "Ownership 30 · Mgmt Control 20 · Skills 26 · Enterprise &amp; Supplier Dev 29 · SED 5  (25 indicators)"),
]
data = [hdr] + [[Paragraph(r[0], CELLB), Paragraph(r[1], CELL), Paragraph(r[2], CELL), Paragraph(r[3], CELL), Paragraph(r[4], CELL)] for r in rows]
story.append(make_table(data, [22*mm, 30*mm, 15*mm, 16*mm, 87*mm]))
story.append(Paragraph("Generic sectors (RCOGP, ICT, AgriBEE, FSC, Transport) score the standard B-BBEE pillars; Construction is scored on a verified indicator matrix (52 / 49 / 25 indicators). Transport uses the standard scaled level bands.", SMALL))

# ---------------- Construction indicator detail ----------------
story.append(PageBreak())
section("3. Construction indicator detail (Contractor scorecard)")
body("Construction is the most granular sector. Below is the full <b>Contractor</b> indicator set (52 indicators, 123 pts) &mdash; every weight and target <b>verified and signed off by the B-BBEE expert (Zoleka Mnanzana, 24 June 2026)</b>. BEP (49 indicators) and QSE (25 indicators) follow the same verified structure.")

def ind_table(title, rows):
    subsec(title)
    h = [Paragraph(x, CELLB) for x in ["Indicator", "Weight", "Target"]]
    d = [h] + [[Paragraph(a, CELL), Paragraph(str(b), CELL), Paragraph(c, CELL)] for (a,b,c) in rows]
    story.append(make_table(d, [110*mm, 18*mm, 42*mm]))

ind_table("Ownership &mdash; 31 pts", [
    ("Black Voting Rights", 4.5, "35%"), ("Black Women Voting Rights", 2, "14%"),
    ("Black Economic Interest", 4.5, "35%"), ("Black Women Economic Interest", 2, "14%"),
    ("Economic Interest of Black Designated Groups", 3, "12%"), ("Black New Entrants", 5, "5%"),
    ("Realisation Points (Net Value)", 6, "Calc"),
    ("Bonus: Black Voting Rights &gt; 50% / &gt; 75%", "1 / 2", "50% / 75%"),
    ("Bonus: Black Women Voting Rights &gt; 50%", 1, "50%"),
])
ind_table("Management Control &mdash; 22 pts", [
    ("Black Board Members / Black Female Board", "3 / 1", "50% / 20%"),
    ("Black Executive Directors / Black Female Exec Dir", "2 / 1", "50% / 20%"),
    ("Bonus: exceeding Black / Black-Female Exec Dir target", "1 / 1", "50% / 20%"),
    ("Black Other Exec Mgmt / Black Female", "2 / 1", "60% / 30%"),
    ("Black Senior Mgmt / Black Female", "2 / 0.5", "60% / 30%"),
    ("Black Middle Mgmt / Black Female", "1 / 0.5", "75% / 30%"),
    ("Black Junior Mgmt / Black Female", "1 / 0.5", "88% / 35%"),
    ("Black Employees with Disabilities", 0.5, "2%"),
    ("Black Professionally Registered Employees", 2, "50%"),
    ("Bonus: Black Youth Employees", 2, "30%"),
])
ind_table("Skills Development &mdash; 26 pts", [
    ("SD Expenditure on Black People", 4, "3% of Leviable"),
    ("African People (per Stats SA EAP)", 2, "EAP contribution"),
    ("Black Management (Exec/Senior/Middle) / (Junior)", "2 / 1", "15% / 10%"),
    ("Bursaries / Scholarships for Black People", 2, "15%"),
    ("Cat A/B/C/D Learning Programmes", 3, "2.5%"),
    ("Black Candidates Registered with Industry Bodies", 3, "60%"),
    ("Black People with Disabilities on Programmes", 1, "5%"),
    ("Mentorship Programme", 3, "Yes"),
    ("Bonus: Absorption / Mentorship Promotions / Professionals", "1 / 2 / 2", "100% / 15% / 60%"),
])
ind_table("Enterprise &amp; Supplier Development &mdash; 38 pts", [
    ("PP from all Empowering Suppliers", 6, "80% of TMPS"),
    ("PP from EME / QSE Suppliers", "3 / 3", "15% / 15% of TMPS"),
    ("PP from &ge;51% Black Owned / &ge;35% Black Women Owned", "4 / 3", "20% / 12% of TMPS"),
    ("Bonus: PP &ge;51% Designated / &ge;51% Black Women", "3 / 1", "20% / 8% of TMPS"),
    ("Supplier &amp; Contractor Development Programmes", 5, "Annex CSC 400"),
    ("Supplier Development Contributions", 8, "3% of NPAT"),
    ("SD Contributions to &ge;51% Black Women Owned", 2, "0.6% of NPAT"),
])
ind_table("Socio-Economic Development &mdash; 6 pts", [
    ("SED Contributions", 4, "1.25% of NPAT"),
    ("SED Spend on Communities with Limited Services", 1, "&gt; 30%"),
    ("Bonus: Structured SED Projects", 1, "1.25% of NPAT"),
])

# ---------------- Testing & results ----------------
story.append(PageBreak())
section("4. Our testing &amp; the results")
body("We tested the system against <b>16 real workbooks supplied for every sector</b> &mdash; which the B-BBEE expert confirmed should all rate Level&nbsp;1. Crucially, we tested them <b>through the bulk-upload (import) path</b>, so the import, validation and scoring were all exercised at once.")

subsec("Import scoring &mdash; before vs after")
h = [Paragraph(x, CELLB) for x in ["Metric", "Before", "After"]]
d = [h,
     [Paragraph("Workbooks reaching the expected Level 1 (of 14 scoreable)", CELL), Paragraph("0", CELL), Paragraph("<b>12</b>", CELLB)],
     [Paragraph("False validation warnings per import (worst file)", CELL), Paragraph("~2,900", CELL), Paragraph("<b>~11</b>", CELLB)],
     [Paragraph("Total false warnings across all 16 workbooks", CELL), Paragraph("28,943", CELL), Paragraph("<b>77 (real)</b>", CELLB)],
     [Paragraph("Name / surname split on import", CELL), Paragraph("broken", CELL), Paragraph("<b>fixed</b>", CELLB)],
     [Paragraph("&ldquo;Fields extracted&rdquo; counter", CELL), Paragraph("always 0", CELL), Paragraph("<b>correct</b>", CELLB)]]
story.append(make_table(d, [105*mm, 32*mm, 33*mm]))

subsec("What we fixed (six systematic import bugs)")
bullets([
    "A whole scoring sheet (Enterprise &amp; Supplier Development) was silently skipped on import.",
    "Ownership was under-read &mdash; junk summary rows counted as shareholders, and black ownership mis-weighted.",
    "Enterprise-Development contributions were filed under the wrong category and scored 0.",
    "A column collision zeroed out <b>Skills</b> for <b>every</b> sector.",
    "Supplier size wasn't read, so QSE/EME procurement spend scored 0.",
    "FSC <b>Access to Financial Services</b> (12 pts) wasn't scored, holding every Banks/Insurer workbook below Level 1.",
])

subsec("Sector-by-sector test outcome")
bullets([
    "<b>RCOGP, ICT, AgriBEE, FSC (all variants): Level 1</b> on import &mdash; 12 of 14 scoreable workbooks.",
    "<b>Construction (2 workbooks): Level 5 / Level 3.</b> The engine is verified correct (matches the expert's signed scorecard exactly) &mdash; these fall short only because the standard template didn't yet capture a few data points. Those columns have now been added.",
    "<b>Transport (2 workbooks):</b> score in production; not yet in the automated test harness.",
])

# ---------------- Engine accuracy ----------------
section("5. Engine accuracy (validated against ground truth)")
body("The calculators reproduce the real, fully-filled <b>Lake Trading</b> toolkit <b>pillar-by-pillar, to the decimal</b>:")
h = [Paragraph(x, CELLB) for x in ["Pillar", "Okiru system", "Real toolkit"]]
lake = [("Ownership","25","25"),("Management Control","10.38","10.38"),("Skills Development","0","0"),
        ("Preferential Procurement","20.33","20.334"),("Supplier Development","3.69","3.691"),
        ("Enterprise Development","2.36","2.362"),("Socio-Economic Development","0.41","0.406"),("Grand total","62.17","62.17")]
d = [h] + [[Paragraph(a, CELLB if a=="Grand total" else CELL), Paragraph(b, CELL), Paragraph(c, CELL)] for (a,b,c) in lake]
story.append(make_table(d, [70*mm, 50*mm, 50*mm]))
bullets([
    "<b>486 automated &ldquo;golden&rdquo; tests pass</b> across all eight sector calculators.",
    "<b>Construction engine matches the expert's signed verification exactly</b> &mdash; totals (123/123/110), indicator counts (52/49/25) and every correction.",
])

# ---------------- Validation outstanding ----------------
section("6. What still needs validation")
body("Accuracy of the core engine is proven against ground truth, but <b>a large part of the system still needs expert sign-off</b> before it is relied on for compliance:")
bullets([
    "FSC <b>Access to Financial Services</b> detailed indicators, and the Consumer-Education / Empowerment-Financing elements.",
    "The <b>Transport</b> scorecards (currently scored in production, not yet in the automated harness).",
    "The newly-added <b>Construction template columns</b> and a few derivation choices &mdash; a validation request has already been sent to the expert (Zoleka).",
    "The construction <b>QSE skills &ldquo;25% of Leviable&rdquo;</b> target &mdash; flagged to the expert to re-confirm.",
])
story.append(Spacer(1, 4))
body("<b>The good news:</b> now that <b>bulk upload works</b>, a complete, filled workbook can be tested in a single action &mdash; so this validation is much faster and easier than before. Each sector can be signed off by importing a known workbook and checking the result against the expert's expected score.")

story.append(HRFlowable(width="100%", thickness=0.8, color=BLUE, spaceBefore=12, spaceAfter=6))
story.append(Paragraph("Okiru Pro &mdash; B-BBEE System Progress Report &middot; 25 June 2026 &middot; Generated for the Okiru team.", SMALL))

doc = SimpleDocTemplate("docs/Okiru-BBBEE-System-Progress-Report.pdf", pagesize=A4,
                        leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm,
                        title="Okiru Pro — B-BBEE System Progress Report", author="okiru-pro")
doc.build(story)
print("OK wrote docs/Okiru-BBBEE-System-Progress-Report.pdf")
