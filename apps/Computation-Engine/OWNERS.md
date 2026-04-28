# OWNERS — okiru-computation-engine

## Owning team
@okiru/compute

## Maintainers
- @okiru/compute

## Escalation path
1. Slack: #okiru-compute
2. On-call: PagerDuty service "okiru-compute"
3. Engineering manager: @okiru/compute-em

## SLAs
- Security patches:    triage < 24 h, fix < 5 business days (HIGH/CRITICAL)
- Bug reports:         triage < 5 business days
- Feature requests:    quarterly review
- Breaking changes:    14-day consumer notification (see ../../docs/governance/versioning-policy.md)

## Office hours
Wednesdays 10:00 SAST in #okiru-compute.

## Notes
This is an **application**, not a shared component, but it is registered in
the catalog so consumers (the API server) know who to escalate to when the
HTTP contract changes.
