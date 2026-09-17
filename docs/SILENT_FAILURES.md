# Silent failures — the taxonomy, the rules, and the week that proved them

**Status:** doctrine. Written 2026-08-24 after a week in which every class below
was found as a live, diagnosed production incident — not a hypothetical.
When a change touches a fallback, a catch, a default, or a toast, review it
against this document.

The unifying observation: **none of these were failures to compute. They were
failures to CONFESS.** The system knew something was wrong — a type it did not
recognise, a body it could not parse, a backup that did not land — and in every
case the code was written to shrug instead of speak. The fix is never cleverer
code first; it is a rule about what code is allowed to do when it does not know.

---

## The six classes, each with its incident

### 1. The favourable default — failure gets rewarded

> `factors[c.type] ?? 1.0` · `mapContributionType`'s else-branch → `direct_cost`
> (100% recognition) · a missing `benefitFactor` → `1.0` · an unknown SD-vs-ED
> split → "counts toward SD sub-min".

**Incident:** Thandanani scored 96/100 with data full of holes. A misread
`guarantees` row (factor 0.03) scored 1.0 — 33× over. On an elective
best-4-of-7 scorecard the inflated pillar is precisely the one that gets
elected, so the error compounds into the headline number.

**Rule: unknown never scores, and unknown is always reported.**
A default may be *neutral* (0, empty, skip-and-flag). A default may never be
the value a happy path would have produced. If you cannot classify it, exclude
it AND put it on the result (`unrecognisedTypes`, `excludedSpend`) so a person
can fix it.

### 2. The silent fallback — degraded mode nobody announced

> Mongo down → the token wallet silently switched to an in-memory store that
> granted every organisation a fresh free balance, and a PayFast credit written
> there evaporated on restart. · ArangoDB was "the single source of truth" in a
> comment while the hardcoded fallback served every request for months.

**Rule: a fallback must be loud, bounded, and biased AGAINST whoever benefits
from pretending it didn't happen.** In production, money paths fail CLOSED
(503, PayFast retries) rather than falling back. Where a fallback is
legitimate (dev, tests), the startup log states which mode is active — a
silent posture is how the CORS reflect-any-origin default reached production.

### 3. The dead path — code that cannot execute, and nothing that would notice

> The ESG import route's `Buffer.isBuffer(req.body)` branch. The client sends
> `application/octet-stream`; the server never mounted `express.raw`; the
> branch was unreachable from the day it was written. **Every binary bulk
> import in the product's history failed in 6ms**, and the first person to say
> so out loud was an external expert ("I selected the documents and nothing
> happened").

**Rule: test the wire, not the wish.** Every route that accepts a body gets a
test that sends EXACTLY what the real client sends — copy the `fetch` call out
of the component, headers and all (`esgImportBinary.test.ts` is the template).
A handler tested only with the body shape the server hopes for proves nothing.

### 4. The swallowed error — the UI that shrugs

> `try { … } finally { … }` with **no catch**: a network failure stopped the
> spinner and showed nothing at all. · `toast("Import failed")` with no detail:
> a hard server rejection read as "nothing happened". · `catch { }` around the
> Arango graph decoration: five years of exceptions, zero evidence.

**Rule: every failure the user caused or can fix must reach the user, in the
server's own words.** No empty catch without a comment proving the swallow is
safe. No generic toast — surface `detail.error`. No `try/finally` on a network
call without a catch. `void promise.catch(() => {})` is allowed only for
fire-and-forget whose failure is already logged by the callee.

### 5. The plausible lie — values that pass every local check and are wrong together

> `procurement.tmps = 23` — the supplier schedule's ROW COUNT in a Rand field.
> Grounded (the document says 23), typed (it's a number), mapped (to the right
> key) — and wrong by four orders of magnitude, minting a full pillar.

**Rule: validate the SET, not just the fields.** Cross-value invariants are
code and always on (a total cannot be smaller than one of its own parts — with
a calibrated margin, because Codes-excluded rows make schedule sums
legitimately exceed TMPS). The model's chain-of-thought review reads the
assembled case last, as an analyst would — advisory, cached, one call per case.

### 6. The unwatched background — infrastructure that fails on schedule

> The nightly MongoDB backup failed every night for a week (the blob container
> was never created). The ArangoDB backup pod sat NotReady for four days.
> Nobody was watching, because nothing was watching. · The feedback collection
> — the one place users' bug reports lived — was wiped in a migration, and its
> loss was itself silent.

**Rule: anything that runs unattended needs an observer, and the observer's
silence must be distinguishable from success.** Backups are only real after a
restore drill. Verify the *artifact* (the blob in the container), not the
job's exit code — this week's job "ran" and uploaded nothing.

### Honourable mention: the fixture that lies for you

The ESG golden fixture *injected* summary cells (`0.911`, `135`) that no UI
field could produce — so tests were green while ~52 points were unreachable by
any real user ("the unachievable points doc").
**Rule: a test may only inject what a user can enter.** Fixtures go in through
the same doors users do; derivations produce the rest.

---

## The mechanisms, in leverage order

1. **CI.** ~3,300 green tests currently run only on one developer's machine.
   Every rule above is a suggestion until a pipeline enforces it on every push.
   This is the single highest-leverage anti-silent-error act available.
2. **The self-reporting app.** The feedback store exists and is empty. Wire
   `unhandledrejection` / failed-fetch telemetry into it so the system files
   its own bug reports — "nothing happened" becomes a row with a stack trace.
3. **The ratchet.** `/audit-sweep` already hunts these defect classes
   (phantom saves, toast-only validation, fail-open auth). Run it before every
   release; add a grep-ratchet test that fails when the count of `catch {}` /
   `?? 1.0`-style favourable defaults GROWS.
4. **Wire-level contract tests** for every body-accepting route (class 3).
5. **Ground-truth canaries.** Re-score the verified cases (Lake 63.56,
   Thandanani 102, SG Consumer golden) on every build; a moved number is a
   silent scoring change caught loudly.
6. **A restore drill**, scheduled, because a backup is a hypothesis until
   restored.

## The reviewer's checklist

- [ ] Does any default equal the value success would have produced? (class 1)
- [ ] Does any fallback engage without a log line stating the mode? (class 2)
- [ ] Is there a code path no test can reach with a real client payload? (class 3)
- [ ] Is there a `catch {}`, a detail-free toast, or a netcall `try/finally` with no catch? (class 4)
- [ ] Do the values get checked against EACH OTHER anywhere? (class 5)
- [ ] If this runs unattended and fails, who notices, and how fast? (class 6)
- [ ] Does any test inject a value no user could enter? (fixture rule)
