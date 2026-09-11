# -*- coding: utf-8 -*-
"""Generate the Okiru Pro Platform Progress Report (September 2026).

Successor to gen_progress_report.py (25 June 2026). Same visual identity, wider
scope: B-BBEE, ESG, Certificates, the shared document engine, and the testing
brief we are asking the team to work through.

Every figure in this report was measured on 8 September 2026 from the live
repository and the production API. Sources are named in the script comments so
the next person can re-measure rather than re-trust.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, HRFlowable, KeepTogether)

NAVY = colors.HexColor("#1f3a5f")
BLUE = colors.HexColor("#2e5e9e")
LIGHT = colors.HexColor("#eef3fa")
GREEN = colors.HexColor("#1d7a4d")
AMBER = colors.HexColor("#a1650a")
RED = colors.HexColor("#9b2226")
GREY = colors.HexColor("#6b7280")
RULE = colors.HexColor("#d6dee9")

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
NOTE = ParagraphStyle("NOTE", parent=BODY, fontSize=9.5, leading=13, leftIndent=8, rightIndent=8,
                      spaceBefore=4, spaceAfter=6, borderPadding=6, backColor=colors.HexColor("#fdf6e7"))

story = []

def section(t): story.append(Paragraph(t, SEC))
def subsec(t): story.append(Paragraph(t, SUBSEC))
def body(t): story.append(Paragraph(t, BODY))
def small(t): story.append(Paragraph(t, SMALL))
def gap(h=6): story.append(Spacer(1, h))
def note(t): story.append(Paragraph(t, NOTE))
def bullets(items):
    for it in items:
        story.append(Paragraph("&bull;&nbsp;&nbsp;" + it, BULLET))

def P(t, bold=False): return Paragraph(t, CELLB if bold else CELL)

def make_table(data, col_widths, header=True, font=8.4, align_right=(), grid=False, row_height=None):
    """grid=True draws every cell edge — for the blank test log, which is filled
    in by hand on paper and needs columns you can actually see."""
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0,
              rowHeights=row_height)
    cmds = [
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 3.5), ("BOTTOMPADDING", (0,0), (-1,-1), 3.5),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, RULE),
        ("FONTSIZE", (0,0), (-1,-1), font),
    ]
    for c in align_right:
        cmds.append(("ALIGN", (c,1), (c,-1), "RIGHT"))
    if grid:
        cmds.append(("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#9aa8bb")))
    if header:
        cmds += [("BACKGROUND", (0,0), (-1,0), NAVY),
                 ("TEXTCOLOR", (0,0), (-1,0), colors.white),
                 ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
                 ("FONTSIZE", (0,0), (-1,0), font+0.4),
                 ("VALIGN", (0,0), (-1,0), "MIDDLE"),
                 ("TOPPADDING", (0,0), (-1,0), 5), ("BOTTOMPADDING", (0,0), (-1,0), 5)]
        for r in range(1, len(data)):
            if r % 2 == 0:
                cmds.append(("BACKGROUND", (0,r), (-1,r), LIGHT))
    t.setStyle(TableStyle(cmds))
    return t

W = 175*mm  # usable width

# ============================ Cover ============================
story.append(Spacer(1, 4))
story.append(Paragraph("Okiru Pro", H1))
story.append(Paragraph("Platform Progress Report &mdash; B-BBEE, ESG and Certificates",
                       ParagraphStyle("x", parent=H1, fontSize=15, textColor=BLUE)))
story.append(Paragraph("Prepared for Pholo &nbsp;&middot;&nbsp; 8 September 2026 &nbsp;&middot;&nbsp; "
                       "Successor to the B-BBEE Progress Report of 25 June 2026", SUB))
story.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceBefore=6, spaceAfter=10))

section("1. Executive summary")
bullets([
    "<b>Okiru Pro is now three products on one engine.</b> B-BBEE scorecards, an ESG toolkit and a public "
    "B-BBEE certificate registry all run off the same document-reading engine and the same client records.",
    "<b>B-BBEE has widened and hardened.</b> A seventh sector (MAC) is configured, taking us to 17 scorecards. "
    "Bonus points are now reported separately from element weightings, and the &ldquo;deemed level&rdquo; "
    "shortcut was removed &mdash; the level is the points, and the affidavit route is the verification "
    "auditor's call, not ours.",
    "<b>ESG is built and running.</b> Three scorecards (Environmental 108, Social 100, Governance 100), "
    "53 indicators, its own document flow, a GHG emissions page and a carbon-tax page. A 114-page plain-English "
    "specification is finished and ready to put in front of an ESG expert for sign-off.",
    "<b>The certificate registry is live in production</b> with 2 955 certificates and affidavits, every one "
    "processed, and it now auto-fills supplier B-BBEE levels into a client's procurement schedule.",
    "<b>Testing has roughly doubled.</b> 895 automated tests on the B-BBEE sector calculators (486 in June), "
    "196 on ESG, 646 on the API.",
    "<b>A serious defect was found while preparing this report, and has been fixed.</b> Supplier Development "
    "was scoring zero on every imported workbook, because the rule that separates Supplier Development from "
    "Enterprise Development did not recognise the wording our own standard template uses. Level&nbsp;1 "
    "fitness across the 16 test workbooks has gone from <b>3 back to 11</b>. Section 3.4 sets out what "
    "happened, because how it was found and how long it survived matter more than the fix.",
    "<b>What we need from you:</b> structured testing against workbooks and companies whose correct answer you "
    "already know, so that every difference between our number and yours is either a bug we fix or a "
    "methodology decision you settle. Section 9 is the brief.",
])

subsec("How this report differs from the June one")
body("The June report covered B-BBEE only, and its headline was that 12 of 14 test workbooks reached the "
     "expected Level 1 on import. The comparable figure today is <b>11 of 16</b>, and the missing one is not a "
     "fault: a set of fixes in August stopped the engine awarding full credit for figures it could not "
     "actually read, and one workbook's Level 1 had been resting on that. An early-payment contribution is "
     "recognised at 15% under the Codes; it had been scoring at 100%. Correcting it leaves Sandile Freight at "
     "98.84 rather than 101.37, which is Level 2. We would rather show you the lower, honest number.")

story.append(PageBreak())

# ============================ 2. What the platform is ============================
section("2. What the platform is now")
body("Three products, one engine. A consultant uploads a folder of a client's documents once; the engine reads "
     "them, and the values land in whichever scorecard the client is being measured on.")

rows = [[P("Product", True), P("What it does", True), P("Where it runs", True), P("State", True)],
        [P("<b>B-BBEE scorecards</b>"),
         P("Scores an entity against 17 gazetted scorecards across 7 sector codes. Three ways in: upload "
           "documents, import a filled Excel workbook, or type the figures in pillar by pillar."),
         P("okiru.pro/toolkit"),
         P("<font color='#1d7a4d'><b>Live</b></font>")],
        [P("<b>ESG toolkit</b>"),
         P("Scores an entity on Environmental, Social and Governance, and calculates a GHG inventory, a carbon-tax "
           "estimate and a net-zero trajectory. Same three ways in."),
         P("okiru.pro/esg"),
         P("<font color='#a1650a'><b>Live, awaiting expert sign-off</b></font>")],
        [P("<b>Certificate registry</b>"),
         P("A searchable directory of B-BBEE certificates and affidavits. Feeds supplier levels straight into a "
           "client's procurement schedule so spend is recognised at the right percentage."),
         P("okiru.pro/certificates"),
         P("<font color='#1d7a4d'><b>Live</b></font>")],
        [P("<b>Document engine</b>"),
         P("Sorts each file, reads it against a written instruction for that document type, names every value "
           "from a fixed list, checks its shape, and places it. Shared by both products."),
         P("Behind both"),
         P("<font color='#1d7a4d'><b>Live</b></font>, priced per read")],
        ]
story.append(make_table(rows, [30*mm, 78*mm, 27*mm, 40*mm]))

subsec("The rule that runs through all of it")
body("Everywhere the system cannot read something, it now says so rather than guessing. A file it cannot place "
     "is shown as unplaced with the reason. A value that is not on the permitted list is dropped and recorded as "
     "rejected. A contribution whose type it cannot read is excluded from the score and reported, not awarded "
     "full marks. This makes scores lower and more honest, and it is why several numbers in this report have "
     "moved down since June.")

# ============================ 3. B-BBEE ============================
section("3. B-BBEE &mdash; where it stands")

subsec("3.1 What changed since 25 June")
bullets([
    "<b>MAC added</b> (Marketing, Advertising and Communication) &mdash; Generic and QSE, including the "
    "Responsible Social Marketing element that is unique to that code.",
    "<b>AgriBEE Management Control corrected</b> to the expert's figures, and Road Freight naming adopted.",
    "<b>Deemed levels removed.</b> An EME or 51%-black-owned QSE was being lifted automatically to Level 4 / "
    "Level 2 / Level 1. That entitlement is real, but it is granted on a sworn affidavit that never passes "
    "through a scorecard &mdash; asserting it from ownership figures <i>we</i> extracted is a consulting "
    "judgement, not a measurement. The level is now the points.",
    "<b>Bonus points separated from element weightings</b> in every sector, so an entity that earns all 20 base "
    "points of RCOGP Skills is shown as having achieved that element, not as 20 out of 25.",
    "<b>Procurement recognition tightened</b> &mdash; Codes-excluded line items (loans, funds, levies) are no "
    "longer counted as recognisable spend.",
    "<b>Transport deemed-NPAT norm updated</b> 2.69% &rarr; 5.98%, per the current Stats SA P0044 (March 2026).",
    "<b>A reconciliation layer</b> was put between extraction and scoring: headcount must agree with the "
    "employee register, ownership must reconcile to the pillar cap, and an entity's aliases are resolved to one "
    "company before anything is scored.",
    "<b>The generous-default class of bug was hunted down and removed</b> &mdash; five places where "
    "&ldquo;we could not read this&rdquo; had been turned into &ldquo;award full credit&rdquo;.",
])

subsec("3.2 The 17 scorecards, as configured today")
rows = [[P("Scorecard", True), P("Own", True), P("MC", True), P("EE", True), P("Skills", True), P("PP", True),
         P("SD", True), P("ED", True), P("SED", True), P("Other", True), P("Total", True), P("L1 at", True)]]
sect = [
    ("RCOGP Generic","25","9","10","25","29","10","7","5","–","120","100"),
    ("RCOGP QSE","25","7","8","30","21","5","7","5","–","108","100"),
    ("ICT Generic","25","13","10","25","27","10","18","12","–","140","120"),
    ("ICT QSE","25","7","8","30","21","5","8","12","–","116","100"),
    ("AgriBEE","25","13","10","25","27","10","7","15","–","132","100"),
    ("FSC Others","25","19","1","23","24","10","9","8","–","119","96.33"),
    ("FSC QSE","25","7","8","25","20","5","5","5","–","100","100"),
    ("FSC Banks","23","19","1","23","19","7","5","8","27","132","110.09"),
    ("FSC Long-Term","23","19","1","23","19","7","7","8","27","134","110.09"),
    ("FSC Short-Term","23","19","1","23","24","10","9","8","12","129","105.50"),
    ("MAC Generic","25","11","16","30","29","10","7","5","5","138","100"),
    ("MAC QSE","25","15","–","35","20","5","5","5","5","115","100"),
    ("Transport Large","24","11","18","15","20","15","–","5","–","108","100"),
    ("Transport QSE","28","27","27","25","25","–","25","25","–","100*","100"),
    ("Constr. QSE","30","20","n/i","26","–","29","–","5","–","110","100"),
    ("Constr. Contractor","31","22","n/i","26","–","38","–","6","–","123","100"),
    ("Constr. BEP","31","22","n/i","34","–","30","–","6","–","123","100"),
]
for r in sect:
    rows.append([P(r[0], True)] + [P(x) for x in r[1:]])
story.append(make_table(rows, [30*mm, 11*mm, 11*mm, 10*mm, 13*mm, 11*mm, 11*mm, 11*mm, 12*mm, 13*mm, 14*mm, 15*mm], font=7.6))
small("Own Ownership &middot; MC Management Control &middot; EE Employment Equity (shown separately; on the "
      "post-2013 codes these points are scored inside the single gazetted Management Control element) &middot; "
      "PP Preferential Procurement &middot; SD Supplier Development &middot; ED Enterprise Development &middot; "
      "SED Socio-Economic Development &middot; Other = FSC Access to Financial Services and Empowerment "
      "Financing, and MAC Responsible Social Marketing. n/i: the Construction configurations itemise "
      "differently, so the split is not derivable. * Transport QSE is elective &mdash; it lists seven elements "
      "at 25 points each and measures the best four, a flat 100-point denominator, with ownership, management "
      "control and employment-equity bonuses on top to a maximum of 107. Generated from the live engine "
      "configuration (apps/api/pipeline/sectorConfig.ts).")

subsec("3.3 Engine accuracy")
bullets([
    "<b>895 automated tests</b> now pass across the sector calculators &mdash; up from 486 in June.",
    "The calculators still reproduce the real, fully-filled <b>Lake Trading</b> toolkit to the decimal "
    "(grand total 62.17 against the toolkit's 62.17).",
    "The <b>Construction</b> engine still matches the expert's signed verification exactly &mdash; totals "
    "123 / 123 / 110 and indicator counts 52 / 49 / 25 (Zoleka Mnanzana, 24 June 2026).",
    "A <b>per-element golden baseline</b> now guards all 16 test workbooks: every pillar of every workbook is "
    "recorded, and any movement fails the build. This is the check that caught the defect below.",
])

subsec("3.4 A defect worth describing: Supplier Development was scoring zero on import")
note("<b>Found on 8 September while preparing this report, and fixed the same day.</b> Supplier Development "
     "was scoring 0 for every one of the 16 test workbooks. Level&nbsp;1 fitness had fallen from 12 of 16 to "
     "3 of 16 and is now 11 of 16. It is written up here in full because it had been live for about three "
     "weeks, and what let it survive that long matters more than the fix itself.")
body("<b>What was happening.</b> Our standard template records Supplier Development and Enterprise Development "
     "on one sheet, and tells them apart in the description column: rows read either "
     "<i>&ldquo;SD beneficiary (existing supplier&hellip;)&rdquo;</i> or "
     "<i>&ldquo;ENTERPRISE DEVELOPMENT (non-supplier&hellip;)&rdquo;</i>. In August we removed a rule that had "
     "been quietly filing anything it could not classify under Supplier Development &mdash; a compliance "
     "sub-minimum being decided by a guess. That removal was right. But the replacement classifier stripped "
     "the punctuation out of the description before matching it, and then only accepted text beginning with "
     "&ldquo;supplier&rdquo; or &ldquo;enterprise&rdquo;. The ED rows begin with &ldquo;ENTERPRISE&rdquo;, so "
     "they kept scoring. The SD rows begin with &ldquo;SD&rdquo;, so every one of them was excluded as "
     "unclassified. Half the sheet went missing and the other half looked fine.")
body("A second, smaller cause sat behind it. The import path carried its own hand-written list of contribution "
     "types, separate from the vocabulary the workbook dropdown, the paste path and the AI importer all share. "
     "That list did not know &ldquo;Early payment&rdquo; or &ldquo;Donation&rdquo;, though the shared "
     "vocabulary knew both, so those rows were dropped too. The import now consults the shared vocabulary "
     "instead of keeping a second opinion.")
body("<b>What it cost, and where it landed.</b> Measured across the 16 test workbooks:")
rows = [[P("", True), P("Baseline (13 Aug)", True), P("The defect", True), P("After the fix", True)],
        [P("Workbooks reaching Level 1", True), P("12 of 16"),
         P("<font color='#9b2226'><b>3 of 16</b></font>"), P("<font color='#1d7a4d'><b>11 of 16</b></font>")],
        [P("Supplier Development points", True), P("5 to 13 per workbook"),
         P("<font color='#9b2226'>0 on all 16</font>"), P("<font color='#1d7a4d'>restored</font>")],
        [P("Sechaba Financial Group (FSC Banks)", True), P("111.04, L1"), P("104.04, L3"), P("111.04, L1")],
        [P("Kgodiso Industrial (RCOGP Generic)", True), P("104.76, L1"), P("94.47, L3"), P("103.48, L1")],
        [P("Sandile Freight (Transport Large)", True), P("101.37, L1"), P("88.40, L2"), P("98.84, L2")],
        ]
story.append(make_table(rows, [55*mm, 32*mm, 30*mm, 33*mm]))
gap(4)
body("Two of the three examples return to where they were. Sandile Freight does not, and should not: its "
     "Level 1 had depended on an early-payment contribution being recognised at 100% when the Codes recognise "
     "it at 15%. 98.84 is the honest number. <b>This is exactly the kind of case we need you to rule on</b> "
     "&mdash; if you would score that row differently, say so and we will change it for every client at once.")
body("<b>What it was not.</b> Not an arithmetic error, and not the sector configurations &mdash; those are "
     "verified. One classification rule, reading one column.")
body("<b>What it says about us.</b> The harness that caught this is not new; it has guarded all 16 workbooks "
     "per pillar since July. Nothing ran it. It was found because a person happened to run it by hand while "
     "writing a report, which is not a control. Standing up continuous integration is the item in section 7.3 "
     "that this defect argues for, and we have moved it to the top of our list.")

subsec("3.5 What still needs expert sign-off on B-BBEE")
bullets([
    "The Construction Phase-1 input questions sent to the expert in June are still unanswered, including the "
    "Construction QSE Skills &ldquo;25% of Leviable&rdquo; target.",
    "FSC Empowerment Financing is built and scoring 15 points, but the grand-total denominator "
    "(130 or ~145) has never been pinned by an expert.",
    "MAC is offered with its ladder marked <i>provisional</i> in the interface, because it has not been "
    "verified against a filled MAC toolkit.",
    "Transport Large's ladder discrepancies against the gazette remain open from the sector audit.",
])


# ============================ 4. ESG ============================
section("4. ESG &mdash; where it stands")
body("ESG did not exist in the June report. It is now a working product: a client is created, documents or a "
     "workbook go in, and three scorecards come out with a GHG inventory beside them.")

subsec("4.1 What it scores")
rows = [[P("Scorecard", True), P("Points", True), P("What it measures", True)],
        [P("Environmental", True), P("108"),
         P("GHG Scope 1/2/3, energy and renewables, fleet efficiency and EVs, waste diversion and landfill, "
           "water, and ISO 14001 environmental management.")],
        [P("Social", True), P("100"),
         P("Employment equity, health and safety, training and skills, community investment (CSI/SED) and "
           "supplier assessment.")],
        [P("Governance", True), P("100"),
         P("Board composition and committees, King&nbsp;V, ethics, POPIA, penalties, risk and assurance, "
           "IFRS S1/S2.")],
        ]
story.append(make_table(rows, [34*mm, 18*mm, 123*mm]))
gap(4)
body("53 indicators in total, each scored by one of five patterns (pro-rata band, inverse band, "
     "Yes/Partial/No, a maturity score out of 5, or a presence check). The headline ESG percentage is the "
     "average of the three pillars. A scoring <i>stance</i> &mdash; Lean, Standard or Strict &mdash; sets how "
     "generous partial credit is, from 30% to 70% of target.")

subsec("4.2 The reference company")
body("The calculation is pinned against a real filled workbook: SG Consumer, FY 2025/26, nine months "
     "July 2025 to March 2026. Any change to a calculation must leave these numbers unchanged unless it is a "
     "deliberate, documented methodology change.")
rows = [[P("", True), P("As the source workbook was", True), P("Corrected (what we run)", True)],
        [P("Environmental"), P("36 of 108"), P("36 of 108")],
        [P("Social"), P("33 of 100"), P("25 of 100")],
        [P("Governance"), P("64.85 of 100"), P("59.85 of 100")],
        [P("Overall ESG", True), P("44.6%"), P("<b>40.3%</b>")],
        [P("Scope 1 + 2 inventory"), P("not calculated by the workbook"), P("<b>3 714.94 tCO<sub>2</sub>e</b>")],
        [P("A completely blank workbook"), P("scored 18 points"), P("<b>scores 0</b>")],
        ]
story.append(make_table(rows, [45*mm, 65*mm, 65*mm]))
gap(4)
body("The three points of difference are all the same species of defect: the source workbook awarded 8 points "
     "for zero fatalities when the cell was blank, 5 points for no material penalties by reading a row that "
     "does not exist, and 5 points for a net-zero target by substituting the year 2050 when nothing had been "
     "entered. We run the corrected calculation as the live score and keep the original reproducible as an "
     "audit reference.")

subsec("4.3 What ESG cannot do yet")
bullets([
    "<b>30 of the 308 points cannot be earned by anyone</b>, because the ISO-tracker roll-ups they depend on "
    "are not yet calculated. Those rows score 0 rather than a guess, and each carries a proposed rule awaiting "
    "approval.",
    "<b>Thirteen of the fourteen configured sectors inherit their thresholds</b> from the only calibrated "
    "instance we have &mdash; the FMCG / Distribution fork of the workbook. Each inherited value is flagged in "
    "the interface rather than presented as sector-specific truth. Calibrating the other sectors is expert work.",
    "<b>The B-BBEE bridge is read-only and partly unavailable.</b> It estimates Management Control, Skills and "
    "SED from ESG data, but Ownership and Enterprise &amp; Supplier Development are hand-entered on the sheet "
    "with no editor in the app, so they report as &ldquo;not available&rdquo; rather than 0. The status level "
    "reports &ldquo;Not determined&rdquo;, because two rungs of the level ladder are blank in the source "
    "workbook and we will not invent thresholds.",
    "<b>Two document routes are not defined:</b> which document supplies prior-year kWh and the prior-year "
    "emissions baseline, and which supplies local versus total procurement spend. The cells exist; nothing "
    "reads them.",
])

subsec("4.4 The expert specification is ready")
body("There is now a 114-page plain-English specification &mdash; <i>Okiru ESG Toolkit: documents, values and "
     "calculations</i> &mdash; written for B-BBEE and ESG professionals rather than for developers. It sets out "
     "every document type we expect, every value we read from it, every calculation and threshold with its "
     "source cell, and it ends each section with a blank table for the expert to complete. It is in the "
     "repository as both Word and PDF and can go out for review as it stands. Getting it filled in is the "
     "single biggest unblocking action available on ESG.")


# ============================ 5. Certificates ============================
section("5. Certificates &mdash; where it stands")
body("The certificate registry is a public, searchable directory of South African B-BBEE certificates and "
     "affidavits, and it is the quiet engine behind procurement scoring: a supplier's spend is recognised at "
     "135% at Level 1 and 0% if non-compliant, so knowing a supplier's level is worth real points.")

subsec("5.1 Live production figures")
rows = [[P("Measure", True), P("Value", True), P("Note", True)],
        [P("Certificates and affidavits held"), P("<b>2 955</b>"), P("All processed; none pending")],
        [P("Valid today"), P("243"), P("8% &mdash; see the caveat below")],
        [P("Expiring within 30 days"), P("272"), P("")],
        [P("Expired"), P("2 416"), P("A historical corpus, not a failure of ingestion")],
        [P("Status unknown"), P("24"), P("Missing or unreadable expiry date")],
        [P("Average B-BBEE level"), P("2.7"), P("Across the whole registry")],
        [P("Average black ownership"), P("39.4%"), P("")],
        ]
story.append(make_table(rows, [55*mm, 30*mm, 90*mm]))
small("Measured from the production API (okiru.pro/api/certificates/stats) on 8 September 2026.")

subsec("5.2 What it does for a scorecard")
bullets([
    "A client's procurement schedule is matched against the registry, and each supplier's B-BBEE level and "
    "size are filled in automatically.",
    "A free dry-run harness measured this against 2 817 real certificates: <b>99.3% correct, none wrong</b> "
    "&mdash; the residual is certificates it declines to match rather than certificates it matches badly.",
    "Structured extraction runs through Azure Document Intelligence, with scanned documents handled by OCR. "
    "Affidavits and certificates were joined into one registry in August, so an EME affidavit is as usable as "
    "a full certificate.",
])

subsec("5.3 The caveat that matters when you test it")
note("<b>Only 8% of the registry is valid <i>today</i>, and that is expected.</b> These are certificates "
     "collected over several years. A certificate is valid for twelve months from issue, so what matters is "
     "whether it was valid at the client's <b>measurement period end</b> &mdash; not today. Measured against a "
     "February 2026 period end, three quarters of the registry was valid. When you test procurement autofill, "
     "please check it against the right period end, or the results will look far worse than they are.")
body("Two decisions remain open: whether to derive an expiry date when a certificate does not state one "
     "(we decided against it &mdash; guessing a validity window is exactly the kind of default we have been "
     "removing), and whether to spend on OCR enrichment for the remaining scanned documents.")

# ============================ 6. Document engine ============================
section("6. How a folder of documents becomes a scorecard")
rows = [[P("Step", True), P("What happens", True), P("The rule that protects the score", True)],
        [P("1. Sort", True), P("Each file is matched to one of 40 known document types in 14 evidence "
                               "families. Spreadsheets are matched tab by tab."),
         P("A file it cannot place with confidence is not guessed at &mdash; it is shown as unplaced, with "
           "the reason.")],
        [P("2. Read", True), P("The file is read against a written instruction for that document type, which "
                               "names every value to look for. Registers are read row by row."),
         P("A table with 134 rows produces 134 rows. Nothing is summarised, sampled or re-typed.")],
        [P("3. Name", True), P("Each value is given its standard name from a fixed permitted list "
                               "(382 names on the ESG side)."),
         P("A value not on the list is dropped and recorded as rejected. Nothing can invent a new place in "
           "the score.")],
        [P("4. Check", True), P("Each value is checked for shape: a number, a date, a Rand amount, a "
                                "percentage, Yes/No/Partial, or a dropdown option."),
         P("&ldquo;Partial&rdquo; is kept as its own answer rather than rounded to Yes or No.")],
        [P("5. Reconcile", True), P("Values are checked against each other &mdash; headcount against the "
                                    "employee register, ownership against the pillar cap, company aliases "
                                    "resolved to one entity."),
         P("A payload that does not make sense as a set is flagged before it is scored.")],
        [P("6. Review", True), P("The consultant sees what was read, what was not placed and why, and can "
                                 "correct anything before building the scorecard."),
         P("The extraction summary reports the real yield, not an encouraging one.")],
        ]
story.append(make_table(rows, [24*mm, 78*mm, 73*mm]))

subsec("What a read costs")
body("Extraction is paid for from an organisation's token wallet, so a card never has to appear mid-flow. "
     "The pricing rule is one knob: the customer price is the cloud cost times 2.5, a 60% gross margin on "
     "every read. A new organisation gets <b>10 000 free tokens</b>, which covers roughly one complete "
     "evidence pack for one company &mdash; enough to test the whole flow end to end without paying. "
     "Beyond that, Pro is R499 a month for 60 000 tokens, with top-ups at R249 for 25 000 and R899 for 100 000. "
     "Work in progress now survives leaving the page, and a paid extraction can be returned to rather than "
     "paid for twice.")


# ============================ 7. Platform & operations ============================
section("7. Platform, testing and operations")

subsec("7.1 Automated testing")
rows = [[P("Suite", True), P("Result", True), P("June 2026", True)],
        [P("B-BBEE sector calculators"), P("<font color='#1d7a4d'><b>895 passing</b></font>"), P("486")],
        [P("ESG toolkit"), P("<font color='#1d7a4d'><b>196 passing</b></font>"), P("did not exist")],
        [P("API"), P("<font color='#1d7a4d'><b>646 passing</b>, 0 failing</font>"), P("&mdash;")],
        [P("Web application (whole suite)"), P("2 282 passing, 11 failing, 71 skipped"), P("&mdash;")],
        ]
story.append(make_table(rows, [60*mm, 65*mm, 50*mm]))
gap(3)
small("The 11 web failures were examined for this report: five are five-second timeouts parsing a large "
      "workbook on a slow machine, one is a stale assertion that reads source text rather than behaviour, and "
      "the rest are the end-to-end tests that skip when no server is listening. None of them is a scoring "
      "error. They should still be cleaned up, because a suite that is habitually 11-red is a suite nobody "
      "reads.")

subsec("7.2 Accounts, teams and access")
bullets([
    "An organisation has a company administrator (the founder by default, transferable), who invites "
    "colleagues by email. Everything &mdash; clients, scorecards, assessments, workbooks &mdash; is scoped to "
    "the organisation.",
    "Clients are tagged as B-BBEE or ESG so the two products do not clutter each other's lists.",
    "ESG is open to every signed-in user unless an allowlist is switched on, in which case only listed email "
    "addresses see it. <b>This needs to be confirmed before testing</b> &mdash; see section 9.1.",
])

subsec("7.3 Operational gaps we are carrying")
rows = [[P("Gap", True), P("Consequence", True), P("Severity", True)],
        [P("No continuous integration"), P("Nothing runs the test suites automatically on a change. The "
                                           "Supplier Development defect in 3.4 sat undetected for roughly "
                                           "three weeks for exactly this reason."),
         P("<font color='#9b2226'><b>High</b></font>")],
        [P("Database restore never rehearsed"), P("Backups run and have been verified off-cluster, but we have "
                                                   "never proved we can restore from them."),
         P("<font color='#9b2226'><b>High</b></font>")],
        [P("Single database node"), P("No failover. An outage is a full outage."),
         P("<font color='#a1650a'><b>Medium</b></font>")],
        [P("No outbound email configured"), P("Invitations and notifications cannot be sent by the system."),
         P("<font color='#a1650a'><b>Medium</b></font>")],
        [P("A container registry password was once public"), P("It was removed from the repository; "
                                                                "<b>rotating it is still outstanding</b>."),
         P("<font color='#a1650a'><b>Medium</b></font>")],
        ]
story.append(make_table(rows, [48*mm, 100*mm, 27*mm]))

# ============================ 8. Status at a glance ============================
section("8. Status at a glance")
rows = [[P("Area", True), P("Ready to test?", True), P("Blocked on", True)],
        [P("B-BBEE sector configurations (17 scorecards)"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("MAC and Transport Large ladders unverified")],
        [P("B-BBEE calculation engine"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("Nothing &mdash; matches Lake Trading and the signed Construction verification")],
        [P("B-BBEE Excel import"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("Nothing &mdash; the 3.4 defect is fixed and the harness is green again")],
        [P("B-BBEE document upload"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("Nothing &mdash; this path classifies ESD separately and was never affected")],
        [P("ESG scoring"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("30 dead points; expert sign-off of the specification")],
        [P("ESG sector calibration"), P("<font color='#9b2226'><b>No</b></font>"),
         P("13 of 14 sectors inherit FMCG thresholds")],
        [P("ESG to B-BBEE bridge"), P("<font color='#a1650a'><b>Partly</b></font>"),
         P("Ownership and ESD have no editor; level ladder has blank rungs")],
        [P("Certificate registry and search"), P("<font color='#1d7a4d'><b>Yes</b></font>"), P("Nothing")],
        [P("Procurement autofill from certificates"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("Test against the right measurement period end")],
        [P("Token wallet and pricing"), P("<font color='#1d7a4d'><b>Yes</b></font>"),
         P("Confirm the production payment gate before testing (9.1)")],
        [P("Teams and invitations"), P("<font color='#a1650a'><b>Partly</b></font>"),
         P("No outbound email &mdash; invite links must be shared by hand")],
        ]
story.append(make_table(rows, [55*mm, 32*mm, 88*mm]))


# ============================ 9. Testing brief ============================
section("9. How we need you to test")
body("What we need is not &ldquo;click around and tell us if it breaks&rdquo;. We need testing against cases "
     "whose correct answer you already know, so that every difference between our number and yours resolves "
     "into one of two things: a bug we fix, or a methodology question you decide. Both are useful. Neither "
     "happens if the test data is invented.")

subsec("9.1 Before you start &mdash; four things to confirm with us")
bullets([
    "<b>Accounts.</b> Each tester needs a sign-in at okiru.pro. Because outbound email is not configured, "
    "invitation links have to be sent by hand &mdash; tell us who is testing and we will send them.",
    "<b>ESG visibility.</b> If the ESG allowlist is switched on in production, testers must be on it or the "
    "ESG product will simply not appear. Confirm with us before the first session.",
    "<b>Tokens.</b> Each organisation starts with 10 000 free tokens, about one full evidence pack. If you "
    "plan to run several document uploads, tell us and we will top the wallets up. Excel import and manual "
    "entry do not consume tokens &mdash; only document reading does.",
    "<b>The build.</b> Confirm with us that the production deployment carries the September work before you "
    "start, so you are not testing an older build and reporting bugs we have already fixed.",
])

subsec("9.2 The five test runs, in order")
rows = [[P("#", True), P("Run", True), P("What to do", True), P("What we learn", True)],
        [P("1", True), P("<b>Known workbook, known answer</b><br/>(the priority)"),
         P("Take a filled toolkit whose verified score you already have. Create a client, choose "
           "<i>Import Excel workbook</i>, import it, and compare the score pillar by pillar against your own. "
           "Do this for as many sectors as you have verified workbooks for."),
         P("Whether the engine agrees with a verification professional on real data. It is the only test "
           "that can confirm the levels are right &mdash; including the Sandile Freight case in 3.4.")],
        [P("2", True), P("<b>Folder of documents</b>"),
         P("For one company you know well, upload the whole evidence folder as it came from the client. Work "
           "through the review screen: check what was read, what was not placed, and whether anything was read "
           "wrongly. Correct it, then build the scorecard."),
         P("Whether the document engine is usable on a real, messy pack &mdash; and whether the "
           "&ldquo;not placed&rdquo; list is honest and actionable.")],
        [P("3", True), P("<b>ESG against the specification</b>"),
         P("Work through the 114-page ESG specification with the toolkit open beside it. Fill in the yellow "
           "tables: correct our thresholds, name the documents we are missing, and settle the "
           "&ldquo;decision needed&rdquo; rows."),
         P("Whether the ESG methodology is defensible. This unblocks more ESG work than anything else "
           "available.")],
        [P("4", True), P("<b>Certificates and procurement</b>"),
         P("Search the registry for suppliers you know. Then run a client's procurement schedule through "
           "autofill and check the levels it filled in &mdash; <b>against the client's measurement period end, "
           "not today's date</b>."),
         P("Whether supplier recognition can be trusted, which is worth up to 29 procurement points.")],
        [P("5", True), P("<b>The ordinary path</b>"),
         P("Create a client and type the figures in by hand, pillar by pillar, without uploading anything. "
           "Then reopen it the next day."),
         P("Whether the product works for a consultant who does not want to upload anything &mdash; and "
           "whether what was entered was actually saved.")],
        ]
story.append(make_table(rows, [7*mm, 34*mm, 76*mm, 58*mm], font=8.0))

rows = [[P("Client / workbook", True), P("Sector &amp; size", True), P("Your expected score", True),
         P("Okiru's score", True), P("Difference &mdash; and where", True), P("Bug or method?", True)]]
for _ in range(6):
    rows.append([P("&nbsp;"), P("&nbsp;"), P("&nbsp;"), P("&nbsp;"), P("&nbsp;"), P("&nbsp;")])
# Heading and blank log must not be split across a page — a test log whose
# header row sits on the previous page is not usable on paper.
story.append(KeepTogether([
    Paragraph("9.3 What to write down for each case", SUBSEC),
    make_table(rows, [40*mm, 24*mm, 26*mm, 24*mm, 38*mm, 23*mm],
               grid=True, row_height=[9*mm] + [11*mm]*6),
]))
gap(4)
body("Please record the difference <b>per pillar</b>, not just the total. A total that matches can hide two "
     "errors cancelling out, and a total that differs tells us nothing about where to look. Where you can, "
     "note the indicator.")

subsec("9.4 Telling a bug from a methodology question")
rows = [[P("It is a bug if&hellip;", True), P("It is a methodology question if&hellip;", True)],
        [P("A figure that is plainly in the document was not read, or was read into the wrong field.<br/><br/>"
           "The arithmetic is wrong for figures that were read correctly.<br/><br/>"
           "Something saved does not come back when you reopen it.<br/><br/>"
           "The screen says one number and the scorecard says another."),
         P("We applied a target, threshold or ladder you would apply differently.<br/><br/>"
           "We treated a contribution, a beneficiary or an occupational level under a different category "
           "than you would.<br/><br/>"
           "We declined to score something because the evidence was absent, and you would have scored it.<br/><br/>"
           "You disagree with a sector's weightings as we have configured them."),
         ]]
story.append(make_table(rows, [86*mm, 89*mm]))
gap(4)
body("Both are worth reporting. But please label them, because they go to different places: bugs go to the "
     "development queue, methodology questions go into the sector truth ledger and change the configuration "
     "for every client at once.")

subsec("9.5 How to report it")
bullets([
    "<b>In the product.</b> There is a feedback button on every screen. It carries a category "
    "(Bug / Idea / Compliance / Other) and a pillar selector, and it records which page you were on. This is "
    "the best channel for anything specific, because we get the context automatically.",
    "<b>For a whole test run</b>, send us the table from 9.3 along with the workbook or documents you used, "
    "so we can reproduce it exactly. A case we can reproduce gets fixed; a case we cannot reproduce gets "
    "discussed.",
    "<b>Anything that looks like a client-data or privacy problem</b>, please tell us directly rather than "
    "through the widget.",
])

# ============================ 10. What we need back ============================
rows = [[P("From", True), P("What", True), P("Why it is blocking", True)],
        [P("<b>Pholo &amp; the testing team</b>"), P("Test run 1 &mdash; verified workbooks with known scores, "
                                                      "per sector"),
         P("It is the only way to confirm the levels are right, and it rules on the early-payment "
           "recognition question raised in 3.4")],
        [P("<b>ESG expert</b>"), P("The 114-page specification, filled in"),
         P("30 dead points, 13 uncalibrated sectors and every open threshold sit behind it")],
        [P("<b>Zoleka (B-BBEE expert)</b>"), P("The Construction Phase-1 input questions from June, and the "
                                                "QSE Skills 25%-of-leviable target"),
         P("Construction cannot be signed off without them")],
        [P("<b>Whoever owns FSC</b>"), P("The Empowerment Financing grand-total denominator"),
         P("15 points are calculated but their share of the total is unpinned")],
        [P("<b>Us</b>"), P("Stand up continuous integration, rehearse a database restore, rotate the "
                            "exposed registry password"),
         P("The first is why a three-week-old scoring defect was found by hand rather than by a machine")],
        ]
story.append(KeepTogether([
    Paragraph("10. What we need back", SEC),
    make_table(rows, [44*mm, 60*mm, 71*mm]),
]))

gap(10)
story.append(HRFlowable(width="100%", thickness=0.8, color=RULE, spaceBefore=4, spaceAfter=6))
small("Okiru Pro &mdash; Platform Progress Report &middot; 8 September 2026 &middot; Prepared for Pholo. "
      "All figures were measured on 8 September 2026 from the live repository and the production API; the "
      "sector table is generated from the running engine configuration. Supersedes the B-BBEE System Progress "
      "Report of 25 June 2026.")

# ============================ Build ============================
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(18*mm, 12*mm, "Okiru Pro — Platform Progress Report · 8 September 2026")
    canvas.drawRightString(A4[0]-18*mm, 12*mm, "Page %d" % doc.page)
    canvas.setStrokeColor(RULE)
    canvas.line(18*mm, 15*mm, A4[0]-18*mm, 15*mm)
    canvas.restoreState()

OUT = "Okiru-Platform-Progress-Report-September-2026.pdf"
doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=15*mm, bottomMargin=20*mm,
                        title="Okiru Pro - Platform Progress Report (September 2026)",
                        author="Okiru")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
