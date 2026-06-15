# Carbon_Tax

- Rows scanned: up to 200
- Formulas: 46

## Sample rows (first 30)
R1: A1=💰  CARBON TAX LIABILITY CALCULATOR  |  SA Carbon Tax Act, Section 12  |  Tier 1 + Tier 2 sensitivity
R2: A2=Liability = (Scope 1+2 tCO₂e × (1 - Basic Allowance)) × Carbon Tax Rate. Display mode controlled by Assumptions!B13. Currency follows Assumptions!B11.
R4: A4=EMISSIONS BASE — pulled from E_Data GHG Summary
R5: A5=Scope | B5=Activity | C5=tCO₂e YTD | D5=Annualised | E5=Taxable (after 60% allow.) | F5=Source
R6: A6=Scope 1A | B6=Fleet diesel | C6=589465.53 [=IFERROR(E_Data!L75,0)] | D6=785954.04 [=C6*Assumptions!$B$112] | E6=314381.616 [=D6*(1-Assumptions!$B$39)] | F6=E_Data row 75 (annualised × 40% taxable)
R7: A7=Scope 1B | B7=Generator diesel | C7=2181.14 [=IFERROR(E_Data!L76,0)] | D7=2908.1866666667 [=C7*Assumptions!$B$112] | E7=1163.2746666667 [=D7*(1-Assumptions!$B$39)] | F7=E_Data row 76
R8: A8=Scope 1C | B8=LPG (forklifts) | C8=2280 [=IFERROR(E_Data!L77,0)] | D8=3040 [=C8*Assumptions!$B$112] | E8=1216 [=D8*(1-Assumptions!$B$39)] | F8=E_Data row 77
R9: A9=Scope 1D | B9=Business cars | C9=1053.82 [=IFERROR(E_Data!L78,0)] | D9=1405.0933333333 [=C9*Assumptions!$B$112] | E9=562.0373333333 [=D9*(1-Assumptions!$B$39)] | F9=E_Data row 78
R10: A10=Scope 2 | B10=Electricity (grid, net of solar) | C10=2589578.44 [=IFERROR(E_Data!L82,0)] | D10=3452771.25333333 [=C10*Assumptions!$B$112] | E10=1381108.50133333 [=D10*(1-Assumptions!$B$39)] | F10=E_Data row 82 (Scope 2 NET, after solar offset)
R11: A11=TOTAL TAXABLE | C11=3184558.93 [=SUM(C6:C10)] | D11=4246078.57333333 [=SUM(D6:D10)] | E11=1698431.42933333 [=SUM(E6:E10)]
R13: A13=LIABILITY CALCULATION — TIER 1 (CURRENT) vs TIER 2 (ESCALATED)
R14: A14=Metric | B14=Tier 1 (Current) | C14=Tier 2 (Escalated) | D14=Delta | E14=Display? | F14=Notes
R15: A15=Rate (currency/tCO₂e) | B15=236 [=Assumptions!B37] | C15=640 [=Assumptions!B38] | D15=404 [=C15-B15] | E15=Both [=IF(Assumptions!$B$15="Both (current + escalated)","Both",IF(Assumptions!$B$15="Escalated Tier 2 only","Tier 2 only","Tier 1 only"))] | F15=Rate from Assumptions TAX_T1 / TAX_T2
R16: A16=Annual liability (taxable × rate) | B16=400829817.322667 [=E11*B15] | C16=1086996114.77333 [=E11*C15] | D16=686166297.450667 [=C16-B16] | F16=Annualised taxable tCO₂e × rate per tCO₂e
R17: A17=Annual liability (formatted) | B17= 400,829,817 [=Assumptions!$B$14&" "&TEXT(B16,"#,##0")] | C17= 1,086,996,115 [=Assumptions!$B$14&" "&TEXT(C16,"#,##0")] | D17= 686,166,297 [=Assumptions!$B$14&" "&TEXT(D16,"#,##0")]
R19: A19=MITIGATION SCENARIOS — what-if liability reduction
R20: A20=Scenario | B20=Tier 1 saving | C20=Tier 2 saving | D20=Capex est. | E20=Payback | F20=Notes
R21: A21=Solar PV → 20% of grid demand | B21=65188321.2629333 [=IFERROR(E10*0.2*B15,0)] | C21=176781888.170667 [=IFERROR(E10*0.2*C15,0)] | D21=4500000 | E21=0.0293008304 [=IFERROR(D21/MAX(1,B21+C21/2),"")] | F21=Capex assumed R4.5M for 5-depot PV roll-out (R900k per depot)
R22: A22=Eco-driving training → -10% L/100km | B22=7419406.1376 [=IFERROR(E6*0.1*B15,0)] | C22=20120423.424 [=IFERROR(E6*0.1*C15,0)] | D22=350000 | E22=0.020023321 [=IFERROR(D22/MAX(1,B22+C22/2),"")] | F22=Training cost ~R4,500 per driver × 77 drivers
R23: A23=EV fleet → 20% transition | B23=14838812.2752 [=IFERROR(E6*0.2*B15,0)] | C23=40240846.848 [=IFERROR(E6*0.2*C15,0)] | D23=18000000 | E23=0.5148853984 [=IFERROR(D23/MAX(1,B23+C23/2),"")] | F23=Capex est: 27 vehicles × R670k diff vs diesel
R24: A24=TOTAL MITIGATION POTENTIAL | B24=87446539.6757333 [=SUM(B21:B23)] | C24=237143158.442667 [=SUM(C21:C23)] | D24=22850000 [=SUM(D21:D23)]
R26: A26=NET LIABILITY POSITION — pre and post mitigation
R27: A27=Pre-mitigation annual liability | B27= 400,829,817 [=Assumptions!$B$14&" "&TEXT(B16,"#,##0")] | C27= 1,086,996,115 [=Assumptions!$B$14&" "&TEXT(C16,"#,##0")]
R28: A28=Post-mitigation (all 3 scenarios) | B28= 313,383,278 [=Assumptions!$B$14&" "&TEXT(MAX(0,B16-B24),"#,##0")] | C28= 849,852,956 [=Assumptions!$B$14&" "&TEXT(MAX(0,C16-C24),"#,##0")]
R29: A29=% reduction | B29=0.218163759 [=IFERROR(B24/B16,0)] | C29=0.218163759 [=IFERROR(C24/C16,0)]