# DevMode Feedback — Root-Cause Map (Zoleka & Chengetai)

> Companion to [`docs/feedback-report.md`](./feedback-report.md). That report tracks the
> 12 substantive items and the UI fixes shipped on the `lethabo/quality-assurance`
> branch (now **merged into `main`** — verified: `SUPPLIER_SIZE_MAP`,
> `getSectionGroupsForSector`, `SED_CONTRIBUTION_GUIDANCE` are all present in
> `apps/web/src/components/workbook/sections.ts`).
>
> This map adds the thing the report did not: it separates each item into the
> layer it actually lives in, and ties the calculation-layer items to the
> **verbatim toolkit truth** now captured in `docs/toolkits/extracted_formulas/`.
> The headline finding: the shipped fixes addressed the **input/UI layer**
> (dropdowns, dedup tabs, instructions, header aliases). The complaints that are
> still alive — *"my excel doesn't translate to scoring"*, *"% of payroll is
> incorrect"*, *"the scorecard is missing elements"* — are **calculation /
> connection-layer** issues, which is exactly the accuracy work the connection
> specs (`docs/domain/sectors/<sector>/<size>/connections.md`) are built to close.

## Who said what

| User | Email | Note |
|------|-------|------|
| Zoleka Mnanzana | `zmnanzana@okiru.co.za` | 5 items, all on `/create-scorecard/C-37659`, 26 May |
| Chengetai Myezwa | `cmyezwa@okiru.co.za` | 7 items, `/create-scorecard/C-51329`, `/super-admin`, `/toolkit/...`, 26 May |

> **On the "switch the Azure account to cmyezwa" note:** `cmyezwa` is **Chengetai
> Myezwa's user login**, not a separate Azure account. The feedback is already
> readable two ways without any cloud switch: (1) this repo's
> `docs/feedback-report.md` + the in-app `DevMode.tsx` samples; (2) the live
> `GET /api/feedback` route (auth-gated) which reads MongoDB. Pulling the *latest
> live* rows would need an interactive `az login` + `kubectl port-forward
> deployment/mongodb -n okiru-pro` — a credentialed action I won't run on your
> behalf; do that locally and I can analyse whatever it returns.

## Layer legend

- **L1 · Input/UI** — what the user types/uploads and how it is presented. Fixed on the QA branch, live on `main`.
- **L2 · Normalisation** — turning user strings into the canonical values the scorer counts. Partly fixed; the verbatim dropdown enums in the extracts are the contract to hold it to.
- **L3 · Calculation/Connection** — whether the score the toolkit *would* produce matches the score the app produces. The open frontier.

## The map

| # | Item (verbatim) | User | Layer | Status now | Root cause & the verbatim truth it connects to |
|---|-----------------|------|:----:|------------|-----------------------------------------------|
| 1 | "RcGP do not require sector specific SED spend. Why is the ICT specific question here…" | Zoleka | L1 | **Fixed/live** | `ictSpecificInitiative` column was rendered for all sectors. The toolkits confirm this is ICT-only: only `ICT_*` extracts carry an "ICT Specific Initiatives" SED row; RCOGP `SED Scorecard` has no such column. `getSection('sed', sectorCode)` now filters it. |
| 2 | "Management control and employment equity are only 2 different pillars in transport…" | Zoleka | L1/L3 | **Fixed (UI)**; L3 verified | Correct: MC+EE combine for every code **except Transport**. Confirmed in every non-Transport extract — the Summary Scorecard has **one** combined MC line (`B18` Grand Total chain), e.g. RCOGP MC total `F18=SUM(...) = 19`. `TRANSPORT_GENERIC` keeps them split in `sectorConfig.ts`. The connection specs document the combined-band math per sector. |
| 3 | "no instructions… if I list someone as junior management will it pick it up or junior manager?" | Zoleka | L2 | **Partially fixed** | The toolkit's MC designation dropdown has **8 and only 8** viable values (`MC Data` extract): `Non-executive Director, Executive Director, Other Executive Manager, Senior Manager, Middle Manager, Junior Manager, Semi-skilled, Unskilled`. The Excel scores by **exact string** `COUNTIFS(tblMCData[Designation *],"Junior Manager",…)`. So the literal answer to Zoleka is **"Junior Manager"** (singular). The code's `normalizeDesignationForScoring` already maps "junior management"→`Junior`, but the **Information Request grid and instructions sheet must surface these exact enums** — the dropdown is the fix, free-text is the trap. |
| 4 | "excel sheet has current size but does not translate to scoring" | Zoleka | L2 | **Fixed/live** | `SUPPLIER_SIZE_MAP` added; size dropdown enum verified against the toolkit `Procurement Data` validation: only `EME, QSE, Generic` are valid (B6 list). Anything else → that PP size line scores 0. |
| 5/8 | "procurement tab AND suppliers tab — need both?" | Zoleka/Chengetai | L1 | **Fixed/live** | Duplicate legacy `suppliers` section removed; merged in projection. Toolkit has a single `Procurement Data` sheet → one tab is correct. |
| 6 | "FSC scorecard is missing elements… needs the various scorecards within FSC" | Chengetai | **L3** | **Partially fixed — OPEN** | FSC **Generic ("Others")** is modelled (120 pts). But the FSC toolkit extract confirms the missing pieces are real and structural: it ships `EF & ESD Scorecard - Banks`, `EF & ESD Scorecard - Long Term`, `AFS Scorecard - Banks/Long Term/Short Term`, `SED & CE Scorecard`. The **Banks / LTI / STI sub-variants** (Empowerment Financing + Access to Financial Services priority elements) are **not yet wired** to a sub-sector picker (Task #10). `FSC_BANKS/FSC_LTI/FSC_STI` exist in `sectorConfig.ts` but Q44 (Banks EF point values) is blank in the template → needs the Banks toolkit/gazette. **This is the clearest live calculation-layer gap.** |
| 7/9 | "options should be dropdowns not typed values" (SD, MC) | Chengetai | L1/L2 | **Fixed/live** | Categorical columns forced to `type:"select"`. The extracts give the authoritative option lists per field to lock these to (race, gender, designation, size, level, contribution type, Yes/No). |
| 10 | "Bulk upload button not working" | Chengetai | L1 | **Fixed/live** | Button wired to file input; `bulkUploadParser.ts`. |
| 11 | "% of payroll is incorrect, either hardcode or change the formula" | Chengetai | **L3** | **Fix was L1; L3 to verify** | The shipped fix made `calculateSkillsScore` config-optional and removed the duplicate `leviableAmount` field. The **arithmetic** itself — `targetSpend = leviable × overallSpendPercent` — must match the toolkit `Skills Scorecard`, which uses **per-spend-row targets** (RCOGP 3.5%/2.5%/0.3%; FSC uses **per-management-level rates** 2%/3%/5%/8%, not a single 3.5%). The FSC code currently approximates FSC as a single 3.5% (`overallSpendPercent: 3.5` with a "per-level rates" comment). The connection spec flags this as a modelling approximation to verify with the expert. |
| 12 | "don't need payroll and leviable amount, same thing" | Chengetai | L1 | **Fixed/live** | `leviableAmount` derived from `forecastPayroll`. Per SARS, leviable ≈ payroll. Correct. |

## What this means for the accuracy push

1. **L1/L2 is in good shape and live.** Dropdowns, instructions, dedup, header aliases all merged. The verbatim dropdown enums in `extracted_formulas/*.md` are now the spec to keep those select-lists honest (any drift between a UI option list and the toolkit validation is a registration bug).
2. **L3 is the frontier**, and it is sector-specific:
   - **FSC sub-variants (Banks/LTI/STI)** — the single biggest gap (item 6). Needs a sub-sector picker + the Banks EF point values (expert/gazette). 
   - **FSC Skills per-level rates** (item 11) — verify the per-management-level skills targets vs the single-rate approximation.
   - **Industry norms** — `STANDARD_INDUSTRY_NORMS` still carries fabricated lines (agriculture 8.0, ICT 10.0, financial 15.0…) that are **not** in any toolkit (only the 9 SARS classes are). These don't match a "register" but they silently skew deemed-NPAT → ESD/SED/PP. Replace with the SARS-classification mapping.
3. The per-sector **`connections.md`** specs + the **§6 discrepancy ledgers** are the durable artefact that turns "the toolkit feels outdated" into a concrete, verifiable to-do list per pillar.

## Part E — LIVE pull (2026-06-21, prod MongoDB `okiru_pro.feedback`)

Pulled read-only from the live cluster (`kubectl --context okiru-pro-aks -n okiru-pro exec mongodb-… -- mongosh …`). **31 total entries** vs the 17 in `feedback-report.md` → **14 new**. The May/early-June new ones are already `resolved` in prod (paste-size bug, contribution-type dropdowns, rand-value pickup, occupational-levels, ESG dark dropdowns, ESG nav). The **8 still OPEN** are below — these are what needs attention now.

### Open · Management pillar (Zoleka, 17 Jun) — LIVE calculation/registration bugs

| When | Message | Likely root cause (this session's evidence) |
|------|---------|---------------------------------------------|
| 17 Jun 16:56 | *"Black female voting rights don't calculate — entered 33% on MC page (>25% required) but score is zero"* | A real **zero-score** bug on the MC page. Candidates from the connection spec: (a) gender **exact-match** `=== 'Female'` (registration risk — any non-canonical gender zeros all BW lines); (b) a direct `%`-entry path on the MC page not wired to the BW voting line. Reproduce on `/toolkit/scorecard` and trace `boardVotingBWO` / the MC BW input binding. |
| 17 Jun 16:59 | *"Black executive manager score not pulling through from the information provided"* | Exec band not registering — same family as ledger **ict/qse D-01** ("Other Executive Manager" dropped from the exec band) and the designation registration traps. Trace `normalizeDesignationForScoring` → `grouped['Executive'/'Executive Director']` for the entered designation. |
| 17 Jun 16:57 | *"the codes do not have a line item for 'black other executive managers', just black executive managers — 'other' only exists in the transport code"* | **Domain-model challenge from the B-BBEE expert.** Note: the RCOGP toolkit we extracted **does** carry an "Other Executive Manager" designation + Other-Exec band (`otherExecBlackMaxPts: 2`). So either the toolkit/our labelling or Zoleka's reading differs — **needs expert reconciliation** before changing the MC structure. Flagged, not auto-changed. |

> These three are the live face of the same "isn't registering what changes a score" problem the connection specs catalogue. The 16:56 one is a concrete, reproducible scoring bug — a good candidate to fix next after expert confirmation of the expected MC input model.

### Open · other

| When | User | Area | Message | Note |
|------|------|------|---------|------|
| 11 Jun 08:25 | Zoleka | Skills/save | *"unable to save the mandatory fields (EAP and the likes); data I add does not show — did not get saved"* | **Persistence/data-loss bug** on `/create-scorecard/C-31350`. EAP not saving ⇒ MC/Skills EAP-split rows can't score (ties to every "EAP unset → 0" registration risk). High priority — investigate the scorecard save path + EAP field binding. |
| 10 Jun 20:07 | **Tshiamo Moahi** (new user) | Certificates | *"certificate preview button downloads the scorecard and displays nothing"* | Certificates UI bug on `/certificates`. |
| 17 Jun 11:21 | Chengetai | ESG | *"add qualitative measurements — sentiment, action items, rank by importance + low-hanging fruit"* | ESG roadmap (analytics layer). |
| 17 Jun 11:57 | Chengetai | ESG | *"draw analytics based on the product and source data, also by location"* + *"estimated value generator based on historic data"* | ESG roadmap (analytics + AI estimation). |

**Takeaways for this session's work:**
1. The **17 Jun MC bugs** validate the connection-spec "registration" findings on live data — the Management pillar is where users are actively hitting silent zeros.
2. **Item 16:57** is a domain dispute about the Other-Exec band — route to the B-BBEE expert; do not change the MC structure unilaterally (the toolkit supports the band).
3. The **11 Jun save bug** is a likely-high-impact persistence issue distinct from scoring — worth its own investigation.
4. Chengetai's ESG items pre-stage the ESG work (analytics, single-sheet AI load, qualitative scoring).

## Cross-references

- Verbatim formulas & dropdowns: `docs/toolkits/extracted_formulas/<SECTOR>.{md,json}`
- Connection specs (per sector): `docs/domain/sectors/<sector>/<size>/connections.md`
- Resolved expert Q&A: `docs/domain/sectors/TOOLKIT-RESOLVED.md`
- Original feedback log: `docs/feedback-report.md`
