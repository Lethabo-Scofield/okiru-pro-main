# Okiru — ESG Intelligence Toolkit
## Report Template Specification

Structure, data model and generation logic for automated ESG disclosure and strategy packs

|                   |                   |
|-------------------|-------------------|
| **Prepared for**  | Okiru — internal  |
| **Prepared by**   | [Prepared By]   |
| **Report period** | [Report Period] |
| **Date**          | [Date]          |
| **Version**       | 1.0               |
| **Status**        | For review        |

# Document control

## Version history

| **Version** | **Date** | **Author**      | **Summary of change**                                                                          |
|-------------|----------|-----------------|------------------------------------------------------------------------------------------------|
| 0.1         | [Date] | [Prepared By] | Initial structure and metric schema                                                            |
| 1.0         | [Date] | [Prepared By] | Added qualitative and quantitative reporting controls, commercial structure and execution plan |

## Distribution

| **Name** | **Role**          | **Purpose**                 |
|----------|-------------------|-----------------------------|
| [Name] | Managing Director | Approval                    |
| [Name] | Development lead  | Build                       |
| [Name] | ESG analyst       | Delivery                    |
| [Name] | Legal reviewer    | Claims and liability review |

## Purpose of this document

This document specifies how the Okiru ESG Intelligence Toolkit generates client-facing ESG disclosure and strategy packs. It sets the structure of the output, the data model behind it, the rules that govern what may and may not render, and the commercial model that sits around it.

It is a build specification, not a client deliverable. The development team builds from it, the analyst team delivers against it, and legal reviews the fixed-language and claims sections before any client output ships.

# Contents

# 1. Executive summary

Okiru is building a template that lets the ESG Intelligence Toolkit generate a client's sustainability disclosure automatically. The brief set the benchmark as the published sustainability reports of large listed issuers. This document recommends a different benchmark, for commercial reasons.

## 1.1 What we found

The four reference documents supplied are four different genres. Only one — the JSE Sustainability Disclosure Matrix — is structurally useful, and it is a cross-reference index rather than a report. The others are an assured issuer disclosure, an asset manager's stewardship narrative and a regulator's programme update. Copying their form gives Okiru a document that invites comparison against work produced by fifteen-person teams over several months, with external assurance attached.

## 1.2 What we recommend

Target traceability rather than volume. A 45-page pack in which every figure carries a source system, a boundary, a calculation method, a data quality rating and an assurance status is more defensible than a 120-page narrative, and it is the version Okiru can automate. Weight comes from what sits behind each number, not from page count.

Three design choices follow from that position:

1.  Build one data spine and render it four ways. A disclosure pack, a board strategy pack, a stakeholder one-pager and a data book, all filtered from the same metric register, evidence register and narrative library.

2.  Control the qualitative half as tightly as the quantitative half. Every claim is classified before it renders, and every claim binds to evidence. This is the control that protects both the client and Okiru as the FSCA develops its guidance on sustainability-related claims.

3.  Treat the gap register as the product. Every metric the toolkit cannot populate becomes a costed remediation item, which is the scope of work for the next engagement.

## 1.3 Where Okiru wins

Two sections in this template are ones a global reporting house will not write for a South African client: the regulatory horizon covering the Climate Change Act, carbon tax, ISSB adoption, the JSE guidance and the Green Finance Taxonomy; and the transformation overlay covering B-BBEE, employment equity, skills development and enterprise and supplier development. Okiru's existing compliance and transformation practice already produces both.

## 1.4 What we are asking for

Two decisions before any build begins, set out in full at section 12: approval of a hard client sign-off gate, and agreement on where the analyst sits in the production line. Both are described with the reasoning at the end of this document.

# 2. Context and scope

## 2.1 The reference set

Four documents were supplied as benchmarks. They serve different purposes and only parts of each transfer.

| **Document**                                    | **What it is**                                                                                          | **What transfers**                                                                         |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| JSE Sustainability Disclosure Matrix            | A cross-reference index mapping each required disclosure to where it sits across the reporting suite    | The disclosure index and the reasoned-omission pattern. The highest-value item in the set. |
| Standard Bank Sustainability Disclosures Report | Issuer self-disclosure for capital markets, produced by a large team over months and externally assured | Section structure. Not the scale or the ambition.                                          |
| PIMCO Sustainable Investing Report              | A stewardship narrative from an asset manager, marketing-led                                            | Tone and the case-study format only.                                                       |
| FSCA Sustainable Finance Update                 | A regulator's programme update                                                                          | A source for the regulatory horizon section, not a template.                               |

*Note: the Standard Bank report and Okiru's existing sample report were not available for review during drafting. Both should be read against this specification before the build starts.*

## 2.2 Scope of this specification

In scope: the structure of the generated output, the metric and evidence data model, the rules governing what renders, the commercial tiering and the build sequence.

Out of scope: the toolkit's data capture interface, the scoring methodology itself, and client-specific content.

## 2.3 Design principle

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>PRINCIPLE</strong></p>
<p>Credibility comes from traceability, not length. Every figure carries provenance. Every absence is stated, not hidden. The core report targets 40 to 55 pages; detail lives in the Data Book.</p></td>
</tr>
</tbody>
</table>

# 3. Strategic assessment

## 3.1 The brief, challenged

The brief asks for output carrying the same weight as a published sustainability report. That is the wrong target and it will cost money to chase.

Those reports derive their weight from three things the toolkit cannot automate: multi-year data series, external assurance, and a named executive putting a reputation behind the document. Producing something that looks like one invites a comparison it loses, and it inherits the format's worst habit — treating length as a proxy for rigour.

## 3.2 The stronger position

Position the output as an assurance-ready disclosure record. That claim is defensible, it is automatable, and it is what a CFO or company secretary needs as the ISSB adoption roadmap reaches large listed entities and cascades down their supply chains.

None of the four reference documents does traceability well. The JSE matrix comes closest, and it is a two-column index attached to a suite that does not carry it either. This is open ground.

## 3.3 Commercial consequences

| **Consequence**                                     | **Why it matters**                                                                                                                                    |
|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| The gap register is the product                     | Every unpopulated metric becomes a named remediation item with an effort and cost band. The report generates its own follow-on sale.                  |
| The regulatory horizon is the moat                  | A global reporting house will not write a South African compliance calendar. Okiru's transformation and compliance base already produces one.         |
| The Social and Ethics Committee report bundles free | Companies Act Regulation 43 makes it compulsory for much of the target market. It draws on the same spine and has its own buyer and its own deadline. |

# 4. Architecture

## 4.1 One spine, four renderings

Build one data spine and filter it. Renderings B, C and D cost almost nothing once the spine exists and each is separately priceable.

| **Component**                       | **Contents**                                                                                                                      |
|-------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| Data spine                          | Metric register (one row per metric, period and boundary), evidence register, narrative-block library, framework cross-walk table |
| Rendering A — Disclosure Pack       | The full report. Compliance buyer: company secretary, CFO, sustainability lead                                                    |
| Rendering B — Board Strategy Pack   | 12 to 18 pages. Score, materiality, gaps, decisions required, roadmap                                                             |
| Rendering C — Stakeholder One-Pager | Supply-chain ESG questionnaires, tender annexures, customer due diligence                                                         |
| Rendering D — Data Book             | Appendix workbook. Full metric register, calculations, emission factors, restatements                                             |

## 4.2 Framework cross-walk

The cross-walk lives in a versioned reference table outside the template. It is never hard-coded into report sections.

The spine taxonomy is the JSE Sustainability and Climate Change Disclosure Guidance topic and sub-topic tree. It is South African native and already tiered Core and Leadership.

Cross-walk columns:

jse_topic | jse_subtopic | jse_tier (C/L) | ifrs_s1_ref | ifrs_s2_ref | gri_ref | amended_fsc_element | ee_or_sd_link | sdg | carbon_tax_relevance | version | effective_from

Every framework update creates a new table version. Each report records the version it was generated against.

# 5. Metric data schema

Every metric in the spine carries the fields below. This schema makes the output assurance-ready and is the single most important design decision in the product. It is expensive to retrofit, so lock it early.

| **Field**                  | **Type**        | **Notes**                                              |
|----------------------------|-----------------|--------------------------------------------------------|
| metric_id                  | string          | Stable across years                                    |
| topic / subtopic           | string          | From the JSE taxonomy                                  |
| tier                       | enum            | Core / Leadership                                      |
| metric_name                | string          |                                                        |
| value                      | numeric or text |                                                        |
| unit                       | string          | Controlled vocabulary                                  |
| period_start / period_end  | date            |                                                        |
| boundary                   | enum            | Operational control / financial control / equity share |
| entities_included          | list            | Named sites, subsidiaries, joint ventures              |
| source_system              | string          | Payroll, meter portal, supplier invoice, manual return |
| source_owner               | string          | Named person or role accountable for the number        |
| calculation_method         | text            | Stated formula                                         |
| emission_factor            | numeric         | Where applicable                                       |
| emission_factor_source     | string          | DEFRA, Eskom grid factor, GHG Protocol — with version  |
| data_quality_score         | 1 to 5          | See 5.1                                                |
| assurance_status           | enum            | Unassured / internally reviewed / limited / reasonable |
| prior_year_value           | numeric         |                                                        |
| restated                   | boolean         |                                                        |
| restatement_reason         | text            | Renders as a footnote if true                          |
| target_value / target_year | numeric / year  |                                                        |
| variance_vs_target         | derived         |                                                        |
| rag_status                 | derived         | See 5.2                                                |
| omission_reason            | enum + text     | See 5.3                                                |
| evidence_ids               | list            | Links to the evidence register                         |
| commentary                 | text            | Analyst or client narrative, evidence-bound            |

## 5.1 Data quality scale

Printed in the report as a legend and shown per metric in the Data Book.

| **Score** | **Definition**                                                                      |
|-----------|-------------------------------------------------------------------------------------|
| 5         | Metered or system-generated, independently verifiable, complete for the full period |
| 4         | System-generated with minor manual adjustment or estimation under 5% of total       |
| 3         | Mix of measured and estimated data; estimation method documented                    |
| 2         | Primarily estimated or extrapolated from a sample or proxy                          |
| 1         | Single-point estimate, proxy or industry average; indicative only                   |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>RULE</strong></p>
<p>A report-level weighted data quality index is calculated and disclosed on the performance dashboard. None of the benchmark reports does this. It is a genuine differentiator.</p></td>
</tr>
</tbody>
</table>

## 5.2 RAG logic

- Green — on or ahead of target trajectory, with data quality 4 or 5

- Amber — within 10% of trajectory, or on trajectory but data quality 3 or below

- Red — off trajectory by more than 10%, or no baseline established

- Grey — not yet measured; renders an omission statement and a gap-register entry

## 5.3 Omission taxonomy

Modelled on the JSE “Commentary:” pattern, the single most transferable device in the reference set. A stated, reasoned omission reads as governance maturity. A silent gap reads as evasion.

| **Code**         | **Renders as**                                                                                                               |
|------------------|------------------------------------------------------------------------------------------------------------------------------|
| NOT_MATERIAL     | Assessed as not material to [entity] given [reason]. This assessment is reviewed annually.                               |
| NOT_APPLICABLE   | Not applicable to [entity]'s operations. [Reason].                                                                       |
| DATA_UNAVAILABLE | [Entity] does not currently collect this data. A remediation action is recorded at [roadmap ref], targeted for [date]. |
| IN_PROGRESS      | Measurement commenced [date]; a full-period figure will be reported from [period].                                       |
| CONFIDENTIAL     | Withheld on confidentiality grounds. [Basis].                                                                              |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>MECHANISM</strong></p>
<p>Every DATA_UNAVAILABLE and IN_PROGRESS automatically creates a gap-register row and a roadmap action. This turns the report into the scope of work for the next engagement.</p></td>
</tr>
</tbody>
</table>

# 6. Qualitative and quantitative reporting

Every ESG report is two documents in one. Most automated reporting handles the numbers well and lets the narrative run free, which is where credibility and regulatory exposure are both lost. The toolkit controls both halves and binds them to each other.

|                | **Quantitative**                                                                                                                                                             | **Qualitative**                                                                                                                                                                     |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| What it covers | Emissions, energy, water, waste, intensity ratios. Headcount, demographics, pay ratios, spend. Incidents, fines, training coverage, tax borne. Baselines, targets, variance. | Governance, oversight and accountability. Materiality method and stakeholder engagement. Strategy, transition plan, management approach. Why a number moved and what is being done. |
| Controlled by  | The metric record schema at section 5. Each number carries provenance, boundary, quality and assurance status.                                                               | The claim tier taxonomy and evidence binding below. No assertion renders without something behind it.                                                                               |
| Fails when     | A figure appears with no boundary, no method and no comparison.                                                                                                              | A sentence asserts an outcome that nothing in the evidence register supports.                                                                                                       |

## 6.1 Anatomy of one defensible number

The reader sees the figure, the unit, the comparison and a footnote marker. Everything else sits in the Data Book and the disclosure index, and is what an assurance provider asks for first.

| **Element**        | **Worked example**                            |
|--------------------|-----------------------------------------------|
| Figure and unit    | 12 480 tCO₂e · Scope 1 · FY2026               |
| Comparison         | Down 8.4% on FY2025 restated                  |
| Boundary           | Operational control, 5 depots                 |
| Source system      | Fuel card ledger and meter reads              |
| Owner              | Group Operations Manager                      |
| Calculation method | Litres × DEFRA 2025 factor                    |
| Data quality       | 4 of 5 — 2.1% of the total estimated          |
| Assurance status   | Internally reviewed, not assured              |
| Target             | Down 40% by FY2030 against an FY2024 baseline |
| Evidence           | EV-0412, EV-0418, EV-0431                     |
| Framework refs     | JSE Core · IFRS S2 · GRI 305-1                |

## 6.2 How quantitative data renders

A metric never appears as a bare figure. Each renders with:

- Its trajectory against the pathway required to hit the stated target

- RAG status derived from that trajectory and from data quality

- The data quality of every plotted point, not just the headline figure

- Restatement footnotes where any prior-period figure has changed

- The narrative block explaining the variance, and the linked reduction levers

Two report-level views are mandatory on the dashboard: the distribution of data quality across the metric set with its weighted index, and assurance readiness by topic rated ready for limited assurance, remediation required, or not assurable.

## 6.3 Claim tiers

Every narrative sentence is classified before it renders. A sentence that cannot be classified does not go into the document.

| **Tier** | **Type**   | **What it asserts**                  | **What must bind it**                            |
|----------|------------|--------------------------------------|--------------------------------------------------|
| A        | Factual    | A measured outcome                   | A metric ID in the register                      |
| B        | Process    | That something is done a certain way | A policy, procedure or committee minute          |
| C        | Commitment | A future intention                   | A board-approved target with a date and an owner |
| D        | Context    | The operating environment            | A cited external source                          |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>THE RULE THIS ENFORCES</strong></p>
<p>Aspiration with nothing behind it — “we are committed to being a leader in sustainability” — has no tier and never renders. This is the class of sentence the FSCA's greenwashing work targets.</p></td>
</tr>
</tbody>
</table>

## 6.4 The pairing rule

Numbers without narrative are unreadable. Narrative without numbers is unfalsifiable. The generator refuses both.

| **Status** | **Form**       | **Example**                                                                                                           | **Why**                                                                                  |
|------------|----------------|-----------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Fails      | A number alone | “Scope 1 emissions were 12 480 tCO₂e.”                                                                                | The reader cannot tell whether that is good, why it moved, or what happens next.         |
| Fails      | A claim alone  | “We made strong progress on decarbonisation this year.”                                                               | Nothing to verify. This is the sentence a regulator circles.                             |
| Renders    | Paired         | “Scope 1 fell 8.4% to 12 480 tCO₂e, ahead of the 6.7% pathway, driven by the depot fleet conversion completed in Q2.” | A figure, a comparison, a cause and a linked action, with both halves bound to evidence. |

## 6.5 How the narrative is generated

Not free text, and not fill-in-the-blank. Each block is a conditional sentence with a trigger, bound variables and an evidence requirement.

1.  Trigger fires — metric variance passes a threshold, a target is met, regulation comes into force, or data quality shifts

2.  Block selected — the narrative library returns the block matching the trigger, the topic and the claim tier

3.  Variables bound — figures, dates, entity names and owners pull from the metric register, never retyped

4.  Evidence checked — the block's evidence IDs must resolve. If any is empty the block is blocked, not softened

5.  Analyst review — Tier 2 and above: a person writes the strategy and roadmap prose. This is where the margin sits

The library is versioned. Editing a sentence updates every future report, and past reports still record the version they used.

# 7. Report structure (Rendering A)

## 7.1 Front matter

### F1. Cover

Client name, report title, reporting period, “Prepared by Okiru”, version and date, generation reference number.

### F2. About this report

Fixed-language block with variables, in this order:

1.  Scope and boundary — entities, sites, subsidiaries and joint ventures included and excluded, consolidation approach

2.  Reporting period — and comparative periods presented

3.  Frameworks applied — with cross-walk table version and date

4.  Basis of preparation — how the report was produced, what the client supplied, what Okiru calculated

5.  Data provenance statement — mandatory wording below

6.  Assurance status — explicit, even where the answer is none

7.  Limitations and exclusions

8.  Restatements — any prior-period figures restated, and why

9.  Forward-looking statement disclaimer

10. Approval and sign-off — named client officer, date, version approved

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>MANDATORY PROVENANCE PARAGRAPH</strong></p>
<p>“The information in this report was compiled by Okiru from data supplied by [Client Name]. Okiru has not independently verified the underlying data. Data quality is disclosed per metric in Appendix [x] and summarised on page [x].”</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>SIGN-OFF GATE</strong></p>
<p>The report cannot render in Final state until item 10 is populated. Until then every page carries a DRAFT watermark. There is no override in the client-facing build.</p></td>
</tr>
</tbody>
</table>

### F3. How to use this report

Half a page. Navigation, the tier legend, the data quality legend, the RAG legend.

### F4. Disclosure index

The highest-value element borrowed from the JSE matrix:

Required disclosure | Framework refs | Where reported (section, page) | Status | Data quality | Omission reason

Generated last, from the populated spine. Where a client reports across several documents, the “where reported” column names the external document and page.

## 7.2 Section 1 — Executive summary

Board-readable in five minutes. Four fixed components: maturity position with sub-scores and movement; a one-page performance dashboard including the weighted data quality index; three to five auto-generated statements on what changed; and three to five decisions required of the board, each with a deadline, the consequence of deferral, a cost band and a roadmap reference.

## 7.3 Section 2 — Operating and regulatory context

Okiru's differentiating section. Client-specific and sector-filtered, sourced from a maintained regulatory register covering at minimum:

- Climate Change Act and sectoral emission targets

- Carbon Tax Act, allowances and offset provisions

- ISSB / IFRS S1 and S2 national adoption roadmap and the FSCA disclosure pathway for large listed entities

- JSE Listings Requirements and Sustainability and Climate Change Disclosure Guidance

- South African Green Finance Taxonomy

- B-BBEE Codes and the Amended Financial Sector Code where applicable

- Employment Equity Act sector targets

- Companies Act Regulation 43 (Social and Ethics Committee)

- PoPIA where data governance is material, and sector-specific licences and environmental authorisations

Each entry renders instrument, status, requirement, applicability, action required and deadline. A 24-month compliance calendar follows, then value chain pressure and peer position.

## 7.4 Section 3 — Governance

- Board oversight of sustainability — structure, committee mandate, frequency, competence

- Management accountability — drawn from source_owner fields, so the report proves accountability rather than asserting it

- Integration into risk management, and remuneration linkage

- Social and Ethics Committee report (conditional) — auto-populated against the Regulation 43 prescribed areas and separately extractable

## 7.5 Section 4 — Materiality

- Method — double or single materiality, stated, with threshold logic disclosed

- Stakeholder engagement — groups, method, frequency, what they raised

- Material matters — matrix plus a table linking each matter to financial exposure, metrics and roadmap actions

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>RULE</strong></p>
<p>Every material matter links to at least one metric and one roadmap action, or the generator flags it. A material matter with nothing attached is a narrative claim, not a management process.</p></td>
</tr>
</tbody>
</table>

## 7.6 Section 5 — Strategy and value creation

- Sustainability strategy and commitments; link to business strategy including revenue and cost exposure

- Transition plan (conditional on emissions materiality) — projection output, scenario assumptions, reduction levers with abatement potential and cost

- Investment and resourcing — capital and operating expenditure allocated

## 7.7 Section 6 — Environmental performance

Each sub-topic renders a metric table, trend chart, commentary, omissions and linked actions: GHG emissions across Scopes 1, 2 and 3 with intensity and base-year policy; energy; water; waste; biodiversity and land use; pollution; environmental supply chain; and just transition. Omitted Scope 3 categories must state why.

## 7.8 Section 7 — Social performance

Okiru's second differentiating block, where the South African context bites.

- Workforce composition by race, gender, age band, occupational level and employment type, rendered alongside the EE report structure

- Diversity, equity and inclusion including progress against EE sector targets

- Pay equality — CEO-to-median, top and bottom decile, gender and race ratios, living wage position

- Skills development — spend, learnerships, beneficiary demographics, B-BBEE skills element, SETA alignment

- Enterprise and supplier development — beneficiaries, spend, outcomes, jobs supported

- Health and safety; labour relations; community and human rights; socio-economic development and value added; social supply chain; customer responsibility

## 7.9 Section 8 — Governance metrics

Board composition; ethics and anti-corruption including training coverage and whistle-blowing outcomes; compliance incidents, fines and penalties; tax transparency; political contributions and lobbying.

## 7.10 Section 9 — Metrics, targets and performance

Consolidated KPI table, one row per tracked metric, grouped by E, S and G. This is the page a funder or customer photographs.

Metric | Baseline | Prior year | Current | Target | Target year | Trajectory | RAG | Data quality | Assurance | Owner

## 7.11 Section 10 — Gap register and assurance readiness

Generated from every omission, grey RAG and data quality score of 3 or below.

Gap ID | Metric | Nature of gap | Requirement not met | Risk | Effort band | Cost band | Owner | Target close | Roadmap ref

Assurance readiness is rated per topic and stated plainly. A client who can see they are two data-quality steps from assurable will buy those two steps. The top five gaps by risk-weighted effort are pulled out as priority remediation.

## 7.12 Section 11 — Roadmap

Time-bound actions with owners, drawn from the gap register and the strategy, grouped 0 to 6 months, 6 to 18 months and 18 to 36 months, with a dependency map.

Action | Material matter | Metric | Owner | Start | Due | Dependencies | Effort | Cost band | Expected outcome | Status

A board KPI milestone tracker carries forward each period so progress is visible year on year.

## 7.13 Appendices

- A. Methodology — scoring model, weighting, thresholds, projection assumptions

- B. Emission factors and sources, with versions and dates

- C. Full metric register — the Data Book, or a pointer to it

- D. Framework index — JSE, IFRS S1 and S2, GRI, FSC and SDG, with cross-walk version

- E. Restatements · F. Stakeholder engagement log · G. Glossary · H. Legal and disclaimers

# 8. Generation rules

These are build constraints, not guidelines. Each one removes a specific failure mode.

| **\#** | **Rule**                                                                                                     | **What it prevents**                                  |
|--------|--------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| 1      | Nothing renders empty — a section with no data renders an omission statement, never a blank or a placeholder | A gap reading as an oversight                         |
| 2      | Draft until signed — full-page DRAFT watermark until the client sign-off field is populated, no override     | Okiru carrying liability for an unapproved disclosure |
| 3      | Claims are evidence-bound, tiered A to D, and paired with a figure                                           | Greenwashing exposure                                 |
| 4      | Suppression is visible — sections omitted as immaterial still appear in the disclosure index with the reason | Silent removal of an inconvenient topic               |
| 5      | Version stamping — toolkit, cross-walk, extract date and report version on every output                      | Inability to reconstruct how a figure was produced    |
| 6      | Restatement is automatic — any changed prior-year figure triggers a footnote and an appendix row             | Silent restatement                                    |
| 7      | Length control — past 60 pages, detail moves to the Data Book                                                | Length substituting for rigour                        |
| 8      | One chart specification — no chart without axis units and a source note naming the metric ID                 | Unattributable visuals                                |

# 9. Commercial structure

## 9.1 Tiering

| **Tier**                      | **Contents**                                                                              | **Delivery**                     | **Position**                    |
|-------------------------------|-------------------------------------------------------------------------------------------|----------------------------------|---------------------------------|
| Tier 1 — Disclosure Pack      | Renderings A and D, automated, light analyst QA                                           | 5 working days from data receipt | Entry point, compliance-driven  |
| Tier 2 — Strategy Pack        | Tier 1 plus Renderings B and C, analyst-authored strategy and roadmap, board presentation | 15 working days                  | The core sale                   |
| Tier 3 — Assurance-Ready Pack | Tier 2 plus gap remediation, evidence file construction, assurance provider liaison       | Engagement-based                 | Highest value, natural retainer |

## 9.2 Revenue mechanics

- Every Tier 1 report ships with a costed remediation schedule. Conversion from Tier 1 to remediation work is the primary metric to track for this product.

- The report is annual by nature. Price year two at a discount to lock the cycle; it costs far less to produce because the spine is populated and only deltas change.

- Renderings C and D are cheap upsells. The stakeholder one-pager sells itself to any client answering customer ESG questionnaires or bidding on ESG-scored tenders.

- The Social and Ethics Committee report attaches at near-zero marginal cost, with its own buyer and its own statutory deadline.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>POSITIONING</strong></p>
<p>Not “we produce sustainability reports.” Rather: we produce the disclosure record you can defend — every figure sourced, every gap named, and a costed plan to close them.</p></td>
</tr>
</tbody>
</table>

# 10. Risk and controls

| **Risk**                      | **Exposure**                                                                                                        | **Control**                                                                                                                   | **Owner**         |
|-------------------------------|---------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|-------------------|
| Liability                     | An auto-generated document asserting disclosure facts on Okiru letterhead, from client data Okiru has not verified. | Basis of preparation, data provenance statement and a hard client sign-off gate. DRAFT watermark until a named officer signs. | Legal reviewer    |
| Greenwashing exposure         | The FSCA is developing guidance explicitly targeting greenwashing, social washing and impact washing.               | Claim tiering and evidence binding. A claim with no bound evidence does not render.                                           | ESG analyst       |
| Framework drift               | Hard-coded JSE or GRI references break every client report the moment a standard updates.                           | Versioned cross-walk table held outside the template; reports record the version used.                                        | Development lead  |
| Scope creep into analyst time | Automation quietly absorbing the strategy and roadmap sections, eroding Tier 2 differentiation.                     | Analyst-authored sections defined in the specification and excluded from the generator.                                       | Managing Director |

# 11. Execution plan

Ten weeks from start to a priced product, assuming the SG Consumer dataset is available for the pilot.

| **\#** | **Task**                                                   | **Rationale**                                    | **Depends on** |
|--------|------------------------------------------------------------|--------------------------------------------------|----------------|
| 1      | Lock metric taxonomy (JSE tree)                            | Spine for everything downstream                  | —              |
| 2      | Build versioned framework cross-walk table                 | Prevents standards drift breaking the template   | 1              |
| 3      | Define metric record schema                                | Determines defensibility; expensive to retrofit  | 1              |
| 4      | Write fixed-language blocks, legal review once             | Basis of preparation, disclaimers, methodology   | —              |
| 5      | Build claim tier taxonomy and narrative library            | Controls the qualitative half of the report      | 3              |
| 6      | Build omission and gap engine                              | Turns absence into credibility and into pipeline | 3, 5           |
| 7      | Wire the four renderings                                   | —                                                | 3 to 6         |
| 8      | Pilot on the SG Consumer dataset, external reviewer        | Data, projection model and actions already exist | 7              |
| 9      | Legal and claims review, sign-off gate design              | Liability and greenwashing controls              | 8              |
| 10     | Productise, price, build the Tier 1 to remediation handoff | —                                                | 9              |

*Sequencing note: the claim tier taxonomy sits ahead of the omission engine because the omission engine writes narrative and needs somewhere to classify what it writes.*

# 12. Recommendations and decisions required

## 12.1 Recommendations

1.  Adopt traceability rather than volume as the design target, and position the output as an assurance-ready disclosure record.

2.  Build one data spine and four renderings. Do not build four templates.

3.  Control the qualitative half with claim tiering, evidence binding and the pairing rule, on the same footing as the metric schema.

4.  Treat the gap register as the commercial engine and track Tier 1 to remediation conversion as the product's primary metric.

5.  Keep the regulatory horizon and transformation overlay sections in every tier. They are the two sections competitors cannot write.

## 12.2 Decisions required

### Decision 1 — The sign-off gate

The document asserts disclosure facts on Okiru letterhead from data Okiru has not verified. We recommend a draft watermark until a named client officer signs, with no override in the client-facing build. This costs nothing to implement and removes the one failure mode that could damage the practice.

**Decision owner: Managing Director. Required before: task 7.**

### Decision 2 — Where the analyst sits

Tier 1 fully automated with light QA is the right entry price. The value in Tier 2 is a person writing the strategy and roadmap sections. We recommend excluding those sections from the generator by design, because that is where the margin and the differentiation sit.

**Decision owner: Managing Director. Required before: task 10.**

## 12.3 Outstanding items

- Standard Bank Sustainability Disclosures Report and Okiru's existing sample report to be read against this specification before the build starts

- Legal review of the fixed-language blocks and indemnity wording

- Price points for the three tiers

**Prepared by Okiru**

okiru.co.za
