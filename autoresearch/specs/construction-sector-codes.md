# Construction Sector Codes — targets (from `docs/Construction sector codes.docx`)

Source: the user-supplied Construction Sector Code document. Two sub-sectors —
**Contractor (CE)** and **BEP (Built Environment Professional)** — each scored as
a Generic entity below. Where a detail is unspecified (QSE/EME thresholds,
discounting, sub-minimums), **match RCOGP**.

Format: `line item — Contractor weight @ target | BEP weight @ target`.

## Ownership (Total: Contractor 31 / BEP 31)
- Black exercisable voting rights — 4.5 @ 35% | 5.5 @ 35%*
- Black women voting rights — 2 @ 14% | 2 @ 14%*
- Black economic interest — 4.5 @ 35% | 5.5 @ 35%*
- Black women economic interest — 2 @ 14% | 2 @ 14%*
- EI of black designated groups/ESOP/BBOS/co-ops — 3 @ 12% | 3 @ 6%
- Black new entrants — 5 @ 5% | 5 @ 6%
- Net value (realisation) — 6 @ Calc | 4 @ Calc
- Bonus: black voting > 50% — 1 | 1
- Bonus: black voting > 75% — 2 | 2
- Bonus: black women voting > 50% — 1 | 1
- *BEP note: >50% of ownership must be held by individuals who are BOTH
  professionally registered with a statutory BEP council AND in Executive
  Management; otherwise only 50% of non-qualifying owners' black ownership counts.

## Management Control (Total: Contractor 22 / BEP 22)
- Black board voting rights — 3 @ 50% | 2.5 @ 50%
- Black women board voting rights — 1 @ 20% | 1 @ 20%
- Black Executive Directors — 2 @ 50% | 2.5 @ 50%
- Black women Executive Directors — 1 @ 20% | 1 @ 20%
- Bonus: exceed black ED target — 1 @ >50% | 1 @ >50%
- Bonus: exceed black women ED target — 1 @ >20% | 1 @ >20%
- Black Other Executive Mgmt — 2 @ 60% | 2 @ 60%
- Black women Other Executive Mgmt — 1 @ 30% | 1 @ 30%
- Black Senior Mgmt — 2 @ 60% | 2 @ 60%
- Black women Senior Mgmt — 0.5 @ 30% | 1 @ 30%
- Black Middle Mgmt — 1 @ 75% | 1.5 @ 75%
- Black women Middle Mgmt — 0.5 @ 30% | 1 @ 30%
- Black Junior Mgmt — 1 @ 88% | (BEP: n/a)
- Black women Junior Mgmt — 0.5 @ 35% | (BEP: n/a)
- Black employees with disabilities — 0.5 @ 2% | 0.5 @ 2%
- Black professionally-registered employees — 2 @ 50% | 2 @ 50%
- Bonus: black youth (Adjusted Recognition for Gender) — 2 @ 30% | 2 @ 30%
- **Adjusted Recognition for Gender:** A = (B/1.3) + C, where C (black women %)
  is capped at 50% of the target.

## Skills Development (Total: Contractor 26 / BEP 34)
- Skills spend on black people (% of Leviable) — 4 @ 3% | 7 @ 3%
- Spend on African people — 2 @ %African-contribution-to-EAP | 2 @ same
- Black Management (Exec/Senior/Middle) skills — 2 @ 15% | 3 @ 15%
- Black Management (Junior) skills — 1 @ 10% | 1 @ 10%
- Bursaries/scholarships for black people — 2 @ 15% | 4 @ 15%
- Black people on Cat A–D learning programmes (% of employees) — 3 @ 2.5% | 4 @ 2.5%
- Black candidates with professional bodies — 3 @ 60% | 4 @ 60%
- Black disabled on Cat A–D programmes — 1 @ 5% | 1 @ 5%
- Mentorship programme (Annexe CSC300 C) — 3 @ Yes | 3 @ Yes
- Bonus: black absorption after Cat A–D — 1 @ 100% | 1 @ 100%
- Bonus: black mentees promoted (3yr) — 2 @ 15% | (BEP: n/a)
- Black newly professionally-registered — 2 @ 60% | 4 @ 60%

## Preferential Procurement
- B-BBEE spend from all empowering suppliers (% TMPS) — 6 @ 80% | 6 @ 80%
- ...from EME empowering suppliers — 3 @ 15% | 3 @ 15%
- ...from QSE empowering suppliers — 3 @ 15% | 2 @ 15%
- ...from ≥51% black-owned empowering suppliers — 4 @ 20% | 4 @ 20%
- ...from ≥35% black-women-owned empowering suppliers — 3 @ 12% | 3 @ 12%
- Bonus: ≥51% black-designated-group-owned — 3 @ 20% | 2 @ 20%
- Bonus: ≥51% black-women-owned — 1 @ 8% | 1 @ 8%

## Supplier Development (Total: Contractor 38 / BEP 30)
- Compliant Supplier & Contractor Development Programmes (Annexe CSC 400) — 5 | 4
- Annual Qualifying SD contributions (% target) — 8 @ 3% NPAT | 4 @ 3% NPAT
- SD contributions to ≥51% black-women-owned — 2 @ 20% of (3% NPAT) | 1 @ same

## Socio-Economic Development (Total: Contractor 6 / BEP 6)
- Annual qualifying SED contributions (% target) — 4 @ 1.25% NPAT | 4 @ 1.25% NPAT
- SED above to Communities with Limited Services — 1 @ 30% of target | 1 @ same
- Bonus: structured SED projects — 1 @ 1.25% NPAT | 1 @ same

## Implementation notes for the engine
- Construction currently overloads sub-sector (Contractor/BEP) onto
  `scorecardType` (see memory `construction-sector-model`). The fix: a real
  `constructionSubSector` (Contractor | BEP) meta field × a size axis
  (Generic/QSE/EME), then a config matrix in `apps/api/pipeline/sectorConfig.ts`
  + `apps/web/Toolkit/src/lib/sectors/`.
- Encode the Contractor/BEP Generic targets above first. QSE/EME variants:
  match RCOGP's QSE structure scaled to construction weights pending a verified
  QSE construction scorecard.
- ESD for construction = Supplier Development only (no scored ED) — already wired
  in `getSection` (commit 7b7e5040).
