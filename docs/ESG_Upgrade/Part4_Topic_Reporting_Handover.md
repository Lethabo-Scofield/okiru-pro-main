# Part 4 — Report by Topic: developer handover

**What this covers:** a new reporting-scope path added to `Okiru_ESG_Toolkit_v6_with_topic_reporting.html`, alongside the existing framework-based setup. This document explains *why* it exists, *how* it's wired into the existing codebase, what was tested, and what's still open for you to decide.

---

## 1. The problem this solves

The original toolkit's setup flow assumed every user is reporting against a named standard (GRI, SASB, IFRS S1/S2, King IV, B-BBEE, etc.). That's true for mandatory reporters, but not for everyone. Some organisations want to report on sustainability topics because they consider it the right thing to do — not because a regulator or a client contract requires a specific framework.

Forcing that second group through a framework-selection screen means asking them to understand disclosure codes and compliance regimes they have no reason to care about. Part 4 gives them a second path: pick plain-language topics (Climate change, Human capital, Corporate governance, etc.) instead of standards, and get a report that reads like a sustainability report, not a compliance filing.

**Design principle:** this is *not* a parallel system bolted onto the toolkit. It reuses the exact bucket/theme taxonomy that already existed (the same ids that drive the sidebar, the Disclosure Map, and the scoring engine). A "topic" in the new picker and a "bucket" in the original code are the same thing. This matters for you as the next developer — there is one tagging system, with two entry points into it.

---

## 2. What the user sees

**Setup screen, step 3 (new):** a two-button toggle — *"By framework / standard"* vs *"By topic"*.

- **By framework / standard** — unchanged original behaviour. Framework chip grid, GHG Protocol locked on as core.
- **By topic** — shows a picker grouped into three pillar cards (Environmental, Social, Governance), each containing toggle chips for its subtopics. A live counter reads "*8 of 10 topics selected — you're not committing to any named standard.*"

**Once confirmed, in topic mode:**
- The sidebar only lists the topics that were selected. Deselected topics disappear from navigation entirely.
- The "Frameworks" page is hidden outright — it's inherently about naming a standard, which a topic-only reporter has opted out of.
- E/S/G scores, the Disclosure Map, and ranked action items are all calculated only from the selected topics.
- The exported Word report drops the "Reporting frameworks" section and any disclosure codes, replaces it with a plain "Topics covered in this report" list grouped by pillar, and adds an explanatory line that the report is voluntary and topic-organised.

Framework mode is completely untouched — every existing behaviour, screen, and report section works exactly as it did before this change.

---

## 3. State additions

Two new fields on the existing `state` object (found near the top of the script, right after `selectedFrameworks`):

```js
reportMode: "framework",   // "framework" | "topic"
selectedTopics: ["climate","water","waste","env-opp","human","product",
                 "stakeholder","social-opp","corp-gov","corp-behaviour"]
```

`selectedTopics` defaults to **all ten buckets selected**. The product decision here: comprehensive by default, the user opts *out* of a topic rather than opting *in* — consistent with how the framework grid pre-selects a recommended set rather than starting blank.

A new config array, `topicPillars`, defines the picker's grouping and labels:

```js
const topicPillars = [
  {pillar:"e", label:"Environmental pillar", color:"var(--e-color)", topics:[
    {id:"climate", label:"Climate change"},
    {id:"water", label:"Natural resources"},
    {id:"waste", label:"Pollution & waste"},
    {id:"env-opp", label:"Environmental opportunity"}
  ]},
  {pillar:"s", label:"Social pillar", color:"var(--s-color)", topics:[
    {id:"human", label:"Human capital"},
    {id:"product", label:"Product safety & quality"},
    {id:"stakeholder", label:"Stakeholder opposition"},
    {id:"social-opp", label:"Social opportunity"}
  ]},
  {pillar:"g", label:"Governance pillar", color:"var(--g-color)", topics:[
    {id:"corp-gov", label:"Corporate governance"},
    {id:"corp-behaviour", label:"Corporate behaviour"}
  ]}
];
```

Every `id` here is an existing bucket id already used throughout `themes_transport`, `themes_ict`, `themes_finserv`, `themes_mining`, `bucketFrameworks`, `bucketSheetKeys`, and `navTree`. Nothing new was introduced at the data level — this array is purely a display grouping for the setup screen.

---

## 4. The one function everything else reads through

```js
function scopedThemes(){
  if(state.reportMode !== "topic") return themes;
  return themes.filter(t => state.selectedTopics.includes(t.bucket));
}
```

This is the single point of truth for "what's currently in scope." In framework mode it's a no-op (returns the full theme list, exactly as before). In topic mode it filters to only the selected buckets.

**Every place that used to read the global `themes` array directly and needed to respect scoping now calls `scopedThemes()` instead:**

| Function | What changed |
|---|---|
| `computePillarScore()` | Filters `scopedThemes()` by pillar before averaging — so E/S/G scores only reflect selected topics in topic mode |
| `rankedActionItems()` | Iterates `scopedThemes()` instead of `themes` — action items from deselected topics won't appear |
| `renderDisclosureMap()` | Builds the theme-head row and issue-tile grid from `scopedThemes()` |
| `buildReportBlob()` | Filters the E/S/G report sections through `scopedThemes()` |

Nothing else in the calculation engine (GHG maths, metric rollups, the setup/sector initialisation) was touched — this is deliberately a thin filtering layer on top of existing logic, not a rewrite of it.

---

## 5. Setup screen wiring

Two new functions, added next to the existing `populateSetupUI()`:

```js
function setReportMode(mode){
  state.reportMode = mode;
  document.getElementById("mode-framework-btn").className = "btn mode-btn" + (mode==="framework" ? "" : " secondary");
  document.getElementById("mode-topic-btn").className = "btn mode-btn" + (mode==="topic" ? "" : " secondary");
  document.getElementById("setup-fw-section").style.display = mode==="framework" ? "block" : "none";
  document.getElementById("setup-topic-section").style.display = mode==="topic" ? "block" : "none";
}

function renderTopicGrid(){
  // renders topicPillars into #setup-topic-grid, wires each chip's onclick
  // to toggle membership in state.selectedTopics, re-renders on every click
}
```

`renderTopicGrid()` is called at the end of `populateSetupUI()`, so the topic grid stays in sync any time the setup screen is (re)opened — including if the user reopens Setup later via the existing `openSetup()` function.

The corresponding markup lives in the `#setup-overlay` block: a `.row` with the two toggle buttons, followed by two sibling containers — `#setup-fw-section` and `#setup-topic-section` — where only one is visible at a time based on `reportMode`.

---

## 6. Navigation filtering

```js
function itemInScope(id){
  if(state.reportMode !== "topic") return true;
  if(id === "frameworks") return false;
  const bucket = id === "levers" ? "climate" : id;
  const isBucketItem = topicPillars.some(pg => pg.topics.some(t=>t.id===bucket));
  if(!isBucketItem) return true;
  return state.selectedTopics.includes(bucket);
}
```

`buildNav()` now calls `itemInScope(id)` before rendering each top-level and grouped nav item. Logic:

- **Non-bucket pages** (Overview, Import data, Action plan, Milestones, Export report) are never topic-specific, so they always show.
- **`frameworks`** is hidden unconditionally in topic mode.
- **`levers`** (net-zero levers) is tied to the `climate` bucket, since levers only make sense once climate is in scope.
- **Everything else** shows only if its bucket id is in `state.selectedTopics`.

`buildNav()` is called once at initial script load (for the framework-mode default) and again inside `confirmSetup()`, so the sidebar reflects whatever was chosen on the setup screen by the time the user lands in the app.

---

## 7. Report generator changes

Inside `buildReportBlob()`, a single flag drives every downstream difference:

```js
const topicOnly = state.reportMode === "topic";
```

Effects:
1. **Title:** "Sustainability Report" instead of "ESG / Sustainability Report"
2. **About this report:** an extra paragraph explaining the report is topic-organised and voluntary
3. **E/S/G sections:** built from `scopedThemes()` instead of the full `themes` list; a pillar section is skipped entirely if it has no in-scope themes
4. **Closing section:** "Topics covered in this report" (a plain list grouped by pillar, no codes) replaces "Reporting frameworks" (which cited framework names and notes)

Everything else in the report — executive summary, materiality/risk register, action plan, external ratings — is generated identically regardless of mode, since none of that content is framework-specific to begin with.

---

## 8. What was actually tested

This was not just reviewed as code — it was run in a real headless Chromium instance (Playwright) against the actual file, end to end:

1. Loaded the toolkit, selected the Transport sector
2. Switched to "By topic" mode
3. Deselected two topics (Product safety & quality, Corporate behaviour)
4. Confirmed the live counter updated correctly ("8 of 10 topics selected...")
5. Clicked "Start measuring" and verified the sidebar showed only the 8 selected topics, with "Frameworks" absent and "Climate change" (a selected topic) present
6. Navigated to the report page and called `buildReportBlob()` directly in-page, captured the resulting bytes, and rendered the actual generated `.docx` to images
7. Confirmed in the rendered report: the topic-mode intro paragraph appeared, the Social pillar section correctly omitted "Product safety & quality," the Governance pillar section correctly omitted "Corporate behaviour," and the closing table listed only the 8 selected topics grouped by pillar with no disclosure codes anywhere

No console errors were introduced by this change (two pre-existing 403s from an external font/resource request appear in both the original and modified file, unrelated to this feature).

---

## 9. Known limitations / decisions still open for you

- **No persistence.** Like the rest of this toolkit, `reportMode` and `selectedTopics` live only in the in-memory `state` object and reset on page reload. If/when this becomes a real multi-tenant backend, these two fields need to be persisted per account alongside `sectorId`, `region`, and `selectedFrameworks`.
- **No mid-stream mode switching.** Reopening Setup lets the user flip between framework/topic mode and re-render both grids, but switching *after* data has been entered doesn't do anything special with data already captured against the other mode — it will just change what's visible and what's scored going forward. Worth deciding whether switching modes later should preserve, hide, or explicitly ask about previously entered data for topics no longer in scope.
- **No "upgrade path" from topic to framework.** If a topic-only reporter later needs to satisfy a named standard (e.g. a client demands CSRD alignment), there's currently no diffing logic that says "you're already collecting 80% of what CSRD needs, here's the gap." That's a natural next feature, using the same `standardsMap` cross-reference table that already powers `badgesFromRows()`.
- **Cross-cutting standards tile** ("General requirements" / "General disclosures" at the top of the Disclosure Map) is hidden entirely in topic mode rather than adapted, since its language ("materiality basis," "board oversight of ESG") is inherently framework-flavoured. If you want a topic-mode equivalent, it would need its own plain-language rewrite rather than reuse.

---

## 10. File manifest

| File | Contents |
|---|---|
| `Okiru_ESG_Toolkit_v6_with_topic_reporting.html` | The full toolkit, original functionality intact, Part 4 added |
| `Part4_Topic_Reporting_Handover.md` | This document |

All Part 4 code is additive and clearly commented in-line with `/* Part 4 — ... */` markers, so searching the file for `Part 4` will surface every change in context.
