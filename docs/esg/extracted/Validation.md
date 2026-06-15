# Validation

- Rows scanned: up to 200
- Formulas: 24

## Sample rows (first 30)
R1: A1=VALIDATION — Data Quality Checks | Formula Verification | Zero Error Target
R3: A3=DATA COMPLETENESS CHECKS
R4: A4=Check | B4=Expected | C4=Actual (auto) | D4=Pass/Fail | E4=Action
R5: A5=E_Data: Fleet diesel months completed (9) | B5=9 | C5=9 [=COUNTIF(E_Data!C14:K14,">0")] | D5=✗ FAIL — check data [=IF(C5=B5,"✓ PASS","✗ FAIL — check data")] | E5=Update relevant data sheet
R6: A6=E_Data: Electricity kWh months completed (9) | B6=9 | C6=9 [=COUNTIF(E_Data!C44:K44,">0")] | D6=✗ FAIL — check data [=IF(C6=B6,"✓ PASS","✗ FAIL — check data")] | E6=Update relevant data sheet
R7: A7=E_Data: Water kL months completed (9) | B7=9 | C7=9 [=COUNTIF(E_Data!C61:K61,">0")] | D7=✗ FAIL — check data [=IF(C7=B7,"✓ PASS","✗ FAIL — check data")] | E7=Update relevant data sheet
R8: A8=S_Data: EE headcount entered (>0) | B8=Yes | C8=No [=IF(S_Data!L12>0,"Yes","No")] | D8=✗ FAIL — check data [=IF(C8=B8,"✓ PASS","✗ FAIL — check data")] | E8=Update relevant data sheet
R9: A9=E_Scorecard: Total score >0 | B9=Yes | C9=Yes [=IF(E_Scorecard!D30>0,"Yes","No")] | D9=✓ PASS [=IF(C9=B9,"✓ PASS","✗ FAIL — check data")] | E9=Update relevant data sheet
R10: A10=S_Scorecard: Total score >0 | B10=Yes | C10=Yes [=IF(S_Scorecard!D28>0,"Yes","No")] | D10=✓ PASS [=IF(C10=B10,"✓ PASS","✗ FAIL — check data")] | E10=Update relevant data sheet
R11: A11=G_Scorecard: Total score >0 | B11=Yes | C11=Yes [=IF(G_Scorecard!D26>0,"Yes","No")] | D11=✓ PASS [=IF(C11=B11,"✓ PASS","✗ FAIL — check data")] | E11=Update relevant data sheet
R12: A12=King5: All 17 principles have status | B12=17 | C12=7 [=COUNTA(King5_Scorecard!C4:C30)-COUNTBLANK(King5_Scorecard!C4:C30)] | D12=✗ FAIL — check data [=IF(C12=B12,"✓ PASS","✗ FAIL — check data")] | E12=Update relevant data sheet
R13: A13=IFRS S1/S2: Disclosures entered | B13=Yes | C13=Yes [=IF(COUNTA(IFRS_S1_S2!D4:D40)>0,"Yes","No")] | D13=✓ PASS [=IF(C13=B13,"✓ PASS","✗ FAIL — check data")] | E13=Update relevant data sheet
R14: A14=Fleet_Register: Vehicle entries >0 | B14=Yes | C14=Yes [=IF(COUNTA(Fleet_Register!A4:A30)>0,"Yes","No")] | D14=✓ PASS [=IF(C14=B14,"✓ PASS","✗ FAIL — check data")] | E14=Update relevant data sheet
R15: A15=Waste_Register: Oricol data loaded | B15=Yes | C15=Yes [=IF(Waste_Register!D5>0,"Yes","No")] | D15=✓ PASS [=IF(C15=B15,"✓ PASS","✗ FAIL — check data")] | E15=Update relevant data sheet
R16: A16=Driver_Debrief: Apr-26 data loaded | B16=Yes | C16=Yes [=IF(COUNTA(Driver_Debrief!C4:C15)>0,"Yes","No")] | D16=✓ PASS [=IF(C16=B16,"✓ PASS","✗ FAIL — check data")] | E16=Update relevant data sheet
R18: A18=GHG CALCULATION VERIFICATION  (cross-check against manual calc)
R19: A19=Fleet BLOEM: Manual check | B19=72,683 L | C19=194.791 tCO₂e | D19=EF_DIESEL=2.68 | E19=Verify = E_Data Fleet row
R20: A20=Fleet CPT: Manual check | B20=51,800 L | C20=138.824 tCO₂e | D20=EF_DIESEL=2.68 | E20=Verify = E_Data Fleet row
R21: A21=Fleet DBN: Manual check | B21=156,779 L | C21=420.168 tCO₂e | D21=EF_DIESEL=2.68 | E21=Verify = E_Data Fleet row
R22: A22=Fleet ISANDO: Manual check | B22=296,059 L | C22=793.438 tCO₂e | D22=EF_DIESEL=2.68 | E22=Verify = E_Data Fleet row
R23: A23=Fleet PE: Manual check | B23=12,144 L | C23=32.546 tCO₂e | D23=EF_DIESEL=2.68 | E23=Verify = E_Data Fleet row
R24: A24=MANUAL GHG TOTALS (Jul-25 to Mar-26) — vs E_Data
R25: A25=Total fleet diesel litres (all depots) | B25=589,465.53 | C25=litres
R26: A26=Total fleet Scope 1 tCO₂e | B26=1,579.768 | C26=tCO₂e
R27: A27=Total electricity kWh (all depots) | B27=2,589,578.44 | C27=kWh
R28: A28=Total electricity Scope 2 tCO₂e | B28=2,123.454 | C28=tCO₂e
R29: A29=Total LPG DBN forklifts | B29=2,280 | C29=kg
R30: A30=Total LPG Scope 1 tCO₂e | B30=3.443 | C30=tCO₂e
R31: A31=Total water all depots | B31=4,356.410 | C31=kL
R32: A32=GRAND SCOPE 1+2 (excl solar offset) | B32=3703.222 | C32=tCO₂e