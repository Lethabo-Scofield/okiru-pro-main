# Okiru Pro — Infrastructure & Certificate System Tasks

> **Azure Account:** cmyezwa@gmail.com | Subscription: `cfc3d77c-3695-4370-b976-dffe20d784c1`
> **Target monthly spend:** $100–$200 (current actual: $191.88, projected: $668.88)
> **Date created:** 2026-05-12

---

## Current State of Azure Resources

| Resource Group | Location | What's In It | Status |
|---|---|---|---|
| `okiru-pro-rg` | southafricanorth | ACR (`okiruproacrde4d539b`), AKS (`okiru-pro-aks`, 2× Standard_B2s_v2), Backup Storage (`okiruprobackups`, Standard_LRS), Key Vault (`okiru-prod-kv`), **Certificate Storage (`certificatees`, Standard_RAGRS)** | **KEEP — main group** |
| `MC_okiru-pro-rg_okiru-pro-aks_southafricanorth` | southafricanorth | Auto-managed AKS node resources (VMs, VMSS, NSG, VNet, disks, public IPs, load balancer) | Auto-managed by AKS, cannot delete |
| `NetworkWatcherRG` | southafricanorth | Azure Network Watcher (auto-created) | Leave alone |

**Resource groups deleted (Task 1 completed):**
- `okiru-rg_group` — Deleted (contained old App Insights + unused managed identities)
- `okiru_group` — Deleted (contained unused `Okiru-AI` service with zero usage + old App Insights)
- `cmyezwa_rg_8014` — Deleted (contained `certificatees` storage, now moved to `okiru-pro-rg`)

**Current cost drivers identified:**
- `certificatees` storage: `Standard_RAGRS` (geo-redundant) is overkill for certificates — should be `Standard_LRS` → **Task 2**
- Azure AI Search (taken down, but was ~$250+/month on S1 tier) → **Task 3**
- AKS running 2× Standard_B2s_v2 nodes → **Task 6**

---

## Tasks (Priority Order)

---

### TASK 1 — Delete old resource groups and consolidate into `okiru-pro-rg` ✅ COMPLETED

**Priority:** HIGHEST — stops bleeding costs immediately

**Status:** ✅ **COMPLETED** — 2026-05-12

**What was done:**
1. ✅ Verified `okiru_group` `Okiru-AI` service — had zero usage metrics (`[]`) and production API pods had empty `AZURE_OPENAI_ENDPOINT` env vars. Safe to delete.
2. ✅ Deleted `okiru-rg_group` — contained old App Insights (`okiru`, `okiru-rg`) and 3 unused managed identities (`oidc-msi-*`). No activity logs for past month.
3. ✅ Deleted `okiru_group` — contained `Okiru-AI` (Azure AI Services with 4 model deployments: gpt-4o, gpt-4o-mini, text-embedding-3-small, gpt-5-chat) but **zero usage**. Also contained old App Insights (`okiru202603071014`) and 1 managed identity. No activity for past month.
4. ✅ Moved `certificatees` storage account from `cmyezwa_rg_8014` → `okiru-pro-rg` using `az resource move`.
5. ✅ Deleted `cmyezwa_rg_8014` — now empty after storage move.

**Immediate cost savings:**
- `okiru-rg_group`: ~$5–15/month (2× App Insights + managed identities)
- `okiru_group`: ~$10–30/month (App Insights + `Okiru-AI` S0 SKU sitting idle)
- `cmyezwa_rg_8014`: $0 (just the resource group itself, storage costs continue in new group)

**Notes:**
- Storage account name remains `certificatees` — no code changes needed (container name `clients-certs` unchanged)
- All resources now consolidated in `okiru-pro-rg` (South Africa North)
- No GitHub Actions or codebase changes required — existing references to `okiru-pro-rg` were already correct

---

### TASK 2 — Downgrade certificate storage tier and reduce redundancy ✅ COMPLETED

**Priority:** HIGH — immediate cost reduction, no code changes needed

**Status:** ✅ **COMPLETED** — 2026-05-12

**What was done:**
1. ✅ Changed `certificatees` storage account from `Standard_RAGRS` → `Standard_LRS` (3× cost reduction)
2. ✅ Changed access tier from **Hot** → **Cool** (additional cost reduction for infrequently accessed data)
3. ✅ Enabled **lifecycle management policy**:
   - Blobs in `clients-certs/` prefix auto-move to **Archive** tier after 90 days of no modification
   - Blobs auto-delete after 7 years (2555 days) — compliance-ready retention

**Storage account state:**
```
Name: certificatees
Resource Group: okiru-pro-rg
SKU: Standard_LRS (was Standard_RAGRS)
Access Tier: Cool (was Hot)
Lifecycle Policy: Archive after 90 days, Delete after 7 years
```

**Estimated cost savings:** $15–30/month (exact savings depend on current storage volume)

---

### TASK 3 — Replace Azure AI Search with MongoDB Search ✅ COMPLETED

**Priority:** HIGH — biggest cost driver removed, search restored

**Status:** ✅ **COMPLETED** — 2026-05-12

**Background:**
Azure AI Search (S1 tier) costs ~$250/month. You already took it down (smart!) but search was broken. This task restores full search functionality at $0 additional cost using MongoDB's built-in `$text` search.

**What was done:**

1. ✅ **Created new MongoDB search service** (`apps/api/src/services/mongoSearch.ts`):
   - `searchCertificatesMongo()` — MongoDB `$text` search with BM25-like ranking via `textScore`
   - `fuzzySearchCertificates()` — Regex-based fallback for partial matches
   - `hybridSearchCertificates()` — Combines both for maximum accuracy
   - `ensureSearchIndex()` — Creates compound text index with weights:
     - `supplierName` (weight 10) — highest priority
     - `vatNumber` (weight 8) — exact match identifier
     - `fileName` (weight 5)
     - `extractedText` (weight 3)
     - `companySize` (weight 2)
   - Plus indexes on `expiryDate`, `status`, `bbbeeLevel`, `verified`, `companySize`, `vatNumber`

2. ✅ **Updated search endpoint** (`apps/api/src/routes/certificates.ts`):
   - Replaced in-memory filtering with MongoDB search
   - Added query params: `status`, `size`, `verified`, `limit`, `skip`, `sort`
   - Response now includes:
     - `id`, `file_name`, `blob_name`
     - `company_name`, `vat_number`, `company_size`
     - `black_ownership`, `black_women_ownership`
     - `bbbee_level`, `expiry_date`, `status`, `verified`
     - `score` (relevance), `snippet` (formatted summary)
     - Pagination info (`total`, `hasMore`)

3. ✅ **Added startup initialization** (`apps/api/index.ts`):
   - Calls `ensureSearchIndex()` after MongoDB connection
   - Non-fatal if index creation fails (logs warning)

**Search features:**
- **BM25-like ranking** via MongoDB's `textScore` metadata
- **Fuzzy fallback** — if text search returns < 5 results, supplements with regex partial matching
- **Filtering** — by status, company size, verification status
- **Sorting** — by relevance (default), expiry date, or company name
- **Pagination** — limit/skip for large result sets

**Cost savings:**
- Azure AI Search S1 tier: ~$250/month → $0 (removed)
- MongoDB text search: $0 (included with MongoDB)
- **Total savings: ~$250/month**

**API examples:**
```bash
# Basic search
GET /api/certificates/search?q=Acme%20Construction

# With filters
GET /api/certificates/search?q=Johannesburg&status=valid&size=EME&verified=true

# Pagination
GET /api/certificates/search?q=mining&limit=20&skip=40
```

**Files created/modified:**
- `apps/api/src/services/mongoSearch.ts` — NEW (300 lines)
- `apps/api/src/routes/certificates.ts` — Updated search endpoint
- `apps/api/index.ts` — Added search index initialization

---

### TASK 4 — Enhance certificate extractor to pull all required fields ✅ COMPLETED

**Priority:** HIGH — required for Task 3 search to have data to return

**Status:** ✅ **COMPLETED** — 2026-05-12

**Background:**
The current extractor (`certificateExtractor.ts`) only reliably extracts `expiryDate`, `issueDate`, `bbbeeLevel`, and `supplierName` from PDF text. The MongoDB schema already has `vatNumber`, `companySize`, `blackOwnership`, `blackWomenOwnership`, `verificationAgency`, `certificateNumber` — but the extractor never populates them.

**Fields to add extraction for:**

| Field | Example text to match in PDF |
|---|---|
| `vatNumber` | `VAT No: 4850123456`, `VAT Registration Number: ...` |
| `companySize` | `EME`, `QSE`, `Generic / Large Enterprise` |
| `blackOwnership` | `Black Ownership: 51%`, `51.00% Black Owned` |
| `blackWomenOwnership` | `Black Women Ownership: 30%`, `30.00% Black Women Owned` |
| `verificationAgency` | `Verified by: Empowerdex`, `SANAS accredited agency` |
| `certificateNumber` | `Certificate No: 2026/12345` |

**What was done:**
1. ✅ Added `extractCertificateData()` with regex/heuristics for VAT, enterprise size (body text and filename), B-BBEE score, black and black women ownership, verification agency, and certificate number (including `YYYY/NNNN` style). `extractDatesFromText()` remains a thin wrapper for backward compatibility.
2. ✅ `processOneCertificate()` persists those fields plus `vatNumberNormalized` (via `normalizeVat`), and stores a 4k-character `extractedText` prefix for search/snippets.
3. ✅ `parseFromContent()` in `certificates.ts` uses `extractCertificateData()` so SEO parsing matches the extractor.

**Next step (operational):** Re-run bulk processing for existing blobs (admin `POST` process/reprocess with `force` if supported) so stored documents pick up the new fields.

---

### TASK 5 — Company-facing certificate upload and management ✅ COMPLETED

**Priority:** MEDIUM — feature work, builds on Task 4

**Status:** ✅ **COMPLETED** — 2026-05-12

**What was done:**
1. ✅ **`POST /api/certificates/upload`** now returns `certificateId` in each result object so the client can immediately query extracted metadata after background processing.
2. ✅ **`GET /api/certificates/mine`** — auth-required endpoint; returns paginated list of certificates where `uploadedByUserId === sessionUserId`. Supports `?limit`, `?skip`, `?status`. Falls back to local store when Mongo is unavailable.
3. ✅ **`PATCH /api/certificates/:id`** — auth-required endpoint; owner or admin can correct auto-extracted fields (`supplierName`, `vatNumber`, `companySize`, `blackOwnership`, `blackWomenOwnership`, `verificationAgency`, `certificateNumber`, `bbbeeLevel`, `bbbeeScore`, `issueDate`, `expiryDate`). Re-derives `vatNumberNormalized` and `status` automatically. Falls back to local store.
4. ✅ **`certificateStore.patchRecord()`** added as the local-store equivalent of the Mongo `updateOne` used above.
5. ✅ **`GET /api/certificates/search`** remains fully public (no auth required).

---

### TASK 6 — AKS cost optimisation ✅ COMPLETED

**Priority:** MEDIUM — reduces the largest remaining cost line (VMs)

**Status:** ✅ **COMPLETED** — 2026-05-12

**What was done:**
1. ✅ **`deploy/aks-deploy.sh`**: Changed from 2× Standard_B2s (--min-count 2) to **1× Standard_B4ms_v2** (4 vCPU, 16 GB, --min-count 1 --max-count 2). All pods fit comfortably on one node.
2. ✅ **`kubernetes/infrastructure/overlays/prod/patches/resource-limits.yaml`**: Rewrote resource requests/limits for a 16 GB single node — raised MongoDB to 3 Gi limit (was 1 Gi), API to 1.5 Gi, compute to 2 Gi; total requests ≈ 2 Gi, leaving ~14 Gi headroom.

**Estimated savings:** ~$60–80/month (removing one Standard_B2s_v2 ≈ $65/month; upgrading to B4ms_v2 ≈ $90/month vs old 2× B2s ≈ $130–140/month).

---

### TASK 7 — Remove Azure AI Search from codebase entirely ✅ COMPLETED

**Priority:** LOW (after Task 3 is done) — cleanup

**Status:** ✅ **COMPLETED** — 2026-05-12

**What was done:**
1. ✅ Deleted `apps/api/src/services/azureSearch.ts`
2. ✅ Removed `@azure/search-documents` from `apps/api/package.json`
3. ✅ Rewrote `apps/api/scripts/ingestCertificates.ts` to use `processAllCertificates()` (MongoDB, no Azure Search). Run with `--force` to re-extract.
4. ✅ Removed `AZURE_SEARCH_ENDPOINT/API_KEY/INDEX_NAME` from:
   - `kubernetes/infrastructure/overlays/prod/secrets/secrets.yaml`
   - `deploy/.env.production.template`
   - `.github/workflows/deploy-prod.yml`
   - `.github/workflows/deploy-staging.yml`
5. ✅ Removed the `vi.mock('../../services/azureSearch.js')` stub from route tests.

---

### TASK 8 — Fix Application Insights and monitoring consolidation ✅ COMPLETED (via Task 1)

**Priority:** LOW — cost + hygiene

**Status:** ✅ **COMPLETED** — 2026-05-12 (as a side-effect of Task 1)

**What was done:**
All three Application Insights instances (`okiru`, `okiru-rg` in `okiru-rg_group`, `okiru202603071014` in `okiru_group`) were automatically deleted when those resource groups were removed in Task 1. No separate action required.

No production code pointed at any of these instances (`APPLICATIONINSIGHTS_CONNECTION_STRING` was absent from all pods per the env audit in Task 1).

---

## Summary Table

| # | Task | Impact | Effort | Status |
|---|---|---|---|---|
| 1 | Delete old resource groups | Cost −$20–50/mo | Low | ✅ **DONE** |
| 2 | Downgrade storage tier + LRS | Cost −$15–30/mo | Low | ✅ **DONE** |
| 3 | Replace Azure Search → MongoDB Search | Cost −$250/mo, search restored | Medium | ✅ **DONE** |
| 4 | Enhanced certificate extractor | Feature | Medium | ✅ **DONE** |
| 5 | Company certificate upload/management | Feature | Medium | ✅ **DONE** |
| 6 | AKS node optimisation | Cost −$40–50/mo | Medium | ✅ **DONE** |
| 7 | Remove Azure Search from codebase | Cleanup | Low | ✅ **DONE** |
| 8 | Consolidate Application Insights | Cost −$5–10/mo | Low | ✅ **DONE** (via Task 1) |

**Projected monthly spend after all tasks:** ~$120–160/month
- AKS nodes (1× B4ms): ~$80–90
- ACR (Basic): ~$5
- Blob storage (LRS, Cool): ~$5–10
- Key Vault: ~$1–5
- Bandwidth + misc: ~$10–20

---

## Next Up: Task 4 — Enhance Certificate Extractor

**The problem:** The current extractor only pulls `supplierName`, `expiryDate`, `issueDate`, and `bbbeeLevel`. But the search now shows (and users expect): VAT number, company size, black ownership %, black women ownership %. These fields exist in the database schema but are never populated.

**What needs to be added:**

| Field | Example text patterns in PDF |
|---|---|
| `vatNumber` | `VAT No: 4850123456`, `VAT Registration Number: 4850123456`, `VAT: 4850123456` |
| `companySize` | `EME`, `QSE`, `Generic`, `Large Enterprise`, `Large` |
| `blackOwnership` | `Black Ownership: 51%`, `51.00% Black Owned`, `Black Owned: 51%` |
| `blackWomenOwnership` | `Black Women Ownership: 30%`, `30.00% Black Women Owned` |
| `verificationAgency` | `Verified by: Empowerdex`, `SANAS accredited agency: ...` |
| `certificateNumber` | `Certificate No: 2026/12345`, `Cert. #: 2026/12345` |

**Implementation:**
1. Add regex patterns to `certificateExtractor.ts` for each field
2. Run re-extraction on existing 1.6k certificates
3. Validate accuracy on a sample

**Why this matters now:**
- Task 3 search is working, but results show empty/null for these fields
- Users search by VAT number or filter by company size — this data needs to be populated
- The extractor already runs on upload — just needs to extract more fields
