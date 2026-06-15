# Okiru ESG Intelligence Toolkit — Front End

**Layer:** UI Architecture · Navigation · Page Inventory · Design System · Component Library  
**Client:** SG Consumer (SuperGroup SG Consumer Pty Ltd)  
**Period:** FY 2025/26 · Jul-25 to Mar-26 · 9 months YTD  
**Version:** v1.7 · Last updated: June 2026

---

## 1. Architecture

The toolkit is a single HTML file (~148KB). There is no build step, no npm, no external CDN dependencies. Everything — HTML structure, CSS, JavaScript, and data — is embedded in one file.

**Runtime:**
- Browser-only (tested: Chrome, Edge, Safari, Firefox)
- Minimum viewport: 768px wide for full layout; responsive fallback at ≤720px collapses nav
- No cookies, no localStorage, no sessionStorage — state is in-memory only
- No analytics, no telemetry

**Technology:**
- HTML5 semantic markup
- CSS custom properties (variables) — no preprocessor
- `backdrop-filter: blur()` for glass morphism — requires Chromium 76+ or Safari 9+
- Vanilla ES6 JavaScript — no frameworks, no transpiler

---

## 2. Visual design system

### Colour tokens

All colours are defined as CSS custom properties on `:root`. The dark glass aesthetic mirrors the Okiru brand.

```css
--bg:     #080e14   /* Deep navy — page background */
--bg2:    #0c1520   /* Slightly lighter — card fills at rest */
--text:   #f0ede8   /* Off-white — primary text */
--t2:     #8a9aaa   /* Mid grey — secondary text, labels */
--t3:     #4a5a6a   /* Dark grey — muted text, hints, nav section headings */
```

**Accent palette — ESG pillar colours:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--e` | `#1de9a0` | Environmental — all E pillar elements |
| `--s` | `#f5a623` | Social — all S pillar elements |
| `--g` | `#9b6bff` | Governance — all G pillar elements |
| `--r` | `#ff5f5f` | Red — errors, warnings, critical actions |
| `--b` | `#4aa8ff` | Blue — import/data tab, neutral info |
| `--pu` | `#e040fb` | Purple — carbon credits, offsets |

**Glass surface system:**

| Property | Value | Usage |
|----------|-------|-------|
| `--gl` | `rgba(255,255,255,0.04)` | Card background at rest |
| `--gl-h` | `rgba(255,255,255,0.07)` | Card on hover |
| `--bd` | `rgba(255,255,255,0.09)` | Border at rest |
| `--bd-h` | `rgba(255,255,255,0.18)` | Border on hover / focus |

**Glass class:**
```css
.gl {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 14px;
}
```

### Background gradient

Three radial gradients applied to `body` create the ambient lighting effect:
- Top-left: teal (E accent, 7% opacity) — Environmental association
- Bottom-right: purple (G accent, 8% opacity) — Governance association
- Centre: amber (S accent, 3% opacity) — Social association

### Typography

```css
font-family: -apple-system, 'SF Pro Display', 'Segoe UI', sans-serif;
```

| Use | Size | Weight | Treatment |
|-----|------|--------|-----------|
| Page heading | 24px | 600 | Letter-spacing −0.02em |
| Score hero | 48px | 700 | Letter-spacing −0.03em |
| Pillar card score | 44px | 700 | |
| KPI value | 22px | 700 | Letter-spacing −0.02em |
| Nav pillar button | 12px | 500 | |
| Nav sub-button | 11px | 400 | |
| Nav section label | 8px | 700 | Uppercase, 0.14em tracking |
| Card title | 9px | 700 | Uppercase, 0.1em tracking |
| Eyebrow | 9px | 700 | Uppercase, 0.14em tracking |
| Body text | 12–13px | 400 | |
| Note / hint | 10–11px | 400 | colour: `var(--t3)` |
| Numbers in tables | 12px | varies | `font-variant-numeric: tabular-nums` |

### Scoring colour bands

Used consistently for all progress bars, KPI values, score heroes, and trend arrows:

| Range | Colour | Meaning |
|-------|--------|---------|
| ≥70% | `var(--e)` — teal | Good / on target |
| 40–69% | `var(--s)` — amber | At risk / needs improvement |
| <40% | `var(--r)` — red | Critical / significant gap |

Applied via:
```js
function col(p) {
  return p >= 0.70 ? 'var(--e)' : p >= 0.40 ? 'var(--s)' : 'var(--r)';
}
```

---

## 3. Layout structure

```
┌──────────────────────────────────────────────────┐
│  HEADER (52px fixed)                             │
│  Brand · Overall ESG score · Stance toggle       │
├───────────┬──────────────────────────────────────┤
│           │                                      │
│  LEFT NAV │  MAIN CONTENT                        │
│  (220px)  │  (flex-1, scrollable)                │
│           │                                      │
│  Sections │  #pc — page content injected here    │
│  + badges │                                      │
│           │                                      │
└───────────┴──────────────────────────────────────┘
                          ┌────────────────────┐
                          │  ⟲ Prior period    │  ← fixed bottom-right
                          └────────────────────┘
```

The main content area (`div#pc`) is the single render target. Every navigation action replaces `innerHTML` of `#pc` entirely. There is no page routing, no history API, no scroll restoration.

---

## 4. Navigation

### Header (`<header class="hdr">`)

| Element | ID | Content | Updates on |
|---------|-----|---------|------------|
| Brand wordmark | — | "OkiRU Consulting · ESG Intelligence Toolkit · SG Consumer · FY25/26" | Static |
| Overall score | `#ov-big` | `72%` — coloured by score band | Every `recalc()` |
| Rating badge | `#ov-rat` | `GOOD` — coloured, bordered | Every `recalc()` |
| Stance toggle | `.sb-row` | Lean / Standard / Strict | User click |

### Left navigation (`<nav class="nav">`)

Structured in sections. Each section has a section label and one or more buttons.

**Sections and buttons:**

```
Overview
  [Dashboard icon]        Dashboard        [overall %]
  [waveform icon]         Analytics
  [layers icon]           Net-Zero Roadmap
  [clock icon]            Carbon Credits   [tCO₂e held]
────────────────────────────
Environmental
  [leaf icon]             E Dashboard      [E %]
    [bars icon]           GHG Emissions    [pts/33]
    [bolt icon]           Energy           [pts/18]
    [truck icon]          Fleet            [pts/18]
    [bin icon]            Waste            [pts/12]
    [droplet icon]        Water            [pts/7]
    [checkmark icon]      ISO 14001        [pts/20]
────────────────────────────
Social
  [people icon]           S Dashboard      [S %]
    [table icon]          Management Control [pts/19]
    [document icon]       WSP / ATR        [pts/20]
    [shield icon]         Health & Safety  [pts/25]
    [heart icon]          Community / CSI  [pts/20]
────────────────────────────
Governance
  [house icon]            G Dashboard      [G %]
    [person icon]         Board Composition [pts/6]
    [star icon]           King V           [pts/35]
    [info icon]           IFRS S1/S2       [pts/15]
    [warning icon]        GARP / ERM       [pts/13]
    [globe icon]          Ethics & Compliance [pts/32]
────────────────────────────
Data & Reporting
  [download icon]         Data Import      [fields/total]
  [coin icon]             Carbon Credits   [tCO₂e]
```

**Button classes:**

| Class | Description |
|-------|-------------|
| `.nb` | Main pillar / section button (14px icon + label + score badge) |
| `.nb.on` | Active state — left border colour = pillar accent, faint accent background |
| `.nb.sp` | Social pillar override — amber active state |
| `.nb.gp` | Governance pillar override — purple active state |
| `.nb.bp` | Blue active state (data/import) |
| `.nb.pp` | Purple active state (credits) |
| `.nsub` | Sub-page button — indented 28px, smaller text |
| `.nsub.on` | Active — subtle background, white left border |
| `.nsc` | Score badge span on pillar buttons |
| `.nsc2` | Score badge span on sub-buttons |

**Nav score badges** update on every `recalc()` call:
- Pillar buttons: percentage (e.g. `63%`)
- Sub-page buttons: points/max (e.g. `24/33`)
- Data Import: fields loaded / total (e.g. `15/21`)
- Carbon Credits: verified tCO₂e held

**Active state logic:**
```js
function go(page) {
  // Remove all .on classes
  document.querySelectorAll('.nb,.nsub').forEach(b => b.classList.remove('on'));
  // Find matching button by onclick attribute
  const btn = document.querySelector(`[onclick="go('${page}')"]`);
  if (btn) {
    btn.classList.add('on');
    // Walk backwards to highlight parent pillar button
    if (btn.classList.contains('nsub')) {
      let parent = btn.previousElementSibling;
      while (parent && !parent.classList.contains('nb')) parent = parent.previousElementSibling;
      if (parent) parent.classList.add('on');
    }
  }
  renderPage(page, calcAll());
}
```

### Icons

All navigation icons are inline SVG, drawn from Feather Icons line vocabulary. They are monochrome (stroke, no fill), using `currentColor` so they inherit the button's text colour.

| Nav section | Icon path |
|-------------|-----------|
| Dashboard | 2×2 rectangle grid |
| Analytics | Pulse/waveform line |
| Net-Zero | Stack of layers |
| GHG Emissions | Two-column bars |
| Energy | Lightning bolt polygon |
| Fleet | Delivery truck outline |
| Waste | Trash bin with lines |
| Water | Raindrop / water drop |
| ISO 14001 | Rounded square with checkmark |
| Management Control | Calendar grid |
| WSP / ATR | Open book |
| Health & Safety | Shield outline |
| Community / CSI | Heart outline |
| Board | Person silhouette |
| King V | 5-pointed star |
| IFRS S1/S2 | Circle with 'i' |
| GARP / ERM | Triangle warning |
| Ethics & Compliance | Globe outline |
| Data Import | Arrow down to line |
| Carbon Credits | Circle with arrow |

---

## 5. Page inventory

### Overview dashboard (`overview`)

**Purpose:** Landing page. Summary position, priority actions, net-zero timeline, report readiness.

**Sections:**
1. Score headline — overall ESG % large, three pillar cards (clickable)
2. 6-tile KPI row — GHG YTD, Net GHG, RE%, MC Score, Credits held, Data coverage
3. Two-column layout:
   - Left: Pillar breakdown bars + Priority action list (dynamically built from `getAllGaps(sc)`)
   - Right: Next steps list + Net-zero timeline (4 milestones) + Report readiness checklist
4. GHG trend sparklines (4 series: Fleet diesel, Electricity, Water, Solar offset)

**Action list logic** (`getAllGaps(sc)`) — returns items sorted by points available:
- EEA2 headcount not entered → 17 pts
- WSP not submitted → 10 pts
- Solar kWh = 0 → 8 pts
- LTIFR null → 8 pts
- ESG remuneration = false → 5 pts
- External assurance = false → 5 pts
- Prior year Scope 1+2 = 0 → 10 pts
- NPAT = 0 → 5 pts

### Analytics (`analytics`)

**Purpose:** Trend charts, scope breakdown, sustainability report data extract.

**Sections:**
1. 5 KPI tiles — total GHG, net GHG, carbon tax, RE%, data periods
2. Monthly GHG bar chart (Scope 1+2+3 combined)
3. Two charts side by side — Scope 1 vs Scope 2 stacked, Fleet diesel monthly, Electricity monthly
4. Sustainability report data extract table — 17 rows covering GRI 305, 302, 303, 306, IFRS S2, B-BBEE, SDL

**Chart component** — pure CSS/HTML bars, no chart library:
```js
function barChart(data, labels, accentColour, maxValue) {
  // Returns HTML with .bc-bar divs sized by percentage of maxValue
  // ::before pseudo-element = value label above bar
  // ::after pseudo-element = month label below bar
}
```

### Net-Zero Roadmap (`netzero`)

**Purpose:** SBTi CNZS 2.0 pathway, milestone bands, reduction trajectory, carbon tax, lever analysis.

**Sections:**
1. Score hero — baseline GHG established
2. 4 KPI tiles — Baseline, 2028 target, 2035 target, 2050 target
3. Two-column: Reduction trajectory table (6 years × 3 scopes) + Credits position summary
4. 4 milestone cards — Pre-recognition (2025), Recognition (2028), Leadership (2035), Net-Zero (2050)
5. Key reduction levers table — 6 levers with reduction %, capex, payback, status

**Trajectory calculation:**
```js
const annualRate = 0.093; // SBTi CNZS 2.0 near-term pathway
function projectGHG(baseGHG, year) {
  return Math.max(0, baseGHG * Math.pow(1 - annualRate, year - 2025));
}
```

### Carbon Credits (`credits`)

**Purpose:** Credit register, add/retire/delete operations, net GHG accounting.

**Sections:**
1. 4 KPI tiles — Verified credits, Pending, Retired, Net GHG
2. Add credit form — 9 fields in a 3-column grid
3. Active portfolio table — sortable, retire and delete actions per row
4. Retired credits table (conditional — shown only if retired.length > 0)
5. Net GHG accounting table — Scope 1, Scope 2, Scope 3, Less credits, Net total

### Environmental Dashboard (`e-dash`)

**Purpose:** E pillar overview. Sub-pillar bars, GHG breakdown, action items.

**Sections:**
1. Score hero — E total / 108
2. 4 KPI tiles — E Score, Scope 1+2, RE%, EV Fleet (all clickable to sub-pages)
3. Two-column: Sub-pillar breakdown bars + Action items
4. Each bar row in the breakdown is clickable — navigates to that sub-page

### GHG Emissions (`e-ghg`)

**Sections:**
1. Score hero — GHG sub-total / 33
2. Indicator table (5 rows — see backend doc)
3. Input table — Scope 1 inputs with auto-calculated tCO₂e hints, Scope 2, Scope 3, net-zero fields

### Energy (`e-energy`)

**Sections:**
1. Score hero — Energy sub-total / 18
2. Indicator table (3 rows)
3. Input table — kWh, solar kWh, efficiency YoY confirmation
4. Solar expansion pipeline action list

### Fleet (`e-fleet`)

**Sections:**
1. Score hero — Fleet sub-total / 18
2. Indicator table (3 rows — 2 currently scoring 0)
3. Input table — EV count, fleet total size
4. EV transition plan action list

### Waste (`e-waste`)

**Sections:**
1. Score hero — Waste sub-total / 12
2. Indicator table (3 rows)
3. Input table — diversion %, cardboard %, landfill tCO₂e
4. Waste insights action list

### Water (`e-water`)

**Sections:**
1. Score hero — Water sub-total / 7
2. Indicator table (2 rows)
3. Input table — water kL, efficiency initiative toggle

### ISO 14001 (`e-iso`)

**Sections:**
1. Score hero — ISO sub-total / 20
2. Indicator table (4 rows)
3. Input table — certification status, aspects register, policy, legal register

### Social Dashboard (`s-dash`)

**Sections:**
1. Score hero — S total / 100
2. 4 KPI tiles — MC Score, WSP/ATR, H&S, Community (all clickable)
3. Sub-pillar breakdown bars + Action items

### Management Control (`s-mc`)

**Sections:**
1. Score hero — MC total / 19
2. Settings row — Province, EAP year, Combined toggle, EAP targets display
3. EEA2 headcount table — 7 bands × 8 race/gender columns + total, Black%, points columns
4. EAP sub-rows shown beneath EAP-weighted bands in lighter style
5. Running MC total in footer row

### WSP / ATR (`s-wsp`)

**Sections:**
1. Score hero — WSP sub-total / 20
2. Indicator table (4 rows)
3. Input table — payroll, NPAT, WSP/ATR toggles, training hours, grant %

### Health & Safety (`s-hs`)

**Sections:**
1. Score hero — H&S sub-total / 25
2. Indicator table (4 rows)
3. Input table — LTIFR (blank-able), fatalities, fatigue programme, incident investigation
4. Confirmed LTI names list

### Community / CSI (`s-csi`)

**Sections:**
1. Score hero — CSI sub-total / 20
2. Indicator table (4 rows)
3. Input table — NPAT, CSI %, initiatives count, local %, supplier H&S %
4. Confirmed CSI programmes list (9 programmes)

### Governance Dashboard (`g-dash`)

**Sections:**
1. Score hero — G total / 100
2. 4 KPI tiles — Board, King V, IFRS, Ethics (all clickable)
3. Sub-pillar breakdown bars + Action items
4. Confirmed strengths list + Material risk register (top 5)

### Board Composition (`g-board`)

**Sections:**
1. Score hero — Board sub-total / 6
2. Indicator table (4 rows — 2 from MC tab)
3. Input table — board total, Black %, female %, meetings, Risk Committee, S&EC
4. Confirmed board composition table

### King V (`g-kingv`)

**Sections:**
1. Score hero — King V sub-total / 35
2. Two-column: Inputs (score, S&EC, remuneration) + Scored output indicators
3. All 17 principles table — status pill, weight, calculated score, evidence note

### IFRS S1/S2 (`g-ifrs`)

**Sections:**
1. Score hero — IFRS sub-total / 15
2. Disclosure tracker table — 11 rows with per-row dropdown (Not / Partial / Fully disclosed) + live score column

### GARP / ERM (`g-garp`)

**Sections:**
1. Score hero — GARP sub-total / 13
2. Indicator table (2 rows)
3. ERM inputs (7 fields)
4. ESG risk register table (10 risks with severity chip, likelihood, risk score)

### Ethics & Compliance (`g-ethics`)

**Sections:**
1. Score hero — Ethics sub-total / 32
2. Indicator table (6 rows)
3. Input table — code of ethics, hotline, POPIA status, risk register, assurance, IAR, penalties

### Data Import (`import`)

**Sections:**
1. 3 pillar summary tiles (clickable to respective dashboards)
2. Three paste sections (Environmental, Social, Governance):
   - Paste zone with textarea + Copy template + Apply + Clear
   - Per-field input grid (9 cells + YTD row per field)
3. Status message on apply: `Loaded N fields across 9 periods.`

---

## 6. Component library

### Score hero

```html
<div class="gl hero" style="border-color:{accent}22">
  <div class="hero-big" style="color:{accent}">{score}</div>
  <div class="hero-right">
    <div class="hero-rat" style="color:{accent};border-color:{accent}44;background:{accent}11">
      {RATING}
    </div>
    <div class="hero-lbl">{label} — {score} / {max} pts ({pct}%)</div>
    <div class="hero-desc">{description}</div>
    <div class="hero-bar">
      <div class="hero-fill" style="width:{pct}%;background:{accent}"></div>
    </div>
  </div>
</div>
```

### KPI tile

```html
<div class="gl kc [cl]" [onclick="go('{dest}')"]>
  <div class="kl">{label} {trend_arrow}</div>
  <div class="kv" style="color:{accent}">{value}</div>
  <div class="ks">{subtitle}</div>
  <div class="kb"><div class="kf" style="width:{pct}%;background:{accent}"></div></div>
</div>
```

- `.cl` added when tile has a destination → cursor pointer, hover border brightens
- Tiles that link to sub-pages show a faint `→` in the label row

KPI grid classes:
- `.kg4` — 4 columns
- `.kg3` — 3 columns
- `.kg5` — 5 columns
- `.kg6` — 6 columns

### Indicator table row

Each indicator has: status dot, name, score, max, trend arrow, progress bar, note.

```js
function iRow(name, pts, max, status, note, trendArrow) {
  // status: 'm' = met (green), 'p' = partial (amber), 'g' = gap (red)
  return `<tr>
    <td><span class="dot" style="background:${stC(status)}"></span>${name}</td>
    <td style="text-align:center;font-weight:600;color:${stC(status)}">${r2(pts)}</td>
    <td style="text-align:center;color:var(--t3)">${max}</td>
    <td style="text-align:center">${trendArrow || '—'}</td>
    <td><div class="pb"><div class="pbf" style="width:...%;background:${stC(status)}"></div></div></td>
    <td class="nc">${note}</td>
  </tr>`;
}
```

Indicator table headers: Indicator · Score · Max · Trend · Bar · Note

### Action cards

Three variants:

```js
// High priority (red)
function aH(title, desc, pts) { ... class="act act-h" }

// Medium / amber
function aM(title, desc, deadline) { ... class="act act-m" }

// Good news / confirmation
function aG(title, desc) { ... class="act act-g" }
```

Action cards are clickable when they have a `dest` parameter — navigates to the relevant data entry page.

### Bar row (sub-pillar breakdown)

```js
function brow(label, destination, score, max, accentColour) {
  // label is clickable — navigates to destination page
  // bar fills proportionally to score/max in accent colour
}
```

### Breadcrumb

```js
function bc(items) {
  // items: [[label, destination], [label, destination], [label, null]]
  // Last item is plain text, all others are clickable links
}
```

### Eyebrow

Small uppercase label above page headings:
```js
function ey(text) {
  return `<div class="ey">${text}</div>`;
}
```

### Chip badge

```html
<span class="chip {variant}">{label}</span>
```

| Class | Colour | Usage |
|-------|--------|-------|
| `.ce` | Teal / green | Positive status, E-pillar |
| `.cs` | Amber | Warning, S-pillar |
| `.cg` | Purple | G-pillar |
| `.cr` | Red | Critical, error |
| `.cb` | Blue | Info, data |
| `.cpu` | Purple-pink | Carbon credits |

### KV pill (King V principle status)

```html
<span class="kv-pill {chip-class}">{Applied|Partially Applied|Explained|Not Applied}</span>
```

### Progress bar

```html
<div class="pb">
  <div class="pbf" style="width:{pct}%;background:{colour}"></div>
</div>
```

Used inline within table cells (width: 50px).

### Sparkline

```js
function sparkline(dataArray, accentColour) {
  // Returns a row of .spark-bar divs, height proportional to value
  // Month initial label below each bar
  // Height: 4px minimum (null/zero), max 44px
}
```

### Bar chart (analytics)

```js
function barChart(data, labels, accent, maxValue) {
  // .bc-bar divs with CSS pseudo-elements for value and label
  // No JS charting library — pure CSS
}
```

---

## 7. Input components

### Number input (within input tables)

```html
<input type="number" value="{D[field]}"
  onchange="D['{field}'] = parseFloat(this.value) || 0; recalc()">
```

Focus state: green (`rgba(29,233,160,0.4)`) border + faint green background.

### Select (dropdown)

```html
<select onchange="D['{field}'] = this.value; recalc()">
  <option value="no" {selected}>No</option>
  <option value="partial">Partial</option>
  <option value="yes">Yes</option>
</select>
```

### EEA2 number input (compact)

```html
<input class="ni" type="number" min="0" value="{mhc[band][race]}"
  onchange="mhc['{band}']['{race}'] = parseInt(this.value) || 0; recalc()">
```

Width: 40px. Compact for the 8-column headcount grid.

### Data Import cell input

```html
<input class="ii [ok]" type="number" step="any"
  value="{TS[key][periodIndex] !== null ? TS[key][periodIndex] : ''}"
  placeholder="—"
  onchange="TS['{key}'][{i}] = this.value === '' ? null : parseFloat(this.value) || 0;
             this.classList.toggle('ok', this.value !== '');
             syncTStoD(); recalc()">
```

`.ok` class adds green border when populated.

### Paste textarea

```html
<textarea class="paste-ta" id="ta-{section}"
  onpaste="setTimeout(() => applyPaste('{section}'), 60)">
</textarea>
```

The 60ms delay allows the browser to complete the paste event before the parser reads the textarea value.

### Date input (carbon credits form)

```html
<input type="date" id="cr-date" value="{today's date}">
```

---

## 8. Prior period panel

Fixed position floating panel. Opens/closes by toggling `.open` on `#ppPanel`.

```html
<button class="pp-btn" onclick="document.getElementById('ppPanel').classList.toggle('open')">
  ⟲ Prior period
</button>
<div class="pp-panel" id="ppPanel">
  <h4>Prior period values — trend baseline</h4>
  {18 input fields, each updating T[field] on change}
</div>
```

Panel inputs:
```html
<div class="pp-f">
  <label>{field label}</label>
  <input type="number" value="{T[field] or placeholder}"
    onchange="T['{key}'] = this.value === '' ? null : parseFloat(this.value); recalc()">
</div>
```

---

## 9. Render cycle

Every user interaction follows the same flow:

```
User action (input change, click, paste)
    ↓
Update state (D[field] = value, or TS[key][i] = value, or mhc[band][race] = value)
    ↓
syncTStoD()        — if TS was updated
    ↓
recalc()
    ↓
calcAll()          — returns full sc object with all scored outputs
    ↓
updateNav(sc)      — refreshes all badge scores in left nav
    ↓
renderPage(curPage, sc)   — rebuilds innerHTML of #pc
```

`renderPage()` routes to the correct page function:
```js
function renderPage(page, sc) {
  const el = document.getElementById('pc');
  const pages = {
    'overview': pageOverview, 'analytics': pageAnalytics,
    'netzero': pageNetZero, 'credits': pageCredits,
    'e-dash': pageEDash, 'e-ghg': pageEGHG, /* ... all 22 pages */
  };
  if (pages[page]) el.innerHTML = pages[page](sc);
}
```

All page functions are pure: they take the `sc` scored-output object and return an HTML string. No DOM queries inside page functions except `document.getElementById` for specific interactive elements (EEA2 grid, paste forms).

---

## 10. Responsive behaviour

| Viewport | Layout changes |
|----------|---------------|
| ≥720px | Full layout: nav + main side by side |
| <720px | Left nav hidden (`.nav { display: none }`) |
| <720px | KPI grids: 4-col → 2-col (`.kg4` etc.) |
| <720px | Two/three column layouts → single column |
| <720px | Import grids → single column |

The toolkit is not designed for mobile-first use. It is a workstation tool. The responsive breakpoint exists as a fallback for tablets and smaller laptops, not for phone use.

---

## 11. Stance toggle

Three buttons in the header. Clicking sets `stance` and triggers `recalc()`.

```js
function setStance(s) {
  stance = s;
  document.querySelectorAll('.sb').forEach(b =>
    b.classList.toggle('on', b.textContent.trim().toLowerCase() === s)
  );
  recalc();
}
```

Active stance button: white background, `var(--g2)` text, white border. All pro-rata scoring recalculates immediately with the new floor threshold.

---

## 12. Navigation state management

| State | Stored in | Persists |
|-------|-----------|----------|
| Current page | `curPage` variable | Session only |
| Stance | `stance` variable | Session only |
| Scalar data | `D` object | Session only |
| Time-series data | `TS` object | Session only |
| EEA2 headcount | `mhc` object | Session only |
| Carbon credits | `CR` object | Session only |
| Prior period values | `T` object | Session only |
| Nav active class | DOM `.on` class | Re-applied on every `go()` call |

**There is no state persistence between sessions.** All data resets on page reload. To retain data:
- Download the HTML file after entry (the file retains the default values but not in-session changes without a save mechanism)
- Future version: add localStorage save/load or export to JSON
- Production deployment: replace in-memory state with API calls to a backend database

---

## 13. Page titles and breadcrumbs

Every sub-page renders a breadcrumb using:
```js
function bc(items) {
  return `<div class="bc">
    ${items.map((item, i) =>
      i < items.length - 1
        ? `<a onclick="go('${item[1]}')">${item[0]}</a> <span>›</span>`
        : `<span style="color:var(--t2)">${item[0]}</span>`
    ).join('')}
  </div>`;
}
```

Example — IFRS S1/S2 page:
```js
bc([['Dashboard', 'dash'], ['Governance', 'g-dash'], ['IFRS S1/S2', 'g-ifrs']])
// Renders: Dashboard › Governance › IFRS S1/S2
//          (first two are clickable links, last is plain text)
```

---

## 14. Version history

| Version | Change |
|---------|--------|
| v1.0 | Initial build — E/S/G scoring, basic inputs |
| v1.3 | EEA2 grid with EAP targets per province/year |
| v1.5 | Time-series paste engine, 9-period TS arrays |
| v1.6 | Glassmorphism design, SVG monochrome icons |
| v1.7 | Overview dashboard · Analytics · Net-Zero Roadmap · Carbon Credits register · Trend arrows · Prior period panel |

---

## 15. Known limitations and future enhancements

| Limitation | Impact | Resolution path |
|------------|--------|-----------------|
| No data persistence | All data lost on reload | Add localStorage save/load, or JSON export/import |
| No multi-user support | Only one person can work at a time | Migrate to web app with shared database |
| No audit trail | No record of who changed what, when | Add change log object with timestamps |
| Fleet L/100km and tonne-km not auto-calculated | 13 points remain at zero | Requires per-vehicle monthly register (km, litres, payload) |
| Scope 3 coverage limited to water | Full Scope 3 (supply chain, waste, travel) not captured | Extend TS and calcAll() with additional Scope 3 categories |
| No PDF/Excel export | Report data must be copy-pasted manually | Add jsPDF or SheetJS export for the sustainability report extract |
| Single company (SG Consumer) | Not multi-entity | Parameterise company name, period, and default data |
| EAP data only covers 2023–2025 | Will be incorrect for FY2026/27 | Update EAP object annually from DoEL publication |
