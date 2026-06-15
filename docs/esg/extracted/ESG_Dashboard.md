# ESG_Dashboard

- Rows scanned: up to 200
- Formulas: 136

## Sample rows (first 30)
R1: A1=🌱  ESG INTELLIGENCE DASHBOARD  —  SG Consumer  |  FY 2025/26  |  Powered by Okiru Consulting
R2: A2=Net-Zero · King V · IFRS S1/S2 · GARP/GRAP · ISO 14001/45001/27001 · Employment Equity · WSP/ATR
R4: A4=ESG PILLAR SCORES | L4=EXECUTIVE SUMMARY — Board view
R5: A5=Pillar | B5=Score | C5=Max | D5=% Score | E5=Rating | F5=Key Gap | G5=Net-Zero Link | H5=Standards
R6: A6=🟢 Environmental (E) | B6=36 [=E_Scorecard!D30] | C6=108 | D6=0.3333333333 [=IFERROR(B6/C6,0)] | E6=⚠ Attention [=IF(D6>=Assumptions!$B$62,"★★★ Excellent",IF(D6>=Assumptions!$B$63,"★★ Good",IF(D6>=Assumptions!$B$64,"★ Adequate","⚠ Attention")))] | F6=GHG Scope 1+2+3 | G6=Fleet diesel dominant | H6=IFRS S2/GRI 305/ISO14001
R7: A7=🔵 Social (S) | B7=33 [=S_Scorecard!D28] | C7=100 | D7=0.33 [=IFERROR(B7/C7,0)] | E7=⚠ Attention [=IF(D7>=Assumptions!$B$62,"★★★ Excellent",IF(D7>=Assumptions!$B$63,"★★ Good",IF(D7>=Assumptions!$B$64,"★ Adequate","⚠ Attention")))] | F7=EE targets | G7=EE + WSP compliance | H7=EEA/GRI 405/ISO45001
R8: A8=🟣 Governance (G) | B8=64.8529411765 [=G_Scorecard!D26] | C8=100 | D8=0.6485294118 [=IFERROR(B8/C8,0)] | E8=★ Adequate [=IF(D8>=Assumptions!$B$62,"★★★ Excellent",IF(D8>=Assumptions!$B$63,"★★ Good",IF(D8>=Assumptions!$B$64,"★ Adequate","⚠ Attention")))] | F8=King V full adoption | G8=IFRS S2 + King V P10 | H8=King V/IFRS S1-S2/POPIA
R9: A9=OVERALL ESG SCORE | D9=0.4461764706 [=IFERROR((E_Scorecard!D30/100+S_Scorecard!D28/100+G_Scorecard!D26/100)/3,0)] | L9=Material risks | M9=12 of 18 risks logged [=GARP_GRAP!C28&" of "&GARP_GRAP!C27&" risks logged"]
R10: L10=King V status | M10=135/170 (79.4%) [=King5_Scorecard!E21&"/170 ("&TEXT(King5_Scorecard!E22,"0.0%")&")"]
R11: A11=GHG EMISSIONS SUMMARY  (tCO₂e)  |  9 months actuals Jul-25 to Mar-26
R12: A12=Scope | B12=Jul-25 | C12=Aug-25 | D12=Sep-25 | E12=Oct-25 | F12=Nov-25 | G12=Dec-25 | H12=Jan-26
R13: A13=Scope 1 — Fleet Diesel | B13=79354.07 [=IFERROR(E_Data!C75,0)] | C13=68178.89 [=IFERROR(E_Data!D75,0)] | D13=65076.46 [=IFERROR(E_Data!E75,0)] | E13=73386.91 [=IFERROR(E_Data!F75,0)] | F13=67294.64 [=IFERROR(E_Data!G75,0)] | G13=57589.35 [=IFERROR(E_Data!H75,0)] | H13=48740.43 [=IFERROR(E_Data!I75,0)]
R14: A14=Scope 1 — Generator | B14=1289.14 [=IFERROR(E_Data!C76,0)] | C14=0 [=IFERROR(E_Data!D76,0)] | D14=0 [=IFERROR(E_Data!E76,0)] | E14=0 [=IFERROR(E_Data!F76,0)] | F14=0 [=IFERROR(E_Data!G76,0)] | G14=295 [=IFERROR(E_Data!H76,0)] | H14=0 [=IFERROR(E_Data!I76,0)]
R15: A15=Scope 1 — LPG Forklifts | B15=0 [=IFERROR(E_Data!C77,0)] | C15=570 [=IFERROR(E_Data!D77,0)] | D15=190 [=IFERROR(E_Data!E77,0)] | E15=190 [=IFERROR(E_Data!F77,0)] | F15=380 [=IFERROR(E_Data!G77,0)] | G15=570 [=IFERROR(E_Data!H77,0)] | H15=380 [=IFERROR(E_Data!I77,0)]
R16: A16=Scope 2 — Electricity (grid) | B16=288638.88 [=IFERROR(E_Data!C82,0)] | C16=304665.02 [=IFERROR(E_Data!D82,0)] | D16=294858.49 [=IFERROR(E_Data!E82,0)] | E16=263387.94 [=IFERROR(E_Data!F82,0)] | F16=255634.03 [=IFERROR(E_Data!G82,0)] | G16=290165.23 [=IFERROR(E_Data!H82,0)] | H16=261690.52 [=IFERROR(E_Data!I82,0)]
R17: A17=Scope 3 — Water | B17=409.41 [=IFERROR(E_Data!C83,0)] | C17=391.39 [=IFERROR(E_Data!D83,0)] | D17=380.72 [=IFERROR(E_Data!E83,0)] | E17=534.81 [=IFERROR(E_Data!F83,0)] | F17=476.36 [=IFERROR(E_Data!G83,0)] | G17=499.53 [=IFERROR(E_Data!H83,0)] | H17=533.01 [=IFERROR(E_Data!I83,0)]
R18: A18=TOTAL GHG (Scope 1+2+3) | B18=369691.5 [=SUM(B13:B17)] | C18=373805.3 [=SUM(C13:C17)] | D18=360505.67 [=SUM(D13:D17)] | E18=337499.66 [=SUM(E13:E17)] | F18=323785.03 [=SUM(F13:F17)] | G18=349119.11 [=SUM(G13:G17)] | H18=311343.96 [=SUM(H13:H17)]
R19: A19=KEY NET-ZERO & ESG KPIs — YTD FY2025/26
R20: A20=KPI | B20=Value | C20=Benchmark | D20=Source
R21: A21=Total fleet diesel (litres YTD) | B21=589465.53 [=E_Data!L19] | C21=<600,000 L target | D21=Fleet_Register
R22: A22=Total fleet tCO₂e Scope 1 | B22=594980.49 [=IFERROR(E_Data!L79,0)] | C22=<1,600 tCO₂e | D22=E_Data
R23: A23=Total electricity kWh YTD | B23=2589578.44 [=E_Data!L46] | C23=Monitor vs prior year | D23=Utility_Bills
R24: A24=Total electricity tCO₂e Scope 2 | B24=2589578.44 [=IFERROR(E_Data!L82,0)] | C24=Target: reduce 10% YoY | D24=E_Data
R25: A25=Fleet avg L/100km vs norm | B25=No data [=IFERROR(AVERAGEIFS(Fleet_Register!K4:K19,Fleet_Register!K4:K19,">0"),"No data")] | C25=≤ vehicle norm | D25=Fleet_Register
R26: A26=Oricol CPT waste diversion % | B26=0.911 [=Waste_Register!B16] | C26=≥90% — Target Met ✓ | D26=Waste_Register
R27: A27=EE: % Black employees | B27=0 [=EE_Scorecard!B5] | C27=≥60% | D27=EE_Scorecard
R28: A28=WSP submitted to SETA | B28=0 [=S_Data!B45] | C28=Yes — Required | D28=S_Data
R29: A29=LTIFR YTD | B29=Awaiting hours worked [=IFERROR(S_Data!G35,"No data")] | C29=<2.0 | D29=S_Data
R30: A30=King V score | B30=135 [=King5_Scorecard!E21] | C30=≥100/170 | D30=King5_Scorecard
R31: A31=IFRS S1/S2 disclosures | B31=0 [=IFERROR(COUNTIF(IFRS_S1_S2!D4:D40,"Yes")/MAX(1,COUNTA(IFRS_S1_S2!A4:A40)-COUNTBLANK(IFRS_S1_S2!A4:A40)),0)] | C31=≥80% disclosed | D31=IFRS_S1_S2