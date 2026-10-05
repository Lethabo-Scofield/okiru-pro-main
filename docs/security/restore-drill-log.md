# Restore drill log

A backup nobody has restored is a claim, not a control. This file records every
rehearsal: what was restored, from which copy, how long it took, and what it
found. Recovery objectives are derived from these numbers rather than asserted.

Run a drill with:

```bash
kubectl apply -f kubernetes/infrastructure/drills/mongodb-restore-drill.yaml
kubectl logs -n okiru-pro -l app=mongodb-restore-drill -c verify -f
```

The drill restores the **off-cluster** copy — the one in blob storage — because
that is what survives the loss of the cluster. It restores into a private mongod
inside its own pod on an emptyDir and never connects to the production database.

**Cadence: quarterly, and after any change to the backup job.** Next due
**17 December 2026.**

---

## 17 September 2026 — first drill

Two runs, because the first one failed and the reason mattered.

### Run 1 — FAILED

| | |
|---|---|
| Source | `mongodb-backups/20260917-020020` (nightly, 02:00 SAST) |
| Result | **Failed.** `okiru.documents`: `reading bson input: unexpected EOF` |
| Restored | 68 of 139 documents in that collection; 30 collections |

**Finding: every off-cluster backup was truncated, and had been for its whole
history.**

The dump on the backup disk was complete. The copy in blob storage was not:

| | on disk | in blob storage |
|---|---|---|
| `documents.bson.gz` | 66,302,543 bytes, written 02:00:30 | 37,923,821 bytes, uploaded 02:00:28 |

The copy was uploaded two seconds before the file it was copying finished being
written.

**Cause.** In the backup CronJob, `mongodump` and `azure-sync` were both entries
under `containers:`. Kubernetes starts every container in a pod at the same
time, so the sync container selected "the newest dated directory" and began
uploading while the dump was still writing into it. `--validate-content` did not
catch it: it verifies that the bytes sent arrived intact, not that they were all
of the file.

Every night in the retention window showed the same signature — a `documents`
dump of 37–39 MB against a true size of 66 MB, from 6 September onwards.

**Fix** (`kubernetes/infrastructure/base/backups/mongodb-backup.yaml`):

1. `mongodump` is now an **initContainer**, so it runs to completion before the
   sync container starts. Kubernetes guarantees that ordering; two containers in
   `containers:` never did.
2. The dump writes a `COMPLETE` marker as its last act, and the sync refuses to
   upload any directory without one.
3. The dump writes a `manifest.txt` of file sizes, and after uploading, the sync
   compares every blob's length against it and fails the job on any mismatch.

Two independent checks, because this failed silently for an unknown length of
time and nothing noticed.

### Run 2 — PASSED

| | |
|---|---|
| Source | `mongodb-backups/20260917-111445` (first backup taken by the corrected job) |
| Download | ~30 seconds |
| **Restore** | **8 seconds** |
| Restored | **48 collections, 17,835 documents, 0 failures** |

Reconciled against production, counted the same morning:

| Collection | Production | Restored |
|---|---|---|
| `documents` | 139 | **139** |
| `certificate_metadata` | 2,955 | 2,955 |
| `auditLogs` | 222 | 222 |
| `users` | 21 | 21 |
| `clients` | 24 | 24 |
| `workbooks` | 19 | 19 |
| `esg_workbooks` | 14 | 14 |
| `workspaces` | 8 | 8 |
| `certificate_events` | 13,888 | 13,890 |

Collection count matches exactly. `certificate_events` is two ahead of the
production figure because the backup was taken twenty minutes after production
was counted — the platform was in use.

---

## Recovery objectives

Measured, not estimated. These are for the database only; a full recovery also
needs a cluster, which is covered below.

| | Position |
|---|---|
| **Recovery point objective** | **24 hours.** Backups are nightly at 02:00 SAST. Work done between the last backup and an incident is lost. |
| **Recovery time objective (database)** | **Under 5 minutes** measured: ~30 s to retrieve, 8 s to restore, the rest process. |
| **Recovery time objective (full platform)** | **Not yet measured.** Restoring the data is the fast part. Rebuilding the cluster, ingress, certificates and secrets has never been timed, and on a single node with no infrastructure-as-code apply path it should be assumed to take hours, not minutes. |

**The 24-hour recovery point is a decision, not a limit.** Point-in-time recovery
needs either a replica set with an oplog or a managed database with continuous
backup. Both are in section 10 of the security disclosure. Until one is in place,
a client should be told 24 hours, in writing.

## What a drill still does not prove

Stated so nobody reads a pass here as more than it is.

- **Only the database.** Blob storage — uploaded documents and certificates — is
  not covered by this drill and has no tested restore.
- **Only the newest backup.** An older one could be corrupt without this
  noticing. The drill should periodically be pointed at the oldest backup in the
  retention window instead.
- **Not a failover.** It proves the data can be recovered, not that the platform
  can be stood up again around it.
