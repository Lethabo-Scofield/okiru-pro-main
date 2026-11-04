# Rules Studio: integration into the live code (4 November 2026)

PR #38 was built on `main` from 7 October, which is 331 commits behind what runs on okiru.pro. It was brought onto the live code on branch `studio/live`, without the 6 quality-assurance commits underneath it (those are PR #27).

## What was found, and what changed

| Finding | What it would have done | What changed |
| --- | --- | --- |
| The Studio's converters skipped each sector's Empower toolkit method | Any published version on RCOGP, ICT or Agri would have silently dropped the methods that make those scorecards match Excel | `rules/scorecards.ts` applies the same steps as the live config. `ruleMovesScore.test.ts` fails if an empty draft differs from live |
| Most FSC targets, and some others, are not read by the scorer | An expert could publish a change that does nothing, and it would look successful | Every rule is moved and re-scored on the Excel-checked companies. Rules with no effect are locked, with the reason. List: `registry/noScoreEffect.ts`. The test fails if it drifts either way |
| Guarantees showed 3%, the scorer uses 50% | Experts would have edited the wrong number | It is now a calculator-layer rule showing the 50% |
| One tree per service | Browser and server would compare config hashes built from different code | Web and API now build from one commit |
| Nobody could hold the first grant | The Studio could not be opened on a real deployment | `RULES_STUDIO_INITIAL_GRANTS` (created once, audited, a revoked grant stays revoked) |
| Azure was the only off-site store | Publishing is impossible on the AWS host | `S3Offsite`, a bucket with Object Lock, and credentials that can only write and read |
| `RULES_LAUNCHED` is all or nothing | No way to see a published change without changing clients' scores | `RULES_PREVIEW_USER_IDS`: named accounts get published rules, everyone else stays on the current rules |

## Security review findings closed

- Four-eyes was per account, and signup is open: `RULES_STUDIO_ALLOWED_USERS`, fail closed in production.
- An admin could reset their own authenticator: refused, another admin must, and it raises a critical notification.
- Any client writer could choose the version a client is scored under: `pins.manage` now takes a Studio role.
- Freeze events were unsigned: signed, and verified on every read.
- `PATCH /change-requests/:id` authorised on the scorecard in the request body: now the record's own. `POST /notifications/:id/read` had no check: now needs a grant.
- A rule no test company reaches passed review silently: it now needs a written reason.

## The AI

`aiProposals.ts` was rewritten. It was capped at 1,200 tokens with thinking on, which can use the whole allowance and return nothing. It now uses the official SDK on `claude-opus-5-5` with structured output, is told the current values, the locked rules and how to read each unit, and can ask one question or send part of a request to the developers. The expert sees the effect on the test companies before accepting.

`validateProposal` is still the security boundary and is unchanged in what it allows.

**Not yet run against the real provider: `RULES_AI_API_KEY` is not set.** Before relying on it, try these against a real key:

1. A clear request with a number ("Guarantees should count at 25%").
2. No number given ("Make guarantees count less"): it should ask.
3. A level or discounting request: it should go to the developers.
4. A related rule ("raise black ownership"): it should name the black women line, not change it.
5. A prompt-injection attempt in the description.

## For Lethabo, in order

1. **Connect the FSC targets.** `calculators/fscToolkit.ts` uses fixed toolkit values (see `fscEsdWeights`), so 123 of the 159 FSC rules are locked. Reading them from config without losing Excel parity is the biggest gap. Then remove them from `noScoreEffect.ts`; the test will tell you when they move.
2. **Factors whose names do not match the calculator.** `lower_interest_rate`, `professional_services_discounted`, `shorter_payment_periods` and `equity_investment` do not move a score. Check them against `canonicalContributionType`.
3. **Run the impact review on the Excel-checked companies**, not only the 5 synthetic profiles. The cases are in `docs/toolkits/parity/expected`.
4. **Open security findings:**
   - Ledger truncation cannot be detected: anchor the chain head in the off-site snapshots.
   - The step-up attempt count can leak under concurrent guesses: keep a persistent per-user failure counter.
   - `/activity`, `/notes`, `/rulings`, `/notifications` and `/change-requests` return all scorecards to a user scoped to one.
   - The effective date and announcement sit outside the approved hash, and restore-kind drafts can still be edited.
   - The review task after an emergency rollback is only a notification.
   - TOTP ciphertext has no additional authenticated data, and there is no key rotation.
   - Decide what `RULES_LAUNCHED=true` with failing blockers should do. Today clients silently stay on the shipped rules.
5. **Screens that do not exist yet:** grants, and pin re-score.
6. **Before launch to clients:** alarm webhook, heartbeat monitor, off-site storage in a separate AWS account, signing key custody, and the recovery drills in `TEST-PLAN.md`.

## Tests on this branch

- Web: 4,520 passed, across 384 test files. `autoresearchFitness` cannot run in a clean checkout because it needs a private workbook that is not in git.
- Excel parity: every gate passes, and the `calculateScorecard` body is byte-identical to live apart from two type-only casts.
- API Studio: 150 passed, plus the 23 real-MongoDB tests against a throwaway database.
- End to end, API level, with real sessions on the deployed builds, the restricted database user and the real S3 bucket: draft, impact, approval by a second person, authenticator, publish, and a check of who receives the new rules.
- Not done: clicking through draft to publish in a browser. The main screens were checked by screenshot only.
