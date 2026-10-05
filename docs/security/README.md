# Security documentation

What a client's IT function is given, and what we work from.

| File | What it is |
|---|---|
| `Okiru_Security_and_POPIA_Disclosure.pdf` | **The client-facing document.** Hosting, encryption, AI and its regions, backups, access control, audit logging, POPIA position, integration, open items and services. Written to be handed over as-is. |
| `security_disclosure.json` | Its content. Edit here, never the PDF. |
| `build_security_disclosure.cjs` | Renders the PDF. `node docs/security/build_security_disclosure.cjs` |
| `restore-drill-log.md` | Every restore rehearsal: what was restored, how long it took, what it found. Recovery objectives come from here. |
| `incident-response-plan.md` | Roles, severity levels, the first hour, notification timings, credential rotation. |
| `waf-tuning.md` | Operating the web application firewall: the threshold and why, reading its log, adding exclusions, turning it off. |

## The rule for the disclosure

**Every statement is read off the running system before it is written down.** Not
from memory, not from intent, not from what a manifest in this repository says
should be true.

A due-diligence reader tests it. They resolve the hostname, ask for a restore,
request the sub-processor list, and check whether the region you claimed is the
region the resource is actually in. One overstatement and the rest of the
document is treated as marketing.

Two things this has already caught:

- The cluster's own `kubectl` context had silently switched to a different
  client's cluster while facts were being gathered. Half a disclosure was nearly
  written about the wrong infrastructure. **Check the context, every time.**
- A claim that there was "no rate limiting on authentication endpoints" was too
  absolute — one did exist, it was just per-process and unreliable. The
  conclusion was right and the description was not. It is corrected in v1.1
  §11 rather than quietly amended.

## The rule for open items

Gaps are listed as plainly as controls, with a risk and a remediation. A reader
who finds an unlisted gap is entitled to assume there are others; a reader who
sees them listed is being given something they can assess.

A control moves out of section 9 when it is **live and verified**, not when the
code is merged.

## Cadence

| | When | Next |
|---|---|---|
| Restore drill | Quarterly, and after any change to the backup job | 17 December 2026 |
| Incident-response tabletop | Annually | 17 December 2026 |
| WAF threshold review | Monthly | 17 October 2026 |
| Disclosure reissue | When a listed item closes or a claim changes | — |
