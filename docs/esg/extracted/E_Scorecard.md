# E_Scorecard

- Rows scanned: up to 200
- Formulas: 55

## Sample rows (first 30)
R1: A1=E SCORECARD — Environmental Performance vs 100 pts  |  Net-Zero Lens  |  Links: E_Data
R3: A3=Indicator | B3=Max
Pts | C3=Actual
(auto) | D3=Score | E3=Data Source | F3=Status | G3=Standard Ref | H3=Net-Zero Action
R4: A4=── GHG ──
R5: A5=GHG: Scope 1 baseline established & tracked | B5=5 | C5=5 [=IF(E_Data!L19>0,5,0)] | D5=5 [=MIN(C5,B5)] | E5=E_Data Fleet | F5=⚠ Partial [=IF(D5>=B5,"✓ Met",IF(D5>=B5*0.5,"⚠ Partial","✗ Gap"))] | G5=IFRS S2 / GHG Protocol | H5=Baseline year: FY2025/26
R6: A6=GHG: Scope 1 reduction vs prior year | B6=10 | C6=0 [=IFERROR(IF(E_Data!$B$90=0,0,IF((E_Data!$B$90-E_Data!$F$90)/E_Data!$B$90>=Assumptions!$B$43,10,IF((E_Data!$B$90-E_Data!$F$90)/E_Data!$B$90>=Assumptions!$B$43*Assumptions!$B$9,10*((E_Data!$B$90-E_Data!$F$90)/E_Data!$B$90)/Assumptions!$B$43,0))),0)] | D6=0 [=MIN(C6,B6)] | E6=E_Data GHG | F6=✗ Gap [=IF(D6>=B6,"✓ Met",IF(D6>=B6*0.5,"⚠ Partial","✗ Gap"))] | G6=SBTi near-term / IFRS S2 | H6=Target: -10% YoY → -50% by 2030
R7: A7=GHG: Scope 2 net reduction (solar offset) | B7=8 | C7=0 [=IFERROR(IF(E_Data!$M$80=0,0,IF(-E_Data!$M$81/E_Data!$M$80>=Assumptions!$B$44,8,IF(-E_Data!$M$81/E_Data!$M$80>=Assumptions!$B$44*Assumptions!$B$9,8*(-E_Data!$M$81/E_Data!$M$80)/Assumptions!$B$44,0))),0)] | D7=0 [=MIN(C7,B7)] | E7=E_Data Solar | F7=✗ Gap [=IF(D7>=B7,"✓ Met",IF(D7>=B7*0.5,"⚠ Partial","✗ Gap"))] | G7=RE100 / GRI 305-2 | H7=Expand solar all depots by 2027
R8: A8=GHG: Scope 3 tracking initiated | B8=5 | C8=5 [=IF(E_Data!$L$63>0,5,0)] | D8=5 [=MIN(C8,B8)] | E8=E_Data Scope3 | F8=⚠ Partial [=IF(D8>=B8,"✓ Met",IF(D8>=B8*0.5,"⚠ Partial","✗ Gap"))] | G8=GHG Protocol S3 / IFRS S2 | H8=Water, value chain, business travel
R9: A9=GHG: Net-zero target formally set (SBTi) | B9=5 | C9=5 [=IF(AND(Assumptions!$B$107>=2030,Assumptions!$B$107<=2060),5,IF(Assumptions!$B$107>0,2.5,0))] | D9=5 [=MIN(C9,B9)] | E9=IFRS_S1_S2 | F9=⚠ Partial [=IF(D9>=B9,"✓ Met",IF(D9>=B9*0.5,"⚠ Partial","✗ Gap"))] | G9=SBTi CNZS 2.0 | H9=Submit commitment letter FY2026
R10: A10=── Energy ──
R11: A11=Energy: kWh data tracked monthly (all 5 depots) | B11=5 | C11=5 [=IF(E_Data!L46>0,5,0)] | D11=5 [=MIN(C11,B11)] | E11=E_Data Elec | F11=⚠ Partial [=IF(D11>=B11,"✓ Met",IF(D11>=B11*0.5,"⚠ Partial","✗ Gap"))] | G11=GRI 302-1 | H11=Monthly utility bill reconciliation
R12: A12=Energy: Energy efficiency improvement YoY | B12=5 | C12=0 | D12=0 [=MIN(C12,B12)] | E12=E_Data Elec | F12=✗ Gap [=IF(D12>=B12,"✓ Met",IF(D12>=B12*0.5,"⚠ Partial","✗ Gap"))] | G12=GRI 302-4 / ISO 14001 | H12=LED retrofit; efficient cold chain
R13: A13=Energy: % renewable electricity ≥20% | B13=8 | C13=0 [=IFERROR(IF(E_Data!$L$46=0,0,IF((E_Data!$L$50+E_Data!$L$51+E_Data!$L$52+E_Data!$L$53+E_Data!$L$54)/E_Data!$L$46>=Assumptions!$B$44,8,IF((E_Data!$L$50+E_Data!$L$51+E_Data!$L$52+E_Data!$L$53+E_Data!$L$54)/E_Data!$L$46>=Assumptions!$B$44*Assumptions!$B$9,8*((E_Data!$L$50+E_Data!$L$51+E_Data!$L$52+E_Data!$L$53+E_Data!$L$54)/E_Data!$L$46)/Assumptions!$B$44,0))),0)] | D13=0 [=MIN(C13,B13)] | E13=E_Data Solar | F13=✗ Gap [=IF(D13>=B13,"✓ Met",IF(D13>=B13*0.5,"⚠ Partial","✗ Gap"))] | G13=RE100 / IFRS S2 | H13=Solar at all 5 depots by 2028
R14: A14=── Fleet ──
R15: A15=Fleet: L/100km within norm (all vehicles) | B15=8 | C15=0 [=IFERROR(IF(COUNTA(Fleet_Register!$A$4:$A$19)=0,0,8*SUMPRODUCT((Fleet_Register!$K$4:$K$19>0)*(Fleet_Register!$K$4:$K$19<=Fleet_Register!$L$4:$L$19*Assumptions!$B$45))/MAX(1,COUNTIF(Fleet_Register!$K$4:$K$19,">0"))),0)] | D15=0 [=MIN(C15,B15)] | E15=Fleet_Register | F15=✗ Gap [=IF(D15>=B15,"✓ Met",IF(D15>=B15*0.5,"⚠ Partial","✗ Gap"))] | G15=SASB TR-AU / GRI 302 | H15=Eco-driving training: -10% L/100km
R16: A16=Fleet: Fleet CO₂ per tonne-km tracked | B16=5 | C16=0 [=IF(SUMPRODUCT((Fleet_Register!$F$4:$F$19>0)*(Fleet_Register!$I$4:$I$19>0))>0,5,0)] | D16=0 [=MIN(C16,B16)] | E16=Fleet_Register + tonnage | F16=✗ Gap [=IF(D16>=B16,"✓ Met",IF(D16>=B16*0.5,"⚠ Partial","✗ Gap"))] | G16=IFRS S2 / GRI 305 | H16=Monthly intensity reporting
R17: A17=Fleet: EV vehicles as % of fleet | B17=5 | C17=0 [=IFERROR(IF(Fleet_Register!$B$28=0,0,IF(Fleet_Register!$H$28/Fleet_Register!$B$28>=Assumptions!$B$46,5,IF(Fleet_Register!$H$28/Fleet_Register!$B$28>=Assumptions!$B$46*Assumptions!$B$9,5*(Fleet_Register!$H$28/Fleet_Register!$B$28)/Assumptions!$B$46,0))),0)] | D17=0 [=MIN(C17,B17)] | E17=Fleet_Register | F17=✗ Gap [=IF(D17>=B17,"✓ Met",IF(D17>=B17*0.5,"⚠ Partial","✗ Gap"))] | G17=SBTi Scope 3 / IFRS S2 | H17=20% EV target by 2030
R18: A18=── Waste ──
R19: A19=Waste: Diversion rate ≥75% (target 91%+) | B19=5 | C19=5 [=IFERROR(IF(Waste_Register!$B$16>=Assumptions!$B$48,5,IF(Waste_Register!$B$16>=Assumptions!$B$48*Assumptions!$B$9,5*Waste_Register!$B$16/Assumptions!$B$48,0)),0)] | D19=5 [=MIN(C19,B19)] | E19=Waste_Register | F19=⚠ Partial [=IF(D19>=B19,"✓ Met",IF(D19>=B19*0.5,"⚠ Partial","✗ Gap"))] | G19=GRI 306 / ISO 14001 | H19=Extend Oricol CPT to all depots
R20: A20=Waste: Cardboard recycling tracked (Cority) | B20=4 | C20=4 [=IF(Waste_Register!$B$17>0,4,0)] | D20=4 [=MIN(C20,B20)] | E20=E_Data Waste | F20=⚠ Partial [=IF(D20>=B20,"✓ Met",IF(D20>=B20*0.5,"⚠ Partial","✗ Gap"))] | G20=GRI 306 / ISO 14001 | H20=Monthly depot reporting
R21: A21=Waste: Landfill tCO₂e tracked | B21=3 | C21=3 [=IF(Waste_Register!$B$18>0,3,0)] | D21=3 [=MIN(C21,B21)] | E21=Waste_Register | F21=⚠ Partial [=IF(D21>=B21,"✓ Met",IF(D21>=B21*0.5,"⚠ Partial","✗ Gap"))] | G21=GRI 306-3 | H21=Minimise landfill send
R22: A22=── Water ──
R23: A23=Water: Monthly consumption tracked (all depots) | B23=4 | C23=4 [=IF(E_Data!L63>0,4,0)] | D23=4 [=MIN(C23,B23)] | E23=E_Data Water | F23=⚠ Partial [=IF(D23>=B23,"✓ Met",IF(D23>=B23*0.5,"⚠ Partial","✗ Gap"))] | G23=GRI 303-1 | H23=CT dam project; DBN monitoring
R24: A24=Water: Water efficiency initiative active | B24=3 | C24=0 | D24=0 [=MIN(C24,B24)] | E24=E_Data | F24=✗ Gap [=IF(D24>=B24,"✓ Met",IF(D24>=B24*0.5,"⚠ Partial","✗ Gap"))] | G24=GRI 303-3 | H24=CT dam, DBN 20kL project
R25: A25=── ISO ──
R26: A26=ISO 14001: Certification achieved/in progress | B26=8 | C26=0 | D26=0 [=MIN(C26,B26)] | E26=ISO_Tracker | F26=✗ Gap [=IF(D26>=B26,"✓ Met",IF(D26>=B26*0.5,"⚠ Partial","✗ Gap"))] | G26=ISO 14001 | H26=Target date confirm with Maria
R27: A27=ISO 14001: Aspects register maintained | B27=4 | C27=0 | D27=0 [=MIN(C27,B27)] | E27=ISO_Tracker | F27=✗ Gap [=IF(D27>=B27,"✓ Met",IF(D27>=B27*0.5,"⚠ Partial","✗ Gap"))] | G27=ISO 14001 cl 6.1.2 | H27=Fleet diesel dominant aspect
R28: A28=Environmental policy — board approved | B28=4 | C28=0 | D28=0 [=MIN(C28,B28)] | E28=G_Data | F28=✗ Gap [=IF(D28>=B28,"✓ Met",IF(D28>=B28*0.5,"⚠ Partial","✗ Gap"))] | G28=King V P1 / ISO 14001 | H28=Include net-zero commitment
R29: A29=NEMA/NWA/NEMWA legal compliance | B29=4 | C29=0 | D29=0 [=MIN(C29,B29)] | E29=ISO_Tracker | F29=✗ Gap [=IF(D29>=B29,"✓ Met",IF(D29>=B29*0.5,"⚠ Partial","✗ Gap"))] | G29=NEMA / NWA | H29=Legal register quarterly
R30: A30=E SCORECARD TOTAL | D30=36 [=SUM(D5,D6,D7,D8,D9,D11,D12,D13,D15,D16,D17,D19,D20,D21,D23,D24,D26,D27,D28,D29)] | E30=108 pts max