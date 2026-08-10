# Post-deploy roadmap (after `2bde921d` ships)

Sequenced from user's directive: smoke-validate → INTERNAL_BACKSYNC_TOKEN → audit-sweep → production observability.

## 1. Smoke-validate (post-fix)
Tag: `2bde921d-202606302219` — ships:
- `apiProxy.ts` per-entity sub-path proxy patterns (POST /api/clients/X/{employees|suppliers|...} now reach apps/api)
- `/api/admin/workbook-backsync/health` moved to apps/web (so /api/admin/* ingress routes it correctly, guarded by `requireAuth + requireAdmin`)

**Expected probe results after deploy:**
- POST /api/clients/X/employees → **401** (was 404 HTML)
- POST /api/clients/X/employees/bulk → **401** (was 404 HTML)
- POST /api/clients/X/suppliers → **401**
- POST /api/clients/X/training-programs → **401**
- POST /api/clients/X/shareholders → **401**
- POST /api/clients/X/esd-contributions → **401**
- POST /api/clients/X/sed-contributions → **401**
- GET /api/admin/workbook-backsync/health (no session) → **401** (was 200 HTML)

## 2. Set `INTERNAL_BACKSYNC_TOKEN`
- Generate `openssl rand -hex 32` (cryptographically random 64-char hex)
- Add to `session-secrets` in `okiru-pro` namespace via `kubectl create secret`
- Reference in both `api` and `web` deployment envFrom or env (need to update env yamls in `kubernetes/infrastructure/base/deployments/api.yaml` + `web.yaml`)
- Restart both deployments
- Verify activation: any Toolkit add → look for outbox entries or successful drainer logs

## 3. Run `/audit-sweep deep`
Workflow re-pass against the latest code. Targets:
- New file: `apps/web/server/workbookEntityCodec.ts` (codec correctness)
- New file: `apps/web/server/workbookBackSync.ts` (rebuild merge policy)
- New file: `apps/api/src/services/workbookBackSyncFanout.ts` (drainer + outbox)
- Existing routes touched: every per-entity router in apps/api
- `apiProxy.ts` proxy patterns (are there OTHER routes that should be proxied?)
- New endpoint: GET /api/admin/workbook-backsync/health (auth posture)
- New endpoint: POST /api/internal/workbook-backsync (token gating)

## 4. Production observability
Three concrete pieces, parallelizable:

### 4a. Raise prod LOG_LEVEL from `warn` to `info`
- The drainer boot logs, audit logs, request lines silenced today
- Trade-off: log volume × cost vs incident-debugging
- Mitigate volume by adding sampling at the request-log middleware

### 4b. Wire alerting on `/api/ready`
- Stuck-rollout, mongo disconnect, arangodb 401 (last outage) — all observable via the new `/api/ready` 503 path I added
- Options: Azure Monitor alert rule on synthetic ping; uptime-kuma external watcher; or Prometheus + Alertmanager (mentioned as TODO in the audit but not deployed)
- Lightest: Azure Monitor "availability test" pinging /api/ready every minute with HTTP 200 expectation → email on failure for 5min

### 4c. Log aggregation off-stdout
- Today logs go to stdout only; pods cycle and logs vanish
- Options: Loki + Promtail (open-source), Azure Monitor Container Insights (managed), ELK (complex)
- Lightest: Azure Monitor Container Insights — already integrated with AKS

### Workflow shape for the observability cluster
Three independent finders + 1 synthesis agent makes sense if we want concrete proposals.
But this is BUILD work not investigate work — better solo with one tight commit per piece.
