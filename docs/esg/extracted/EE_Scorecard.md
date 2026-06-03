# EE_Scorecard

- Rows scanned: up to 200
- Formulas: 82

## Data validations
- `B9` type=list formula1="Yes,No,Partial,N/A"
- `B10` type=list formula1="Yes,No,Partial,N/A"
- `B11` type=list formula1="Yes,No,Partial,N/A"
- `B12` type=list formula1="Yes,No,Partial,N/A"
- `B13` type=list formula1="Yes,No,Partial,N/A"
- `B14` type=list formula1="Yes,No,Partial,N/A"

## Sample rows (first 30)
R1: A1=EE SCORECARD — Employment Equity Act | EEA2 Reporting | GRI 405  [Links: S_Data headcount]
R3: A3=EE SCORE CARD — Weighted scoring aligned to EEA & B-BBEE Management Control
R4: A4=EE Indicator | B4=Actual | C4=Target | D4=Weight | E4=Score | F4=Max | G4=Status | H4=Standard Ref
R5: A5=% Black (all levels combined) | B5=0 [=IFERROR((S_Data!B5+S_Data!C5+S_Data!D5+S_Data!F5+S_Data!G5+S_Data!H5)/(S_Data!L5)*1,0)] | C5=60% | D5=20 | E5=0 [=IFERROR(MIN(20,ROUND(B5/0.6*20,2)),0)] | F5=20 | G5=✗ Gap [=IF(E5>=F5*0.9,"✓ Met",IF(E5>=F5*0.5,"⚠ Partial","✗ Gap"))] | H5=EEA s27 / GRI 405
R6: A6=% Black female (all levels) | B6=0 [=0] | C6=30% | D6=15 | E6=0 [=IFERROR(MIN(15,ROUND(B6/0.3*15,2)),0)] | F6=15 | G6=✗ Gap [=IF(E6>=F6*0.9,"✓ Met",IF(E6>=F6*0.5,"⚠ Partial","✗ Gap"))] | H6=EEA s27 / GRI 405
R7: A7=% Black Top/Senior Mgmt (L1+L2) | B7=0 [=IFERROR((S_Data!B5+ S_Data!B6)/S_Data!L12,0)] | C7=50% | D7=20 | E7=0 [=IFERROR(MIN(20,ROUND(B7/0.5*20,2)),0)] | F7=20 | G7=✗ Gap [=IF(E7>=F7*0.9,"✓ Met",IF(E7>=F7*0.5,"⚠ Partial","✗ Gap"))] | H7=EEA s27 / King V P4
R8: A8=% Persons with Disabilities | B8=0 [=0] | C8=2% | D8=10 | E8=0 [=IFERROR(MIN(10,ROUND(B8/0.02*10,2)),0)] | F8=10 | G8=✗ Gap [=IF(E8>=F8*0.9,"✓ Met",IF(E8>=F8*0.5,"⚠ Partial","✗ Gap"))] | H8=EEA s6 / GRI 405
R9: A9=EE Plan submitted to DoEL (Y/N) | B9=Yes | C9=Yes | D9=10 | E9=10 [=IF(B9="Yes",10,IF(B9="Partial",5,0))] | F9=10 | G9=✓ Met [=IF(E9>=F9*0.9,"✓ Met",IF(E9>=F9*0.5,"⚠ Partial","✗ Gap"))] | H9=EEA s20/21
R10: A10=EE forum/TDs consulted (Y/N) | B10=Yes | C10=Yes | D10=5 | E10=5 [=IF(B10="Yes",5,IF(B10="Partial",2,0))] | F10=5 | G10=✓ Met [=IF(E10>=F10*0.9,"✓ Met",IF(E10>=F10*0.5,"⚠ Partial","✗ Gap"))] | H10=EEA s16
R11: A11=EE monitoring & reporting (Y/N) | B11=Yes | C11=Yes | D11=5 | E11=5 [=IF(B11="Yes",5,IF(B11="Partial",2,0))] | F11=5 | G11=✓ Met [=IF(E11>=F11*0.9,"✓ Met",IF(E11>=F11*0.5,"⚠ Partial","✗ Gap"))] | H11=EEA s19
R12: A12=Numerical targets set (Y/N) | B12=Yes | C12=Yes | D12=5 | E12=5 [=IF(B12="Yes",5,IF(B12="Partial",2,0))] | F12=5 | G12=✓ Met [=IF(E12>=F12*0.9,"✓ Met",IF(E12>=F12*0.5,"⚠ Partial","✗ Gap"))] | H12=EEA s20(2)(b)
R13: A13=Barriers to EE removed (Y/N) | B13=Yes | C13=Yes | D13=5 | E13=5 [=IF(B13="Yes",5,IF(B13="Partial",2,0))] | F13=5 | G13=✓ Met [=IF(E13>=F13*0.9,"✓ Met",IF(E13>=F13*0.5,"⚠ Partial","✗ Gap"))] | H13=EEA s20(2)(c)
R14: A14=Affirmative measures implemented | B14=Yes | C14=Yes | D14=5 | E14=5 [=IF(B14="Yes",5,IF(B14="Partial",2,0))] | F14=5 | G14=✓ Met [=IF(E14>=F14*0.9,"✓ Met",IF(E14>=F14*0.5,"⚠ Partial","✗ Gap"))] | H14=EEA s15
R15: A15=EE TOTAL SCORE (out of 100) | E15=35 [=SUM(E5,E6,E7,E8,E9,E10,E11,E12,E13,E14)] | F15=100 | G15=Needs Attention [=IF(E15>=85,"Excellent",IF(E15>=70,"Good",IF(E15>=50,"Adequate","Needs Attention")))]
R17: A17=EE HEADCOUNT SUMMARY  (from S_Data — update headcount there)
R18: A18=Level | B18=Af M | C18=Col M | D18=Ind M | E18=Wht M | F18=Af F | G18=Col F | H18=Ind F
R19: A19=Top Mgmt | B19=0 [=S_Data!B5] | C19=0 [=S_Data!C5] | D19=0 [=S_Data!D5] | E19=0 [=S_Data!E5] | F19=0 [=S_Data!F5] | G19=0 [=S_Data!G5] | H19=0 [=S_Data!H5]
R20: A20=Senior Mgmt | B20=0 [=S_Data!B6] | C20=0 [=S_Data!C6] | D20=0 [=S_Data!D6] | E20=0 [=S_Data!E6] | F20=0 [=S_Data!F6] | G20=0 [=S_Data!G6] | H20=0 [=S_Data!H6]
R21: A21=Prof Qualified | B21=0 [=S_Data!B7] | C21=0 [=S_Data!C7] | D21=0 [=S_Data!D7] | E21=0 [=S_Data!E7] | F21=0 [=S_Data!F7] | G21=0 [=S_Data!G7] | H21=0 [=S_Data!H7]
R22: A22=Skilled Tech | B22=0 [=S_Data!B8] | C22=0 [=S_Data!C8] | D22=0 [=S_Data!D8] | E22=0 [=S_Data!E8] | F22=0 [=S_Data!F8] | G22=0 [=S_Data!G8] | H22=0 [=S_Data!H8]
R23: A23=Semi-Skilled | B23=0 [=S_Data!B9] | C23=0 [=S_Data!C9] | D23=0 [=S_Data!D9] | E23=0 [=S_Data!E9] | F23=0 [=S_Data!F9] | G23=0 [=S_Data!G9] | H23=0 [=S_Data!H9]
R24: A24=Unskilled | B24=0 [=S_Data!B10] | C24=0 [=S_Data!C10] | D24=0 [=S_Data!D10] | E24=0 [=S_Data!E10] | F24=0 [=S_Data!F10] | G24=0 [=S_Data!G10] | H24=0 [=S_Data!H10]
R25: A25=TOTAL | B25=0 [=S_Data!B12] | C25=0 [=S_Data!C12] | D25=0 [=S_Data!D12] | E25=0 [=S_Data!E12] | F25=0 [=S_Data!F12] | G25=0 [=S_Data!G12] | H25=0 [=S_Data!H12]