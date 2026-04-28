# OWNERS — @okiru/logger

## Owning team
@okiru/platform

## Maintainers
- @okiru/platform

## Escalation path
1. Slack: #okiru-platform
2. On-call: PagerDuty service "okiru-platform"
3. Engineering manager: @okiru/platform-em

## SLAs
- Security patches:    triage < 24 h, fix < 5 business days (HIGH/CRITICAL)
- Bug reports:         triage < 5 business days
- Feature requests:    quarterly review
- Breaking changes:    14-day consumer notification (see ../../docs/governance/versioning-policy.md)

## Office hours
Tuesdays 14:00 SAST in #okiru-platform.

## Notes
The logger's **wire format** (the JSON envelope shipped to log aggregators) is
considered part of the public API. Any change to the field set, types, or
ordering rules requires a MAJOR bump and a `MIGRATION-vX.md`.
