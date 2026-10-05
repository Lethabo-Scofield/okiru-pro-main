# Navigation, access and visual redesign

Status: plan approved 2026-09-17. Phase 1 in progress.

## Context

Consultants at large corporates — the people who use Okiru to measure several client
companies at once — raised four complaints:

1. **The way in is confusing.** There is no "B-BBEE section" and "ESG section". The Hub
   offers *Create Scorecard*, *View Scorecard* and *ESG Toolkit* as three peers, so the
   two products are not visible as products, and the route into each differs.
2. **There is no view of the companies they work with.** They expect to enter a product,
   see their list of client companies, and work from there — including that company's
   documents.
3. **It does not feel corporate.** Their words: "unserious and friendly", they want a
   "banking app" feeling, and it "must not be difficult to navigate".
4. **Role-based access is invisible.** They could not find who can see which company, or
   who can edit which pillar.

Complaint 4 turned out to be worse than reported. The permission system is not merely
hidden — **it is inert**. Pillar scopes are resolved by finding a workspace-bound
assessment for the company (`apps/web/server/routes.ts:2115`), and the only code that
ever writes that binding is `POST /api/assessments/foundation`, reached exclusively from
`/processor` and `/builder`, both of which are super-admin-only routes
(`apps/web/src/App.tsx:249-253`). No company created through the normal create flows is
ever bound to a workspace, so the resolver returns "no restriction" for every real
company. Scopes are recorded at invite time and then never applied.

The outcome we want: two clear products, each with a company list and one identical
create flow; a document library that can be reached; access that is real, visible and
settable per company and per pillar; and a calmer, denser interface.

## Decisions taken

- **Keep the dark theme and the current colours.** The corporate feel comes from
  structure, density, consistency and removing decoration, not from a new palette.
- **Phase 1 is navigation, access and documents. Phase 2 is the visual pass.** Phase 1
  ships on its own.
- **Build per-company access**, not just expose what exists.
- **Authenticated product only.** The marketing site is out of scope.

## Target structure

```
/hub                 Suite home: two product sections, plus Certificates and Documents
├── /bbbee           B-BBEE workspace — the company list      (was /dashboard)
│   └── /bbbee/new   Create scorecard: Choose → Provide → Review
├── /esg             ESG workspace — the company list         (was /esg/clients)
│   └── /esg/new     Create scorecard: Choose → Provide → Review   (was /esg)
├── /documents       Document library, filterable by company  (exists, never linked)
├── /certificates    Certificate Hub
└── /access          People, companies and pillars            (was /workspace)
```

Old paths keep permanent redirects. The one semantic change is `/esg`, which stops
meaning "create" and starts meaning "the ESG workspace", because that is what the
complaint asks for.

## Phase 1 — ten steps, each shippable on its own

**1. Remove dead code, add the route skeleton.** Delete `apps/web/src/pages/Team.tsx`,
`apps/web/Toolkit/src/pages/ClientSelector.tsx` with its gate, the unreachable duplicate
create layout at `apps/web/src/pages/InformationRequest.tsx:795-950`, the Coming Soon
tiles and handler in `HubLanding.tsx`, and `apps/web/src/hooks/useWorkspacePermissions.ts`.
Add the new routes pointing at existing components, plus the redirects. Two tests read
the route table as text and must be updated in the same commit:
`apps/web/src/__tests__/routes.test.ts` and `HubLanding.esg.test.ts`.

**2. A persistent app shell.** Generalise the pattern already shipping in
`apps/web/Toolkit/src/components/layout/` rather than adopting the unused 722-line
`ui/sidebar.tsx`. New `apps/web/src/components/shell/AppShell.tsx`: fixed rail, slim
topbar, breadcrumbs built on the unused `ui/breadcrumb.tsx`, active-company chip,
token pill and account menu. It must mount outside every nested route so paths resolve
absolutely. This makes "back to the Hub" an ordinary link and retires the full page
reload at `Toolkit/.../Topbar.tsx:59` and the two session keys that decide where Back goes.

**3. One product workspace, two instances.** New
`apps/web/src/components/product/ProductWorkspace.tsx` taking `product`, lifted from
`Dashboard.tsx:104-339`. Columns: company, status, score, last activity, your access,
documents, actions. Server work on `GET /api/clients`: filter by product server-side,
add `?summary=1` for a lean projection, derive status from the two workbook collections.
Score needs a new `lastScore` field written on submit; companies not submitted since will
show a blank until next submit.

**4. Wire up the document library.** `ParserDocumentLibrary.tsx` already works and has no
inbound links. Add a rail item, a per-company deep link `/documents?entityId=<id>` from
each workspace row and from the workbook header, and a product column. Fix the silent
misfiling: both create flows fire the filing PATCH without awaiting it, so failures are
invisible. Close the tenancy split where `apps/api/src/routes/documents.ts` is user-scoped
while `parserDocuments.ts` is org-scoped over the same collection.

**5. One shared create flow.** The ESG side already has the right architecture — a real
Choose/Provide/Review machine with a stepper and a review step. Generalise those
components into `apps/web/src/components/create/` and delete the B-BBEE equivalents
(`CompanyPicker`, `SetupShell`, and about 765 lines of `InformationRequest.tsx`). Two
behaviour changes follow, both deliberate: the company is created **last** on both
products, so an abandoned manual start no longer leaves a half-created company; and a
non-template Excel hands over to the document route with a token quote instead of
dead-ending on an error toast.

**6. Bind companies to workspaces and close the fail-open.** Add `workspaceId` to the
client schema, stamp it on create, backfill existing rows with a dry run first. This is
what makes permissions apply at all. Consolidate the five copies of `pillarInScope` into
`apps/web/shared/pillarScopes.ts`. Change the three resolvers to read the new field first,
and make the **error** path deny rather than allow. Trade-off to accept: during a database
blip a collaborator drops to read-only; creators and owners are unaffected.

**7. Per-company access.** Add `clientScopes` to workspace members and invites. Absent or
empty means all companies, so nobody's access changes on day one. It composes with pillar
scopes as a strict AND. Enforce in the client list filter, `loadClientWithAccess`, the
API's `verifyClientAccess`, the workbook resolver and the document library. Add the
missing member PATCH so roles can be changed after invite, and stop an inviter granting
more than they hold.

**8. Make access visible.** Return the access mode from `GET /api/clients/:id/data`
instead of silently emptying arrays. New `/access` page with a members × companies ×
pillars matrix, invites that show the company and pillar controls for every role, and a
roles legend. Out-of-scope pillars are greyed and locked in the sidebar, never hidden,
with a read-only banner and disabled Save. The invite link states the grant before it is
accepted.

**9. One active-company concept.** `apps/web/src/lib/activeCompany.ts` wrapping the two
existing storage keys, so no migration. Put the company in the B-BBEE toolkit URL as ESG
already does, which makes deep links and a company switcher possible.

**10. The Hub becomes two doors.** Rewrite `HubLanding.tsx` down to roughly 250 lines: two
product sections with counts and two actions each, then Certificates and Documents. Remove
the hero photograph, the blur orb, the time-of-day greeting, the gradient cards, the
AI-Verified badges, the pulsing dots and the serif font that was never loaded.

## Phase 2 — the stricter dark pass

Colours unchanged. One type ramp and spacing scale replacing ad-hoc sizes; two corner
radii instead of five; decorative motion removed, keeping only spinners and short opacity
fades; tables instead of cards for records, with right-aligned tabular numbers; one header
component; a copy pass into sentence case; visible focus rings and a command palette for
switching company; and finally de-duplicating the 55 shadcn primitives that exist twice.

## Risks

- Production runs from this branch, so the steps that move users (3 and 5) go behind one
  flag that can be flipped without a rollback.
- The fail-closed change is cheap now because there are effectively no scoped users yet,
  and expensive later. It must land before step 8 creates any.
- The shell must sit outside the nested routers, or links inside the toolkit will resolve
  relative to the toolkit.
- `apps/api` mirrors the web server's authorisation logic, so each enforcement change
  lands twice.
- `GET /api/clients` currently returns whole documents including the large nested arrays,
  and three pages call it on mount. The lean projection must land before a consultant with
  a few hundred companies opens the list.

## Verification

Click through, on the dark theme: sign in, confirm two product sections, enter each one,
see the company list, create a scorecard through all three routes, and confirm both
products look and behave identically apart from wording. Open a company, walk to the
toolkit, confirm breadcrumbs at every depth and that returning to the Hub does not reload
the page. Follow a company's documents link and file an unfiled document. Then invite a
contributor limited to one company and two pillars, and confirm from that account that the
list shows one company, the other pillars are visible but locked, saving is disabled, and a
direct request for another company is refused.

Automated: `pnpm vitest` at the workspace root. The suites that must stay green and will
need edits are the two route tests above, `clientsRoutes.e2e`, `pillarAccess`, `invites`,
`organizationRoutes.e2e`, `scorecardCollaboration`, `parserDocuments` and
`mountOrderAuth`. New suites for client scopes and the shared create flow. Run
`tsc --noEmit` per workspace after steps 5 and 6.
