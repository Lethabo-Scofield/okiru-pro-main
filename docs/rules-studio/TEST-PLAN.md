# Rules Studio — reproducible test procedure (3 November)

Synthetic data only. Never run destructive cases against live client data. Production publishing stays off
(`RULES_LAUNCHED=false`) until every prerequisite in README "Owner decisions" is met.

## 1. Automated (run first; all must pass)

```bash
# API: Studio + ledger + scorer-through-the-API typecheck
cd apps/api && pnpm typecheck
cd apps/api && npx vitest run src/rules src/routes/__tests__/rules.published.test.ts src/routes/__tests__/rulesStudio.routes.test.ts

# Web: shared scorer, registries, live link, impact engine, UI smoke, existing B-BBEE regression suite
cd apps/web && npx vitest run Toolkit/src/lib server src/pages/studio
```

What they prove (counts as of the last run): 9 scorecard registries incl. empty-override parity and no-phantom-control checks;
override path safety; ledger signing / hash chain / tamper / gap / transplant detection; freeze, pins, period-end, compatibility;
restore and emergency rollback; four-eyes and hash-bound approvals; step-up replay / binding / expiry / lock-out;
snapshot write / read-back / verify failures; the directive's 20-step scenario (`studio/__tests__/acceptance.test.ts`);
the role × endpoint permission matrix, CSRF/origin checks and 503/423/409 mappings over HTTP; adversarial AI output; nightly backup + heartbeat.

## 2. Manual rehearsal on a staging stack (no real keys in git)

1. Generate keys (commands in `apps/api/.env.example`): signing key, TOTP encryption key. Create an **off-site** storage account in a
   different subscription with an immutability policy; set the connection string + container. Set `BUILD_ID`.
2. Start API with `CERT_EXTRACTION_ON_STARTUP=false` and `RULES_LAUNCHED=false`; set `RULES_STUDIO_BOOTSTRAP_ADMINS=<your user id>`.
3. Open `/studio` as the bootstrap admin → Grants (API: `POST /api/rules-studio/grants`) for an editor, an approver and a viewer (three different users).
4. Editor: open RCOGP Generic → New draft → edit *guarantees* benefit factor `0.03 → 0.5` with a justification → Run authoritative impact →
   acknowledge the deliberate ESD lines → Submit.
5. Approver: Review → Approve (confirm the editor cannot approve; confirm admin cannot approve).
6. Approver: Check readiness → all 12 checks green → Publish → enrol an authenticator on first use → enter code → version 1.
   Expect a snapshot object in the off-site container (`rules-snapshots/...pre-publish-rcogp-generic-...json`).
7. Set `RULES_LAUNCHED=true` **and** `VITE_RULES_LAUNCHED=true` on the *staging* stack only. Client A (unpinned) → score changes, stamp = version 1.
   Client B pinned to version 0 (`POST /api/clients/:id/ruleset-pins`) → unchanged.
8. Freeze (Versions → Freeze, step-up) → unpinned scoring returns to version 0, stamp shows frozen; publishing returns 423. Unfreeze.
9. Versions → Restore… version 0 → goes through the draft flow → version 2. Load version 1 explicitly (`?version=1`) → identical result to step 7.
10. Stop the API (or block `/api/rules`) → launched Toolkit shows "published scoring rules could not be loaded" with Retry and scores nothing; exports blocked.
11. Tamper drill on a **staging copy** only: edit a stored `rules_versions` document → `GET /api/rules/published/:sid` returns 500 `RULES_INTEGRITY_FAILURE`,
    Studio → Activity → Verify integrity reports it, the webhook receives the critical alarm.
12. Emergency rollback drill (Versions → Emergency rollback, step-up) → new `rollback` version, review task due in 2 working days.
13. Backup failure drill: point the off-site connection string at an unreachable account → publish returns `503 snapshot_failed`, alarm fires, nothing published.
14. Confirm ESG pages, the Certificate Hub and the existing B-BBEE toolkit flows still work (smoke).

## 3. Known not-yet-verified (do not claim as done)

Real off-site storage, signing-key custody, the dead-man-switch monitor, the alarm webhook, Cloudflare Access / `studio.okiru.pro`,
database-level (role) append-only enforcement, the 124-case parity library, and a security review. See STATUS.md.
