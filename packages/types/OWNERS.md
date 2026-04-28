# OWNERS — @okiru/types

## Owning team
@okiru/platform

## Maintainers
- @okiru/platform
- @okiru/backend (co-maintainer for API-shaped types)

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
This package contains zero runtime code; all changes are type-shape changes.
A change to any exported interface is therefore a MAJOR bump if it is not
purely additive.
