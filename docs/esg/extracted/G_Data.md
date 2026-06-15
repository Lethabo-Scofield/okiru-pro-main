# G_Data

- Rows scanned: up to 200
- Formulas: 21

## Data validations
- `B12` type=list formula1="Yes,No,Partial,N/A"
- `B13` type=list formula1="Yes,No,Partial,N/A"
- `B14` type=list formula1="Yes,No,Partial,N/A"
- `B15` type=list formula1="Yes,No,Partial,N/A"
- `B16` type=list formula1="Yes,No,Partial,N/A"
- `B17` type=list formula1="Yes,No,Partial,N/A"
- `B18` type=list formula1="Yes,No,Partial,N/A"
- `B19` type=list formula1="Yes,No,Partial,N/A"
- `B20` type=list formula1="Yes,No,Partial,N/A"
- `B21` type=list formula1="Yes,No,Partial,N/A"
- `B23` type=list formula1="Yes,No,Partial,N/A"
- `B24` type=list formula1="Yes,No,Partial,N/A"

## Sample rows (first 30)
R1: A1=G_DATA — GOVERNANCE RAW DATA  [King V | IFRS S1/S2 | GARP/GRAP | POPIA | Board]
R3: A3=BOARD & GOVERNANCE
R4: A4=Governance Metric | B4=Current Value | C4=Target/Req | D4=Source | E4=King V Ref | F4=Score /5
R5: A5=Board members (total) | B5=7 | D5=Source: Coba 27 May 2026 — SG Holdings Ltd Board: 2 Exec (Mountford CEO, Brown CFO) + 5 NEDs (Chitalu Chair, Cathrall Lead Ind, Mehlomakulu, Mnisi, Phalane). John Mackay = Co Sec. | E5=P1-P16 | F5=5 [=IF(B5>0,5,0)]
R6: A6=Independent non-executive directors | B6=5 | D6=Source: Coba 27 May 2026 — 5 of 5 NEDs disclosed as Independent (Chitalu, Cathrall, Mehlomakulu, Mnisi, Phalane) | E6=P1-P16 | F6=5 [=IFERROR(IF(B5=0,0,IF(B6/B5>=0.5,5,IF(B6/B5>=0.5*Assumptions!$B$9,5*B6/B5/0.5,0))),0)]
R7: A7=Executive directors | B7=2 | D7=Source: Coba 27 May 2026 — Group ED: Peter Mountford (CEO), Colin Brown (CFO/Debt Officer). [Prior placeholder of 5 referred to SG Consumer divisional execs — different scope.] | E7=P1-P16 | F7=5 [=IFERROR(IF(B5=0,0,IF(B7/B5<=0.4,5,MAX(0,5*(1-((B7/B5)-0.4)*2)))),0)]
R8: A8=% Black board members | B8=0.4285714286 | D8=Source: Coba 27 May 2026 — Black SA directors: Mehlomakulu, Mnisi, Phalane (3 of 7). Note: Chitalu (Zambian Chair) is African but not SA-EEA Black designated. Confirm classification with Co Sec. | E8=P1-P16 | F8=3.5714285714 [=IFERROR(IF(B8>=Assumptions!$B$50,5,IF(B8>=Assumptions!$B$50*Assumptions!$B$9,5*B8/Assumptions!$B$50,0)),0)]
R9: A9=% Female board members | B9=0.1428571429 | D9=Source: Coba 27 May 2026 — 1 female NED (Pitsi Mnisi) of 7. Gap vs 50% target = -35.7pp. Material gender diversity risk. | E9=P1-P16 | F9=0 [=IFERROR(IF(B9>=0.5,5,IF(B9>=0.5*Assumptions!$B$9,5*B9/0.5,0)),0)]
R10: A10=Board meetings held YTD | B10=4 | D10=Source: Inferred JSE-listed minimum (4/yr). Awaiting confirmation from Company Secretary John Mackay. | E10=P1-P16 | F10=5 [=IFERROR(IF(B10>=4,5,IF(B10>=4*Assumptions!$B$9,5*B10/4,0)),0)]
R11: A11=Audit committee meetings YTD | B11=4 | D11=Source: Coba 27 May 2026 — Cathrall chairs Audit Committee; assumed 4 meetings YTD (confirm minute count from Co Sec). | E11=P1-P16 | F11=5 [=IFERROR(IF(B11>=4,5,IF(B11>=4*Assumptions!$B$9,5*B11/4,0)),0)]
R12: A12=Risk committee active (Y/N) | B12=Yes | D12=Source: Coba 27 May 2026 — Cathrall confirmed as Risk Committee Chair. [Updated from "Partial".] | E12=P1-P16 | F12=5 [=IF(B12="Yes",5,IF(B12="Partial",2.5,0))]
R13: A13=Social & Ethics committee active (Y/N) | B13=Yes | D13=Group Social and Ethics Committee — CSI/SED Policy §7 (identifies/approves/coordinates CSI & SED initiatives and budgets; monitors all CSI/SED expenditure) | E13=P1-P16 | F13=5 [=IF(B13="Yes",5,IF(B13="Partial",2.5,0))]
R14: A14=ESG linked to executive remuneration (Y/N) | D14=Not disclosed in supplied policies — confirm from Remco report | E14=P1-P16 | F14=0 [=IF(B14="Yes",5,IF(B14="Partial",2.5,0))]
R15: A15=Code of ethics in place (Y/N) | B15=Yes | D15=Super Group Code of Business Standards and Ethics — Rev 2, 30 Jan 2023, approved by SG Executive Committee (Public disclosure) | E15=P1-P16 | F15=5 [=IF(B15="Yes",5,IF(B15="Partial",2.5,0))]
R16: A16=Whistleblower hotline active (Y/N) | B16=Yes | D16=Source: Coba 27 May 2026 confirmed — Be Heard (https://beheard.co.za/make-a-disclosure/) 0800-007-117 anonymous 24/365. Case-count/response-time data requested from HO, confidential at Group level. | E16=P1-P16 | F16=5 [=IF(B16="Yes",5,IF(B16="Partial",2.5,0))]
R17: A17=POPIA Information Officer appointed (Y/N) | B17=Partial | D17=POPI Act compliance framework in place (Code of Ethics §6); SG Consumer POPI consent operational (Jan 2026 letter). Formal Information Officer appointment letter required as evidence. | E17=P1-P16 | F17=2.5 [=IF(B17="Yes",5,IF(B17="Partial",2.5,0))]
R18: A18=POPIA impact assessment done (Y/N) | B18=Partial | D18=Active POPI consent process suggests assessment performed — formal PIA documentation required as evidence | E18=P1-P16 | F18=2.5 [=IF(B18="Yes",5,IF(B18="Partial",2.5,0))]
R19: A19=External assurance of ESG report (Y/N) | D19=Not disclosed in supplied policies — confirm from latest integrated report | E19=P1-P16 | F19=0 [=IF(B19="Yes",5,IF(B19="Partial",2.5,0))]
R20: A20=Integrated report published (Y/N) | B20=Yes | D20=Source: Coba 27 May 2026 — SG Holdings JSE-listed publishes Integrated Report incl. ESG section (Group level). CSI/SED Policy §15(b)(v) confirms. | E20=P1-P16 | F20=5 [=IF(B20="Yes",5,IF(B20="Partial",2.5,0))]
R21: A21=Risk register updated (Y/N) | B21=Partial | D21=Risk-based approach evidenced (Code of Ethics §11 — pragmatic risk-based environmental performance); formal risk register documentation required | E21=P1-P16 | F21=2.5 [=IF(B21="Yes",5,IF(B21="Partial",2.5,0))]
R22: A22=Number of material risks identified | D22=Not disclosed in supplied policies — confirm count from risk register | E22=P1-P16 | F22=0 [=IFERROR(IF(B22>=Assumptions!$B$61,5,IF(B22>=Assumptions!$B$61*Assumptions!$B$9,5*B22/Assumptions!$B$61,0)),0)]
R23: A23=Climate risk in risk register (Y/N) | B23=Partial | D23=GHG/emissions commitments in Code of Ethics §11; explicit climate risk in formal register requires confirmation | E23=P1-P16 | F23=2.5 [=IF(B23="Yes",5,IF(B23="Partial",2.5,0))]
R24: A24=Anti-corruption training done (Y/N) | B24=Partial | D24=Code of Ethics §8 and Supplier Code §5 establish zero-tolerance anti-bribery/corruption framework + whistleblower hotline; formal training records required as evidence | E24=P1-P16 | F24=2.5 [=IF(B24="Yes",5,IF(B24="Partial",2.5,0))]
R26: A26=GOVERNANCE TOTAL SCORE (out of 100) | F26=66.0714285714 [=SUM(F5:F24)]