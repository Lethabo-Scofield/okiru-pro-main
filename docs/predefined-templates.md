# Predefined Extraction Templates

**Source:** `apps/web/src/data/starterTemplates.ts`
**Seeded on app start:** `Storage` → `Seeded predefined templates {count: 6}`

## Summary

| # | Template | Category | Entities |
|---|----------|----------|----------|
| 1 | B-BBEE Certificate | B-BBEE | 8 |
| 2 | Ownership Verification | B-BBEE | 8 |
| 3 | Management Control | B-BBEE | 8 |
| 4 | Skills Development | B-BBEE | 8 |
| 5 | Enterprise & Supplier Development | B-BBEE | 8 |
| 6 | Socio-Economic Development | B-BBEE | 6 |
| | **Total** | | **46** |

> Format note: these starter templates currently use a flat **Template → Entity** structure (no nested pillars/criteria). The B-BBEE pillar grouping is implicit in the template name. Example labelling style: **Okiru BEE Starter Pack · 6 templates · 46 entities** (analogous to the *RCOGP QSE Scorecard · 9 pillars · 36 criteria · 115 entities* convention).

---

## 1. B-BBEE Certificate
**Key:** `bbee_certificate` · **Category:** B-BBEE · **Entities:** 8
*Extract verified B-BBEE status, level, and scorecard details from certificates.*

| # | Label | Definition |
|---|-------|------------|
| 1 | BBBEELevel | The B-BBEE contributor level (1–8) or Non-Compliant status assigned to the measured entity. |
| 2 | BBBEEScore | The total B-BBEE scorecard points achieved out of the applicable maximum (e.g. 100 or 110 with bonus). |
| 3 | BlackOwnership | The percentage of black ownership recognised in the B-BBEE certificate or scorecard. |
| 4 | CertificateNumber | The unique reference number assigned to the B-BBEE certificate by the verification agency. |
| 5 | VerificationAgency | The SANAS-accredited verification agency that issued the B-BBEE certificate. |
| 6 | CertificateExpiryDate | The date on which the B-BBEE certificate expires and re-verification is required. |
| 7 | MeasuredEntityName | The legal name of the company or organisation that was measured for B-BBEE compliance. |
| 8 | MeasurementPeriod | The financial year or period over which the B-BBEE measurement was conducted. |

---

## 2. Ownership Verification
**Key:** `ownership_verification` · **Category:** B-BBEE · **Entities:** 8
*Extract shareholder demographics, voting rights, and economic interest for B-BBEE ownership scoring.*

| # | Label | Definition |
|---|-------|------------|
| 1 | ShareholderName | The full legal name of each shareholder or equity holder in the measured entity. |
| 2 | ShareholdingPercentage | The percentage of total issued shares held by each shareholder. |
| 3 | VotingRightsPercentage | The percentage of exercisable voting rights held by black shareholders. |
| 4 | EconomicInterestPercentage | The percentage of economic interest (right to dividends/capital gains) held by black shareholders. |
| 5 | RaceClassification | The racial classification of the shareholder as per B-BBEE definitions (African, Coloured, Indian, White). |
| 6 | GenderClassification | The gender of the shareholder for B-BBEE scoring of black female ownership. |
| 7 | NewEntrant | Whether the black shareholder qualifies as a new entrant (no prior significant business ownership). |
| 8 | OwnershipFulfilmentDate | The date on which the ownership transaction was fulfilled or completed (relevant to flow-through). |

---

## 3. Management Control
**Key:** `management_control` · **Category:** B-BBEE · **Entities:** 8
*Extract board composition and senior/executive management demographics for B-BBEE management scoring.*

| # | Label | Definition |
|---|-------|------------|
| 1 | BoardMemberName | The full name of each board member or director of the measured entity. |
| 2 | BoardMemberRace | The racial classification of each board member for B-BBEE management control scoring. |
| 3 | BoardMemberGender | The gender of each board member for tracking black female representation at board level. |
| 4 | BoardMemberRole | Whether the board member is Executive, Non-Executive, or Independent Non-Executive. |
| 5 | TotalBoardMembers | The total number of board members/directors at the measured entity. |
| 6 | SeniorManagementName | The full name of each senior or executive manager in the measured entity. |
| 7 | SeniorManagementRace | The racial classification of each senior manager for B-BBEE management control scoring. |
| 8 | SeniorManagementGender | The gender of each senior manager for tracking black female representation at top management. |

---

## 4. Skills Development
**Key:** `skills_development` · **Category:** B-BBEE · **Entities:** 8
*Extract training spend, learnership details, and beneficiary demographics for skills development scoring.*

| # | Label | Definition |
|---|-------|------------|
| 1 | TotalTrainingSpend | The total annual expenditure on skills development and training programmes. |
| 2 | BlackTrainingSpend | The portion of training spend allocated to black employees (African, Coloured, Indian). |
| 3 | LearnershipCount | The total number of learners enrolled in registered learnership or internship programmes. |
| 4 | BlackLearnershipCount | The number of black beneficiaries in learnership, internship, or apprenticeship programmes. |
| 5 | DisabledLearnerCount | The number of black disabled learners in skills development programmes. |
| 6 | TrainingProgrammeName | The name or title of each training programme, learnership, or skills intervention. |
| 7 | AnnualPayroll | The total annual employee payroll (leviable amount) used as the denominator for skills development spend ratio. |
| 8 | AbsorbedLearnerCount | The number of learners or interns absorbed into permanent employment after completing their programme. |

---

## 5. Enterprise & Supplier Development
**Key:** `esd` · **Category:** B-BBEE · **Entities:** 8
*Extract ESD contributions, beneficiary details, and supplier development spend for B-BBEE scoring.*

| # | Label | Definition |
|---|-------|------------|
| 1 | ESDTotalContribution | The total annual value of all Enterprise and Supplier Development contributions. |
| 2 | EDBeneficiaryName | The name of each Enterprise Development (ED) beneficiary — typically a black-owned EME or QSE. |
| 3 | ContributionType | The type/form of the ESD contribution (grant, loan, guarantee, mentorship, etc.). |
| 4 | ContributionAmount | The rand value of each individual ESD contribution to a specific beneficiary. |
| 5 | BenefitFactor | The applicable benefit factor (weighting multiplier) for the type of ESD contribution as per the Codes. |
| 6 | BeneficiaryBBBEELevel | The B-BBEE level of each ESD beneficiary (EME/QSE typically Level 1–4). |
| 7 | BlackOwnershipOfBeneficiary | The percentage of black ownership in the ESD beneficiary entity. |
| 8 | NPATOfMeasuredEntity | The Net Profit After Tax of the measured entity, used as the denominator for ESD contribution targets. |

---

## 6. Socio-Economic Development
**Key:** `sed` · **Category:** B-BBEE · **Entities:** 6
*Extract SED/CSI contributions, beneficiary demographics, and community development spend.*

| # | Label | Definition |
|---|-------|------------|
| 1 | SEDTotalContribution | The total annual expenditure on Socio-Economic Development (SED) or Corporate Social Investment (CSI). |
| 2 | SEDBeneficiaryName | The name of each SED/CSI beneficiary organisation (NPO, community project, school, etc.). |
| 3 | SEDBeneficiaryType | The type of SED beneficiary (education, health, community development, youth, etc.). |
| 4 | SEDContributionAmount | The rand value of each individual SED/CSI contribution to a specific beneficiary. |
| 5 | BlackBeneficiaryPercentage | The percentage of SED beneficiaries who are black (African, Coloured, Indian). |
| 6 | NPATForSED | The Net Profit After Tax used as the denominator for calculating the SED contribution target (1% of NPAT). |

---

## Entity Schema

Each entity in a template carries the following metadata fields used by the extraction pipeline:

| Field | Purpose |
|-------|---------|
| `label` | Canonical entity name (e.g. `BBBEELevel`). |
| `definition` | Human-readable description used in LLM prompts. |
| `synonyms` | Alternative phrasings the extractor should match. |
| `positives` | Example values that **should** be matched. |
| `negatives` | Example values that **must not** be confused with this entity. |
| `zones` | Document regions to search (`PDF Header`, `Tables`, `Email Body`, `Footer`, `Signature Block`). |
| `keywords.must` / `nice` / `neg` | Required, helpful, and disqualifying keywords for candidate scoring. |
| `pattern` | Regex used as a final validation/recognition filter. |
