# Web application firewall — operating notes

Configuration: `kubernetes/infrastructure/base/ingress/ingress-nginx-waf.yaml`

ModSecurity 3.0.12 with the OWASP Core Rule Set 4.4.0, running in the ingress
controller we already had. It is **blocking**, not observing.

## Where the threshold is, and why

The Core Rule Set scores every match. Rule 949110 blocks once the total for a
request passes `tx.inbound_anomaly_score_threshold`. The default is 5, which is
a single critical rule — enough that one unusual but legitimate request gets
turned away.

Ours is **20**. Measured against this deployment on 17 September 2026:

| Probe | Score | At threshold 20 |
|---|---|---|
| Path traversal + OS file access + shell code | 30 | blocked |
| Cross-site scripting (libinjection) | 15–20 | blocked |
| Blind SQL injection in a query parameter | 10 | logged, not blocked |
| Scanner user-agent (nikto) | 5 | logged, not blocked |

So the blatant cases are stopped today and a single marginal match is not. That
is a deliberate trade while nobody has tuned the rule set against this
application: a firewall that turns away a client on its first day gets switched
off, and then there is no firewall at all.

**The number should come down.** Review monthly and move toward 5 as the log
stays quiet. Record each change here with the date and what the log showed.

| Date | Threshold | Reason |
|---|---|---|
| 2026-09-17 | 20 | Initial enablement. No tuning data for this application yet. |

## Reading what it did

```bash
# Rules that fired, most frequent first — this is the tuning input.
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=20000 \
  | grep -o '"ruleId":"[0-9]*"' | sort | uniq -c | sort -rn | head -30

# What was actually blocked.
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=20000 \
  | grep "Inbound Anomaly Score Exceeded"

# One transaction in full, by request id.
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=20000 \
  | grep '<unique_id>'
```

A legitimate request that was blocked looks like a 403 the user reports, with a
matching `Inbound Anomaly Score Exceeded` line naming the rules. That is the
signal to add an exclusion, not to raise the threshold.

## Adding an exclusion

Exclude the narrowest thing that works: one rule on one parameter on one path.
Never a whole rule family, and never a path.

```
SecRule REQUEST_URI "@beginsWith /api/<path>" \
  "id:100NN,phase:2,pass,nolog,ctl:ruleRemoveTargetById=<ruleId>;ARGS:<param>"
```

Rule ids 10000–10999 are reserved for our own rules. 10000 sets the threshold
and 10001–10004 turn off body inspection for the four document-carrying routes.

**No apostrophes anywhere in the snippet.** The controller emits it inside a
single-quoted nginx directive, so one apostrophe — in a comment is enough — ends
the string early and nginx refuses to reload. It fails safe, keeping the last
good configuration, but the change silently does not apply. Check every time:

```bash
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=20 \
  | grep -E "successfully reloaded|emerg"
```

## Turning it off

If the firewall is blocking real traffic and there is no time to find out why:

```bash
kubectl patch cm ingress-nginx-controller -n ingress-nginx \
  --type merge -p '{"data":{"enable-modsecurity":"false"}}'
```

Effective within seconds, no pod restart. Prefer raising the threshold to 100
over switching it off entirely — that keeps the detection log, which is what
tells you what to fix.

## What it does not cover

- **Only what reaches the ingress.** okiru.pro is proxied through Cloudflare,
  which blocks some traffic before we ever see it. Our log is not the whole
  picture of what was attempted.
- **Request bodies on four routes.** `/api/parser`, `/api/excel-import`,
  `/api/workbook` and `/api/esg` carry customer documents and spreadsheet
  content, which generic rules flag constantly. Their URLs, headers and query
  strings are inspected; their bodies are not. All four require an authenticated
  session.
- **Responses.** Response body inspection is off, so the rules that look for
  data leaking outwards do not run.
- **A firewall is not a fix.** Every rule here is a guess about attacks in
  general. The application getting authorisation right is what actually protects
  the data.
