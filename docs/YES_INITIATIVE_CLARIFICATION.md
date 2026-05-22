# YES Initiative Clarification

**Purpose**: Resolve confusion between the Empower/RCOGP Excel toolkit YES display, `docs/SCORECARD_GROUND_TRUTH.md`, `docs/SECTOR_TRUTH_LEDGER.md`, and Okiru scoring output — with Lake Trading as the worked example.

**Verified**: 2026-05-21 against `docs/Lake Trading  Toolkit (RCOGP).xlsx` and `docs/SCORECARD_GROUND_TRUTH.md`.

---

## Executive summary

1. **YES is not a scored pillar** in the RCOGP Generic 120-point total. `yesInitiative.maxPoints = 0` in `sectorConfig.ts` is correct.
2. **YES can add up to +3 bonus points** to the points total when Tier 2 is achieved (1.5× headcount target + 5% absorption) — this is separate from the 120 max and does **not** change `totalMaxPoints`.
3. **Lake Trading grand total 63.56** is pillar-only. Lake does **not** qualify for YES (`Qualify for YES? = No`, `YES Points = 0`). Total with YES bonus = **still 63.56**. Hypothetical total if Tier 2 were achieved = **66.56**.
4. The Excel Summary Scorecard **YES points** row showing 63.56 is **not** an extra +3 — it is the `Current Points + YES Points` formula when bonus = 0.

---

## Ground truth (SCORECARD_GROUND_TRUTH.md)

### Section 1 & §10

> YES Initiative is NOT part of any scored total. It provides level improvement only.

Section 10 tier table includes one row with bonus points:

| Achievement | Level Improvement |
|------------|------------------|
| 1.5× YES target + 5% absorption | 1 level up **+ 3 bonus points** |

So: YES is not a pillar in the 120 total, but Tier 2 **does** add 3 points to the achieved score (and can affect level determination via higher point total).

### Section 17 — Lake Trading validation

Lists seven pillars totalling **63.56 / 120**. Does **not** list YES bonus — because Lake Trading Excel shows **YES Points = 0**.

---

## What the Lake Trading Excel actually shows

### Summary Scorecard

| Row | Actual | Notes |
|-----|--------|-------|
| Grand total | 63.559… → **63.56** | Sum of 7 pillars |
| YES points | 63.559… → **63.56** | Same value — bonus column = **0** |
| Current Points + YES Points (col P) | 63.559… | = pillar sum + 0 bonus |
| Achieved Level | Level 7 | On pillar points |
| Discounted Level | Level 8 | Skills sub-min failed |
| YES Level | Level 8 | No uplift (same as discounted) |

### Scorecard Calculations sheet

| Field | Value |
|-------|-------|
| Total (7 pillars) | 63.55931201537822 |
| YES Achieved? | **No** |
| YES Points | **0** |
| Tier reference (planning) | Tier 2 → +1 level + 3 pts (not achieved) |

### YES sheet

| Field | Value |
|-------|-------|
| Qualify for YES? | **No** |
| Minimum YES headcount required | 0 (gated off) |
| Message | "You do not qualify for YES at this stage!" |
| Deemed headcount target (if qualified) | 7 (revenue band R250–300M) |

---

## Code behaviour (correct for Lake Trading)

| Component | Behaviour |
|-----------|-----------|
| `sectorConfig.ts` | `yesInitiative.maxPoints: 0`, `totalMaxPoints: 120` |
| `calculationEngine.ts` | Excludes `yesInitiative` from pillar sum |
| `lakeTradingDemo.ts` | `yesCandidatesCount: 0`, expected total **63.56** |
| `lakeTrading.test.ts` | Acceptance test **63.56 / 120**, no YES bonus |
| Toolkit `store.ts` | Adds `yesBonusPoints` to total **only when** YES Tier 2 qualifies |
| Toolkit `yes.ts` | Tier 2 → `bonusPoints: 3`, `levelIncrease: 1` |

Lake demo data produces YES bonus = 0 → total stays **63.56**. No fix required.

---

## Why users report confusion

1. **Excel labelling**: The "YES points" row duplicates the grand total when bonus = 0, suggesting YES is "included" in the number users already trust.
2. **Ledger brevity**: `SECTOR_TRUTH_LEDGER.md` §1 showed only `YES Initiative | 0 (level boost)` without explaining the Tier 2 +3 exception or Lake specifics.
3. **Mixed UI signals**: Toolkit Sidebar shows YES with `target: 3`; old `DocumentProcessor.tsx` comment referenced "YES: 5 pts".
4. **Super Admin**: YES omitted from active pillar list (maxPoints = 0) while Excel shows a YES row — looks like a missing pillar.

---

## Correct totals for Lake Trading

| Scenario | Total | Max | Level |
|----------|-------|-----|-------|
| Pillar sum only (authoritative for Lake) | **63.56** | 120 | 7 → discounted **8** |
| + Tier 2 YES bonus (hypothetical) | **66.56** | 120 + 3 bonus | Depends on uplift rules |
| **Actual Lake Excel** | **63.56** | 120 | 7 → discounted **8** |

---

## Related documents

- `docs/SCORECARD_GROUND_TRUTH.md` §10, §17
- `docs/SECTOR_TRUTH_LEDGER.md` §16
- `docs/LAKE_TRADING_FIX_PLAN.md` §11
- `apps/web/src/lib/lakeTradingDemo.ts`
- `apps/api/pipeline/__tests__/lakeTrading.test.ts`
