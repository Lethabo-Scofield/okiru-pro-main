# ISO_Tracker

- Rows scanned: up to 200
- Formulas: 48

## Data validations
- `D5` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D6` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D7` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D8` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D9` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D10` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D11` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D12` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D13` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D14` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D15` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D16` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D21` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D22` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D23` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D24` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D25` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D26` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D27` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"
- `D28` type=list formula1="Fully Compliant,Partially Compliant,Gap,Not Applicable"

## Sample rows (first 30)
R1: A1=ISO STANDARDS GAP TRACKER  |  ISO 14001 | 45001 | 27001 | 26000 | 22000  [Net-Zero lens on all]
R3: A3=ISO 14001:2015 — Environmental Management System
R4: B4=Requirement | C4=Clause | D4=Status | E4=Score /5 | F4=Weight | G4=Evidence Needed | H4=Current Evidence / Status | I4=Net-Zero / ESG Link
R5: B5=Context of the organisation — internal/external issues | C5=4.1 | E5=0 [=IF(D5="Fully Compliant",5,IF(D5="Partially Compliant",3,IF(D5="Not Applicable",5,0)))] | F5=1 | G5=Env issues register | I5=Net-zero context essential
R6: B6=Interested parties — needs/expectations | C6=4.2 | E6=0 [=IF(D6="Fully Compliant",5,IF(D6="Partially Compliant",3,IF(D6="Not Applicable",5,0)))] | F6=1 | G6=Stakeholder register | I6=Customers, SETA, DoEL
R7: B7=Scope of EMS | C7=4.3 | E7=0 [=IF(D7="Fully Compliant",5,IF(D7="Partially Compliant",3,IF(D7="Not Applicable",5,0)))] | F7=1 | G7=EMS scope document | I7=All 5 depots covered
R8: B8=Environmental policy — net-zero commitment | C8=5.2 | D8=Partially Compliant | E8=3 [=IF(D8="Fully Compliant",5,IF(D8="Partially Compliant",3,IF(D8="Not Applicable",5,0)))] | F8=1 | G8=Board-approved env policy | H8=Code of Ethics §11 — board-approved environmental policy with GHG, energy, water, waste, biodiversity, noise commitments. Explicit net-zero / SBTi commitment to be added. | I8=Include net-zero target
R9: B9=Environmental objectives — GHG, energy, water, waste | C9=6.2 | D9=Partially Compliant | E9=3 [=IF(D9="Fully Compliant",5,IF(D9="Partially Compliant",3,IF(D9="Not Applicable",5,0)))] | F9=1 | G9=KPIs in E_Scorecard | H9=Code of Ethics §11 commits to GHG quantification + target-setting; energy efficiency, water reduction, waste minimisation. Numerical SBTi targets pending formal commitment letter. | I9=Link to SBTi targets
R10: B10=Environmental aspects — fleet emissions dominant | C10=6.1.2 | D10=Partially Compliant | E10=3 [=IF(D10="Fully Compliant",5,IF(D10="Partially Compliant",3,IF(D10="Not Applicable",5,0)))] | F10=1 | G10=Aspects register | H10=Code of Ethics §11 identifies vehicle emissions as material aspect; full aspects register to be formalised. | I10=Fleet = >80% Scope 1
R11: B11=Legal requirements register (NEMA, NWA, NEMWA) | C11=6.1.3 | D11=Partially Compliant | E11=3 [=IF(D11="Fully Compliant",5,IF(D11="Partially Compliant",3,IF(D11="Not Applicable",5,0)))] | F11=1 | G11=Legal compliance register | H11=Code of Ethics §11 commits to compliance with all applicable laws and maintenance of environmental permits, licenses, approvals. | I11=Quarterly update
R12: B12=Emergency preparedness — fuel spill, fire | C12=8.2 | D12=Partially Compliant | E12=3 [=IF(D12="Fully Compliant",5,IF(D12="Partially Compliant",3,IF(D12="Not Applicable",5,0)))] | F12=1 | G12=Emergency response plan | H12=Supplier Code §8 references spill/incident response procedures (cascaded to suppliers); depot-level plans to be confirmed. | I12=All depot plans
R13: B13=Monitoring & measurement — monthly GHG data | C13=9.1 | E13=0 [=IF(D13="Fully Compliant",5,IF(D13="Partially Compliant",3,IF(D13="Not Applicable",5,0)))] | F13=1 | G13=E_Data sheet | I13=Monthly Mariette submission
R14: B14=Internal audit — all depots | C14=9.2 | E14=0 [=IF(D14="Fully Compliant",5,IF(D14="Partially Compliant",3,IF(D14="Not Applicable",5,0)))] | F14=1 | G14=Audit schedule | I14=Annual minimum
R15: B15=Management review — ESG integration | C15=9.3 | E15=0 [=IF(D15="Fully Compliant",5,IF(D15="Partially Compliant",3,IF(D15="Not Applicable",5,0)))] | F15=1 | G15=Board/management review | I15=Quarterly ESG review
R16: B16=ISO 14001 certification achieved | C16=10 | E16=0 [=IF(D16="Fully Compliant",5,IF(D16="Partially Compliant",3,IF(D16="Not Applicable",5,0)))] | F16=1 | G16=Certificate | I16=Target: confirm with Maria
R17: B17=ISO 14001:2015 Score | E17=15 [=SUM(E5,E6,E7,E8,E9,E10,E11,E12,E13,E14,E15,E16)]
R19: A19=ISO 45001:2018 — Occupational H&S Management System
R20: B20=Requirement | C20=Clause | D20=Status | E20=Score /5 | F20=Weight | G20=Evidence Needed | H20=Current Evidence / Status | I20=Net-Zero / ESG Link
R21: B21=H&S policy — zero harm commitment | C21=5.2 | D21=Partially Compliant | E21=3 [=IF(D21="Fully Compliant",5,IF(D21="Partially Compliant",3,IF(D21="Not Applicable",5,0)))] | F21=1 | G21=Board H&S policy | H21=Code of Ethics §7 (Labour Standards & Human Rights) commits to safe workplace; Supplier Code §7 requires OHS Act compliance and OHS management system from suppliers. | I21=Include fatigue policy
R22: B22=Hazard identification (HIRA) — driver fatigue | C22=6.1.2 | E22=0 [=IF(D22="Fully Compliant",5,IF(D22="Partially Compliant",3,IF(D22="Not Applicable",5,0)))] | F22=1 | G22=HIRA register | I22=Driver routes = key hazard
R23: B23=Legal requirements — OHS Act, COID, Road Traffic | C23=6.1.3 | D23=Partially Compliant | E23=3 [=IF(D23="Fully Compliant",5,IF(D23="Partially Compliant",3,IF(D23="Not Applicable",5,0)))] | F23=1 | G23=Legal register | H23=Supplier Code §7 enforces OHS Act compliance and incident notification; internal legal register to be confirmed. | I23=Quarterly update
R24: B24=Operational controls — PPE, fatigue mgmt, vehicle checks | C24=8.1 | E24=0 [=IF(D24="Fully Compliant",5,IF(D24="Partially Compliant",3,IF(D24="Not Applicable",5,0)))] | F24=1 | G24=SOPs per depot | I24=Driver debrief critical
R25: B25=Emergency preparedness — road accidents | C25=8.2 | E25=0 [=IF(D25="Fully Compliant",5,IF(D25="Partially Compliant",3,IF(D25="Not Applicable",5,0)))] | F25=1 | G25=Emergency plan | I25=All depots + fleet
R26: B26=Monitoring — LTIFR, TRIFR, near-miss (Accidently) | C26=9.1 | E26=0 [=IF(D26="Fully Compliant",5,IF(D26="Partially Compliant",3,IF(D26="Not Applicable",5,0)))] | F26=1 | G26=Accidently system | I26=Monthly reporting
R27: B27=Incident investigation process | C27=10.2 | E27=0 [=IF(D27="Fully Compliant",5,IF(D27="Partially Compliant",3,IF(D27="Not Applicable",5,0)))] | F27=1 | G27=Incident reports | I27=Within 24hrs of incident
R28: B28=Worker participation and consultation | C28=5.4 | E28=0 [=IF(D28="Fully Compliant",5,IF(D28="Partially Compliant",3,IF(D28="Not Applicable",5,0)))] | F28=1 | G28=Safety committee minutes | I28=Monthly meetings
R29: B29=ISO 45001 certification achieved | C29=10 | E29=0 [=IF(D29="Fully Compliant",5,IF(D29="Partially Compliant",3,IF(D29="Not Applicable",5,0)))] | F29=1 | G29=Certificate | I29=Target: confirm timeline
R30: B30=ISO 45001:2018 Score | E30=6 [=SUM(E21,E22,E23,E24,E25,E26,E27,E28,E29)]
R32: A32=ISO 27001:2022 — Information Security Management System
R33: B33=Requirement | C33=Clause | D33=Status | E33=Score /5 | F33=Weight | G33=Evidence Needed | H33=Current Evidence / Status | I33=Net-Zero / ESG Link