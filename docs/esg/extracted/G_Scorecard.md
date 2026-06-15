# G_Scorecard

- Rows scanned: up to 200
- Formulas: 43

## Sample rows (first 30)
R1: A1=G SCORECARD — Governance vs 100 pts  |  King V · IFRS S1/S2 · GARP/GRAP · POPIA · ISO 27001
R3: A3=Indicator | B3=Max
Pts | C3=Actual | D3=Score | E3=Data Source | F3=Status | G3=Standard Ref | H3=Action
R4: A4=── King V ──
R5: A5=King V: Score ≥70% (Apply & Explain) | B5=25 | C5=19.8529411765 [=King5_Scorecard!E21/170*25] | D5=19.8529411765 [=MIN(C5,B5)] | E5=King5_Scorecard | F5=⚠ Partial [=IF(D5>=B5,"✓ Met",IF(D5>=B5*0.5,"⚠ Partial","✗ Gap"))] | G5=King V all 17 principles | H5=Board apply & explain all principles
R6: A6=King V: Social & Ethics Committee established | B6=5 | C6=5 [=G_Data!F13] | D6=5 [=MIN(C6,B6)] | E6=G_Data | F6=⚠ Partial [=IF(D6>=B6,"✓ Met",IF(D6>=B6*0.5,"⚠ Partial","✗ Gap"))] | G6=King V P5 / Companies Act s72 | H6=S&EC ToR and meetings minutes
R7: A7=King V: ESG-linked executive remuneration | B7=5 | C7=0 [=G_Data!F14] | D7=0 [=MIN(C7,B7)] | E7=G_Data | F7=✗ Gap [=IF(D7>=B7,"✓ Met",IF(D7>=B7*0.5,"⚠ Partial","✗ Gap"))] | G7=King V P6 / GRI 201 | H7=ESG KPIs in exec contracts
R8: A8=── IFRS ──
R9: A9=IFRS: S1/S2 disclosures prepared | B9=10 | C9=0 [=IFERROR(10*COUNTIF(IFRS_S1_S2!D4:D40,"Yes")/MAX(1,COUNTA(IFRS_S1_S2!A4:A40)-COUNTBLANK(IFRS_S1_S2!A4:A40)),0)] | D9=0 [=MIN(C9,B9)] | E9=IFRS_S1_S2 | F9=✗ Gap [=IF(D9>=B9,"✓ Met",IF(D9>=B9*0.5,"⚠ Partial","✗ Gap"))] | G9=IFRS S1/S2 / TCFD | H9=Annual ESG/integrated report
R10: A10=IFRS: Climate risk in board agenda | B10=5 | C10=2.5 [=G_Data!F23] | D10=2.5 [=MIN(C10,B10)] | E10=IFRS_S1_S2 | F10=⚠ Partial [=IF(D10>=B10,"✓ Met",IF(D10>=B10*0.5,"⚠ Partial","✗ Gap"))] | G10=IFRS S2 / King V P10 | H10=Quarterly risk review
R11: A11=── GARP ──
R12: A12=GARP: ERM framework includes ESG/climate risks | B12=8 | C12=8 [=IF(G_Data!F21>0,IF(G_Data!F23>0,8,4),0)] | D12=8 [=MIN(C12,B12)] | E12=GARP_GRAP | F12=⚠ Partial [=IF(D12>=B12,"✓ Met",IF(D12>=B12*0.5,"⚠ Partial","✗ Gap"))] | G12=GARP ERM / IFRS S1 | H12=10 material ESG risks identified
R13: A13=── GRAP ──
R14: A14=GARP: GRAP public interest compliance | B14=5 | C14=5 [=IF(G_Data!F5>0,5,0)] | D14=5 [=MIN(C14,B14)] | E14=GARP_GRAP | F14=⚠ Partial [=IF(D14>=B14,"✓ Met",IF(D14>=B14*0.5,"⚠ Partial","✗ Gap"))] | G14=Companies Act s93 | H14=PI score ≥500 monitored
R15: A15=── ISO 27001 ──
R16: A16=ISO 27001: POPIA Information Officer appointed | B16=5 | C16=2.5 [=G_Data!F17] | D16=2.5 [=MIN(C16,B16)] | E16=ISO_Tracker | F16=⚠ Partial [=IF(D16>=B16,"✓ Met",IF(D16>=B16*0.5,"⚠ Partial","✗ Gap"))] | G16=POPIA Act / ISO 27001 | H16=s55 appointment letter
R17: A17=ISO 27001: Cyber/data risk assessed | B17=5 | C17=2.5 [=G_Data!F18] | D17=2.5 [=MIN(C17,B17)] | E17=ISO_Tracker | F17=⚠ Partial [=IF(D17>=B17,"✓ Met",IF(D17>=B17*0.5,"⚠ Partial","✗ Gap"))] | G17=ISO 27001 / King V P9 | H17=Annual cyber risk assessment
R18: A18=── Reporting ──
R19: A19=Transparency: ESG/Integrated report published | B19=8 | C19=8 [=G_Data!F20*8/5] | D19=8 [=MIN(C19,B19)] | E19=G_Data | F19=⚠ Partial [=IF(D19>=B19,"✓ Met",IF(D19>=B19*0.5,"⚠ Partial","✗ Gap"))] | G19=King V P8/P15 / GRI 2-3 | H19=Annual publication commitment
R20: A20=Transparency: External assurance of ESG report | B20=5 | C20=0 [=G_Data!F19] | D20=0 [=MIN(C20,B20)] | E20=G_Data | F20=✗ Gap [=IF(D20>=B20,"✓ Met",IF(D20>=B20*0.5,"⚠ Partial","✗ Gap"))] | G20=ISAE 3000 / King V P11 | H20=Assurance provider engaged
R21: A21=── Ethics ──
R22: A22=Ethics: Code of ethics + hotline active | B22=4 | C22=4 [=(G_Data!F15+G_Data!F16)/2*4/5] | D22=4 [=MIN(C22,B22)] | E22=G_Data | F22=⚠ Partial [=IF(D22>=B22,"✓ Met",IF(D22>=B22*0.5,"⚠ Partial","✗ Gap"))] | G22=King V P1 / GRI 205 | H22=Confidential hotline operational
R23: A23=── Compliance ──
R24: A24=Compliance: Legal register maintained | B24=5 | C24=2.5 [=G_Data!F21] | D24=2.5 [=MIN(C24,B24)] | E24=ISO_Tracker | F24=⚠ Partial [=IF(D24>=B24,"✓ Met",IF(D24>=B24*0.5,"⚠ Partial","✗ Gap"))] | G24=ISO 14001/45001 / King V P12 | H24=Quarterly compliance review
R25: A25=Compliance: No material regulatory penalties | B25=5 | C25=5 [=IF(G_Data!B25="",5,IF(G_Data!B25=0,5,0))] | D25=5 [=MIN(C25,B25)] | E25=G_Data | F25=⚠ Partial [=IF(D25>=B25,"✓ Met",IF(D25>=B25*0.5,"⚠ Partial","✗ Gap"))] | G25=Companies Act / NEMA | H25=Zero-tolerance compliance
R26: A26=G SCORECARD TOTAL | D26=64.8529411765 [=SUM(D5,D6,D7,D9,D10,D12,D14,D16,D17,D19,D20,D22,D24,D25)]