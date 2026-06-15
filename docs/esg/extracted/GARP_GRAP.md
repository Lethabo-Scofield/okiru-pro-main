# GARP_GRAP

- Rows scanned: up to 200
- Formulas: 40

## Data validations
- `F5` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F6` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F7` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F8` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F9` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F10` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F11` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F12` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F13` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F14` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F17` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F18` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F19` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F20` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F21` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F22` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F23` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"
- `F24` type=list formula1="Effective,Partially Effective,Ineffective,Not Assessed"

## Sample rows (first 30)
R1: A1=GARP / GRAP RISK & COMPLIANCE FRAMEWORK  |  ERM | Public Interest Alignment | IFRS S1 Risk
R3: A3=GARP — Enterprise Risk Management (ERM)
R4: B4=Risk / Requirement | C4=Description | D4=Data Source | E4=Severity | F4=Control Status | G4=Current Control / Evidence | H4=Improvement Action | I4=Likelihood (1-5)
R5: B5=Climate Physical Risk | C5=Flooding (DBN 2022), extreme heat, supply disruption | D5=E_Data | E5=High | G5=Code of Ethics §11 commits to environmental risk management; SG Consumer flood-exposed depots (DBN/PE) | I5=4 | J5=20 [=IF(E5="High",5,IF(E5="Medium",3,IF(E5="Low",1,IF(E5="Req",4,0))))*I5] | K5=✓ Material [=IF(J5>=12,"✓ Material",IF(J5>=6,"⚠ Monitor","○ Low"))]
R6: B6=Climate Transition Risk | C6=Carbon tax, fuel cost escalation, EV mandate | D6=E_Data | E6=High | G6=Code of Ethics §11 commits to GHG reduction, fuel efficiency, partnerships with cleaner fuel suppliers | I6=5 | J6=25 [=IF(E6="High",5,IF(E6="Medium",3,IF(E6="Low",1,IF(E6="Req",4,0))))*I6] | K6=✓ Material [=IF(J6>=12,"✓ Material",IF(J6>=6,"⚠ Monitor","○ Low"))]
R7: B7=Operational Risk — Fleet | C7=Vehicle breakdowns, driver fatigue, accidents | D7=Fleet/S_Data | E7=High | G7=Code of Ethics §11 commits to vehicle maintenance per manufacturer spec; Driver Debrief operational | I7=5 | J7=25 [=IF(E7="High",5,IF(E7="Medium",3,IF(E7="Low",1,IF(E7="Req",4,0))))*I7] | K7=✓ Material [=IF(J7>=12,"✓ Material",IF(J7>=6,"⚠ Monitor","○ Low"))]
R8: B8=Regulatory Risk — EE Act | C8=Non-compliance with EEA reporting deadlines | D8=S_Data EE | E8=Medium | G8=Super Group EE Policy (Rev 2, 30 Jan 2023) — formal EE Plan, designated employer, Chapter 3 EEA compliance; EE Committees established per s16 | I8=3 | J8=9 [=IF(E8="High",5,IF(E8="Medium",3,IF(E8="Low",1,IF(E8="Req",4,0))))*I8] | K8=⚠ Monitor [=IF(J8>=12,"✓ Material",IF(J8>=6,"⚠ Monitor","○ Low"))]
R9: B9=Regulatory Risk — POPIA | C9=Data breach, non-appointment of Info Officer | D9=G_Data | E9=Medium | G9=Code of Ethics §6 (POPI Act compliance); SG Consumer POPI Consent process active (Jan 2026); Information Officer appointment to be confirmed | I9=3 | J9=9 [=IF(E9="High",5,IF(E9="Medium",3,IF(E9="Low",1,IF(E9="Req",4,0))))*I9] | K9=⚠ Monitor [=IF(J9>=12,"✓ Material",IF(J9>=6,"⚠ Monitor","○ Low"))]
R10: B10=Financial Risk — SDL/WSP | C10=Non-submission of WSP/ATR, loss of grant | D10=S_Data WSP | E10=Medium | G10=Group Skills Development pipeline (CSI/SED + EE training commitments) — WSP submission status in S_Data | I10=3 | J10=9 [=IF(E10="High",5,IF(E10="Medium",3,IF(E10="Low",1,IF(E10="Req",4,0))))*I10] | K10=⚠ Monitor [=IF(J10>=12,"✓ Material",IF(J10>=6,"⚠ Monitor","○ Low"))]
R11: B11=Reputational Risk — ESG | C11=Failure to publish ESG report, poor scores | D11=ESG_Dashboard | E11=Medium | G11=CSI/SED Policy §15(b)(v) confirms Integrated Report including ESG Report | I11=3 | J11=9 [=IF(E11="High",5,IF(E11="Medium",3,IF(E11="Low",1,IF(E11="Req",4,0))))*I11] | K11=⚠ Monitor [=IF(J11>=12,"✓ Material",IF(J11>=6,"⚠ Monitor","○ Low"))]
R12: B12=Environmental Risk — Waste | C12=Landfill non-compliance, NEMA penalties | D12=E_Data Waste | E12=Low | G12=Code of Ethics §11 commits to systematic waste identification, management, reduction and recycling (hazardous + non-hazardous) | I12=2 | J12=2 [=IF(E12="High",5,IF(E12="Medium",3,IF(E12="Low",1,IF(E12="Req",4,0))))*I12] | K12=○ Low [=IF(J12>=12,"✓ Material",IF(J12>=6,"⚠ Monitor","○ Low"))]
R13: B13=Supply Chain Risk | C13=Supplier ESG non-compliance (SAQ gaps) | D13=SAQ_Supplier | E13=Medium | G13=Super Group Supplier Code of Conduct (Rev 2, 30 Jan 2023) — full supplier ESG framework: labour, ethics, H&S, environment & sustainability | I13=4 | J13=12 [=IF(E13="High",5,IF(E13="Medium",3,IF(E13="Low",1,IF(E13="Req",4,0))))*I13] | K13=✓ Material [=IF(J13>=12,"✓ Material",IF(J13>=6,"⚠ Monitor","○ Low"))]
R14: B14=Technology Risk | C14=System failure in Cority/fleet telematics | D14=G_Data | E14=Low | G14=Code of Ethics §6 (IT/IP controls); ISO 27001 certification path | I14=2 | J14=2 [=IF(E14="High",5,IF(E14="Medium",3,IF(E14="Low",1,IF(E14="Req",4,0))))*I14] | K14=○ Low [=IF(J14>=12,"✓ Material",IF(J14>=6,"⚠ Monitor","○ Low"))]
R15: A15=GRAP — Public Interest Score & Accountability
R16: B16=Risk / Requirement | C16=Description | D16=Data Source | E16=Severity | F16=Control Status | G16=Current Control / Evidence | H16=Improvement Action
R17: B17=Public interest score ≥500 points | C17=Mandatory audit + Social & Ethics Committee | D17=G_Data | E17=Req | G17=Group Social and Ethics Committee operates per Companies Act s72 (CSI/SED Policy §7) | I17=3 | J17=12 [=IF(E17="High",5,IF(E17="Medium",3,IF(E17="Low",1,IF(E17="Req",4,0))))*I17] | K17=✓ Material [=IF(J17>=12,"✓ Material",IF(J17>=6,"⚠ Monitor","○ Low"))]
R18: B18=Social & Ethics Committee (S&EC) | C18=Required if PI score ≥500 or listed | D18=G_Data | E18=Req | G18=Group Social and Ethics Committee — identifies/approves/monitors CSI & SED initiatives; budgets and expenditure (CSI/SED Policy §7) | I18=3 | J18=12 [=IF(E18="High",5,IF(E18="Medium",3,IF(E18="Low",1,IF(E18="Req",4,0))))*I18] | K18=✓ Material [=IF(J18>=12,"✓ Material",IF(J18>=6,"⚠ Monitor","○ Low"))]
R19: B19=S&EC — Labour & Employment (EE, BCEA) | C19=S&EC must monitor EE, BBBEE, training | D19=S_Data | E19=Req | G19=EE Policy §6.10 — Group CEO + Reporting Entity Exec Officer jointly accountable for EE/AA implementation; EE KPA in Line Mgr performance agreements | I19=3 | J19=12 [=IF(E19="High",5,IF(E19="Medium",3,IF(E19="Low",1,IF(E19="Req",4,0))))*I19] | K19=✓ Material [=IF(J19>=12,"✓ Material",IF(J19>=6,"⚠ Monitor","○ Low"))]
R20: B20=S&EC — Environment | C20=S&EC monitors environmental performance | D20=E_Data | E20=Req | G20=Code of Ethics §11 — environmental performance, GHG, waste, water, biodiversity, noise commitments; Supplier Code §8 cascades to supply chain | I20=3 | J20=12 [=IF(E20="High",5,IF(E20="Medium",3,IF(E20="Low",1,IF(E20="Req",4,0))))*I20] | K20=✓ Material [=IF(J20>=12,"✓ Material",IF(J20>=6,"⚠ Monitor","○ Low"))]
R21: B21=S&EC — Anti-corruption | C21=S&EC monitors FICA, anti-bribery, ethics | D21=G_Data | E21=Req | G21=Code of Ethics §8 — zero-tolerance anti-bribery/corruption; Be Heard hotline 0800-007-117; Internal Audit Department active | I21=3 | J21=12 [=IF(E21="High",5,IF(E21="Medium",3,IF(E21="Low",1,IF(E21="Req",4,0))))*I21] | K21=✓ Material [=IF(J21>=12,"✓ Material",IF(J21>=6,"⚠ Monitor","○ Low"))]
R22: B22=S&EC — Consumer relations | C22=Customer satisfaction, product quality | D22=Customer_Report_Data | E22=Req | G22=Code of Ethics §3 commitments to quality and product specifications; Supplier Code §6 enforces quality + food safety standards | I22=3 | J22=12 [=IF(E22="High",5,IF(E22="Medium",3,IF(E22="Low",1,IF(E22="Req",4,0))))*I22] | K22=✓ Material [=IF(J22>=12,"✓ Material",IF(J22>=6,"⚠ Monitor","○ Low"))]
R23: B23=S&EC — Community development | C23=CSI, SED, skills development | D23=S_Data | E23=Req | G23=CSI/SED Policy — 1% NPAT SED target; three-pronged approach (Central/Decentralised/Volunteerism); 75% Black beneficiary requirement aligned to B-BBEE | I23=3 | J23=12 [=IF(E23="High",5,IF(E23="Medium",3,IF(E23="Low",1,IF(E23="Req",4,0))))*I23] | K23=✓ Material [=IF(J23>=12,"✓ Material",IF(J23>=6,"⚠ Monitor","○ Low"))]
R24: B24=External audit coverage | C24=External auditors cover ESG risks | D24=G_Data | E24=Req | G24=Code of Ethics §8 — Internal Audit Department active in fraud/corruption detection; external assurance evidence to be provided | I24=3 | J24=12 [=IF(E24="High",5,IF(E24="Medium",3,IF(E24="Low",1,IF(E24="Req",4,0))))*I24] | K24=✓ Material [=IF(J24>=12,"✓ Material",IF(J24>=6,"⚠ Monitor","○ Low"))]
R26: B26=RISK SUMMARY
R27: B27=Total risks logged | C27=18 [=COUNTA(B5:B14)+COUNTA(B17:B24)]
R28: B28=Material risks (score ≥12) | C28=12 [=COUNTIF(K5:K14,"✓ Material")+COUNTIF(K17:K24,"✓ Material")]
R29: B29=Monitor risks (6-11) | C29=4 [=COUNTIF(K5:K14,"⚠ Monitor")+COUNTIF(K17:K24,"⚠ Monitor")]
R30: B30=Maximum severity score | C30=25 [=MAX(J5:J14,J17:J24)]