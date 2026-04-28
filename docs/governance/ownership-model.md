# Ownership Model (COM-003)

Every shared component has exactly one **owning team**. Ownership is recorded
in three enforced places:

1. The package's `OWNERS.md` (canonical, human-readable).
2. The package's `catalog.json` under `owner`.
3. The root `CODEOWNERS` file (GitHub PR-review enforcement).

If any of these disagree, `OWNERS.md` wins and the others MUST be updated
within one business day.

## OWNERS.md template

Every shared component's `OWNERS.md` MUST contain:

```markdown
# OWNERS — <package name>

## Owning team
<team-handle>           e.g. @okiru/platform

## Maintainers (write access, on-call rotation)
- @maintainer-1
- @maintainer-2

## Escalation path
1. Owning team Slack channel: #<team-channel>
2. On-call engineer: PagerDuty service "<service-id>"
3. Engineering manager: @em-handle

## SLAs
- Security patches:    triage < 24 h, fix < 5 business days for HIGH/CRITICAL
- Bug reports:         triage < 5 business days
- Feature requests:    quarterly review
- Breaking changes:    14-day consumer notification (see versioning-policy.md)

## Office hours
<day, time, channel>
```

## Incident handling

When a shared component is implicated in a production incident in any
consuming application:

1. The consuming team opens an incident bridge and pages the package's
   on-call (escalation path step 2 in `OWNERS.md`).
2. The owning team is responsible for either patching the package or
   providing a workaround within the SLA above.
3. A blameless postmortem is filed against the owning team's repo.

## Offboarding & ownership transfer

* If the original owning team is dissolved or transfers a package, both
  teams update `OWNERS.md`, `catalog.json`, and `CODEOWNERS` in the same PR.
* The platform team is the **fallback owner** for any package whose owners
  go unresponsive for > 30 days; it then runs the deprecation process.
