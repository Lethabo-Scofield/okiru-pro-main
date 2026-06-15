# Waste_Register

- Rows scanned: up to 200
- Formulas: 12

## Data validations
- `B20` type=list formula1="Yes,No,Partial"

## Sample rows (first 30)
R1: A1=WASTE REGISTER — Oricol Environmental | Oracle | Valour Brands | Cority  [GRI 306 | ISO 14001 | Net-Zero]
R3: A3=WASTE STREAMS — Monthly data entry [Source: Waste contractors + Cority cardboard data]
R4: A4=Month | B4=Depot | C4=Waste Type | D4=Total kg | E4=Recycled kg | F4=Landfill kg | G4=Diverted % | H4=Landfill tCO₂e
R5: A5=Mar-26 | B5=CPT | C5=Commercial/Industrial (landfill) | D5=2000 | E5=0 | F5=2000 | G5=0 [=IFERROR(E5/D5,0)] | H5=1.16 [=F5*0.58/1000]
R6: A6=Mar-26 | B6=CPT | C6=Commercial/Industrial (recycled) | D6=6580 | E6=6580 | F6=0 | G6=1 [=IFERROR(E6/D6,0)] | H6=0 [=F6*0.58/1000]
R7: A7=Mar-26 | B7=CPT | C7=Paper/Cardboard K4 | D7=1100 | E7=1100 | F7=0 | G7=1 [=IFERROR(E7/D7,0)] | H7=0 [=F7*0.58/1000]
R8: A8=Mar-26 | B8=CPT | C8=LDPE Shrinkwrap | D8=880 | E8=880 | F8=0 | G8=1 [=IFERROR(E8/D8,0)] | H8=0 [=F8*0.58/1000]
R9: A9=Mar-26 | B9=ALL | C9=TOTAL (Oricol Big Numbers) | D9=22470 | E9=20470 | F9=2000 | G9=91.1% | H9=1.16 [=F9*0.58/1000]
R11: A11=CORITY CARDBOARD RECYCLING % — Monthly (from Mariette Dashboard waste sheet)
R12: A12=Month | B12=Jul-25 | C12=Aug-25 | D12=Sep-25 | E12=Oct-25 | F12=Nov-25 | G12=Dec-25 | H12=Jan-26
R13: A13=% Recycled (all depots) | B13=0.1065 | C13=0.1624 | D13=0.1106 | E13=0.0889 | F13=0.2642 | G13=0.1068 | H13=0.046
R15: A15=WASTE SCORECARD — vs ISO 14001 + Net-Zero targets
R16: A16=Oricol CPT diversion rate (Mar-26) | B16=0.911 [=91.1%] | C16=≥90% | D16=✓ Met | E16=5
R17: A17=Average monthly % recycled (Cority) | B17=0.1242555556 [=AVERAGE(B13:J13)] | C17=≥25% | E17=4
R18: A18=Total landfill tCO₂e YTD | B18=2.320153236 [=SUMIF(F4:F40,">0",F4:F40)*0.58/1000] | C18=Minimise | E18=3
R19: A19=Waste contractor sustainability rating | B19=IMS-T-149 Oricol score | C19=≥80% | E19=3
R20: A20=ISO 14001 waste aspect managed | C20=Yes | E20=3