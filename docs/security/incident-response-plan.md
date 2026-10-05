# Incident response and breach notification

Okiru ESG Intelligence Platform · Version 1.0 · 17 September 2026

Open item 11 of the security disclosure. Section 22 of POPIA requires a
responsible party to notify the Information Regulator and affected data subjects
where there are reasonable grounds to believe personal information has been
accessed or acquired by an unauthorised person. We process that information as
an operator for our clients, so the practical obligation on us is to tell the
client fast enough and completely enough that they can meet theirs.

This plan is short on purpose. A plan nobody can follow at two in the morning is
not a control.

---

## 1. Who does what

The team is small, so these are roles rather than people, and one person may
hold more than one. **The named holders must be filled in and kept current —
a plan with a blank here has not been adopted.**

| Role | Responsibility | Holder |
|---|---|---|
| **Incident lead** | Declares the incident, runs it, decides on containment, owns the timeline | _to be named_ |
| **Technical lead** | Investigates, contains, preserves evidence, restores | _to be named_ |
| **Client contact** | Single voice to affected clients; no one else communicates externally | _to be named_ |
| **Information Officer** | POPIA notifications to the Regulator; registration status is itself an open item | _to be named_ |

If the incident lead is unreachable within 30 minutes, whoever noticed the
incident becomes the incident lead until relieved. Waiting for the right person
is how an hour becomes a day.

## 2. Severity

Severity decides the clock, so decide it first and revise it later rather than
debating it now.

| | Definition | Declare within | Client told within |
|---|---|---|---|
| **S1** | Client data confirmed or likely exposed, taken or destroyed. Production unavailable with no recovery path. | Immediately | **24 hours** |
| **S2** | A control has failed but no exposure is confirmed — a vulnerability being exploited, a credential leaked, authentication bypassed. | 1 hour | 72 hours |
| **S3** | A weakness found with no evidence of exploitation. A failed backup. A dependency advisory affecting production. | 1 business day | Next scheduled report |

**When in doubt, S1.** Downgrading later costs an apology. Upgrading later costs
the relationship.

## 3. The first hour

In order. Do not skip step 3 to get to step 4 faster.

1. **Write it down.** Open a timestamped log — a file, a message thread, paper.
   Every action, every observation, every decision, with the time in UTC. This
   log is what the client, the Regulator and any insurer will ask for. Memory
   afterwards is not evidence.

2. **Declare and assign.** Severity, incident lead, technical lead. Say it
   explicitly so everyone knows who decides.

3. **Preserve before you fix.** The instinct is to restart the pod. Do not.
   ```bash
   kubectl logs -n okiru-pro <pod> --all-containers --timestamps > incident-<ts>-<pod>.log
   kubectl describe pod -n okiru-pro <pod> > incident-<ts>-<pod>.describe
   kubectl get events -n okiru-pro --sort-by=.lastTimestamp > incident-<ts>-events.log
   kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=20000 > incident-<ts>-ingress.log
   ```
   Container logs die with the container. Once you restart it, what happened is
   gone.

4. **Contain.** Least drastic action that stops the bleeding:

   | Situation | Action |
   |---|---|
   | One account compromised | Reset the password — this also ends every other session for that user |
   | Credential leaked | Rotate it and restart the consumers (see §5) |
   | Attack traffic reaching the app | Tighten the WAF: set `tx.inbound_anomaly_score_threshold=5` in the ingress ConfigMap, or block at Cloudflare |
   | Active exploitation, source unknown | Scale the affected deployment to zero. The platform being down is recoverable; the data leaving is not |

5. **Assess exposure.** The audit trail is the instrument:
   ```
   GET /api/audit/logs?from=<iso>&to=<iso>&organizationId=<org>
   GET /api/audit/integrity?days=30     # seals intact? records unaltered?
   ```
   If `integrity` reports a broken seal or a failed signature, treat the trail
   itself as compromised, say so, and fall back to the container logs — every
   audit event is also written there.

## 4. Telling the client

**For S1, within 24 hours, even when the picture is incomplete.** A partial
notification on day one beats a complete one on day five; the client has their
own 72-hour clock and cannot start it until we start ours.

Say, in this order:

1. What happened, in plain language.
2. **What data was involved** — which categories, which people, roughly how
   many. If you do not know, say you do not know and when you will.
3. When it started, when it was detected, when it was contained.
4. What we have done.
5. What they should do.
6. When the next update comes — and then send it, on time, even if it says
   nothing new.

Do not speculate about cause or blame in the first notification. Do not say "no
evidence of data loss" unless you have looked and can say what you looked at.

## 5. Credential rotation

Every secret in the cluster, with what breaks. Assume anything exposed in a
container image, a log or a repository is compromised whether or not you can
prove it was used.

| Secret | Rotate | Then restart |
|---|---|---|
| `SESSION_SECRET` | Generate 64 random bytes, patch `session-secrets` | web, api — **this signs out every user, which is the point** |
| `AZURE_OPENAI_API_KEY` | `az cognitiveservices account keys regenerate -n okiru-foundry-za -g okiru-pro-rg --key-name key1` | web, api, parser |
| `AZURE_STORAGE_KEY` | `az storage account keys renew -n okirubackups -g okiru-pro-rg --key key1` | api, parser, the backup CronJob |
| `MONGO_INITDB_ROOT_PASSWORD` | Change in MongoDB first, then the secret | mongodb, web, api, compute, parser — in that order |
| ACR pull credentials | `az acr credential renew -n okiruproacr --password-name password` | Recreate `acr-pull-secret` |
| `AUDIT_SIGNING_KEY` | Only if disclosed. **Rotating it invalidates every existing signature**, so seal the current day first and record the changeover date in the drill log |

After any rotation:
```bash
kubectl rollout restart deploy/web deploy/api deploy/parser deploy/compute -n okiru-pro
```

## 6. Recovery

Recovery point is 24 hours and recovery time for the database is under five
minutes, both measured — see `restore-drill-log.md`. Rebuilding the cluster
around it has never been timed and should be assumed to take hours.

```bash
# Prove the backup is good BEFORE destroying anything, in an isolated pod:
kubectl apply -f kubernetes/infrastructure/drills/mongodb-restore-drill.yaml
kubectl logs -n okiru-pro -l app=mongodb-restore-drill -c verify -f
```

Only then restore into production. Restoring from a backup nobody has checked is
how one incident becomes two — a truncated copy would have done exactly that
before 17 September 2026.

## 7. Afterwards

Within five working days of closing an S1 or S2, write up: timeline, root
cause, what detected it, what should have detected it, what changed. One page.

Two rules:

- **No blame.** The truncated backup went unnoticed for weeks because nobody
  tested it, not because anybody was careless. A review that hunts for a person
  gets a worse account of the facts next time.
- **Every review produces at least one change** — a control, a test, an alert
  or a documented decision to accept the risk. A review with no output was a
  meeting.

Record the outcome here and, if it changes what a client was told, reissue the
security disclosure with a new version number.

## 8. This plan is untested

Stated plainly because the disclosure says so and it remains true: **it has been
written but never rehearsed.**

A tabletop exercise — two hours, a made-up S1, the people above in a room
working through §3 — is what turns this from a document into a control. Until
that has happened, a client should be told the plan exists and has not been
tested.

**Due: 17 December 2026**, alongside the quarterly restore drill.
