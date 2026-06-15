# ESG Toolkit — Open questions (post adversarial review pass 2)

**Status:** Blockers 1–10 resolved from workbook v1.7 (see below). Medium items 11–15 remain open.  
**Companion docs:** `ESG_TOOLKIT_ANALYSIS.md`, `ESG_IMPLEMENTATION_PLAN.md`

---

## Resolved (workbook) — blockers 1–4

### 1. Overall ESG score formula — **Resolved (workbook)**

Ship **`ESG_Dashboard!D9` exactly**:

```excel
=IFERROR((E_Scorecard!D30/100+S_Scorecard!D28/100+G_Scorecard!D26/100)/3,0)
```

- Each pillar contributes **points ÷ 100**, not ÷108 for E in the headline.
- Row 6 may show E as `36/108` for display; D9 uses `/100` per pillar.
- **Do not** use HTML prototype 40/30/30 weighting.
- Implemented in `apps/web/src/lib/esgScoringDefaults.ts` → `esgOverallPercent()`.

### 2. Governance input model (G_Data) — **Resolved (workbook)**

Web inputs = **0–5 maturity sliders** per `G_Data` column F (workbook parity). No boolean Yes/Partial/No mapping unless the workbook uses booleans (it does not for G_Scorecard scoring).

### 3. LTIFR when hours worked unknown — **Resolved (workbook)**

`S_Scorecard` row 17: `IF(S_Data!G35=0,0,…)` — **empty or 0 → 0 points**. Align web to workbook for audit parity. Implemented in `esgLtifrPoints()`.

### 4. ISO_14083 vs E_Data GHG totals — **Resolved (workbook)**

**ISO_14083 is reporting-only / parallel track** for v1.7. Do **not** add to E_Data GHG totals or Validation cross-checks until product decides otherwise. Flag: `ESG_ISO_14083_REPORTING_ONLY`.

---

## Resolved (workbook) — high priority 5–10

### 5. Sector templates — **Resolved (workbook)**

v1 ships **one frozen instance**: Transport / FMCG Distribution (`Assumptions` sector-locked; B6 dropdown is informational only). Dynamic 14-sector switching deferred — fork from Generic template per workbook note.

### 6. EE headcount vs partial EE score — **Resolved (workbook)**

Web validation **flags** `S_Data!L12=0` as critical fail (Validation row 8) but does **not block navigation** in Phase 1. Scores may show partial EE (workbook behaviour). Submit gate in Phase 2.

### 7. King V completeness — **Resolved (workbook)**

**Allow partial King V score** (current workbook: 7/17 principles with status, Validation row 12). Warning-only in Phase 1; enforce 17/17 on submit in Phase 2 if product requires.

### 8. Carbon credits — **Resolved (workbook)**

**Defer** — no Carbon Credits sheet in v1.7. Web-only CR register from HTML prototype is Phase 2+.

### 9. B-BBEE + ESG same company — **Resolved (workbook)**

**Yes** — same `Client` entity; separate `/esg/*` routes and `esg_workbooks` collection. `B_BBEE_ESG` bridge sheet is read-only cross-reference; does not write to B-BBEE store in Phase 1.

### 10. Score parity tolerance — **Resolved (workbook)**

Golden tests lock to **2 dp** on overall percent; per-indicator accept **±0.5 pt** banding drift from JS float vs Excel until full formula port.

---

## Medium priority (still open)

11. **Prior period / trend arrows:** HTML `T` object + trend UI; no workbook sheet. MVP or Phase 2?

12. **Materiality_Matrix:** 94 formulas, no scorecard refs — disclosure ordering only?

13. **SAQ_Supplier:** 84 validations, 0 live score contribution — required data entry or Phase 4?

14. **Export:** Byte-identical xlsx vs values-only export for v1?

15. **Assumptions editing:** Consultant-only (like sector config) vs client Settings page?

---

## Resolved in pass 2 (no longer open)

- ~~Assumptions B9 = standards pack~~ → **B9 = banding floor**; standards = **B11**.
- ~~Social max 84 / score 24~~ → **100 max / 33 live**.
- ~~Overall = sum/292~~ → **average of (pillar_pts ÷ 100)**.
- ~~THR_WASTE = 90%~~ → **75%** (`B48`); 90% is `THR_WASTE_X` excellence benchmark.

---

## Access control (Phase 1)

ESG preview limited to:

- Emails containing **`brian`** (case-insensitive)
- **`cmyezwa@okiru.co.za`** (Chengetai Myezwa)
- Comma list in env **`ESG_PREVIEW_ALLOWLIST`** (k8s prod overlay)

See `apps/web/src/lib/esgAccess.ts` and `apps/web/server/esgAccess.ts`.
