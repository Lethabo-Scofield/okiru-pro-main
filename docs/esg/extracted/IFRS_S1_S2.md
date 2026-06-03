# IFRS_S1_S2

- Rows scanned: up to 200
- Formulas: 24

## Data validations
- `D5` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D6` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D7` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D8` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D9` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D10` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D11` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D12` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D13` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D14` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D15` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D16` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D19` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D20` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D21` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D22` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D23` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D24` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D25` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"
- `D26` type=list formula1="Disclosed,Partially Disclosed,Not Disclosed,N/A"

## Sample rows (first 30)
R1: A1=IFRS S1 + S2 CLIMATE DISCLOSURE TRACKER  |  TCFD Framework  |  GHG Protocol  [Links: E_Data GHG, NetZero_Roadmap]
R3: A3=IFRS S1 — General Sustainability-Related Financial Information
R4: B4=Disclosure Requirement | C4=Pillar | D4=Status | E4=Score /5 | F4=Data Source | G4=Current Status / Evidence | H4=Action Required
R5: B5=Board oversight of climate risks | C5=Governance | D5=Partially Disclosed | E5=3 [=IF(D5="Disclosed",5,IF(D5="Partially Disclosed",3,IF(D5="N/A",5,0)))] | F5=G_Data / King V P10 | G5=Group Social and Ethics Committee mandate covers environment (CSI/SED Policy); explicit climate mandate to be confirmed | H5=Embed explicit climate-risk oversight into S&EC charter
R6: B6=Management role in climate risk | C6=Governance | D6=Not Disclosed | E6=0 [=IF(D6="Disclosed",5,IF(D6="Partially Disclosed",3,IF(D6="N/A",5,0)))] | F6=G_Data | G6=Management climate KPIs not disclosed in supplied policies | H6=Assign exec climate risk owner with KPIs
R7: B7=Climate risks to business model | C7=Strategy | D7=Partially Disclosed | E7=3 [=IF(D7="Disclosed",5,IF(D7="Partially Disclosed",3,IF(D7="N/A",5,0)))] | F7=E_Data / Risk Register | G7=Code of Ethics §11 acknowledges vehicle emissions; physical/transition risk assessment to be formalised | H7=Document physical and transition climate risk assessment
R8: B8=Climate opportunities identified | C8=Strategy | D8=Partially Disclosed | E8=3 [=IF(D8="Disclosed",5,IF(D8="Partially Disclosed",3,IF(D8="N/A",5,0)))] | F8=Fleet_Register / E_Data | G8=Code of Ethics §11 commits to energy efficiency and cleaner fuel partnerships; explicit opportunity register required | H8=Build opportunity register; EV fleet, solar expansion business case
R9: B9=Scenario analysis (1.5°C/2°C/4°C) | C9=Strategy | D9=Not Disclosed | E9=0 [=IF(D9="Disclosed",5,IF(D9="Partially Disclosed",3,IF(D9="N/A",5,0)))] | F9=NetZero_Roadmap | G9=Climate scenario analysis not evidenced in supplied policies | H9=Commission 1.5°C/2°C/4°C scenario analysis
R10: B10=Climate risk identification process | C10=Risk Management | D10=Partially Disclosed | E10=3 [=IF(D10="Disclosed",5,IF(D10="Partially Disclosed",3,IF(D10="N/A",5,0)))] | F10=G_Data | G10=Code of Ethics §11 "pragmatic, risk-based approach" — formal identification process to be documented | H10=Document climate risk identification methodology
R11: B11=Climate risk integration into ERM | C11=Risk Management | D11=Partially Disclosed | E11=3 [=IF(D11="Disclosed",5,IF(D11="Partially Disclosed",3,IF(D11="N/A",5,0)))] | F11=G_Data | G11=ERM integration of climate risks requires confirmation | H11=Update risk register to include climate physical & transition risks
R12: B12=Absolute Scope 1 GHG tCO₂e | C12=Metrics & Targets | E12=0 [=IF(D12="Disclosed",5,IF(D12="Partially Disclosed",3,IF(D12="N/A",5,0)))] | F12=E_Data GHG_GRAND_ROW | G12=Fleet diesel + generator + LPG
R13: B13=Absolute Scope 2 GHG tCO₂e | C13=Metrics & Targets | E13=0 [=IF(D13="Disclosed",5,IF(D13="Partially Disclosed",3,IF(D13="N/A",5,0)))] | F13=E_Data ELEC_TOTAL | G13=Grid electricity per depot
R14: B14=Scope 3 GHG material categories | C14=Metrics & Targets | E14=0 [=IF(D14="Disclosed",5,IF(D14="Partially Disclosed",3,IF(D14="N/A",5,0)))] | F14=E_Data Scope3 | G14=Water, value chain transport
R15: B15=GHG reduction targets | C15=Metrics & Targets | D15=Partially Disclosed | E15=3 [=IF(D15="Disclosed",5,IF(D15="Partially Disclosed",3,IF(D15="N/A",5,0)))] | F15=NetZero_Roadmap | G15=Code of Ethics §11 commits to GHG quantification and target-setting; numerical SBTi-aligned targets to be confirmed (SBTi CNZS 2.0 net-zero by 2050 — toolkit Assumptions) | H15=Submit SBTi commitment letter; publish FY25/26 baseline and near-term targets
R16: B16=Transition plan (net-zero pathway) | C16=Metrics & Targets | E16=0 [=IF(D16="Disclosed",5,IF(D16="Partially Disclosed",3,IF(D16="N/A",5,0)))] | F16=NetZero_Roadmap | G16=OER tiers, EV fleet, solar expansion
R17: A17=IFRS S2 — Climate-Related Disclosures
R18: B18=Disclosure Requirement | C18=Pillar | D18=Status | E18=Score /5 | F18=Data Source | G18=Current Status / Evidence | H18=Action Required
R19: B19=Physical climate risks in board agenda | C19=Governance | D19=Not Disclosed | E19=0 [=IF(D19="Disclosed",5,IF(D19="Partially Disclosed",3,IF(D19="N/A",5,0)))] | F19=G_Data | G19=Board agenda climate physical risk integration not evidenced | H19=Add quarterly climate physical risk to board agenda
R20: B20=Transition climate risks in board agenda | C20=Governance | D20=Not Disclosed | E20=0 [=IF(D20="Disclosed",5,IF(D20="Partially Disclosed",3,IF(D20="N/A",5,0)))] | F20=G_Data | G20=Board agenda climate transition risk integration not evidenced | H20=Add carbon tax / EV transition risk to board agenda
R21: B21=Financial effect of climate risks (R) | C21=Strategy | E21=0 [=IF(D21="Disclosed",5,IF(D21="Partially Disclosed",3,IF(D21="N/A",5,0)))] | F21=E_Data cost data | G21=Fuel cost sensitivity, stranded fleet risk
R22: B22=Resilience of strategy to climate scenarios | C22=Strategy | E22=0 [=IF(D22="Disclosed",5,IF(D22="Partially Disclosed",3,IF(D22="N/A",5,0)))] | F22=NetZero_Roadmap | G22=Net-zero pathway documented
R23: B23=Energy intensity (kWh/tonne-km) | C23=Metrics | E23=0 [=IF(D23="Disclosed",5,IF(D23="Partially Disclosed",3,IF(D23="N/A",5,0)))] | F23=E_Data / tonnage data | G23=Electricity and fuel per tonne delivered
R24: B24=Fleet CO₂ intensity (tCO₂e/tonne-km) | C24=Metrics | E24=0 [=IF(D24="Disclosed",5,IF(D24="Partially Disclosed",3,IF(D24="N/A",5,0)))] | F24=E_Data + tonnage | G24=Scope 1 fleet per tonne-km
R25: B25=% renewable energy | C25=Metrics | E25=0 [=IF(D25="Disclosed",5,IF(D25="Partially Disclosed",3,IF(D25="N/A",5,0)))] | F25=E_Data solar rows | G25=Solar kWh / total electricity kWh
R26: B26=Carbon credits/offsets used | C26=Metrics | E26=0 [=IF(D26="Disclosed",5,IF(D26="Partially Disclosed",3,IF(D26="N/A",5,0)))] | F26=Carbon_Credits_Register | G26=OER tier — credits register
R27: B27=Internal carbon price (R/tCO₂e) | C27=Metrics | E27=0 [=IF(D27="Disclosed",5,IF(D27="Partially Disclosed",3,IF(D27="N/A",5,0)))] | F27=Management decision | G27=Used for investment decisions?
R28: B28=Climate-related capex planned (R) | C28=Metrics | E28=0 [=IF(D28="Disclosed",5,IF(D28="Partially Disclosed",3,IF(D28="N/A",5,0)))] | F28=NetZero_Roadmap | G28=EV fleet, solar, insulation investments
R29: A29=IFRS S1+S2 TOTAL SCORE | E29=18 [=SUMIF(E5:E28,"<>0",E5:E28)]
R30: E30=0.1636363636 [=IFERROR(E29/110,0)]