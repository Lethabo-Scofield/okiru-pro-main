# S_Data

- Rows scanned: up to 200
- Formulas: 71

## Sample rows (first 30)
R1: A1=S_DATA — SOCIAL RAW DATA  |  H&S · EE Headcount · Training · Community  [Sources: Accidently / HR / SETA / Cority]
R3: A3=EMPLOYMENT EQUITY — HEADCOUNT BY OCCUPATIONAL LEVEL & RACE  [EEA2 format | Source: HR payroll system]
R4: A4=Occupational Level | B4=Af M | C4=Col M | D4=Ind M | E4=Wht M | F4=Af F | G4=Col F | H4=Ind F
R5: A5=Top Management (EEA2 L1) | B5=0 | C5=0 | D5=0 | E5=0 | F5=0 | G5=0 | H5=0
R6: A6=Senior Management (EEA2 L2) | B6=0 | C6=0 | D6=0 | E6=0 | F6=0 | G6=0 | H6=0
R7: A7=Professionally Qualified (EEA2 L3) | B7=0 | C7=0 | D7=0 | E7=0 | F7=0 | G7=0 | H7=0
R8: A8=Skilled Technical (EEA2 L4) | B8=0 | C8=0 | D8=0 | E8=0 | F8=0 | G8=0 | H8=0
R9: A9=Semi-Skilled (EEA2 L5) | B9=0 | C9=0 | D9=0 | E9=0 | F9=0 | G9=0 | H9=0
R10: A10=Unskilled (EEA2 L6) | B10=0 | C10=0 | D10=0 | E10=0 | F10=0 | G10=0 | H10=0
R11: A11=Non-Permanent | B11=0 | C11=0 | D11=0 | E11=0 | F11=0 | G11=0 | H11=0
R12: A12=TOTAL ALL LEVELS | B12=0 [=SUM(B5,B6,B7,B8,B9,B10,B11)] | C12=0 [=SUM(C5,C6,C7,C8,C9,C10,C11)] | D12=0 [=SUM(D5,D6,D7,D8,D9,D10,D11)] | E12=0 [=SUM(E5,E6,E7,E8,E9,E10,E11)] | F12=0 [=SUM(F5,F6,F7,F8,F9,F10,F11)] | G12=0 [=SUM(G5,G6,G7,G8,G9,G10,G11)] | H12=0 [=SUM(H5,H6,H7,H8,H9,H10,H11)]
R14: A14=EE TARGETS & GAP ANALYSIS  [EEA Section 20 targets]
R15: A15=Level | B15=Total | C15=% Black | D15=Target % Black | E15=% Black Female | F15=Target % BlkF | G15=% PWD | H15=Target % PWD
R16: A16=Top Management (EEA2 L1) | B16=0 [=S_Data!L5] | C16=0 [=IFERROR((S_Data!B5+S_Data!C5+S_Data!D5+S_Data!F5+S_Data!G5+S_Data!H5)/S_Data!L5,0)] | D16=0.55 | E16=0 [=IFERROR((S_Data!F5+S_Data!G5+S_Data!H5)/S_Data!L5,0)] | F16=0.3 | G16=0 [=0] | H16=0.02
R17: A17=Senior Management (EEA2 L2) | B17=0 [=S_Data!L6] | C17=0 [=IFERROR((S_Data!B6+S_Data!C6+S_Data!D6+S_Data!F6+S_Data!G6+S_Data!H6)/S_Data!L6,0)] | D17=0.55 | E17=0 [=IFERROR((S_Data!F6+S_Data!G6+S_Data!H6)/S_Data!L6,0)] | F17=0.3 | G17=0 [=0] | H17=0.02
R18: A18=Professionally Qualified (EEA2 L3) | B18=0 [=S_Data!L7] | C18=0 [=IFERROR((S_Data!B7+S_Data!C7+S_Data!D7+S_Data!F7+S_Data!G7+S_Data!H7)/S_Data!L7,0)] | D18=0.55 | E18=0 [=IFERROR((S_Data!F7+S_Data!G7+S_Data!H7)/S_Data!L7,0)] | F18=0.3 | G18=0 [=0] | H18=0.02
R19: A19=Skilled Technical (EEA2 L4) | B19=0 [=S_Data!L8] | C19=0 [=IFERROR((S_Data!B8+S_Data!C8+S_Data!D8+S_Data!F8+S_Data!G8+S_Data!H8)/S_Data!L8,0)] | D19=0.55 | E19=0 [=IFERROR((S_Data!F8+S_Data!G8+S_Data!H8)/S_Data!L8,0)] | F19=0.3 | G19=0 [=0] | H19=0.02
R20: A20=Semi-Skilled (EEA2 L5) | B20=0 [=S_Data!L9] | C20=0 [=IFERROR((S_Data!B9+S_Data!C9+S_Data!D9+S_Data!F9+S_Data!G9+S_Data!H9)/S_Data!L9,0)] | D20=0.55 | E20=0 [=IFERROR((S_Data!F9+S_Data!G9+S_Data!H9)/S_Data!L9,0)] | F20=0.3 | G20=0 [=0] | H20=0.02
R21: A21=Unskilled (EEA2 L6) | B21=0 [=S_Data!L10] | C21=0 [=IFERROR((S_Data!B10+S_Data!C10+S_Data!D10+S_Data!F10+S_Data!G10+S_Data!H10)/S_Data!L10,0)] | D21=0.55 | E21=0 [=IFERROR((S_Data!F10+S_Data!G10+S_Data!H10)/S_Data!L10,0)] | F21=0.3 | G21=0 [=0] | H21=0.02
R22: J22=0 [=AVERAGE(J16,J17,J18,J19,J20,J21)]
R24: A24=HEALTH & SAFETY  [ISO 45001 | Source: Accidently system | Cority report | Driver debrief]
R25: A25=H&S Metric | B25=Unit | C25=Q1 Jul-Sep | D25=Q2 Oct-Dec | E25=Q3 Jan-Mar | F25=Q4 Apr-Jun | G25=YTD | H25=Target
R26: A26=Total employees (for LTIFR calc) | B26=headcount | C26=426 | D26=426 | E26=426 | F26=426 | G26=426 | H26=< 2.0
R27: A27=Hours worked YTD | B27=hours | C27=0 | D27=0 | E27=0 | F27=0 | G27=0 [=SUM(C27:F27)]
R28: A28=Fatalities YTD | B28=count | C28=— | D28=— | E28=— | F28=— | G28=— | H28=0
R29: A29=Lost Time Injuries YTD | B29=count | C29=1 | D29=2 | E29=1 | F29=0 | G29=4 [=SUM(C29:F29)] | I29=Source: SHE Incidents register Jul-25 to Apr-26 (Wallace Arends, Ndumiso Mkhize, Joseph Sebeko, Tendani Matumba)
R30: A30=Medical Treatment Injuries (MTI) | B30=count | C30=0 | D30=0 | E30=3 | F30=0 | G30=3 [=SUM(C30:F30)]
R31: A31=First Aid Cases | B31=count | C31=0 | D31=0 | E31=0 | F31=0 | G31=0 [=SUM(C31:F31)]
R32: A32=Near Miss incidents | B32=count | C32=0 | D32=0 | E32=1 | F32=0 | G32=1 [=SUM(C32:F32)]
R33: A33=Vehicle accidents (fleet) | B33=count | C33=1 | D33=4 | E33=3 | F33=0 | G33=8 [=SUM(C33:F33)]