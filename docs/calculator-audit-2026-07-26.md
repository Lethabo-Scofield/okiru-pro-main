# B-BBEE Calculator Correctness Audit — okiru-pro vs the Official Codes

**Date:** 2026-07-26 · **Scope:** `apps/web/Toolkit/src/lib/sectors/*.ts`, `apps/web/Toolkit/src/lib/calculators/*.ts`, `apps/api/pipeline/sectorConfig.ts`, `apps/api/pipeline/constructionScoring.ts`, `apps/web/src/lib/npatDeemedCalculation.ts`, `apps/web/src/lib/industryNormLookup.ts` · **Method:** static read of the code + verification against the gazetted codes (first-hand text extraction of the ICT, AgriBEE, FSC and Construction gazettes; secondary sources and real verification certificates where gazettes are scanned images).

**Primary sources verified first-hand (full gazette text extracted and read):**
- Amended ICT Sector Code, GG 40407 (7 Nov 2016) — http://www.thedtic.gov.za/wp-content/uploads/Amended_ICT_Code.pdf
- Amended AgriBEE Sector Code, GG 41306 (8 Dec 2017) — https://bbbeecommission.co.za/wp-content/uploads/2017/12/AgriBEE-Final-08Dec2017.pdf
- Amended Financial Sector Code, GG 41287 (1 Dec 2017) — https://www.thedtic.gov.za/wp-content/uploads/Amended_Financial_Sector_Code.pdf
- Amended Construction Sector Code, GG 41287 (1 Dec 2017) — http://www.thedtic.gov.za/wp-content/uploads/Amended-Construction-Codes.pdf
- Amended Generic Codes 2019 amendment (Statements 000/300/400), GG 42496 (31 May 2019) — https://www.gov.za/sites/default/files/gcis_document/201905/42496gen304.pdf
- Integrated Transport Sector Code, GG 32511 (21 Aug 2009) — https://www.bbbeecommission.co.za/integrated-transport-sector-code/ (page-range PDFs are **scanned images**, not machine-readable; corroborated with real Road Freight certificates: https://nieuwstadroadfreight.co.za/wp-content/uploads/2022/07/B-BBEE-CERT-Nieuwstad-2021.pdf and https://collivery.net/docs/BEE_Certificate2025.pdf)

Verdicts: **SOUND** (matches the official code), **DISCREPANCY** (differs from the official code), **UNVERIFIABLE-ONLINE** (no machine-readable authoritative source found), **TEMPLATE-TENSION** (code matches okiru's expert-verified Excel/certificate ground truth but not the gazette — noted, per audit guardrails, rather than declared wrong).

---

## 1. RCOGP (Amended Generic Codes of Good Practice, as amended 31 May 2019)

Code under audit: `RCOGP_GENERIC` in `apps/api/pipeline/sectorConfig.ts` (L474-559), consumed by `apps/web/Toolkit/src/lib/sectors/rcogp-generic.ts`.

| Element | Code value | Official value | Verdict | Source |
|---|---|---|---|---|
| Ownership 25 pts: voting 4@25%+1, BW voting 2@10%, EI 4@25%, BW EI 2@10%, DG/ESOP/BBOS/co-op 3@3%, new entrants 2@2%, net value 8 | as listed | identical (Amended Statement 100; identical structure confirmed in the AgriBEE gazette §7.2.3 and ICT gazette Statement AICT101 which replicate it) | **SOUND** | GG 41306 p.31; GG 40407 p.27 |
| Management Control 19 pts: board 2+1 (50%/25%), exec dirs 2+1 (50%/25%), other exec 2+1 (60%/30%), senior 2+1 (60%/30%), middle 2+1 (75%/38%), junior 1+1 (88%/44%), disabled 2@2% | as listed | identical (Amended Statement 200; AgriBEE §7.3.3 replicates it verbatim at 19 pts) | **SOUND** | GG 41306 pp.33-34 |
| MC EAP methodology: band targets 60/75/88 (30/38/44 BW) split per-demographic by provincial effective EAP (`management.ts` `scoreBandPerDemographic`, `eapTargets.ts`) | per-demographic effective EAP | Statement 200 §2.7/2.8: targets for senior/middle/junior "based on the overall demographic representation … further broken down into specific criteria according to the different race sub-groups … weighted accordingly" (same wording in ICT gazette AICT200 §2.7-2.8) | **SOUND** (also expert-verified vs the Lake workbook per audit guardrails) | GG 40407 pp.49-50 |
| Skills 20 pts + 5 bonus: LP 6@3.5%, bursaries 4@2.5%, disabled 4@0.3%, LAI headcount 6@5%, absorption bonus 5 | as listed | identical (2019 amended Statement 300) | **SOUND** | GG 42496; https://beeratings.com/amended-b-bbee-code-of-good-practice-may-2019-update/ |
| Skills absorption bonus **target**: `absorptionTargetPercent: 2.5` → full 5 bonus pts at a **2.5 % absorption rate** (`skills.ts` L393: `safeRatio(absorptionRate, absorptionTargetPct/100, absorptionMaxPts)`) | 2.5 % | **100 %** — the amended Statement 300 bonus is "Number of black people absorbed … 100%", pro-rated when less than 100 % are absorbed (ICT gazette AICT300 §2.1.3 states the identical 100 % target and pro-rating rule; RCOGP-QSE and ICT-QSE configs were already corrected to 100 in R8/R22 but Generic was not) | **DISCREPANCY** (over-award ×40) | GG 40407 p.52-53; GG 42496 |
| Preferential Procurement 27 base + 2 DG bonus: 5@80% all empowering, 3@15% QSE, 4@15% EME, 11@50% ≥51 % BO, 4@12% ≥30 % BWO, DG bonus 2@2% | as listed | identical — the 2019 amendment raised BO51 from 40 %/9 pts to 50 %/11 pts and added the DG 2 pts@2 % indicator | **SOUND** | https://www.webberwentzel.com/News/Pages/amendments-to-the-amended-generic-codes-of-good-practice-on-b-bbee.aspx ; GG 42496 |
| ESD: SD 10@2 % NPAT; ED 5@1 % NPAT; bonuses grad 1, jobs 1 | as listed | identical (Statement 400) | **SOUND** | GG 42496 |
| SED 5@1 % NPAT | as listed | identical (Statement 500) | **SOUND** | https://www.tusker.co.za/bee-ownership-guide/code-000-core-bee-concepts/scorecards/ |
| Level thresholds 100/95/90/80/75/70/55/40 → L1-L8; recognition 135/125/110/100/80/60/50/10 (`STANDARD_LEVELS`, `STANDARD_RECOGNITION_TABLE`) | as listed | identical | **SOUND** | https://app.bee123.co.za/AppHelp/help2013/GENERIC%20AMENDED%202019/Content/The%20Generic%20Scorecard%20Structure.htm |
| Priority sub-minimums: Ownership 40 % of net value 8 pts = 3.2; Skills 40 % of 20 base = 8; ESD 40 % of each category (PP 10.8 of 27, SD 4 of 10, ED 2 of 5); one-level discount, applied once regardless of how many fail (`store.ts` L920-922) | as listed | identical — "maximum discount of one level" | **SOUND** | https://www.linkedin.com/pulse/sub-minimum-discounting-principle-context-enterprise-supplier- ; FSC gazette §3.3.3.2 (same principle) |

**Engine-level findings (affect all sectors that use the generic calculators):**

1. **Ownership "full award" shortcut** — `ownership.ts` L164-181: when black *voting* ≥ 25 % (`fullOwnershipAwarded`), the calculator awards **maximum** points for economic interest, black-women EI, designated groups and net value regardless of the actual EI/BW/DG/net-value percentages. Statement 100 scores each indicator independently with formula `A/B×C` per indicator; a 26 %-black-voting entity with 0 % black-women EI must not receive the 2 BW-EI points. **DISCREPANCY** (over-award; latent because golden tests use 100 %-black entities).
2. **Net value / time-based graduation misplaced** — `ownership.ts` applies the Annexe 100(E) graduation table to the *Economic Interest* line (L186-194) and scores net value as an un-graduated deemed-value aggregation (L155-161, L205-213). Officially the time-based graduation factor belongs to the **Net Value** formula (Annexe 100(E)); EI has no graduation. **DISCREPANCY** (structural; magnitude depends on deal age).
3. **Ownership sub-minimum OR-branch** — `store.ts` L905 (`ownScore.total >= ownTarget*0.4 || ownScore.subMinimumMet`) lets 40 % of the whole 25-pt pillar substitute for the net-value sub-minimum. The Codes tie the ownership sub-minimum to Net Value only. **DISCREPANCY** (leniency: an entity failing net value but scoring ≥10 ownership points escapes discounting).
4. **Skills category caps** — `skills.ts` caps categories F and G at 25 % *each* (`applyCapToSpend`). The Codes cap informal training (Cat F + G) at 25 % of total skills spend *combined*. Minor leniency. The 15 % cap on training-admin/SDF costs (`applyAdminCosts`) matches practice.

### RCOGP QSE (`RCOGP_QSE`, sectorConfig.ts L1177-1259; `rcogp-qse.ts`)

| Element | Code value | Official value (Amended QSE statements; mirrored verbatim in the ICT QSE gazette AICT601-605, read first-hand) | Verdict |
|---|---|---|---|
| Totals: Own 25, MC 15, Skills 30 (25 base + 5 bonus), PP 21 (20 + 1 DG bonus), SD 5, ED 7 (5+2), SED 5 = 108 incl. bonus | base 100 + bonuses | QSE scorecard: Own 25, MC 15, Skills 25(+5), ESD 30(+bonus), SED 5 = 100 base | **SOUND** |
| Ownership: voting 5@25 %+1, BW 2@10 %, EI 5@25 %, BW EI 2@10 %, combined New-Entrants-or-DG 3@2 %, net value 8 | as listed | identical (AgriBEE QSE §7.2.4 and ICT QSE AICT601 show the same combined NE-or-DG 3@2 % line) | **SOUND** |
| MC: exec 5@50 % + 2@25 %; Senior+Middle+Junior combined flat 6@60 % + 2@30 %, no EAP split (`management.ts` isQse branch) | as listed | identical (ICT QSE AICT602: "demographic representation … not applicable to the QSE Scorecard") | **SOUND** |
| Skills: 15@3 % black, 7@1 % black women (spend, not bursaries — `bursaryIsBlackFemale`), 3@0.15 % disabled, absorption bonus 5@100 % | as listed | identical (ICT QSE AICT603: 15@3 %, 7@1 %, 3@0.15 %, bonus 5@100 %) | **SOUND** |
| PP: 15@60 % all empowering, 5@15 % BO51, DG bonus 1@1 % | as listed | identical (ICT QSE AICT604 PP block) | **SOUND** |
| SD 5@1 % NPAT, ED 5@1 % NPAT (+grad 1, jobs 1) | 1 %/1 % | 1 %/1 % under the generic QSE statement | **SOUND** |
| **QSE priority-element rule** — store discounts when ANY of ownership/skills/PP/SD/ED sub-minimums fail (`store.ts` L920) | all five required | A QSE must comply with **Ownership plus EITHER Skills Development OR ESD** (AgriBEE gazette §5.2.2, FSC gazette §3.3.2(b) — both restate the generic rule) | **DISCREPANCY** (over-discounts QSEs that satisfy ownership + one leg) |
| 51 %/100 % black-owned QSE automatic Level 2/1 (sworn affidavit route) | not modelled | Amended Codes give 51 % black QSEs deemed Level 2, 100 % deemed Level 1 | **GAP** (feature absence, not mis-scoring) — https://www.mondaq.com/southafrica/government-contracts-procurement-ppp/817746/recent-amendments-to-the-b-bbee-codes |

---

## 2. ICT Sector Code (GG 40407, 7 Nov 2016 — verified first-hand against the gazette text)

### ICT Generic (`ICT_GENERIC`, sectorConfig.ts L566-676)

| Element | Code value | Official value (gazette) | Verdict |
|---|---|---|---|
| Element weights: Own 25, MC 23, Skills 20(+5), PP 25(+2), SD 10, ED 15(+3), SED 12; total incl. bonus 140 | as listed | Own 25, MC 23, Skills 20, ESD 50 (PP 25 + SD 10 + ED 15), SED 12 (base 130; bonuses: skills 5, DG 2, ED 3) | **SOUND** (GG 40407 p.15, p.22) |
| **Ownership targets** | voting 25 %+1, EI 25 % | **30 %** voting rights and **30 %** economic interest ("Exercisable Voting Rights … in the hands of Black People — 4 — 30 %"; "Economic Interest … Black People — 4 — 30 %") | **DISCREPANCY** — GG 40407 p.26-27 (Statement AICT101 §2.1.1/2.2.1). Weights (4/2/4/2/3/2/8) are correct; only the 30 % targets are wrong (config uses 25 %). Note `ICT_QSE` correctly uses 30 %, which highlights the inconsistency. |
| MC 23: board 3@50 % + 2@25 %, exec dirs 2@50 % + 1@25 %, other exec 3@60 % + 2@30 %, senior 2+1, middle 2+1, junior 1+1 (60/30, 75/38, 88/44), disabled 2@2 % | as listed | identical | **SOUND** (GG 40407 pp.48-49) |
| Skills: 8@6 % spend, 4@0.3 % disabled, 4@2.5 % LAI headcount, 4@2.5 % unemployed-in-training headcount (`bursaryIsHeadcount`), absorption bonus 5 with unemployed-LAI-completers basis | as listed | identical rows: 8@6 %, 4@0.3 %, 4@2.5 %, 4@2.5 %, bonus 5 | **SOUND** (GG 40407 pp.52-53) |
| Skills absorption **target** `absorptionTargetPercent: 2.5` | 2.5 % | **100 %** (AICT300 §2.1.3: "5 — 100 %"; §3.4 pro-rates below 100 %) | **DISCREPANCY** (same class as RCOGP Generic) |
| PP: 5@80 %, 3@15 % QSE, 4@15 % EME, 9@**40 %** BO51, 4@12 % BWO30, DG bonus 2@2 % | as listed | identical (ICT keeps BO51 at 40 %/9 — it did NOT adopt the 2019 generic 50 %/11 change) | **SOUND** (GG 40407 pp.57-58) |
| SD 10@2 % NPAT; ED 15@**3 %** NPAT; bonuses: graduation 1; jobs ≤10 % → 1 OR ≥11 % → 2 (`esd-sed.ts` two-tier logic) | as listed | identical (AICT400 §2.2-2.4) | **SOUND** (GG 40407 pp.58-59) |
| ESD sub-minimums 40 %: PP 10/25, SD 4/10, ED 6/15, excl. bonus | as listed | identical (AICT400 §4.1) | **SOUND** |
| SED 12@1.5 % NPAT (ICT sector-specific initiatives) | as listed | identical (AICT500 §2.3: "12 — 1.5 % of NPAT") | **SOUND** (GG 40407 pp.72-73) |
| Level thresholds `ICT_LEVELS`: 120/115/110/100/95/90/75/55 | as listed | identical ("Level One Contributor ≥120 points on the ICT Scorecard 135 %… Non-Compliant <55") | **SOUND** (GG 40407 p.15) |

### ICT QSE (`ICT_QSE`, sectorConfig.ts L1269-1359)

| Element | Code value | Official value (AICT600-605, first-hand) | Verdict |
|---|---|---|---|
| Own 25 (5@30 %, 2@10 %, 5@30 %, 2@10 %, NE/DG 3@2 %, NV 8); MC 15 (5@50 %, 2@25 %, SMJ 6@60 % + 2@30 %); Skills 15@3 %, 7@1 % BW, 3@0.15 %, bonus 5@100 %; PP 15@60 %, 5@15 %, DG 1@1 %; SED 12@1 % | as listed | identical in every row | **SOUND** (GG 40407 pp.77-86) |
| **SD / ED targets**: `sdPercent: 1.0, edPercent: 1.0` | 1 % / 1 % | **2 % of NPAT for SD and 2 % of NPAT for ED** ("Annual value of all Supplier Development Contributions … 5 — 2 % of Net Profit After Tax"; "Enterprise Development Contributions … 5 — 2 % of NPAT") | **DISCREPANCY** — GG 40407 pp.84-85 (AICT604 §7.1.1.4/7.1.1.5). Halves the target → inflates SD/ED scores for ICT QSEs. |
| ED bonuses: grad 1; jobs ≤10 % → 1 / ≥11 % → 2 | as listed | identical | **SOUND** |
| Level thresholds: `STANDARD_LEVELS` (100/95/90/…) | generic table | The gazette applies Statement AICT000 "mutatis mutandis" to QSEs; AICT000's own table is the 120/115/… ICT ladder, which is arithmetically unreachable on a 107-base QSE scorecard. The gazette is internally ambiguous. | **UNVERIFIABLE-ONLINE** — okiru's choice (generic 100/95/… ladder) is the only workable reading and matches verification practice, but flag it: an ICT QSE Level 1 at 100/107 cannot be proven from the gazette text. |

---

## 3. AgriBEE Sector Code (GG 41306, 8 Dec 2017 — verified first-hand)

### AGRI Generic (`AGRI_GENERIC`, sectorConfig.ts L1067-1169)

| Element | Code value | Official value (gazette) | Verdict |
|---|---|---|---|
| Ownership 25: 4@25 %+1, 2@10 %, 4@25 %, 2@10 %, DG-incl-farm-workers 3@**4 %**, NE 2@2 %, NV 8 | as listed | identical, including the agriculture-specific 4 % DG target and farm-worker inclusion (§7.2.3) | **SOUND** (GG 41306 pp.31-32) |
| **Management Control** | **23 pts** (board 3@50 % + 2@25 %, exec 2+1, other exec 3@60 % + 2@30 %, senior 2+1, middle 2+1, junior 1+1, disabled 2) | **19 pts** — the gazette's Large-Enterprise MC scorecard (§7.3.3) is the generic 19-point structure: board 2+1, exec dirs 2+1, other exec 2+1, senior 2+1, middle 2+1, junior 1+1, disabled 2 | **DISCREPANCY / TEMPLATE-TENSION** — GG 41306 pp.33-34. The code comments say 23 was "verified against BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx". The gazette says 19 (board black = 2 not 3, board BW = 1 not 2, other exec = 2+1 not 3+2). +4 phantom MC points also inflate `totalMaxPoints` 132 → gazette-consistent max incl. bonuses is 128. |
| Skills 20(+5): 8@6 %, 4@0.3 % disabled, 4@2.5 % LAI, 4@2.5 % unemployed (headcount, `bursaryIsHeadcount`), absorption bonus 5@100 % | as listed | identical (§7.4.4); okiru's absorption target is correctly 100 here | **SOUND** (GG 41306 pp.38-39) |
| PP: 5@80 %, 3@15 %, 4@15 %, 9@**40 %** BO51, 4@12 % BWO30, DG bonus 2@2 % | as listed | identical (§7.5.1); note gazette phase-ins (BO51 10→40 % over 5 yrs; BWO30 6 % yrs 1-4) are historic and now at full target | **SOUND** (GG 41306 pp.42-43) |
| SD 10@2 % NPAT | 2 % | Gazette: "10 — (3 % of NPAT for year 1 to year 4) 2 % of NPAT" — 3 % applied 2018-2021, 2 % thereafter. As of 2026, 2 % is correct. | **SOUND** (with the historical phase-in noted) |
| ED 5@1.5 % NPAT + grad 1 + jobs 1 | as listed | identical (§7.5.1.8-7.5.1.10) | **SOUND** |
| SED 15@1.5 % NPAT (agri-specific contributions) | as listed | identical (§7.6.1) | **SOUND** (GG 41306 p.60) |
| Levels: `STANDARD_LEVELS` | 100/95/90/… | identical (gazette §4.3 uses the standard ladder; L7 ≥55<70, L8 ≥40<55 read first-hand) | **SOUND** |
| Priority/sub-min: own NV 40 % of 8; skills 40 % excl. bonus; ESD 40 % per category; QSE = ownership + either skills or ESD; one-level discount | implemented for Large; QSE either/or **not** implemented (see RCOGP QSE finding) | gazette §5.1-5.3 | **SOUND for Large / DISCREPANCY for QSE rule** |

---

## 4. Financial Sector Code (GG 41287, 1 Dec 2017 — verified first-hand)

Official element weightings (FSC gazette §8.1, read first-hand):

| Element | Banks & Life offices | STI | Other institutions |
|---|---|---|---|
| Ownership | **23** | 23 | 25 |
| Management Control | 20 | 20 | 20 |
| Skills Development | 20 | 20 | 20 |
| Procurement & ESD | **15** (PP only) | 35 | 35 (PP 20 + SD 10 + ED 5) |
| SED & Consumer Education | 5 | 5 | 5 |
| Empowerment Financing & ESD | **25** (TI 12 + TF 3 + SD 7 + ED 3) | 0 | 0 |
| Access to Financial Services | 12 | 12 | 0 |
| **Total** | **120** | **115** | **105** |

Level thresholds (gazette §8.2.1): `threshold = (generic points / 109) × sector total` — e.g. Banks L1 = 100/109×120 = **110.09**, STI L1 = **105.50**, Others L1 = **96.33**.

### FSC Generic / "Others" (`FSC_GENERIC`, sectorConfig.ts L687-764)

| Item | Code value | Official value | Verdict |
|---|---|---|---|
| Ownership 25 structure (4/2/4/2/[3 DG default]/2/8 @ 25 %+1, 10 %…) | 25 | Others ownership = 25 per §8.1 (generic structure) | **SOUND** |
| MC | 21 pts: board 2+1, exec 2+1, other-exec **10@75 % + 4@38 %**, disabled 1; no senior/middle/junior | **20 pts**: board 1+1+2+1 (=5), other exec 2@60 %+1@30 % (=3), senior 2@60 %+1@30 %+**1 African@EAP**, middle 2@75 %+1@38 %+1 African@EAP, junior 1@88 %+1@44 %+1 African@EAP, disabled 1@2 % | **DISCREPANCY** — GG 41287 p.232 (FS200 §2). okiru hard-codes the gazette's §3.4.1 *collapsed* variant (used only when an entity has NO senior/middle/junior management: Other Exec becomes 14 = 10@75 % + 4@38 %) as the universal FSC scorecard, mis-weights board black voting at 2 (gazette: 1), and omits the three African-EAP indicators entirely. Total 21 vs gazette 20. |
| Skills | 23 pts: mgmt-level spend collapsed to 11 pts @ 3.5 % overall, unemployed 4@1.5 %, disabled 1@0.3 %, LAI 4@5 %, absorption bonus 3@100 % | 20 base + 3 bonus: per-level spend (senior 2 @ 2 %/1 %/EAP, middle 2 @ 3 %/1.5 %/EAP, junior 3 @ 5 %/2.5 %/EAP, non-mgmt 4 @ 8 %/4 %/EAP), unemployed 4@1.5 %, disabled 1@0.3 %, LAI 4@5 %, bonus 3@100 % | **PARTIAL / DISCREPANCY** — GG 41287 pp.236-237. Point totals match (11 = 2+2+3+4) but the per-management-level leviable-amount rates and the African-EAP sub-indicators are not modelled; a single 3.5 % blended target is an admitted approximation (comment in code). Direction of error varies with payroll mix. |
| PP (Others) | 20 base: 5@80 %, 3@18 %, 2@12 %, 7@30 %, 3@10 %; bonus 4 | identical: 5@80 % (75 % yrs 1-3), 3@18 %, 2@12 %, 7@30 %, 3@10 %; PP-side bonuses = intermediated-or-stockbroker 2@5 % + DG 2@2 % | **SOUND** (GG 41287 pp.245-246) |
| SD 10@2 %, ED 5@1 %; bonuses grad 1, jobs 1, ED-stockbroker 2@0.5 % (`edStockbrokerBonusMax` in `fsc-generic.ts`) | as listed | identical (§2.2-2.4.5) | **SOUND** |
| SED & CE (`calculateSedScore` split model): SED 3@0.6 %, CE 2@0.4 %, bonus CE 1@0.1 % (derived), Fundisa 2@0.2 % | as listed | identical, incl. reinsurer variants (0.7 % / CE exempt) | **SOUND** — GG 41287 pp.262-263 (FS500 §2) |
| Level thresholds `FSC_LEVELS_OTHERS` (L1 92.79 … L8 37.12) | /template | gazette: W/109 × 105 → L1 96.33, L4 77.06, L8 38.53 | **DISCREPANCY / TEMPLATE-TENSION** — okiru derives thresholds from its Excel template's "Scoring Scale" (denominator 111/113), the gazette formula uses /109 × sector total. okiru's ladder is ~3.5 pts more lenient at L1. |
| FSC QSFI scorecard (Own 25, MC 15, Skills 25, ESD 30, SED 5 = 100) | not shipped | gazette §8.2 | **GAP** — FSC QSEs (QSFIs) cannot be scored. |

### FSC Banks (`FSC_BANKS`) and Long-Term Insurers (`FSC_LTI`)

| Item | Code value | Official value | Verdict |
|---|---|---|---|
| Empowerment Financing: TI 12 + TF 3 = 15 (`empowermentFinancing.ts`) | 15 | identical: "Targeted Investments 12 — R48bn (Banks) / R27bn (LTI)"; "B-BBEE transaction financing and Black Business Growth/SME Funding 3 — R32bn / R15bn" | **SOUND on points** — GG 41287 pp.268-269 (FS600 §2). Note the gazette targets are **rand-denominated industry targets** apportioned per institution; the calculator scores achieved/target exposure ratios from the template inputs, which is the right shape provided the entity's own rand target is captured. |
| EF taxonomy split (TI = transformational infrastructure, black agri financing, affordable housing, black SME; TF = transaction financing + BBG/PE) | regex `isTransactionFinancingCategory` | identical taxonomy | **SOUND** (FS600 §2.1-2.2, §4) |
| SD 7@1.8 % NPAT; ED 3@0.2 % NPAT (non-recoverable) on the EF&ESD scorecard | as listed | identical | **SOUND** (GG 41287 p.268) |
| Banks stockbroker-development ED bonus | `edStockbrokerBonusMax: 0` for Banks | gazette FS600 §2.5.3 gives Banks the same 2-pt "Development of black stockbrokers…" bonus (target "TBD") | **TEMPLATE-TENSION** — the okiru template omits it for Banks; the gazette includes it with an undefined target. Low impact (target TBD is unscoreable anyway). |
| PP for Banks/LTI | 24 pts using the *Others* rows (5/3/2/7/3 + 4 bonus) | **15 base**: 4@80 %, 2@18 %, 2@12 %, 5@30 %, 2@10 % (+4 bonus) | **DISCREPANCY** (acknowledged in code comments as a "pre-existing template delta") — GG 41287 pp.245-246. Banks/LTI PP is over-weighted by 5 base points with wrong per-row weights. |
| Ownership for Banks/LTI/STI | 25-pt generic structure, NV 8, sub-min 3.2 | **23 pts**: voting 4@25 %+1, BW 2@10 %, EI **3**@25 %, BW EI 2@10 %, DG/ESOP/BBOS/co-op 3@3 %, NE **3**@2 %, **NV 6**; bonuses: 3 (ownership >15 %) + 2 (EI/voting >32.5 %/40 %); ownership sub-min = 40 % of the **six** NV points = 2.4 | **DISCREPANCY** — GG 41287 pp.203-204 (FS100 Table 2a) and §3.3.1(a). |
| AFS Banks 12 (`afs.ts`): TP 1@85 %/5 km, SP 1@70 %/10 km, Sales 2@60 %/15 km, Electronic 2, PoP 3, Active accounts 3 | as listed | identical weights/geographic targets; Electronic access official target = 19 % of target-market account holders, Densification = 1 point-of-presence per 1 500 LSM 1-5 adults, Product access = 12 370 082 active accounts (2017) — okiru models these three as yes/no toggles | **SOUND on weights; simplification on the three national indicators** — GG 41287 pp.283-284 |
| AFS LTI 12: products 3, penetration 7, transactional access 2@80 % | as listed | gazette LTI table: Appropriate Products 3, Market Penetration 7, transactional access 2 | **SOUND** (GG 41287 p.287) |
| Banks/LTI level thresholds `FSC_LEVELS_BANKS_LTI` (L1 109.01 = 100/111×121) | /template | gazette: 100/109×120 = **110.09** | **DISCREPANCY / TEMPLATE-TENSION** (~1.1 pts lenient at L1) |
| FSC STI (`FSC_STI`): no EF, AFS 12, SD 2 %/ED 1 % standard | as listed | gazette: STI has EF 0, AFS 12, P&ESD 35 → SD/ED at Others' targets | **SOUND** on structure; STI AFS internal split (commercial products 2 + insurance policies 10) **UNVERIFIABLE-ONLINE** (template-sourced; STI AFS table not extracted); STI thresholds ladder uses /111 not /109 → same threshold discrepancy class. |

---

## 5. Transport Sector Code (GG 32511, 21 Aug 2009 — legacy 2007-framework; gazette PDFs are scans, corroborated with real certificates)

The Integrated Transport Sector Code was never aligned to the 2013 Amended Codes; it keeps the old-codes seven-element framework (Ownership, Management Control, Employment Equity, Skills, Preferential Procurement, Enterprise Development, SED) and the legacy level ladder. Confirmed by SERR Synergy ("Transport entities can obtain a B-BBEE level by obtaining as few as 30 points"; gazette 32511 still in force; 2016 draft never gazetted): https://serr.co.za/b-bbee-codes-of-good-practice-overview-of-the-transport-sector

### Transport Generic / Road Freight Large (`TRANSPORT_GENERIC`, sectorConfig.ts L1369-1471; `calcTransportLarge*` in `calculators/transport.ts`)

| Item | Code value | Official/observed value | Verdict |
|---|---|---|---|
| Element maxima (bonus-folded): Own 24 (20+4), MC 11 (10+1), EE 18 (15+3), Skills 15, PP 20, ED 15, SED 5 = 108 | as listed | Two real Road Freight Large certificates show base 100 + 8 bonus: Nieuwstad (Izwelisha, 2021): Own 20+4, MC 15+1, EE 10+3, Skills 15, PP 20, ED 15, SED 5; Super Group (TLVT, 2025): Own 20, MC 10, EE 15, Skills 15, PP 20, ED 15, SED 5 | **SOUND on totals** (base 100 + 8 bonus = 108); the **MC/EE split is disputed even among SANAS-accredited agencies** (15/10 vs 10/15). okiru's 10(+1)/15(+3) matches the TLVT reading. **UNVERIFIABLE-ONLINE** at indicator level (gazette is scanned). |
| **Level thresholds** `TRANSPORT_LARGE_LEVELS` = STANDARD_LEVELS × 108/120 → L1 = 90, L2 = 85.5, L3 = 81, L4 = 72 … | scaled amended-codes ladder | The legacy ladder applies: L1 ≥ 100, L2 85-100, L3 75-85, L4 65-75, L5 55-65, L6 45-55, L7 40-45, L8 30-40. Proof: Super Group scored **93.88 → Level 2** on its certificate; under okiru's table 93.88 ≥ 90 would be **Level 1**. Nieuwstad 87.75 → Level 2 (agrees with both by coincidence). | **DISCREPANCY** — real-world Road Freight Large certificates use the legacy table; okiru's scaled table awards Level 1 from 90 points (a 10-point giveaway) and misplaces most middle bands. The code's own comment block at `TRANSPORT_QSE_LEVELS` (sectorConfig.ts L304-322) already articulates exactly why scaling STANDARD_LEVELS is wrong for the QSE — the same reasoning applies to the Large scorecard. |
| MC indicators (board 1.5+1.5@50/25, exec 1+1@50/25, senior-top 1.5+1.5@40/20, other-top 1+1@40/20, NED bonus 1) / EE indicators (2.5+2.5@43/22, 1.5+1.5@63/32, 1.5+1.5@68/34, semi/unskilled BW 2@15 %, disabled 1@2 %, disabled women 1@1 %, EAP bonus 3) / Skills 5×3 (3 %, 1.5 %, 0.45 %, 5 % LAI, 2.5 % women-in-programmes) / PP (12@50 %, 3@10 % QSE, 3@9 % BO, 2@6 % BWO) / ED 15@3 % NPAT / SED 5@1 % | from docs/Transport Codes.xlsx | Gazette scans unreadable; element weights corroborated by certificates; indicator targets not independently confirmable | **UNVERIFIABLE-ONLINE** (internally consistent with the certificates' element weights) |
| Sub-minimums: none (`hasSubMinimum: false` everywhere) | none | the 2009 code predates priority elements/discounting (a 2013 amended-codes construct); certificates print "Discounting Principle applied: NO" | **SOUND** — but see cross-cutting finding #C3: the generic calculators *default* to a 40 % skills/PP sub-min threshold when `subMinimumPercent` is absent from `pillarConfigs` (e.g. `skills.ts` L331 `?? 40`), so `subMinimumMet:false` flags can leak out of Transport scoring paths and into the store's one-level discount at `store.ts` L920-922. Verify no Transport path can set `isDiscounted`. |

### Transport QSE (`TRANSPORT_QSE`, sectorConfig.ts L1510-1600; `transport-qse.ts`; `calculateTransportQse*`)

Expert-verified ground truth per audit guardrails (certificate BE13609: 102 pts = Level 1, best-4-of-7, MC 27 = 25+2 bonus, Own 28). Online corroboration:

| Item | Code value | Official value | Verdict |
|---|---|---|---|
| "Any four of seven elements, 25 each → denominator 100; bonuses earn above" (`electiveGroupSizes`, `basePoints`) | as listed | "QSE Transport Entities can choose any four of the B-BBEE scorecard elements to be measured on during verification and each element will count 25 points" | **SOUND** — https://serr.co.za/b-bbee-codes-of-good-practice-overview-of-the-transport-sector |
| Level ladder `TRANSPORT_QSE_LEVELS`: 100/85/75/65/55/45/40/30, recognition 135…10 | as listed | the legacy (2007 codes) ladder; L8 from 30 points corroborated by SERR; ≥100 → Level 1 corroborated by BE13609 | **SOUND** |
| Ownership 28 = voting 6@25 %+1, EI 9@25 %, fulfilment 1, NV 9, bonus BW 2@10 %, bonus ESOP/BBOS/co-op 1@10 % | as listed | mirrors the 2007-codes QSE ownership scorecard shape (6/9/1/9 + 3 bonus) | **UNVERIFIABLE-ONLINE** at row level (scan); consistent with certificate ground truth |
| MC 27 = top-mgmt black 25@50.1 % + bonus black women 2@25 % | as listed | mirrors the 2007-codes QSE MC scorecard (single top-management indicator @ 50.1 % + BW bonus) | **SOUND** (see Q&A §A2 below) |
| PP 25 = single indicator, B-BBEE spend 40 % of TMPS | as listed | see Q&A §A1 — 40 % is the years-0-5 target of the legacy QSE PP statement; the years-6-10 target was 50 % | **SOUND**, with an open policy question: 17 years into the code, some agencies apply 50 %. Flag for expert confirmation rather than change. |
| Skills 25 = 12.5@2 % + 12.5@1 % black women (`bursaryIsBlackFemale`); ED 25@2 % NPAT; SED 25@1 % NPAT; EE 27 (7.5@40 % mgmt, 7.5@20 % BW mgmt, 5@60 %, 5@30 %, EAP bonus 2) | as listed | element weights consistent with 25-per-element rule; row-level targets unverifiable online | **UNVERIFIABLE-ONLINE** (certificate-consistent) |
| Known internal tension (documented in sectorConfig comments): okiru's own Transport QSE Excel template carries the *amended* 100/95/90/80 ladder in its Summary Scorecard rows 4-12, diverging from the legacy ladder in the middle bands | — | — | correctly flagged in code; the engine's legacy ladder is the defensible one |

---

## 6. Construction Sector Code (GG 41287, 1 Dec 2017 — verified first-hand)

Engine: `apps/api/pipeline/constructionScoring.ts` + `constructionIndicators.ts`; configs `CONSTRUCTION_QSE/CONTRACTOR/BEP`. Indicator-level content is expert-verified (Zoleka signed PDF, 24 Jun 2026) per audit guardrails; audited here at framework level only.

| Item | Code value | Official value (gazette §8) | Verdict |
|---|---|---|---|
| Contractor totals: 31/22/26/38/6 = 123 | incl. bonus | Own 27+4, MC 18+4, Skills 21+5, PP&SD 34+4, SED 5+1 = 105 base + 18 bonus = **123** | **SOUND** (exact, bonus-folded) — GG 41287 p.383 |
| BEP totals: 31/22/34/30/6 = 123 | incl. bonus | Own 27+4, MC 18+4, Skills 29+5, PP&SD 27+3, SED 5+1 = 106 + 17 = **123** | **SOUND** |
| QSE totals: 30/20/26/29/5 = 110 | incl. bonus | Own 27+3, MC 20, Skills 24+2, PP&SD 29, SED 5 = 105 + 5 = **110** | **SOUND** |
| Level thresholds: `CONSTRUCTION_LEVELS_PLACEHOLDER = STANDARD_LEVELS` with a "TODO(verify) placeholder" warning | 100/95/90/80/75/70/55/40 | gazette §8.3.1: **identical** standard ladder (≥100 L1 … ≥40 L8, <40 non-compliant) | **SOUND** — the placeholder warning can be retired; the guess is gazette-exact. GG 41287 p.386 |
| **Priority elements / discounting** | `hasSubMinimum:false` on all pillars; `constructionScoring.ts` has **no sub-minimum or discounting logic at all** | CSC has priority elements: Ownership 40 % of Net Value, Skills 40 % excl. bonus, PP&SD 40 % of each broad category; non-compliance discounts one level (QSEs: ownership + either skills or PP&SD) | **DISCREPANCY (omission)** — https://www.webberwentzel.com/News/Pages/amended-b-bbee-construction-sector-code-effective-from-1-december-2017.aspx ; GG 41287 §5 (Statement CSC000). A contractor failing net value would be certified one level too high. |
| CSC-specific equivalences (51 % Black Owned ≈ old 50 %; 35 % BWO ≈ 30 %; Empowering Supplier = min Level 8) modelled via `blackWomen35Spend`/`blackWomen51Spend` rawStats in `procurement.ts` | partial | gazette §10.4 table | **SOUND** as raw-stat plumbing |
| QSE BEP-subsector override (designated groups target 5 % vs 10 %) | `scoreIndicator` special-case | expert-verified (ZM 2026-06-24) | out of audit scope (guardrail), noted as consistent |

---

## 7. Deemed / Indicative NPAT (`apps/web/src/lib/npatDeemedCalculation.ts`, `industryNormLookup.ts`)

| Item | Code behaviour | Official rule | Verdict |
|---|---|---|---|
| Trigger: margin < 25 % of industry norm (`isBelowIndustryNormQuarterThreshold`) | `npat/revenue < norm/4` | "the net profit margin is less than a quarter of the norm in the industry" — verbatim in ICT gazette AICT500 §2.1.2/AICT604 §7.2.2.2, FSC FS500 §3.1, and the Amended Codes | **SOUND** |
| Leibrandt method: walk current + up to 5 prior years, take the most recent year with margin ≥ norm/4, effective NPAT = that year's margin × current turnover | as listed | "Indicative Profit Margin is the profit margin in the last year where the company's profit margin equals or exceeds one quarter of the industry norm", applied to turnover; agencies request "the last 5-years annual financial statements" | **SOUND** — https://www.rsm.global/southafrica/news/what-happens-your-b-bbee-compliance-targets-if-you-make-financial-loss ; https://mpowered.zendesk.com/hc/en-us/articles/201868546 ; GG 40407 pp.84-85 |
| Fallback when **no** qualifying year in 5: deemed NPAT = turnover × full industry norm % (also applied when *no prior-year rows at all*) | turnover × norm | The Codes/SANAS do not prescribe this case; RSM: "a number of different ways in which the SANAS recommendations are being interpreted"; some agencies use a 5-year average instead. okiru's choice matches how certificate BE13609 was actually verified (guardrail). | **SOUND-as-interpretation** (defensible, industry-common; not gazette-mandated). Consider surfacing the method on the report output — done (`method: 'industry-norm-deemed'`). |
| Override handling: `deemedNpatOverride` ignored (falls back to actual) when no prior-year history captured | product rule | no official rule | acceptable; note it silently ignores an explicit override |
| **Industry norm tables** | Two independent tables disagree: `STANDARD_INDUSTRY_NORMS` (sectorConfig.ts L441-459, e.g. Transport 2.69 %, Construction 5.22 %, ICT 10 %, FSC 15 %) vs `BUILD_INDUSTRY_NORMS` (industryNormLookup.ts, e.g. Transport 5 %, Construction 4 %, IT 10 %, Financial 15 %) | The official reference is Stats SA **P0044 Quarterly Financial Statistics** profit margins, updated quarterly. The first ~9 rows of `STANDARD_INDUSTRY_NORMS` match a Q3-2023 Stats SA vintage; the remainder ("ICT 10.0", "Financial 15.0", "Professional 20.0"…) have round-number placeholder values with no Stats SA citation. | **DISCREPANCY (data quality)** — a single, dated, Stats SA-sourced table should back both lookups; today the same client can get a different deemed NPAT depending on which path resolved the norm. https://beeratings.com/industry-norms-the-npat-calculation-sed-and-how-to-deal-with-the-numbers/ |

---

## 8. Cross-cutting findings

**C1 — Recognition table & procurement formula.** `STANDARD_RECOGNITION_TABLE` (135/125/110/100/80/60/50/10) and the recognition-weighted spend formula in `procurement.ts` (spend × level multiplier per line, all lines) match Statement 400. **SOUND.**

**C2 — Empowering Supplier default.** `procurement.ts` L140: `sup.isEmpoweringSupplier ?? (beeLevel 1-8)` treats every rated supplier as Empowering unless explicitly flagged false. Official position post-2019: EMEs and start-ups are *automatically* Empowering Suppliers; QSEs must meet 1 of the criteria; Generic entities 3 (ICT gazette AICT400 §4.3 states the same). Since the practical evidence is the supplier's own certificate/affidavit stating Empowering status, defaulting unknown to "yes" is lenient but matches how most agencies treat certificates that omit the field. **Acceptable; document the assumption.** Sources: https://www.mondaq.com/southafrica/government-contracts-procurement-ppp/817746/recent-amendments-to-the-b-bbee-codes ; GG 40407 p.59.

**C3 — Sub-minimum defaults leak.** `skills.ts` (`?? SKILLS_DEFAULTS.subMinThreshold` = 40) and `procurement.ts` (`?? 40`) default the sub-min threshold to 40 % whenever `pillarConfigs.*.subMinimumPercent` is undefined — including sectors that have **no** sub-minimum (Transport both, and any pillar whose config omits the field). `subMinimumMet:false` then feeds `store.ts` L920-922's one-level discount. The store's `showSubMin` only hides badges; it does not stop the discount. Ensure legacy Transport paths (and any elective path) can never discount — the 2009 code has no discounting principle.

**C4 — QSE either/or priority rule missing** (see §1 RCOGP QSE): affects RCOGP QSE, ICT QSE and any future QSE sector; store discounts on any failed sub-min instead of `ownership && (skills || ESD)`.

**C5 — YES initiative config/units bugs** (`yes.ts` + every sector config's `yes` block):
- Configs pass `tier1Multiplier: 2.5`; `yes.ts` uses it as the enrolment multiple for the top tier (`thresholds.tier1 = target × 2.5`). Official YES rule (and the code's own comment table at yes.ts L91-94): **2×** target + 5 % absorption → +2 levels. Config makes the top tier 25 % harder than the law.
- Configs pass `blackYouthPercent: 0.55` (a fraction); `yes.ts` L158-159 compares it against `blackYouthPercentage` in **percent** units (0-100) with default 50. Result: the ≥50 %-black-youth gate passes at 0.55 %, i.e. effectively always. Two offsetting bugs, both real.

**C6 — Ownership `votingRightsPercent`/`economicInterestPercent` dead inputs** (`ownership.ts` L132-140 Wave-3 A9 note): shareholder-level voting/EI percentages are collected but scoring uses share-weighted fractions for both. The Codes measure voting rights and economic interest as separately traceable rights. Already flagged internally; endorse resolving with expert spec.

---

## 9. Prioritised discrepancy list (worth fixing)

Ordered by (a) certificate risk — would a verification agency reach a different level; (b) blast radius.

1. **Transport Large level ladder** (`TRANSPORT_LARGE_LEVELS`, sectorConfig.ts L298-302): scaled amended-codes ladder awards Level 1 from 90 pts; real Road Freight Large certificates use the legacy ladder (L1 ≥ 100, L2 85-100 — Super Group 93.88 → L2). Replace with the same legacy table already used for Transport QSE. *One-line fix, wrong level for any Large transport client scoring 90-99.9.*
2. **Skills absorption bonus target 2.5 % instead of 100 %** in `RCOGP_GENERIC` and `ICT_GENERIC` (`absorptionTargetPercent: 2.5`): awards the full 5 bonus points at a 2.5 % absorption rate — a ×40 over-award vs Statement 300 / AICT300 §2.1.3. The QSE configs were already corrected (R8/R22); Generic was missed.
3. **ICT Generic ownership targets 25 % instead of 30 %** (voting rights and economic interest, GG 40407 Statement AICT101). Inflates ownership scores for any ICT client between 25 % and 30 % black-held.
4. **ICT QSE SD/ED targets 1 % instead of 2 % of NPAT** (GG 40407 AICT604 §7.1.1.4-7.1.1.5). Doubles SD/ED scores at a given spend.
5. **Construction: no priority-element sub-minimum / discounting** in `constructionScoring.ts` despite CSC000 §5 defining Ownership-net-value/Skills/PP&SD 40 % sub-minimums with a one-level discount. (Also: retire the "level thresholds unverified" TODO — the standard ladder is gazette-exact.)
6. **QSE discounting rule** (`store.ts` L920): implement "Ownership + either Skills or ESD" for QSE scorecards instead of requiring all five sub-minimums (FSC §3.3.2(b), AgriBEE §5.2.2, generic codes).
7. **FSC Banks/LTI/STI ownership scorecard**: gazette Table 2a is 23 pts (EI 3, NE 3, **Net Value 6**, sub-min 2.4) + 5 bonus; okiru applies the 25-pt "Others" structure with NV 8 / sub-min 3.2 to every FSC sub-sector.
8. **FSC Banks/LTI PP**: gazette rows are 4/2/2/5/2 = 15 base; okiru uses the Others' 5/3/2/7/3 = 20 base (+4 bonus = 24). Over-weights PP for banks/insurers by 5+ points. (Known template delta; still wrong vs gazette.)
9. **FSC MC structure**: board black = 1 pt (not 2); senior/middle/junior bands with three African-EAP indicators exist for entities that have those bands; the 10@75 %/4@38 % collapsed form is only for entities *without* S/M/J management (FS200 §3.4.1). Current shape can mis-score any bank with a full management hierarchy, and totals 21 vs the gazetted 20.
10. **FSC level ladders**: use the gazette formula `W/109 × sector total` (Banks L1 110.09, STI 105.50, Others 96.33) instead of the template-derived /111 ladders (109.01 / 103.60 / 92.79). Current ladders are systematically ~1-3.5 points lenient. (TEMPLATE-TENSION: raise with the FSC template owner before changing.)
11. **AgriBEE MC 23 vs gazetted 19** (board 2+1 not 3+2; other exec 2+1 not 3+2): +4 phantom points and a 132 vs 128 total. (TEMPLATE-TENSION: okiru's Agri Excel says 23 — but the gazette is unambiguous.)
12. **Ownership engine**: (a) remove the ≥25 %-voting "full award of EI/BW/DG/net-value" shortcut; (b) move the time-graduation factor from the EI line to the Net Value formula per Annexe 100(E); (c) drop the store's `ownTarget*0.4` OR-branch on the ownership sub-minimum.
13. **Industry-norm tables**: unify `STANDARD_INDUSTRY_NORMS` and `BUILD_INDUSTRY_NORMS` into one Stats SA P0044-sourced, dated table (Transport 2.69 vs 5; Construction 5.22 vs 4 currently disagree, changing deemed-NPAT outcomes by path).
14. **YES config feed**: `tier1Multiplier` 2.5 → 2.0, and pass `blackYouthPercent` in percent units (55) or convert before comparing.
15. **Sub-minimum default leak** (cross-cutting C3): make "no `subMinimumPercent` configured" mean "no sub-minimum" in `skills.ts`/`procurement.ts`, or explicitly set 0 for Transport in the bundled configs, so legacy-code sectors can never be discounted.
16. **Gaps** (not mis-scoring, but coverage): FSC QSFI scorecard (100-pt) not shipped; QSE/EME automatic Level 1/2 via 51 %/100 % black ownership + affidavit not modelled anywhere in the level pipeline.

---

## 10. Transport QSE special questions (with citations)

### A1. What does the Transport code's QSE PP scorecard measure, and what are the TMPS exclusions?

The Integrated Transport Sector Code (GG 32511) retains the **old-codes (2007) QSE Preferential Procurement statement**: a **single indicator** — "B-BBEE procurement spend from all suppliers, based on the B-BBEE procurement recognition levels, as a percentage of Total Measured Procurement Spend" — worth **25 points**, with a compliance target of **40 % of TMPS in years 0-5** of the code (rising to **50 % in years 6-10** under the old-codes statement). B-BBEE procurement spend = Σ(supplier spend × supplier recognition %, per the 135/125/110/100/80/60/50/10 table). okiru implements exactly this (`TRANSPORT_QSE.targets.procurement`: `allSuppliersTarget 0.40, allSuppliersMaxPts 25`; recognition-weighted in `procurement.ts`). The 40 %-vs-50 % phasing (the code is 17 years old) is a live interpretive question to put to the verifier — certificate BE13609 was issued on the 40 % basis (guardrail), so no change is recommended without expert sign-off.
Sources: https://serr.co.za/b-bbee-codes-of-good-practice-overview-of-the-transport-sector (QSE = any four elements, 25 points each); https://blog.seesa.co.za/index.php/2022/04/22/b-bbee-transport-sector-ensuring-compliance-under-the-road-freight-sub-sector/ (PP sub-element of RF QSE = 25 points, 40 % sub-minimum context); okiru cert BE13609 (guardrail).

**TMPS exclusions** (old Statement 500, carried materially unchanged into amended Statement 400 §5-6): the measured entity's total procurement of goods and services **excluding**:
- **taxation and levies** imposed by an organ of state (incl. municipal rates) — https://www.bee.co.za/post/calculating-tmps-2
- **salaries, wages, remunerations and emoluments** (incl. director emoluments)
- **procurement from organs of state or public entities enjoying a statutory or regulated monopoly** — electricity (Eskom), municipal water/sewer, etc. — https://www.bee.co.za/post/calculating-tmps-2
- **pass-through third-party procurement** (expensed in the client's AFS, not the measured entity's)
- **empowerment-related expenditure** (investments/loans/donations already claimable under ED/SD/SED)
- **imports**, subject to the exclusion criteria: imported capital goods/components with **no existing local production** where importing promotes further SA value-added production; and unique branded imports — https://www.bee.co.za/post/what-are-the-rules-around-import-exclusions-under-tmps-3
- **intra-group procurement** from subsidiaries/holding companies under the prescribed conditions.
Reference text: Amended Statement 400 in GG 42496 — https://www.gov.za/sites/default/files/gcis_document/201905/42496gen304.pdf ; practitioner list: https://app.bee123.co.za/AppHelp/help2013/GENERIC%20CONSTRUCTION%20CONTRACTOR/Content/Preferential%20Procurement%20and%20Supplier%20Development%20Element/Total%20Measured%20Procurement%20Spend.htm
(okiru's recent parser rule "never count a likely TMPS exclusion" — commit a5bda7ba — is aligned with this list.)

### A2. What earns the 2 MC bonus points on Transport QSE Management Control?

**Black women representation in top management against a 25 % target.** The legacy QSE MC scorecard measures one indicator — black representation in top management, target 50.1 %, 25 points — plus a **2-point bonus for black women in top management at 25 %**. okiru implements this in `calculateTransportQseManagement` (`transport.ts` L44-69): `25 × min(blackPct/0.501, 1) + 2 × min(blackWomenPct/0.25, 1)`, capped at 27. This is the structure that reproduces MC 27.00 on certificate BE13609 (25 base earned + 2 bonus). The gazette scan could not be machine-read to quote the row verbatim → **UNVERIFIABLE-ONLINE at row level, certificate-verified** (guardrail). Corroboration that the QSE elements carry bonus points above the 25-weighting: Nieuwstad and Super Group certificates print per-element "Bonus Points" columns on the same sub-sector code.

### A3. How should Empowering Supplier status and EME/QSE sworn affidavits be recognised in procurement spend?

- **Under the Transport code itself** the "Empowering Supplier" construct does not exist — it was introduced by the 2013 Amended Generic Codes. Legacy Transport PP counts recognition-weighted spend from **all** suppliers. okiru's Transport QSE PP path funnels through `procurement.ts`, whose all-suppliers line defaults every rated (L1-8) supplier to "empowering" unless explicitly flagged otherwise — functionally equivalent to the legacy rule for this sector. Correct.
- **Affidavits:** since the 2019 amendments, a **sworn affidavit (or CIPC certificate)** is the prescribed evidence for EMEs (any) and for 51 %+/100 % black-owned QSEs: it establishes (a) the supplier's deemed status level — EME ≥51 % black = Level 2, 100 % = Level 1, other EMEs Level 4; QSE 51 % = Level 2, 100 % = Level 1 — and (b) for EMEs and start-ups, **automatic Empowering Supplier status** (QSEs must meet one of the criteria; large suppliers three). The affidavit must be valid for the period in which the invoice falls. Sources: https://www.mondaq.com/southafrica/government-contracts-procurement-ppp/817746/recent-amendments-to-the-b-bbee-codes ; https://www.lexology.com/library/detail.aspx?g=54bd7eab-73e3-402f-bd08-32aca90ecbe4 ; https://cfo360.co.za/getstarted/eme-and-qse/
- **In the spend calculation** the affidavit therefore feeds two fields okiru already models per supplier: `beeLevel` (→ recognition multiplier) and `isEmpoweringSupplier`. What okiru does not capture is affidavit **validity vs the measurement period** — agencies recalculate spend downward when a certificate/affidavit expired mid-year (https://www.labournet.com/five-post-year-end-priorities-for-b-bbee-verification/). Worth a `validFrom/validTo` on the supplier evidence model.

### A4. What evidence hierarchy do verification agencies use for procurement spend?

SANAS-accredited agencies work **from the books outward**, not from the client's claimed schedule inward:
1. **TMPS foundation:** trial balance / AFS expense lines and the **creditors (accounts payable) ledger** for the measurement period establish total procurement; client-prepared supplier schedules must reconcile to these before anything is scored.
2. **Supplier ledger:** a detailed supplier-by-supplier ledger (typically Excel) for the financial year is the primary working document — https://www.labournet.com/five-post-year-end-priorities-for-b-bbee-verification/
3. **Sampling:** the agency samples suppliers (largest/spend-weighted) and for each requires: the supplier's **valid B-BBEE certificate or sworn affidavit** covering the invoice dates, plus the supplier's **largest invoice** for the year showing registration/VAT numbers that tie the certificate to the ledger entity — https://www.labournet.com/five-post-year-end-priorities-for-b-bbee-verification/ ; https://elevateadvisory.co.za/blog-posts/understanding-the-preferential-procurement-element-in-a-b-bbee-verification-process/
4. **Payment proof:** invoices must trace to actual payments; unsupported schedule lines are excluded — https://invoicedataextraction.com/blog/south-africa-bbbee-procurement-invoice-requirements
5. **Downgrade rule:** where the supplier's certificate expired mid-period or can't be matched, the claimed spend is re-rated (often to Level 8's 10 % or excluded) rather than taken at the schedule's claimed level.

**Implication for okiru's parser/scoring (matches recent commits 4dc59e03/a5bda7ba/dfe9e9c4):** supplier ledgers / AP records are *corroborating* evidence that outranks client-prepared schedules; a ledger entry should confirm (not double-count) a schedule row, and likely-TMPS-exclusion lines (utilities, SARS, payroll, municipal accounts) should never be counted. That is exactly the evidence hierarchy agencies apply.

---

## Appendix — audit trail of code reading

- `apps/api/pipeline/sectorConfig.ts` (all 14 configs, level tables, recognition table, benefit factors, industry norms, `sumPillarMaxPoints`) — read in full.
- Calculators read in full: `ownership.ts`, `management.ts`, `skills.ts`, `procurement.ts`, `esd-sed.ts`, `transport.ts`, `afs.ts`, `empowermentFinancing.ts`, `yes.ts` (+ `eapTargets.ts` header, `shared.ts` via usage).
- Sector wrappers read: `rcogp-generic.ts`, `rcogp-qse.ts`, `transport-qse.ts`, `construction.ts`, `fsc-banks.ts` (representative excerpt), flag-grep across all sector files (`bursaryIsHeadcount`, `absorptionTargetPercent`, `edStockbroker*`).
- `store.ts` level/discount path (L500-930), `constructionScoring.ts`, `npatDeemedCalculation.ts`, `industryNormLookup.ts` — read in full.
- Benefit factors spot-check vs Codes: grants/direct cost 100 %, overheads 70 % ESD / 80 % SED, interest-free loan 70 %, standard loan 50 %, guarantees 3 %, professional services 60 % ESD / 80 % SED, shorter payment terms 15 % SD-only — consistent with Statement 400/500 annexes (SOUND; not exhaustively verified row-by-row online).
- No code was modified; no tests were run.
