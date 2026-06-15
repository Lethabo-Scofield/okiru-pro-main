# E_Data

- Rows scanned: up to 200
- Formulas: 224

## Data validations
- `B90` type=list formula1=0

## Sample rows (first 30)
R1: A1=E_DATA — ENVIRONMENTAL RAW DATA  |  SG Consumer  |  FY 2025/26
R3: A3=EMISSION FACTORS (DEFRA 2024 / Eskom NERSA 2024)  — edit only if factors updated
R4: A4=EF_DIESEL | B4=2.68 | C4=kgCO₂e/L | D4=Road freight diesel (DEFRA 2024)
R5: A5=EF_PETROL | B5=2.31 | C5=kgCO₂e/L | D5=Business car petrol
R6: A6=EF_LPG | B6=1.51 | C6=kgCO₂e/kg | D6=LPG forklifts (DBN warehouse)
R7: A7=EF_ELEC | B7=0.82 | C7=kgCO₂e/kWh | D7=Eskom grid — NERSA 2024
R8: A8=EF_SOLAR | B8=0.025 | C8=kgCO₂e/kWh | D8=Solar PV (onsite generation)
R9: A9=EF_WATER | B9=0.000344 | C9=tCO₂e/kL | D9=Municipal water (GHG Protocol)
R10: A10=EF_LANDFILL | B10=0.58 | C10=tCO₂e/tonne | D10=Waste to landfill
R12: A12=SCOPE 1A — ROAD FREIGHT DIESEL (Fleet litres per depot)  [Source: Mariette Dashboard fuel consumption sheet]
R13: A13=Depot/Source | B13=Unit | C13=Jul-25 | D13=Aug-25 | E13=Sep-25 | F13=Oct-25 | G13=Nov-25 | H13=Dec-25
R14: A14=SG Consumer – BLOEM | B14=litres | C14=17639.52 | D14=12721.25 | E14=5877.41 | F14=6836 | G14=5002 | H14=6977
R15: A15=SG Consumer – CPT | B15=litres | C15=6789 | D15=6039 | E15=5927 | F15=6936 | G15=5857 | H15=6518
R16: A16=SG Consumer – DBN | B16=litres | C16=17716.57 | D16=14729.31 | E16=16273.31 | F16=18434 | G16=18357.36 | H16=18828
R17: A17=SG Consumer – ISANDO | B17=litres | C17=35757.98 | D17=33349.25 | E17=35581.74 | F17=39804.91 | G17=36773.79 | H17=23998.48
R18: A18=SG Consumer – PE | B18=litres | C18=1451 | D18=1340.08 | E18=1417 | F18=1376 | G18=1304.49 | H18=1267.87
R19: A19=TOTAL FLEET DIESEL | C19=79354.07 [=C14+C15+C16+C17+C18] | D19=68178.89 [=D14+D15+D16+D17+D18] | E19=65076.46 [=E14+E15+E16+E17+E18] | F19=73386.91 [=F14+F15+F16+F17+F18] | G19=67294.64 [=G14+G15+G16+G17+G18] | H19=57589.35 [=H14+H15+H16+H17+H18] | I19=48740.43 [=I14+I15+I16+I17+I18]
R21: A21=SCOPE 1B — GENERATOR DIESEL (litres per depot)  [Source: Mariette Dashboard / Bowser Recon]
R22: A22=Depot | B22=Unit | C22=Jul-25 | D22=Aug-25 | E22=Sep-25 | F22=Oct-25 | G22=Nov-25 | H22=Dec-25
R23: A23=Generator – BLOEM | B23=litres | C23=650 | D23=0 | E23=0 | F23=0 | G23=0 | H23=0
R24: A24=Generator – CPT | B24=litres | C24=0 | D24=0 | E24=0 | F24=0 | G24=0 | H24=0
R25: A25=Generator – DBN | B25=litres | C25=639.14 | D25=0 | E25=0 | F25=0 | G25=0 | H25=0
R26: A26=Generator – ISANDO | B26=litres | C26=0 | D26=0 | E26=0 | F26=0 | G26=0 | H26=0
R27: A27=Generator – PE | B27=litres | C27=0 | D27=0 | E27=0 | F27=0 | G27=0 | H27=295
R28: A28=TOTAL GENERATOR | C28=1289.14 [=C23+C24+C25+C26+C27] | D28=0 [=D23+D24+D25+D26+D27] | E28=0 [=E23+E24+E25+E26+E27] | F28=0 [=F23+F24+F25+F26+F27] | G28=0 [=G23+G24+G25+G26+G27] | H28=295 [=H23+H24+H25+H26+H27] | I28=0 [=I23+I24+I25+I26+I27]
R30: A30=SCOPE 1C — LPG FORKLIFTS (kg per depot)  [Source: Mariette Dashboard gas-forklifts sheet]
R31: A31=Depot/Unit | B31=Unit | C31=Jul-25 | D31=Aug-25 | E31=Sep-25 | F31=Oct-25 | G31=Nov-25 | H31=Dec-25
R32: A32=LPG Forklifts – DBN | B32=kg | C32=0 | D32=570 | E32=190 | F32=190 | G32=380 | H32=570
R33: A33=NOTE: BLOEM, CPT, ISANDO, PE use electric/lithium-battery forklifts — no LPG emissions. Sanulac data confirms depot-level forklift types.
R35: A35=SCOPE 1D — ROAD BUSINESS (Solly's car, ISANDO)  [Source: Mariette Dashboard fuel consumption sheet]