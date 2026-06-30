# autoresearch — risk register

One row per risk. Severity: HIGH / MEDIUM / LOW. HIGH items should spawn a fix
experiment (see BACKLOG M5).

| # | Severity | Area | Risk | Evidence (file:line / source) | Proposed fix | Status |
|---|---|---|---|---|---|---|
| R1 | HIGH | Correctness | MC engine under-scored Lake Trading (6.79 vs 11.77) | EXP-3; `management.ts` board voting | Board voting now includes exec directors | DONE (deployed 762dfe47) |
| R2 | MEDIUM | Correctness | Ownership dropped 2 pts on bulk-upload (23 vs 25) | EXP-1; `projectWorkbookToClient` | New entrants credited from BNE% | DONE (deployed) |
| R3 | MEDIUM | Correctness | Construction sub-sector overloaded onto scorecardType | EXP-5; `sections.ts` | UI re-model shipped; engine integration held for review | PARTIAL (UI done) |
| R4 | MEDIUM | Maintainability | Duplicated feedback handlers — edits to the wrong one are silent | memory `devmode-feedback-infra` | Unify / mark the dead one (M4) | OPEN |
| R5 | LOW | Data integrity | Bulk-upload empty-section overwrite can blank pillars | `/api/workbook/:id/import` | Client-side mitigated; add server guard (M4) | OPEN |

## M3 misalignment hunt (EXP-6, 2026-06-24) — 14 confirmed (sector TS vs verbatim Excel)

### Clear, undocumented bugs — the loop will fix each with a golden test (no scoring judgment needed)
| # | Severity | Sector / pillar | Misalignment | Fix | Status |
|---|---|---|---|---|---|
| R6 | **HIGH** | ICT Generic / MC | senior/middle/junior band targets MISSING from config → targets resolve to NaN → **8 of 23 MC pts always score 0** for every ICT Generic entity (under-scores). `sectorConfig.ts:554-567` omits them | Added seniorBlackTarget 0.60 / BW 0.30, middle 0.75 / 0.38, junior 0.88 / 0.44 (mirror AGRI/RCOGP) + converter copy in `ict-generic.ts` + golden test (full 8 SMJ pts) | **DONE** (EXP-7, branch; deploy-eligible) |
| R7 | **HIGH** | FSC (all variants) / skills | absorption target divided by 100 **twice** → effective 0.01% vs Excel 100%; any single absorbed learner maxes the 3-pt bonus. `fsc-{generic,banks,lti,sti}.ts` + `skills.ts:392` | Config 1.0→100 (all 4 FSC) + removed mapper /100 (single-divide → target 1.0); API path auto-fixed (single-divides); corrected golden + new pro-rata test | **DONE** (EXP-8, branch; deploy-eligible) |
| R18 | MEDIUM | FSC (all variants) / skills | absorption DENOMINATOR is `totalBlackLearners`, but Excel J40 uses unemployed-LAI completers — so absorption can never reach the full 3 for a realistic mixed workforce (same class as ICT R11). Found while fixing R7. | set `absorptionBasisUnemployedLAI` for FSC (mirror ICT) — needs a golden + expert confirm | OPEN |
| R8 | **HIGH** | RCOGP QSE / skills | absorption target was 1% vs Excel 100%. Verified against `Skills Calcs!J28 = MIN(absorbed/completers × 5, 5)` (NO % divisor → full 5 pts need 100% absorption). The ledger D-04 "1% target" **misread** the display cell `E23='Skills Calcs'!C30`=1 as a divisor; the score formula proves 100%. R7 (FSC) already used 100; only RCOGP/ICT QSE were left at 1.0. `sectorConfig.ts:1168` | Set `absorptionTargetPercent` 1.0→100 (Toolkit + API share the config; both single-/100). Corrected 2 golden tests + added pro-rata (50%→2.5) + tail (1/200→~0) regressions; fixed `rcogp-qse.ts` + ledger D-04 note. | **DONE** (EXP-11, branch; deploy-eligible) |
| R22 | **HIGH** | ICT QSE / skills | identical to R8 — `ICT_QSE` absorption target was `1.0` (=1%); verified `ICT_QSE.json` score = `MIN(I28/I30×E28,E28)` = `MIN(absorbed/completers×5,5)` (no % divisor → 100% target), same as RCOGP QSE. | Set `sectorConfig.ts:1264` 1.0→100; updated `ict-qse.ts` comment; corrected the 2 ict-qse golden assertions + added pro-rata (50%→2.5) and tail (1/200→~0) regressions. ict-qse golden 52/52; Toolkit suite 477/477; API integrity 31/31. | **DONE** (EXP-13, branch; deploy-eligible) |
| R9 | ~~MEDIUM~~ | ICT Generic / skills | **REJECTED (the 2.5→100 claim is wrong).** Verified `ICT_Generic.json`: absorption (2.1.3) scores `MIN(absorbed/target × 5, 5)` where the **target is a ROUNDUP *headcount***, not a rate — `Skills Toolkit!C70=ROUNDUP(C69×2.5%,0)`, `C76=ROUNDUP(C75×5%,0)`, labels `B70/B76/B82 "Absorption target (2.5%)/(5%)"` (conditional YES-tier). The `D54=Skills Calcs!C76=1` the M3 hunt read as "fraction 1.0=100%" is just the sample's rounded-up headcount (1 person). Setting 100 would demand 100% absorption → wrong (over-harsh). | Do NOT set 2.5→100. The real gap is structural: code uses `absorbed/totalBlackLearners` vs Excel `absorbed/ROUNDUP(2.5–5%×base headcount)` — a denominator/target-model fix (with the 2.5/5% YES-tier), entangled with R11. Reclassify to needs-modeling / fold into R11. | **REJECTED** (EXP-14; no code change) |
| R10 | ~~MEDIUM~~ | RCOGP Generic / skills | **REJECTED (same as R9).** Verified `RCOGP_Generic.json`: absorption (2.1.3, row 47) uses a ROUNDUP **headcount** target identical to ICT Generic — `C69=ROUNDUP(C68×2.5%,0)`, `C75=ROUNDUP(C74×5%,0)`, `C81=ROUNDUP(C80×5%,0)`, labels `B69/B75/B81 "Absorption target (2.5%)/(5%)"`. The `D47=0.05` cited as a "5% rate" is a headcount multiplier inside ROUNDUP, not a score divisor. Setting 2.5→5 would be wrong. **Touches Lake Trading** — another reason not to flip it blindly. | Do NOT set 2.5→5. Same structural model issue as R9 → see R24. | **REJECTED** (EXP-15; no code change) |
| R24 | MEDIUM (structural / needs-modeling) | RCOGP Generic **and** ICT Generic / skills absorption | consolidates R9+R10 (and overlaps R11). Both Generic toolkits score absorption (2.1.3) as `MIN(absorbed/target × 5, 5)` where **target = a ROUNDUP headcount** = `ROUNDUP(base × {2.5% or 5%}, 0)`, the 2.5/5% chosen by a **YES-initiative tier conditional**, then distributed across EAP demographic bands. The live code (`skills.ts`) models a flat **rate** target (`absorptionTargetPercent`, 2.5%) against `absorbedCount/totalBlackLearners` — wrong denominator AND wrong target shape. | Re-model Generic absorption: headcount target `ROUNDUP(base×tier%)`, the YES-tier 2.5/5% conditional, EAP split. Non-atomic; **affects Lake Trading fitness** (must re-run the SCORE gate); the YES-tier rule likely needs expert confirm → route alongside R11. Do NOT auto-fix in the clear-bug loop. | OPEN (structural) |
| R11 | MEDIUM | ICT Generic / skills | unemployed-LAI headcount (2.1.2.2) counts ALL unemployed Black learners, not only LAI participants. `skills.ts:156` | gate increment on `isLAIProgram(prog)` (ledger-flagged) | OPEN |
| R12 | MEDIUM | AGRI Generic / procurement | **CONFIRMED REAL.** BWO30 line used 12% (the SPEND target) as the per-supplier ownership qualification instead of 30%. Verified `AGRI_Generic.json` B55 = "Spend on empowering suppliers with **greater than 30%** black female ownership"; `procurement.ts:146` filters `blackWomenOwnership >= blackWomenThreshold` (default 0.30); the converter overrode it with `bwo30Target` (0.12), so 12–29%-BWO suppliers wrongly counted. | Set `agri-generic.ts:190` `blackWomenThreshold: 0.30` (qualification), keeping `bwo30Target=0.12` as the spend target. +2 AGRI golden tests (20%→0, 35%→4). AGRI golden 44/44; Toolkit 479/479; fitness 63.53 (RCOGP untouched). Note: the adjacent `blackOwnedThreshold` override is **inert** (procurement.ts hardcodes `>=0.51`). | **DONE** (EXP-16, branch; deploy-eligible) |
| R25 | MEDIUM | FSC (all 4 variants) / procurement | same conflation pattern as R12: `fsc-{generic,banks,lti,sti}.ts` set `blackWomenThreshold: pr.bwo30Target` (FSC = 0.10) — needs verifying whether the FSC BWO line qualifies at >30% ownership (then 0.10 is a bug, should be 0.30) or genuinely at a lower FSC-specific threshold. The FSC inline comment "0.10 (10%…)" suggests someone treated 0.10 as the qualification — confirm against `FSC_Generic.json` B-line label. | Verify the FSC BWO qualification % vs spend target; fix `blackWomenThreshold` per-sector if it's really >30%. (RCOGP/ICT use the 0.30 default — correct.) | OPEN |
| R13 | LOW | FSC Generic / skills | sub-min inline comment wrong ("9.2 / 40%×23"); the code computes `40% × (maxPoints 23 − 3-pt absorption bonus) = 8.0` (verified FSC skills maxPoints=23, absorptionMaxPts=3). Comment-only — no scoring effect. | Corrected the `fsc-generic.ts:196` comment to "8.0 = 40% × 20 base (excl. 3-pt absorption bonus)". FSC golden 38/38. | **DONE** (EXP-17, branch; comment-only) |
| R19 | **HIGH** | Bulk upload / all sectors | real export workbooks put Company **Name + Sector + Scorecard Type on the Financials sheet header**, not the "Information Request" checklist sheet the importer reads → **every standalone upload was criticalBlocked**. Found by the Toolkit Testing Data harness (16 files). | Added `deriveCompanyMetaFromSheets` + `mapSectorString` to `normalizeExcelBuffer` (scans any sheet header for Measured Entity / Sector-Codes; maps the sector string → sector + scorecardType + FSC/construction sub-sector). **12/16 now import cleanly.** | **DONE** (EXP-10, branch; deploy-eligible) |
| R20 | **HIGH** | Bulk upload / FSC Banks·LTI·STI | the 4 FSC sub-variant workbooks still block: `Prior Year Revenue (FSC only): Required` + a Yes/No field — these sub-sectors need prior-year revenue + AFS data the importer doesn't extract from the multi-column Financials layout. | Extract `priorYearRevenue` (Prior column) + AFS additions for FSC Banks/LTI/STI; set `fscReinsurer` default | OPEN |
| R21 | **HIGH** | Bulk upload / financials (all) | TWO bugs, worse than first thought. (A) **Sheet mis-mapping**: a sheet named "Financials" was swallowed by the **afs-additions** hint — `norm("access to financial services")` contains the substring `"financials"`, and the longest-substring rule (25 > 9) beat `financial-information`'s `"financial"` hint → "Financials" mapped to afs-additions (`meta: []`) → **revenue/NPAT/payroll silently DROPPED for every upload** (scoring fell back to deemed NPAT). (B) Even mapped right, `parseMetaFromSheet` read column B = **Prior** year, not Measured. | (A) Added exact `"financials"` hint so the pass-1 exact match wins. (B) Added `findMeasuredColumn` — header-aware pick of the Measured (current-year) column, falling back to col B for single-value sheets. Verified across all 16 real workbooks: Financials→financial-information and parsed revenue == Measured (≠ Prior). +2 unit tests. | **DONE** (EXP-12, branch; deploy-eligible) |
| R23 | MEDIUM | Bulk upload / sheet mapping | root-cause fragility behind R21(A): `matchSheetName` pass-2 does `hint.includes(sheetName)` (a longer hint swallowing a short sheet name) — any future short sheet name that is a substring of a long hint will mis-map. Mitigated for "Financials" via an exact hint, but the algorithm is still fragile. | Constrain the `a.includes(n)` branch to whole-word / prefix matches, or drop that direction | OPEN |

### Needs B-BBEE expert sign-off (route to Zoleka/expert — do NOT auto-fix; modeling judgment or big blast radius)
| # | Severity | Sector / pillar | Question for the expert |
|---|---|---|---|
| R14 | **HIGH** | RCOGP QSE + ICT QSE (shared `ownership.ts`) | The ≥25%/≥30% "full ownership" voting shortcut auto-awards full economic-interest, designated-group and 8-pt net value (no realisation data) and auto-passes the 3.2 net-value sub-min. Excel scores each row from its own actuals. Ledger says remove it — confirm before touching shared ownership.ts (large blast radius). |
| R15 | MEDIUM | RCOGP Generic + QSE / ESD | Guarantee SD/ED benefit factor: TS uses 3% (amended Codes); the RCOGP toolkit reference cell says 50%. Which authority governs? |
| R16 | MEDIUM | RCOGP Generic / MC | Board band is built from designation; Excel uses the Yes/No `Board?` flag (a board member with a non-director designation is excluded). Needs an `isBoardMember` field added to the model. |
| R17 | MEDIUM | AGRI Generic / skills | Cat F&G + admin recognition cap: TS uses 25% F&G + separate 15% admin; AGRI toolkit folds F&G+admin into a single 15% subtotal. May be an intentional 2019-amendment choice. |

## audit-sweep 2026-06-29 — multi-agent audit + P1/P2 store sweep

First run of the `/audit-sweep` skill (`.claude/skills/audit-sweep/SKILL.md`). Multi-agent
audit: 72 findings → 64 confirmed (2 critical, 14 high, 27 med, 21 low), 6 false positives
rejected. Ratings: DevOps 3.5/10, Code 4.5/10, Logging 5.5/10, Frontend 5/10. These are
product/UX/security/persistence risks (distinct from the R1–R25 scoring-fidelity register
above). NONE change a scoring target — Lake Trading stays 63.56.

| # | Severity | Pattern | Risk | Evidence (file:line) | Status |
|---|---|---|---|---|---|
| A1 | **CRITICAL** | P1 phantom-save | `updateEmployee` mutates local state + "Updated" toast but never calls the API (no `api.updateEmployee`) → every employee edit lost on reload | `store.ts:1587`; `api.ts:87-92` | OPEN (Wave 1) |
| A2 | **CRITICAL** | P9 fail-open RBAC | live `GET /api/clients/:clientId/data` + write routes check org/creator only, not `pillarScopes`; client hooks fail OPEN → a pillar-scoped user reads+edits all pillars | `apps/web/server/routes.ts:1750`; `usePillarPermission.ts:176` | OPEN (Wave 2) |
| A3 | HIGH | P1 phantom-save | `updateFinancialYear` local-only (no `api.updateFinancialYear`) | `store.ts:1533` | OPEN (Wave 1) |
| A4 | HIGH | P1 phantom-save | `updateAfs` local-only — FSC Access-to-Financial-Services edits lost | `store.ts:1722` | OPEN (Wave 1) |
| A5 | HIGH | P1 phantom-save | `updateEsdBonuses` local-only — ESD graduation/jobs bonuses + evidence lost | `store.ts:1739` | OPEN (Wave 1) |
| A6 | HIGH | P2 partial-payload | `addEmployee`/`addEmployeesBulk` drop `idNumber,isForeign,province,hireDate,terminationDate` from API payload → foreign-exclusion & active-period break after reload | `store.ts:1580,1608` | OPEN (Wave 1) |
| A7 | HIGH | P2 / bulk | `addEmployeesBulk` loops `api.addEmployee` N× instead of `api.bulkAddEmployees`; UI mapping never collects salary/voting | `store.ts:1601`; `ManagementControl.tsx:414` | OPEN (Wave 1) |
| A8 | HIGH | P10 clobber | `loadClientData` re-hydration overwrites local state; mutations are fire-and-forget `.catch(console.error)` with no user-visible failure | `store.ts:1228,1559` | OPEN (Wave 1) |
| A9 | HIGH | P7 dead input | employee `annualSalary` + shareholder `votingRightsPercent`/`economicInterestPercent` collected but no calculator reads them | `ownership.ts:123`; `management.ts` | OPEN (Wave 3) |
| A10 | HIGH | P11 sector gap | FSC Consumer Ed/Fundisa scored but no SED input; `SED.tsx:35` hardcodes RCOGP 1%/5pt for all sectors; construction beneficiary/employee/learner indicators scored with no input surface | `SED.tsx:35`; `construction-map.ts:87` | OPEN (Wave 3) |
| A11 | HIGH | P3 UI-leak | `// Issue 1` dev comment renders as visible text in Add/Edit Employee modals | `ManagementControl.tsx:509` | OPEN (Wave 1) |
| A12 | MEDIUM | P6 validation | manual forms: toast-only validation, no inline field error, whitespace-only names pass (≠ bulk/import) | `ManagementControl.tsx:243`; Ownership/Skills/ESD/SED | OPEN (Wave 1) |
| A13 | MEDIUM | P8 taxonomy | bulk `DESIGNATION_MAP` can't emit "Executive Director"/"Other Executive Management" the manual form offers → same person scored differently by entry path | `ManagementControl.tsx:71` | OPEN (Wave 3) |
| A14 | MEDIUM | P12 health-lie | `/health` returns 200 unconditionally (never checks Mongo) → probes green during outage; prod logs 500s only when `!isProd` | `apps/api/src/routes/health.ts`; `apps/api/index.ts:148` | OPEN |
| A15 | LOW | P4/P5 | `{level} Management` doubles "Management"; edit button uses Filter/funnel icon | `ManagementControl.tsx:1008,1047` | OPEN (Wave 1) |

DevOps note (not a code risk but root-caused the outage): CI/CD was deleted in commit `01ad6412`
(2026-05-27) — no `.github/`; secrets/deploys hand-driven; External Secrets + GitOps are
templates only; no alerting/metrics/cluster-IaC. See [[toolkit-quality-audit]] memory.

## audit-sweep 2026-06-29 (deep, run 2) — 33 NEW verified locations (P1–P8); P9–P12 verify cut off by session limit

Whole-repo deep sweep. Went a layer deeper than the run-1 store check (also verified backend
routes + the duplicated build forms + import path): 59 raw → 33 confirmed NEW locations, 6
rejected. NONE change a scoring target. P9–P12 verifiers hit the session limit — re-run
`/audit-sweep deep` after reset to verify new fail-open/health locations (the *classes* are
already logged as A2/A8/A10/A14).

| # | Severity | Pattern | Risk | Evidence (file:line) |
|---|---|---|---|---|
| B1 | **HIGH** | P1 | `updateSupplier` calls `api.updateSupplier` but backend has **no PATCH /api/suppliers/:id** → silent 404; supplier edits don't persist | `store.ts:1665`; `apps/api/src/routes/suppliers.ts` |
| B2 | **HIGH** | P1 | `updateTrainingProgram` calls the API but backend training-programs router has **no PATCH** → silent 404; Skills/YES edits don't persist | `store.ts:1631` |
| B3 | **HIGH** | P1 | AFS pillar driven entirely by phantom `updateAfs`; backend has no AFS read/write path (12 FSC pts lost on reload) | `AccessToFinancialServices.tsx:96` |
| B4 | MEDIUM | P1 | YES candidate edit shows "Changes saved" but makes no store/api call | `YES.tsx:251` |
| B5 | **HIGH** | P2 | `addShareholder` drops 7 fields (economic interest, designated-group, new-entrant, years-held, graduation) | `store.ts:1546` |
| B6 | **HIGH** | P2 | `addTrainingProgram` sends only legacy fields, drops the entire modern TrainingProgram schema | `store.ts:1623` |
| B7 | **HIGH** | P2 | `addSupplier` drops certificateExpiryDate, isForeignSupplier + ~12 fields | `store.ts:1656` |
| B8 | MEDIUM | P2 | `bulkAddEmployees` helper targets a non-existent `/employees/bulk` endpoint (dead); store loops single POSTs | `api.ts:90` |
| B9 | **HIGH** | P8 | Excel normalizer never applies `DESIGNATION_MAP` → uploaded designation synonyms flagged invalid | `workbookExcelNormalizer.ts:245` |
| B10 | **HIGH** | P8 | `VALID_SECTOR_CODES` omits CONSTRUCTION → normalizer silently downgrades CONSTRUCTION uploads to RCOGP (wrong scorecard) | `bbeeSectorCodes.ts:1` |
| B11 | MEDIUM | P7 | SED/ESD "Black Beneficiary %" (`blackBenefitPercent`) collected + imported but never scored | `esd-sed.ts:116` |
| B12 | MEDIUM | P7 | Skills `isAbet`/`isMandatory` collected (live + build form) but read by no calculator | `SkillsDevelopment.tsx:477`; `SkillsForm.tsx:391` |
| B13 | MEDIUM | P7 | Build OwnershipForm voting%/economic-interest% collected, calculator ignores (same class as live A9) | `OwnershipForm.tsx:553` |
| B14 | LOW | P7 | `isSupplierDevRecipient` + shareholder `designatedGroupType` collected but never scored | `ProcurementForm.tsx:290`; `OwnershipForm.tsx:596` |
| B15 | **HIGH** | P9 | `loadClientWithAccess` gates client read/write on org/creator only, no pillarScopes (new line of A2) | `apps/web/server/routes.ts:1536` |
| B15-srv | **HIGH** | P9 | **SERVER-SIDE WRITE ENFORCEMENT (apps/api).** Per-entity write routes (POST /employees, PATCH /employees/:id, /suppliers, /training-programs, /shareholders, /esd-contributions, /sed-contributions, /scenarios, /financial-years) under apps/api/src/routes/* still check verifyClientAccess (org/creator) only — they don't consult pillarScopes. With Mongo-backed ProcessorSession bridging Client→workspaceId, the pattern from `resolveClientPillarAccess` in apps/web/server/routes.ts (added in this commit) can be ported to a shared apps/api middleware that gates by entity-type → pillar-key. | `apps/api/src/middleware/auth.ts:14`; `apps/api/src/routes/{employees,suppliers,shareholders,contributions,scenarios,financialYears}.ts` | OPEN |
| B16 | MEDIUM | P6 | Toast-only validation is **repo-wide** (14 confirmed sites: Ownership, Skills, Procurement, ESD, SED, Scenarios, ClientSelector, MC bulk-mapping) — no aria-invalid / inline error anywhere | `Ownership.tsx:128` +13 |
| B17 | LOW | P8 | DocumentProcessor enterpriseType offers 'large' (not in eme/qse/generic); cert extractor `VALID_SIZES` diverges from size enum | `DocumentProcessor.tsx:5152`; `llmExtractor.ts:240` |

Rejected (6, verifier killed as overstated/dup): addEsd/addSed contribution "drops fields" (core fields ARE sent); MC edit-save validation (dup of known add); 3 P9 framings where the verifier judged the severity overstated (org-only check is real but it pushed back on impact — worth expert review).

## Wave 3 — 2026-06-30 decisions

| # | Action | Reason |
|---|---|---|
| A9 ownership voting/economic interest | **DEFERRED — expert sign-off needed.** Attempted to wire `votingRightsPercent`/`economicInterestPercent` into the calculator (use as weight when non-zero). Lake fitness stayed at 63.53 BUT 2 ICT-QSE golden tests failed because their test data sets `votingRightsPercent: 0.30` on a 100%-shares holder, expecting the old "ignored" behavior. The semantics differ — voting trust vs beneficial ownership — and we don't have a cited B-BBEE spec source for which interpretation is canonical. Reverted; the inputs stay collected-but-not-scored until the rule is clarified. See `ownership.ts:123` for the in-code NOTE. |
| A10 construction beneficiary inputs | **SHIPPED.** Engine already scored these (`construction-map.ts:87/91/93/213`); just needed UI. Added construction-sector-gated checkboxes for `isBlackWomenOwnedBeneficiary` + `supplierDevProgramme` (ESD form) and `isStructuredProject` + `isLimitedServicesCommunity` (SED form). Score-neutral for non-construction sectors. |
| B11 `blackBenefitPercent` | **DEFERRED.** Calculator uses per-type `benefitFactors` map; adding a row-level % multiplier is a scoring rule change. |
| B12 Skills `isAbet`/`isMandatory` | **DEFERRED.** Not in `skills.ts` at all. Adding requires an expert rule (ABET typically counts as Cat F-G; mandatory training is excluded from B-BBEE in some sectors). |
| B14 `isSupplierDevRecipient`/`designatedGroupType` | **DEFERRED.** Only in tests, not calculators. Adding either would shift scoring without a cited spec source. |
