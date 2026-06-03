# B_BBEE_ESG

- Rows scanned: up to 200
- Formulas: 20

## Sample rows (first 30)
R1: A1=⚖  B-BBEE GENERIC CODE — ESG ELEMENT MAPPING  |  Statement 000 Series
R2: A2=Generic Scorecard (Statement 000): 109 points + 5 bonus = 114 total. Auto-pulled from E/S/G data where possible. Status level driven by total points.
R4: A4=GENERIC SCORECARD — 5 elements
R5: A5=Element | B5=Weight | C5=Sub-target | D5=Actual | E5=Points Earned | F5=Source / Logic | G5=ESG Pillar
R6: A6=OWNERSHIP  (Statement 100) | B6=25 | C6=≥25.1% Black ownership | D6=0 | E6=0 [=IFERROR(IF(D6>=0.251,25,IF(D6>=0.251*Assumptions!$B$9,25*D6/0.251,0)),0)] | F6=Manual entry — confirm with share register / Modified Flow-Through | G6=Governance | H6=25 [=B6-E6]
R7: A7=MANAGEMENT CONTROL  (Statement 200) | B7=19 | C7=Black 60% / Black Female 30% | D7=0.35 [=IFERROR(EE_Scorecard!E15/100,0)] | E7=6.65 [=IFERROR(D7*19,0)] | F7=EE_Scorecard E15 total/100 × 19 pts (weighted scorecard already aligned) | G7=Social | H7=12.35 [=B7-E7]
R8: A8=SKILLS DEVELOPMENT  (Statement 300) | B8=25 | C8=6% payroll spend on Black training | D8=0 [=IFERROR(S_Data!B50/MAX(1,S_Data!B43),0)] | E8=0 [=IFERROR(IF(D8>=0.06,25,IF(D8>=0.06*Assumptions!$B$9,25*D8/0.06,0)),0)] | F8=Training spend (S_Data B50) ÷ Leviable payroll (B43); target 6% | G8=Social | H8=25 [=B8-E8]
R9: A9=ENTERPRISE & SUPPLIER DEVELOPMENT  (Statement 400) | B9=40 | C9=PP 25 + ESD 15 sub-targets | D9=0 | E9=0 [=IFERROR(D9*40,0)] | F9=Manual entry — % recognition vs PP 25 + ESD 15 sub-targets | G9=Social / Governance | H9=40 [=B9-E9]
R10: A10=SOCIO-ECONOMIC DEVELOPMENT  (Statement 500) | B10=5 | C10=1% NPAT contribution | D10=0 | E10=0 [=IFERROR(IF(D10>=Assumptions!$B$56,5,IF(D10>=Assumptions!$B$56*Assumptions!$B$9,5*D10/Assumptions!$B$56,0)),0)] | F10=CSI spend ÷ NPAT; target 1% (THR_CSI) | G10=Social | H10=5 [=B10-E10]
R11: A11=BONUS POINTS  (net job creation, value-adding) | B11=5 | C11=Up to 5 bonus pts | D11=0 | E11=0 [=MIN(5,D11)] | F11=Manual — claim up to 5 bonus points (net job creation / value-add) | G11=— | H11=5 [=B11-E11]
R12: A12=TOTAL POINTS | B12=119 [=SUM(B6:B11)] | E12=6.65 [=SUM(E6:E11)]
R14: A14=STATUS LEVEL — Auto-determined from total points
R15: A15=Current Level | B15=Level 4 [=IF(E12>=Assumptions!$B$76,"Level 1",IF(E12>=Assumptions!$B$77,"Level 2",IF(E12>=Assumptions!$B$78,"Level 3",IF(E12>=Assumptions!$B$79,"Level 4",IF(E12>=Assumptions!$B$80,"Level 5",IF(E12>=Assumptions!$B$81,"Level 6",IF(E12>=Assumptions!$B$82,"Level 7",IF(E12>=Assumptions!$B$83,"Level 8","Non-compliant"))))))))] | D15=Procurement Recognition | E15=0 [=IF(E12>=Assumptions!$B$76,Assumptions!$C$76,IF(E12>=Assumptions!$B$77,Assumptions!$C$77,IF(E12>=Assumptions!$B$78,Assumptions!$C$78,IF(E12>=Assumptions!$B$79,Assumptions!$C$79,IF(E12>=Assumptions!$B$80,Assumptions!$C$80,IF(E12>=Assumptions!$B$81,Assumptions!$C$81,IF(E12>=Assumptions!$B$82,Assumptions!$C$82,IF(E12>=Assumptions!$B$83,Assumptions!$C$83,Assumptions!$C$84))))))))]
R17: A17=GAP TO NEXT LEVEL
R18: A18=Points to next level | B18=83.35 [=IF(E12>=Assumptions!$B$76,0,IF(E12>=Assumptions!$B$77,Assumptions!$B$76-E12,IF(E12>=Assumptions!$B$78,Assumptions!$B$77-E12,IF(E12>=Assumptions!$B$79,Assumptions!$B$78-E12,IF(E12>=Assumptions!$B$80,Assumptions!$B$79-E12,IF(E12>=Assumptions!$B$81,Assumptions!$B$80-E12,IF(E12>=Assumptions!$B$82,Assumptions!$B$81-E12,IF(E12>=Assumptions!$B$83,Assumptions!$B$82-E12,Assumptions!$B$83-E12))))))))] | D18=Biggest opportunity | E18=ENTERPRISE & SUPPLIER DEVELOPMENT  (Statement 400) [=INDEX(A6:A11,MATCH(MAX(H6:H11),H6:H11,0))]