# Assumptions

- Rows scanned: up to 200
- Formulas: 2

## Data validations
- `B6` type=list formula1="Lean,Standard,Strict"
- `B8` type=list formula1="Generic,FMCG / Distribution,Transport / Logistics,Manufacturing,Financial Services,ICT / Technology,Agriculture,Mining,Construction,Retail,Hospitality,Healthcare,Education,Public Sector"
- `B9` type=list formula1="King V + IFRS S1/S2,GRI Standards,IFRS S1+S2 only,ESRS (EU CSRD),TCFD,Combined (all)"
- `B10` type=list formula1="Single (financial — IFRS),Double (financial + impact — ESRS),Dynamic"
- `B11` type=list formula1="ZAR,USD,EUR,GBP,KES,NGN,BWP,ZMW,GHS,EGP,XOF,MAD"
- `B13` type=list formula1="Current Tier 1 only,Escalated Tier 2 only,Both (current + escalated)"

## Sample rows (first 30)
R1: A1=⚙  ASSUMPTIONS  —  Single source of truth for thresholds, weights, emission factors, targets
R2: A2=Edit values in the BLUE cells to retune the toolkit. All scorecards reference this sheet — one edit cascades everywhere.
R3: A3=🔒  THIS INSTANCE IS CONFIGURED FOR SUPERGROUP  —  Transport / FMCG Distribution  |  Sector-locked deep build
R4: A4=To deploy for a different sector (ICT, Financial Services, Mining, etc.) start from the Generic template — do not retrofit by changing the Sector toggle below. Each sector fork has bespoke depth (e.g. ISO 14083 for transport, task-based emissions for ICT, financed emissions for FinServ).
R6: A6=BLOCK 0 — STRATEGY TOGGLES  ★  PRIMARY CONTROLS — change these to retune the whole toolkit
R7: A7=Setting | B7=Active value | C7=Options | D7=Code | E7=Effect on toolkit | F7=Cell ref
R8: A8=Scoring stance | B8=Standard | C8=Lean / Standard / Strict | D8=STANCE | E8=Drives the banding floor (Lean 30% / Std 50% / Strict 70%) for partial credit on all quantitative indicators | F8=Assumptions!B6
R9: A9=Banding floor (auto from stance) | B9=0.5 [=IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))] | C9=0.30 / 0.50 / 0.70 | D9=STANCE_FLR | E9=Below Actual/Target × this %, score = 0. Above, pro-rata. | F9=Assumptions!B7
R10: A10=Sector | B10=Transport / FMCG Distribution | C10=See list → | D10=SECTOR | E10=🔒 Sector-locked for this SuperGroup instance. The toolkit is configured around transport/distribution logic (ISO 14083, Fleet_Register, Driver_Debrief). To use for another sector, fork from the Generic template — do not change this dropdown. | F10=Assumptions!B8
R11: A11=Primary reporting standard | B11=King V + IFRS S1/S2 | C11=SA / IFRS / GRI / ESRS / TCFD | D11=STD_PRIMARY | E11=Determines emphasis in dashboard, executive summary, and standards map | F11=Assumptions!B9
R12: A12=Materiality basis | B12=Single (financial — IFRS) | C12=Single / Double / Dynamic | D12=MAT_BASIS | E12=Single: financial only (IFRS). Double: financial + impact (ESRS). Dynamic: both, evolving over time. | F12=Assumptions!B10
R13: A13=Reporting currency | B13=ZAR | C13=See list → | D13=CCY | E13=Drives currency symbol on CSI, Carbon Tax, training spend, and procurement | F13=Assumptions!B11
R14: A14=Currency symbol (auto)
R15: A15=Carbon tax display | B15=Both (current + escalated) | C15=Current / Escalated / Both | D15=TAX_MODE | E15=Side-by-side liability view: Tier 1 (current) vs Tier 2 (escalated forward-looking) | F15=Assumptions!B13
R16: A16=★ How toggles work: change a value in column B → all scorecards and the dashboard recompute. The current scoring stance ("Standard") gives 50% banding floor; switch to "Lean" to use 30% (encourages early progress); switch to "Strict" for 70% (closer to B-BBEE binary).
R28: A28=BLOCK 1 — EMISSION FACTORS  (DEFRA 2024 · Eskom NERSA 2024 · GHG Protocol)
R29: A29=Factor | B29=Value | C29=Unit | D29=Code | E29=Source / Reference | F29=Last Updated
R30: A30=Diesel — road freight | B30=2.68 | C30=kgCO₂e/L | D30=EF_DIESEL | E30=DEFRA 2024 — Mobile combustion, HGV diesel | F30=2025-01-01
R31: A31=Petrol — business vehicles | B31=2.31 | C31=kgCO₂e/L | D31=EF_PETROL | E31=DEFRA 2024 — Passenger car petrol | F31=2025-01-01
R32: A32=LPG — forklifts | B32=1.51 | C32=kgCO₂e/kg | D32=EF_LPG | E32=DEFRA 2024 — LPG combustion | F32=2025-01-01
R33: A33=Electricity — Eskom grid | B33=0.82 | C33=kgCO₂e/kWh | D33=EF_ELEC | E33=Eskom NERSA 2024 — grid emission factor | F33=2025-01-01
R34: A34=Solar PV — onsite generation | B34=0.025 | C34=kgCO₂e/kWh | D34=EF_SOLAR | E34=IEA / GHG Protocol — solar PV lifecycle | F34=2025-01-01
R35: A35=Municipal water | B35=0.000344 | C35=tCO₂e/kL | D35=EF_WATER | E35=GHG Protocol — water supply & treatment | F35=2025-01-01
R36: A36=Waste to landfill | B36=0.58 | C36=tCO₂e/tonne | D36=EF_LANDFILL | E36=DEFRA 2024 — landfilled commercial waste | F36=2025-01-01
R37: A37=Carbon Tax Tier 1 rate (ZAR) | B37=236 | C37=ZAR/tCO₂e | D37=TAX_T1 | E37=SA Carbon Tax Act — Tier 1 rate 2025 (taxable above threshold) | F37=2025-01-01
R38: A38=Carbon Tax Tier 2 rate (ZAR) | B38=640 | C38=ZAR/tCO₂e | D38=TAX_T2 | E38=SA Carbon Tax Act — projected escalation 2026 | F38=2025-01-01
R39: A39=Carbon Tax basic allowance | B39=0.6 | C39=% exempt | D39=TAX_ALLOW | E39=SA Carbon Tax Act s7 — basic 60% tax-free allowance | F39=2025-01-01
R41: A41=BLOCK 2 — SCORING THRESHOLDS  (used by E/S/G scorecards for banded scoring)
R42: A42=Threshold | B42=Value | C42=Unit | D42=Code | E42=Used by / Applies to | F42=Rationale
R43: A43=Scope 1+2 YoY reduction target | B43=0.1 | C43=% | D43=THR_GHG_YOY | E43=E_Scorecard row 6 | F43=SBTi near-term: minimum 4.2% pa for 1.5°C; 10% stretch target