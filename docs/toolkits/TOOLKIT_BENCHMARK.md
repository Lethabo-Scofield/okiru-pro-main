# Empowered Toolkits ↔ Okiru Engine — Benchmark

**Run date:** 2026-08-11

The **Empowered toolkits** are the six `BBBEE Toolkit (…)*.xlsx` workbooks in `docs/toolkits/`
(RCOGP Generic + QSE, ICT Generic + QSE, FSC, AgriBEE). All six are covered by benchmark A.

Two independent benchmarks, because they answer different questions:

| | What it compares | Command | Result |
|---|---|---|---|
| **A. Structural** | Empowered toolkit pillar/criterion **weightings** vs the live `sectorConfig.ts` | `python docs/toolkits/compare_all.py` | **0 defects**; 9 deliberate gazette divergences, labelled `GAZETTE` |
| **B. Behavioural** | 16 filled workbooks scored end-to-end vs expert ground truth | `TOOLKIT_SCORE=1 npx vitest run src/__tests__/toolkitTestData.score.harness.test.ts --pool=forks` (from `apps/web`) | **12/16 Level 1** (goal 16/16) |

---

## B. Behavioural — all sectors, end-to-end

Every workbook: normalize → project to client → load sector config → score every pillar → level.

| Workbook | Sector | Total | Level |
|---|---|---|---|
| Kgodiso_Industrial_Holdings | RCOGP Generic | 105/120 | **1** |
| Khanya_Digital_Technologies | ICT Generic | 120/140 | 2 |
| Khethiwe_Construction_Contractor | Construction Contractor | 79/123 | 5 |
| Mzansi_Asset_Managers | FSC Other | 102/119 | **1** |
| QSE_Kgodiso_Trading | RCOGP QSE | 99/108 | 2 |
| QSE_Khanya_Digital | ICT QSE | 104/116 | **1** |
| QSE_Khethiwe_Construction | Construction QSE | 95/110 | 3 |
| QSE_Mzansi_Advisory | FSC Other | 101/119 | **1** |
| QSE_Sandile_Freight | Transport QSE | 104/100 | **1** |
| QSE_Sechaba_Mutual | FSC Banks/LTI | 112/132 | **1** |
| QSE_Setsoto_AgriGroup | AgriBEE | 114/128 | **1** |
| QSE_Vela_ShortTerm | FSC STI | 108/129 | **1** |
| Sandile_Freight_Logistics | Transport Large | 101/108 | **1** |
| Sechaba_Financial_Group | FSC Banks/LTI | 111/132 | **1** |
| Setsoto_AgriGroup | AgriBEE | 113/128 | **1** |
| Vela_ShortTerm_Insurance | FSC STI | 110/129 | **1** |

**The 4 short of Level 1:** ICT Generic (L2), RCOGP QSE (L2), Construction Contractor (L5), Construction QSE (L3).
The two Construction gaps are the known Phase-1 input-ingestion gap, not an engine gap — the engine matches
the signed expert PDF.

A per-element golden baseline guards this: the harness fails if any pillar of any workbook moves.

---

## A. Structural — Excel weightings vs live config

### The harness was lying before this run

Nine defects made the structural comparison worthless; all are fixed. **The mismatch count fell 66 → 11
without a single change to the engine** — every one of those 55 was the harness misreading the toolkits:

1. **`compare_all.py` read nothing.** `extract_fast.py` had changed its output format twice (a sector-keyed
   wrapper, then rows as a list instead of a dict). The extractors still expected the old shape, so
   `find_sheet()` matched nothing and **every Excel column printed "N/A"** — which reads as "nothing to
   compare" rather than "the extractor moved".
2. **The "Codebase" column was a hand-copied snapshot.** `CODEBASE_VALUES` was a dict of numbers transcribed
   into the Python script. It had drifted badly — it still claimed RCOGP QSE = 124 after the live config moved
   to 108, and ICT Generic = 133 when live is 140. So it reported mismatches against a stale transcription,
   not against the engine.

The codebase column now comes from a dump of the real `sectorConfig.ts`
(`apps/web/src/__tests__/liveSectorConfigDump.harness.test.ts` → `live_sector_config.json`).

3. **Three extractors read the wrong column.** Each scorecard sheet puts Points in a different place
   (Procurement `c3`, MC `c6`, Skills `c6`, ESD `c5`), and Skills/ESD/Procurement all read a hardcoded `c4` —
   which is the **target %** column. That is how Procurement reported "0.15 points" for the QSE row: it was
   the 15% target. Now located from each sheet's own header (`find_points_column`).
4. **Procurement matched the bonus row as BO51.** The designated-group bonus row reads "…at least **51%**
   black owned designated group suppliers", so a `"51%"` test fired before the `"designated group"` test and
   overwrote BO51 with the bonus row's 2 points. Ordering fixed.
5. **The Summary sheet matched sub-lines instead of pillar headers.** Each pillar header ("Enterprise
   development" = 7) sits directly above its own indicator rows ("Annual value of Enterprise Development
   contributions" = 5, "Graduation…" = 1, "Jobs created…" = 1). A substring test matched those too and the
   last one won, so ED was read as **5** — its base — and reported as a mismatch against the config's 7.
   Now matched by exact pillar label.
6. **MC read the Junior row as "Senior".** The toolkits label the Senior, Middle *and* Junior blocks with the
   same c4 text, "Black employees in senior management" — the actual band is a c3 section header
   ("Senior Manager" / "Middle Manager" / "Junior Manager"). All three matched and the last won, so Senior was
   reported as Junior's 1 point instead of 2. Now keyed off the section header, which also makes Middle and
   Junior comparable for the first time.
7. **Skills disability rows were spelled wrong in the toolkits.** They read "living with **disbilities**"
   (missing the 'a'; the MC sheet has "**diabilities**", missing the 's'). Any correctly-spelled test misses
   the row, so the disability line fell through into the general learning-programmes slot and overwrote it —
   the ICT "Learning Programmes 0 vs 8" and AgriBEE "4 vs 8". Now matched on `bilit`.
8. **Skills read an unfilled sheet instead of the Summary.** In the ICT template the Skills Scorecard sheet
   shows 0 for disabled learning and totals 21, while the Summary states 4 and totals 25 (8+4+4+4+5). The
   Summary carries the target weightings and is internally consistent, so Skills now reads from it.
9. **The QSE Skills split was collapsed.** QSE toolkits have a separate "Black female" learning line
   (15 + 7 + 3 + 5 = 30) that was overwriting the general learning line, reading 7 against the config's 15.

### Four of six sectors match exactly; the other two differ only where the gazette differs

| Sector | Excel | Live config | Deltas |
|---|---|---|---|
| RCOGP Generic | 120 | 120 | **0 — exact match** |
| ICT Generic | 140 | 140 | **0 — exact match** |
| RCOGP QSE | 108 | 108 | **0 — exact match** |
| ICT QSE | 116 | 116 | **0 — exact match** |
| FSC Generic | 120 | 119 | 3, all `GAZETTE` |
| AgriBEE | 132 | 128 | 6, all `GAZETTE` |

### Correction: Enterprise Development is NOT a disagreement

An earlier reading of this benchmark reported ED as a base-vs-bonus mismatch in all six sectors (Excel 5 vs
config 7, etc.). That was defect 5 above — the harness reading the ED *sub-line* rather than the ED pillar
header. The Empowered toolkits state the ED pillar as **7** (RCOGP), the same as our config. **ED matches in
every sector.** Our `maxPoints` does still bundle weighting + bonus, but so does the toolkit's pillar total,
so the two agree; the base/bonus split is a presentation concern, not a scoring disagreement.

### The 9 remaining deltas are DELIBERATE — do not "fix" them

Every surviving delta is a case where the engine follows the **gazette** and the Empowered toolkit does not.
They are labelled `GAZETTE` in the output and excluded from the defect count via `TEMPLATE_TENSION` in
`compare_all.py`. Source: `docs/calculator-audit-2026-07-26.md`, a first-hand gazette text extraction with
page citations, items 9 and 11.

| Sector | Delta | Toolkit | Engine | Authority |
|---|---|---|---|---|
| AgriBEE | Grand total | 132 | **128** | GG 41306 pp.33-34 |
| AgriBEE | Management Control | 23 | **19** | GG 41306 pp.33-34 |
| AgriBEE | Board Black / Board BW | 3 / 2 | **2 / 1** | GG 41306 |
| AgriBEE | Other Exec Black / BW | 3 / 2 | **2 / 1** | GG 41306 |
| FSC Others | Grand total | 120 | **119** | FS200 |
| FSC Others | Management Control | 21 | **20** | FS200 §3.4.1 |
| FSC Others | Board Black | 2 | **1** | FS200 |

The audit's wording on AgriBEE is explicit: *"The code comments say 23 was 'verified against BBBEE Toolkit
(Agri Generic)_Master_v.1.0.1.xlsx'. The gazette says 19… +4 phantom MC points also inflate `totalMaxPoints`
132 → gazette-consistent max incl. bonuses is 128."*

> **Warning for future work.** These deltas are seductive: the toolkit, `docs/SECTOR_TRUTH_LEDGER.md` §7/§8
> and `docs/SCORECARD_GROUND_TRUTH.md` all say 23/132 and 21/120, so three sources appear to outvote the
> config. They do not — those three are all downstream of the same vendor template. Only the audit read the
> gazette itself. Aligning the config to the toolkit was attempted and reverted; it awarded every AgriBEE
> client +4 points and every FSC Others client +1.
>
> Both downstream docs are now annotated (2026-08-11): `docs/SECTOR_TRUTH_LEDGER.md` marks the affected
> cells `[SUPERSEDED]` and carries a banner, and `docs/SCORECARD_GROUND_TRUTH.md` has a banner plus
> `template → **engine**` markers on the affected rows. Its old blanket instruction "All code must match
> these values exactly" has been qualified.

**One further delta was dismissed, not deferred:** FSC Procurement "Designated Group 2 vs 4". The toolkit
lists three separate 2-pt bonus rows (intermediated professionals, stock brokers, designated group) whose
combined award it caps at 4 — its PP header is 24, not 20 base + 6. Our `dgMaxPts: 4` models that cap in one
field, and the pillar totals agree. The harness no longer compares that row for FSC.

### Still unverified

`FSC_BANKS`, `FSC_LTI` and `FSC_STI` all carry the same `boardBlackMaxPts: 1` / MC 20 shape as FSC Others.
There is no Empowered toolkit for those sub-sectors and `SECTOR_TRUTH_LEDGER.md` marks them
**`[UNVERIFIED]`**, so they were left alone. Audit items 7 and 8 flag separate ownership and PP gaps there.

### Verified and cleared — the engine was right

Two deltas were investigated against the sheets directly and are **harness artifacts, not config defects**:

- **MC "Senior" 1 vs 2** (RCOGP, ICT, AgriBEE) — the toolkit states Senior = 2 on row 30; the harness was
  reading the Junior block's 1. Defect 6 above. Our config's 2 is correct.
- **Skills "Learning Programmes"** ICT 0 vs 8, AgriBEE 4 vs 8 — the toolkits state 8 on row 18; the
  misspelled disability row was overwriting it. Defect 7. Our config's 8 is correct. The follow-on ICT
  "Disabled Learning 0 vs 4" was likewise the unfilled Skills sheet, contradicted by its own Summary (4).

---

## Reproducing

```bash
cd apps/web && SECTOR_DUMP=../../docs/toolkits/live_sector_config.json npx vitest run src/__tests__/liveSectorConfigDump.harness.test.ts --pool=forks
```

```bash
cd docs/toolkits && python compare_all.py
```

```bash
cd apps/web && TOOLKIT_SCORE=1 npx vitest run src/__tests__/toolkitTestData.score.harness.test.ts --pool=forks
```

## Not covered

All six Empowered toolkits that exist are benchmarked structurally. There is **no Empowered toolkit for
Transport, Construction, or the FSC sub-sectors** (Banks / LTI / STI), so those sectors are benchmarked
behaviourally only (benchmark B, which does cover them). To extend A, drop the workbook in `docs/toolkits/`,
extract it with `extract_fast.py`, and add a `SECTORS` entry in `compare_all.py`.

Note also that the FSC entry compares the single `BBBEE Toolkit (FSC) Template` against `FSC_GENERIC` only —
the Banks / LTI / STI variants in `sectorConfig.ts` have no toolkit to compare against.
