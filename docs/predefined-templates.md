# Predefined Scorecard Templates

**Source:** `GET /api/entity-templates` (built from `apps/api/pipeline/extraction/entityManifest.ts` + `apps/api/pipeline/sectorConfig.ts`)

## Summary

| # | Template | Sector | Type | Pillars | Criteria | Entities |
|---|----------|--------|------|---------|----------|----------|
| 1 | RCOGP Generic Scorecard | RCOGP | Generic | 10 | 39 | 115 |
| 2 | ICT Generic Scorecard | ICT | Generic | 10 | 36 | 117 |
| 3 | ICT QSE Scorecard | ICT | QSE | 9 | 36 | 117 |
| 4 | RCOGP QSE Scorecard | RCOGP | QSE | 9 | 36 | 115 |
| 5 | FSC Generic Scorecard | FSC | Generic | 13 | 39 | 118 |
| 6 | AGRI Generic Scorecard | AGRI | Generic | 10 | 36 | 118 |

---

## 1. RCOGP Generic Scorecard
**Sector:** RCOGP · **Type:** Generic · **10 pillars · 39 criteria · 115 entities**

*Ontology-based template for RCOGP Generic with 39 criteria across 10 pillars*

### Pillars

| # | Code | Pillar | Max Pts | Sub-Min | Criteria | Entities |
|---|------|--------|---------|---------|----------|----------|
| 1 | `clientInfo` | Client Information | 0 | — | 0 | 12 |
| 2 | `financials` | Financials | 0 | — | 0 | 9 |
| 3 | `ownership` | Ownership | 25 | 10% | 7 | 5 |
| 4 | `managementControl` | Management Control | 19 | — | 13 | 10 |
| 5 | `employmentEquity` | Employment Equity | 0 | — | 0 | 0 |
| 6 | `skillsDevelopment` | Skills Development | 25 | 10% | 5 | 26 |
| 7 | `preferentialProcurement` | Preferential Procurement | 29 | 11.600000000000001% | 6 | 17 |
| 8 | `enterpriseSupplierDevelopment` | Enterprise & Supplier Development | 17 | 4% | 4 | 15 |
| 9 | `socioEconomicDevelopment` | Socio-Economic Development | 5 | — | 1 | 13 |
| 10 | `yesInitiative` | YES Initiative | 0 | — | 3 | 8 |

#### Client Information (`clientInfo`)

**Entities (12)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `company_name` | Company Name | string | Yes |
| `trading_name` | Trading Name | string | No |
| `registration_number` | Registration Number | string | Yes |
| `vat_number` | VAT Number | string | No |
| `sector_code` | Sector Code | string | Yes |
| `company_size` | Company Size | string | Yes |
| `annual_turnover` | Annual Turnover | currency | Yes |
| `headcount` | Number of Employees | count | Yes |
| `contact_person` | Contact Person | string | No |
| `contact_email` | Contact Email | string | No |
| `contact_phone` | Contact Phone | string | No |
| `industry` | Industry | string | Yes |

#### Financials (`financials`)

**Entities (9)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `total_revenue` | Total Revenue | currency | Yes |
| `npat` | NPAT | currency | Yes |
| `leviable_amount` | Leviable Amount | currency | Yes |
| `total_payroll` | Total Payroll | currency | No |
| `tmps_inclusions` | TMPS Inclusions | currency | Yes |
| `tmps_exclusions` | TMPS Exclusions | currency | Yes |
| `tmps` | TMPS | currency | Yes |
| `financial_year_end` | Financial Year End | date | Yes |
| `industry_norm` | Industry Norm | percentage | No |

#### Ownership (`ownership`)

**Criteria (7)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `OWN-VR-BLACK` | Exercisable voting rights of black people | 25.0% | 4 |
| `OWN-VR-BWO` | Exercisable voting rights of black women | 10.0% | 2 |
| `OWN-EI-BLACK` | Economic interest of black people | 25.0% | 4 |
| `OWN-EI-BWO` | Economic interest of black women | 10.0% | 2 |
| `OWN-DG` | Economic interest of black designated groups | 10.0% | 3 |
| `OWN-NE` | Economic interest of black new entrants | new_entrant | 2 |
| `OWN-NV` | Net value | complex | 8 |

**Entities (5)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `shareholder_name` | Shareholder Name | string | Yes |
| `black_ownership_percent` | Black Ownership Percentage | percentage | Yes |
| `black_women_ownership_percent` | Black Women Ownership Percentage | percentage | Yes |
| `shareholding_percent` | Shareholding Percentage | percentage | Yes |
| `share_value` | Share Value | currency | No |

#### Management Control (`managementControl`)

**Criteria (13)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `MC-BOARD-BLACK` | Board participation — black | 50.0% | 2 |
| `MC-BOARD-BWO` | Board participation — black women | 25.0% | 1 |
| `MC-EXEC-BLACK` | Executive management — black | 50.0% | 2 |
| `MC-EXEC-BWO` | Executive management — black women | 25.0% | 1 |
| `MC-OEXEC-BLACK` | Other executive management — black | 60.0% | 2 |
| `MC-OEXEC-BWO` | Other executive management — black women | 30.0% | 1 |
| `EE-SENIOR` | Senior management — black | EAP | 2 |
| `EE-MIDDLE` | Middle management — black | EAP | 2 |
| `EE-JUNIOR` | Junior management — black | EAP | 1 |
| `EE-DISABLED` | Employees with disabilities | 2.0% | 2 |
| `EE-SENIOR-BWO` | Senior management — black women | EAP | 1 |
| `EE-MIDDLE-BWO` | Middle management — black women | EAP | 1 |
| `EE-JUNIOR-BWO` | Junior management — black women | EAP | 1 |

**Entities (10)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `employee_name` | Employee Name | string | Yes |
| `employee_gender` | Employee Gender | string | Yes |
| `employee_race` | Employee Race | string | Yes |
| `employee_designation` | Employee Designation | string | Yes |
| `employee_disabled` | Employee Disability Status | boolean | No |
| `ee_employee_name` | EE Employee Name | string | Yes |
| `ee_employee_gender` | EE Employee Gender | string | Yes |
| `ee_employee_race` | EE Employee Race | string | Yes |
| `ee_employee_designation` | EE Employee Designation | string | Yes |
| `ee_employee_disabled` | EE Employee Disability Status | boolean | Yes |

#### Employment Equity (`employmentEquity`)

#### Skills Development (`skillsDevelopment`)

**Criteria (5)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SKILLS-LEARNING` | Expenditure on learning programmes for black people | 3.5 | 6 |
| `SKILLS-BURS` | Expenditure on bursaries for black students | 2.5 | 4 |
| `SKILLS-DISABLED` | Expenditure on learning programmes for disabled black employees | 30.0% | 4 |
| `SKILLS-LEARNERSHIP` | Number of black people in learnerships, apprenticeships or internships | 5 | 6 |
| `SKILLS-ABSORPTION` | Absorption of black people after learnerships/apprenticeships/internships | 2.5 | 5 |

**Entities (26)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `training_programme_name` | Training Programme Name | string | Yes |
| `training_category` | Training Category | string | Yes |
| `training_is_abet` | ABET Training | boolean | No |
| `training_is_mandatory` | Mandatory Training | boolean | No |
| `training_is_bursary` | Bursary - Higher Education | boolean | No |
| `training_provider` | Training Provider | string | No |
| `training_cost` | Training Cost | currency | Yes |
| `training_course_cost` | Course Cost | currency | No |
| `training_travel_cost` | Travel Cost | currency | No |
| `training_accommodation_cost` | Accommodation Cost | currency | No |
| `training_meals_cost` | Meals/Catering Cost | currency | No |
| `training_stationery_cost` | Stationery/Materials Cost | currency | No |
| `training_other_cost` | Other Training Costs | currency | No |
| `training_salary_cost` | Salary Cost | currency | No |
| `learner_name` | Learner Name | string | Yes |
| `learner_id_number` | Learner ID Number | string | No |
| `learner_gender` | Learner Gender | string | Yes |
| `learner_race` | Learner Race | string | Yes |
| `learner_disabled` | Learner Disability Status | boolean | Yes |
| `learner_foreign` | Learner Foreign Status | boolean | No |
| `learner_employment_status` | Learner Employment Status | string | Yes |
| `training_is_yes_employee` | YES Employee | boolean | No |
| `training_is_completed` | Training Completed | boolean | No |
| `training_is_absorbed` | Learner Absorbed | boolean | No |
| `training_start_date` | Training Start Date | date | No |
| `training_end_date` | Training End Date | date | No |

#### Preferential Procurement (`preferentialProcurement`)

**Criteria (6)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `PROC-EMP` | B-BBEE procurement from empowering suppliers | 80.0% | 5 |
| `PROC-QSE` | Spend on QSE empowering suppliers | 15.0% | 3 |
| `PROC-EME` | Spend on EME suppliers | 15.0% | 4 |
| `PROC-BO51` | Spend on 51%+ black-owned suppliers | 50.0% | 11 |
| `PROC-BWO30` | Spend on 30%+ black women-owned suppliers | 12.0% | 4 |
| `PROC-DG` | Spend on designated group suppliers | 2.0% | 2 |

**Entities (17)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `supplier_name` | Supplier Name | string | Yes |
| `supplier_size` | Supplier Company Size | string | Yes |
| `supplier_bee_level` | Supplier BEE Level | bee_level | Yes |
| `supplier_vat` | Supplier VAT Number | string | No |
| `supplier_is_empowering` | Empowering Supplier | boolean | No |
| `supplier_is_foreign` | Foreign Supplier | boolean | No |
| `supplier_black_ownership` | Supplier Black Ownership | percentage | No |
| `supplier_black_women_ownership` | Supplier Black Women Ownership | percentage | No |
| `supplier_flow_through_ownership` | Flow-through Black Ownership | percentage | No |
| `supplier_designated_group_ownership` | Designated Group Ownership | percentage | No |
| `supplier_is_sd_recipient` | Supplier Development Recipient | boolean | No |
| `supplier_has_3yr_contract` | Three Year Contract | boolean | No |
| `supplier_spend` | Supplier Spend | currency | Yes |
| `supplier_first_procurement_date` | Date of First Procurement | date | No |
| `supplier_size_at_first_procurement` | Size at First Procurement | string | No |
| `supplier_certificate_expiry` | Certificate Expiry Date | date | No |
| `supplier_location` | Supplier Location | string | No |

#### Enterprise & Supplier Development (`enterpriseSupplierDevelopment`)

**Criteria (4)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `ESD-SD` | Supplier development contributions | 2 | 10 |
| `ESD-ED` | Enterprise development contributions | 100.0% | 5 |
| `ESD-GRAD` | Bonus: Graduation to supplier development | bonus | 1 |
| `ESD-JOBS` | Bonus: Jobs created | bonus | 1 |

**Entities (15)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `esd_beneficiary` | ESD Beneficiary | string | Yes |
| `esd_first_assistance_date` | Date of First Assistance | date | Yes |
| `esd_initial_black_ownership` | Initial Black Ownership | percentage | Yes |
| `esd_initial_size` | Initial Company Size | string | Yes |
| `esd_current_black_ownership` | Current Black Ownership | percentage | Yes |
| `esd_current_size` | Current Company Size | string | Yes |
| `esd_contribution_description` | Contribution Description | string | No |
| `esd_transaction_date` | Transaction Date | date | Yes |
| `esd_contribution_type` | ESD Contribution Type | string | Yes |
| `esd_amount` | ESD Amount | currency | Yes |
| `esd_invoice_date` | Invoice Date | date | No |
| `esd_payment_date` | Payment Date | date | No |
| `esd_prime_rate` | Prime Rate | percentage | No |
| `esd_actual_rate` | Actual Rate | percentage | No |
| `esd_category` | ESD Category | string | Yes |

#### Socio-Economic Development (`socioEconomicDevelopment`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SED-SPEND` | SED contributions | 100.0% | 5 |

**Entities (13)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `sed_beneficiary` | SED Beneficiary | string | Yes |
| `sed_description` | Description of Spend | string | No |
| `sed_transaction_date` | Transaction Date | date | Yes |
| `sed_contribution_type` | SED Contribution Type | string | Yes |
| `sed_black_benefit_percent` | Black Benefit Percentage | percentage | Yes |
| `sed_amount` | SED Amount | currency | Yes |
| `sed_province` | Province | string | No |
| `sed_african_male_beneficiaries` | African Male Beneficiaries | count | No |
| `sed_african_female_beneficiaries` | African Female Beneficiaries | count | No |
| `sed_coloured_male_beneficiaries` | Coloured Male Beneficiaries | count | No |
| `sed_coloured_female_beneficiaries` | Coloured Female Beneficiaries | count | No |
| `sed_indian_male_beneficiaries` | Indian Male Beneficiaries | count | No |
| `sed_indian_female_beneficiaries` | Indian Female Beneficiaries | count | No |

#### YES Initiative (`yesInitiative`)

**Criteria (3)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `YES-HEADCOUNT` | YES youth headcount target | size_based | 0 |
| `YES-ABSORPTION` | YES absorption rate | 25.0% | 0 |
| `YES-LEVEL` | YES level increase | tier_based | 0 |

**Entities (8)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `yes_participant_name` | YES Participant Name | string | Yes |
| `yes_participant_id` | YES Participant ID | string | Yes |
| `yes_participant_age` | YES Participant Age | count | Yes |
| `yes_start_date` | YES Start Date | date | Yes |
| `yes_end_date` | YES End Date | date | Yes |
| `yes_is_absorbed` | YES Participant Absorbed | boolean | Yes |
| `yes_months_retained` | YES Months Retained | count | Yes |
| `yes_company_size` | YES Host Company Size | string | Yes |


---

## 2. ICT Generic Scorecard
**Sector:** ICT · **Type:** Generic · **10 pillars · 36 criteria · 117 entities**

*Ontology-based template for ICT Generic with 36 criteria across 10 pillars*

### Pillars

| # | Code | Pillar | Max Pts | Sub-Min | Criteria | Entities |
|---|------|--------|---------|---------|----------|----------|
| 1 | `clientInfo` | Client Information | 0 | — | 0 | 12 |
| 2 | `financials` | Financials | 0 | — | 0 | 9 |
| 3 | `ownership` | Ownership | 25 | 10% | 7 | 5 |
| 4 | `managementControl` | Management Control | 23 | — | 10 | 10 |
| 5 | `employmentEquity` | Employment Equity | 0 | — | 0 | 0 |
| 6 | `skillsDevelopment` | Skills Development | 25 | 10% | 5 | 26 |
| 7 | `preferentialProcurement` | Preferential Procurement | 27 | 10.8% | 6 | 19 |
| 8 | `enterpriseSupplierDevelopment` | Enterprise & Supplier Development | 28 | 4% | 4 | 15 |
| 9 | `socioEconomicDevelopment` | Socio-Economic Development | 12 | — | 1 | 13 |
| 10 | `yesInitiative` | YES Initiative | 0 | — | 3 | 8 |

#### Client Information (`clientInfo`)

**Entities (12)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `company_name` | Company Name | string | Yes |
| `trading_name` | Trading Name | string | No |
| `registration_number` | Registration Number | string | Yes |
| `vat_number` | VAT Number | string | No |
| `sector_code` | Sector Code | string | Yes |
| `company_size` | Company Size | string | Yes |
| `annual_turnover` | Annual Turnover | currency | Yes |
| `headcount` | Number of Employees | count | Yes |
| `contact_person` | Contact Person | string | No |
| `contact_email` | Contact Email | string | No |
| `contact_phone` | Contact Phone | string | No |
| `industry` | Industry | string | Yes |

#### Financials (`financials`)

**Entities (9)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `total_revenue` | Total Revenue | currency | Yes |
| `npat` | NPAT | currency | Yes |
| `leviable_amount` | Leviable Amount | currency | Yes |
| `total_payroll` | Total Payroll | currency | No |
| `tmps_inclusions` | TMPS Inclusions | currency | Yes |
| `tmps_exclusions` | TMPS Exclusions | currency | Yes |
| `tmps` | TMPS | currency | Yes |
| `financial_year_end` | Financial Year End | date | Yes |
| `industry_norm` | Industry Norm | percentage | No |

#### Ownership (`ownership`)

**Criteria (7)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `OWN-VR-BLACK` | Exercisable voting rights of black people | 25.0% | 5 |
| `OWN-VR-BWO` | Exercisable voting rights of black women | 10.0% | 2 |
| `OWN-EI-BLACK` | Economic interest of black people | 25.0% | 5 |
| `OWN-EI-BWO` | Economic interest of black women | 10.0% | 2 |
| `OWN-DG` | Economic interest of black designated groups | 10.0% | 3 |
| `OWN-NE` | Economic interest of black new entrants | new_entrant | 3 |
| `OWN-NV` | Net value | complex | 8 |

**Entities (5)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `shareholder_name` | Shareholder Name | string | Yes |
| `black_ownership_percent` | Black Ownership Percentage | percentage | Yes |
| `black_women_ownership_percent` | Black Women Ownership Percentage | percentage | Yes |
| `shareholding_percent` | Shareholding Percentage | percentage | Yes |
| `share_value` | Share Value | currency | No |

#### Management Control (`managementControl`)

**Criteria (10)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `MC-BOARD-BLACK` | Board participation — black | 50.0% | 3 |
| `MC-BOARD-BWO` | Board participation — black women | 25.0% | 2 |
| `MC-EXEC-BLACK` | Executive management — black | 50.0% | 2 |
| `MC-EXEC-BWO` | Executive management — black women | 25.0% | 1 |
| `MC-OEXEC-BLACK` | Other executive management — black | 60.0% | 3 |
| `MC-OEXEC-BWO` | Other executive management — black women | 30.0% | 2 |
| `EE-SENIOR` | Senior management — black | EAP | 0 |
| `EE-MIDDLE` | Middle management — black | EAP | 0 |
| `EE-JUNIOR` | Junior management — black | EAP | 0 |
| `EE-DISABLED` | Employees with disabilities | 2.0% | 2 |

**Entities (10)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `employee_name` | Employee Name | string | Yes |
| `employee_gender` | Employee Gender | string | Yes |
| `employee_race` | Employee Race | string | Yes |
| `employee_designation` | Employee Designation | string | Yes |
| `employee_disabled` | Employee Disability Status | boolean | No |
| `ee_employee_name` | EE Employee Name | string | Yes |
| `ee_employee_gender` | EE Employee Gender | string | Yes |
| `ee_employee_race` | EE Employee Race | string | Yes |
| `ee_employee_designation` | EE Employee Designation | string | Yes |
| `ee_employee_disabled` | EE Employee Disability Status | boolean | Yes |

#### Employment Equity (`employmentEquity`)

#### Skills Development (`skillsDevelopment`)

**Criteria (5)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SKILLS-LEARNING` | Expenditure on learning programmes for black people | 3 | 15 |
| `SKILLS-BURS` | Expenditure on bursaries for black students | 100.0% | 7 |
| `SKILLS-DISABLED` | Expenditure on learning programmes for disabled black employees | 15.0% | 3 |
| `SKILLS-LEARNERSHIP` | Number of black people in learnerships, apprenticeships or internships | 0.0% | 0 |
| `SKILLS-ABSORPTION` | Absorption of black people after learnerships/apprenticeships/internships | 100.0% | 5 |

**Entities (26)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `training_programme_name` | Training Programme Name | string | Yes |
| `training_category` | Training Category | string | Yes |
| `training_is_abet` | ABET Training | boolean | No |
| `training_is_mandatory` | Mandatory Training | boolean | No |
| `training_is_bursary` | Bursary - Higher Education | boolean | No |
| `training_provider` | Training Provider | string | No |
| `training_cost` | Training Cost | currency | Yes |
| `training_course_cost` | Course Cost | currency | No |
| `training_travel_cost` | Travel Cost | currency | No |
| `training_accommodation_cost` | Accommodation Cost | currency | No |
| `training_meals_cost` | Meals/Catering Cost | currency | No |
| `training_stationery_cost` | Stationery/Materials Cost | currency | No |
| `training_other_cost` | Other Training Costs | currency | No |
| `training_salary_cost` | Salary Cost | currency | No |
| `learner_name` | Learner Name | string | Yes |
| `learner_id_number` | Learner ID Number | string | No |
| `learner_gender` | Learner Gender | string | Yes |
| `learner_race` | Learner Race | string | Yes |
| `learner_disabled` | Learner Disability Status | boolean | Yes |
| `learner_foreign` | Learner Foreign Status | boolean | No |
| `learner_employment_status` | Learner Employment Status | string | Yes |
| `training_is_yes_employee` | YES Employee | boolean | No |
| `training_is_completed` | Training Completed | boolean | No |
| `training_is_absorbed` | Learner Absorbed | boolean | No |
| `training_start_date` | Training Start Date | date | No |
| `training_end_date` | Training End Date | date | No |

#### Preferential Procurement (`preferentialProcurement`)

**Criteria (6)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `PROC-EMP` | B-BBEE procurement from empowering suppliers | 80.0% | 5 |
| `PROC-QSE` | Spend on QSE empowering suppliers | 15.0% | 3 |
| `PROC-EME` | Spend on EME suppliers | 15.0% | 4 |
| `PROC-BO51` | Spend on 51%+ black-owned suppliers | 50.0% | 9 |
| `PROC-BWO30` | Spend on 30%+ black women-owned suppliers | 12.0% | 4 |
| `PROC-DG` | Spend on designated group suppliers | 2.0% | 2 |

**Entities (19)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `supplier_name` | Supplier Name | string | Yes |
| `supplier_size` | Supplier Company Size | string | Yes |
| `supplier_bee_level` | Supplier BEE Level | bee_level | Yes |
| `supplier_vat` | Supplier VAT Number | string | No |
| `supplier_is_empowering` | Empowering Supplier | boolean | No |
| `supplier_is_foreign` | Foreign Supplier | boolean | No |
| `supplier_black_ownership` | Supplier Black Ownership | percentage | No |
| `supplier_black_women_ownership` | Supplier Black Women Ownership | percentage | No |
| `supplier_flow_through_ownership` | Flow-through Black Ownership | percentage | No |
| `supplier_designated_group_ownership` | Designated Group Ownership | percentage | No |
| `supplier_is_sd_recipient` | Supplier Development Recipient | boolean | No |
| `supplier_has_3yr_contract` | Three Year Contract | boolean | No |
| `supplier_spend` | Supplier Spend | currency | Yes |
| `supplier_first_procurement_date` | Date of First Procurement | date | No |
| `supplier_size_at_first_procurement` | Size at First Procurement | string | No |
| `supplier_certificate_expiry` | Certificate Expiry Date | date | No |
| `supplier_location` | Supplier Location | string | No |
| `ict_black_owned_spend` | ICT Black-Owned Spend | currency | No |
| `third_party_ict_spend` | 3rd Party ICT Spend | currency | No |

#### Enterprise & Supplier Development (`enterpriseSupplierDevelopment`)

**Criteria (4)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `ESD-SD` | Supplier development contributions | 2 | 10 |
| `ESD-ED` | Enterprise development contributions | 100.0% | 5 |
| `ESD-GRAD` | Bonus: Graduation to supplier development | bonus | 1 |
| `ESD-JOBS` | Bonus: Jobs created | bonus | 1 |

**Entities (15)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `esd_beneficiary` | ESD Beneficiary | string | Yes |
| `esd_first_assistance_date` | Date of First Assistance | date | Yes |
| `esd_initial_black_ownership` | Initial Black Ownership | percentage | Yes |
| `esd_initial_size` | Initial Company Size | string | Yes |
| `esd_current_black_ownership` | Current Black Ownership | percentage | Yes |
| `esd_current_size` | Current Company Size | string | Yes |
| `esd_contribution_description` | Contribution Description | string | No |
| `esd_transaction_date` | Transaction Date | date | Yes |
| `esd_contribution_type` | ESD Contribution Type | string | Yes |
| `esd_amount` | ESD Amount | currency | Yes |
| `esd_invoice_date` | Invoice Date | date | No |
| `esd_payment_date` | Payment Date | date | No |
| `esd_prime_rate` | Prime Rate | percentage | No |
| `esd_actual_rate` | Actual Rate | percentage | No |
| `esd_category` | ESD Category | string | Yes |

#### Socio-Economic Development (`socioEconomicDevelopment`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SED-SPEND` | SED contributions | 100.0% | 12 |

**Entities (13)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `sed_beneficiary` | SED Beneficiary | string | Yes |
| `sed_description` | Description of Spend | string | No |
| `sed_transaction_date` | Transaction Date | date | Yes |
| `sed_contribution_type` | SED Contribution Type | string | Yes |
| `sed_black_benefit_percent` | Black Benefit Percentage | percentage | Yes |
| `sed_amount` | SED Amount | currency | Yes |
| `sed_province` | Province | string | No |
| `sed_african_male_beneficiaries` | African Male Beneficiaries | count | No |
| `sed_african_female_beneficiaries` | African Female Beneficiaries | count | No |
| `sed_coloured_male_beneficiaries` | Coloured Male Beneficiaries | count | No |
| `sed_coloured_female_beneficiaries` | Coloured Female Beneficiaries | count | No |
| `sed_indian_male_beneficiaries` | Indian Male Beneficiaries | count | No |
| `sed_indian_female_beneficiaries` | Indian Female Beneficiaries | count | No |

#### YES Initiative (`yesInitiative`)

**Criteria (3)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `YES-HEADCOUNT` | YES youth headcount target | size_based | 0 |
| `YES-ABSORPTION` | YES absorption rate | 25.0% | 0 |
| `YES-LEVEL` | YES level increase | tier_based | 0 |

**Entities (8)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `yes_participant_name` | YES Participant Name | string | Yes |
| `yes_participant_id` | YES Participant ID | string | Yes |
| `yes_participant_age` | YES Participant Age | count | Yes |
| `yes_start_date` | YES Start Date | date | Yes |
| `yes_end_date` | YES End Date | date | Yes |
| `yes_is_absorbed` | YES Participant Absorbed | boolean | Yes |
| `yes_months_retained` | YES Months Retained | count | Yes |
| `yes_company_size` | YES Host Company Size | string | Yes |


---

## 3. ICT QSE Scorecard
**Sector:** ICT · **Type:** QSE · **9 pillars · 36 criteria · 117 entities**

*Ontology-based template for ICT QSE with 36 criteria across 9 pillars*

### Pillars

| # | Code | Pillar | Max Pts | Sub-Min | Criteria | Entities |
|---|------|--------|---------|---------|----------|----------|
| 1 | `clientInfo` | Client Information | 0 | — | 0 | 12 |
| 2 | `financials` | Financials | 0 | — | 0 | 9 |
| 3 | `ownership` | Ownership | 25 | 10% | 7 | 5 |
| 4 | `managementControl` | Management Control | 15 | — | 10 | 10 |
| 5 | `skillsDevelopment` | Skills Development | 30 | 12% | 5 | 26 |
| 6 | `preferentialProcurement` | Preferential Procurement | 21 | 8.4% | 6 | 19 |
| 7 | `enterpriseSupplierDevelopment` | Enterprise & Supplier Development | 13 | 2% | 4 | 15 |
| 8 | `socioEconomicDevelopment` | Socio-Economic Development | 12 | — | 1 | 13 |
| 9 | `yesInitiative` | YES Initiative | 0 | — | 3 | 8 |

#### Client Information (`clientInfo`)

**Entities (12)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `company_name` | Company Name | string | Yes |
| `trading_name` | Trading Name | string | No |
| `registration_number` | Registration Number | string | Yes |
| `vat_number` | VAT Number | string | No |
| `sector_code` | Sector Code | string | Yes |
| `company_size` | Company Size | string | Yes |
| `annual_turnover` | Annual Turnover | currency | Yes |
| `headcount` | Number of Employees | count | Yes |
| `contact_person` | Contact Person | string | No |
| `contact_email` | Contact Email | string | No |
| `contact_phone` | Contact Phone | string | No |
| `industry` | Industry | string | Yes |

#### Financials (`financials`)

**Entities (9)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `total_revenue` | Total Revenue | currency | Yes |
| `npat` | NPAT | currency | Yes |
| `leviable_amount` | Leviable Amount | currency | Yes |
| `total_payroll` | Total Payroll | currency | No |
| `tmps_inclusions` | TMPS Inclusions | currency | Yes |
| `tmps_exclusions` | TMPS Exclusions | currency | Yes |
| `tmps` | TMPS | currency | Yes |
| `financial_year_end` | Financial Year End | date | Yes |
| `industry_norm` | Industry Norm | percentage | No |

#### Ownership (`ownership`)

**Criteria (7)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `OWN-VR-BLACK` | Exercisable voting rights of black people | 25.0% | 5 |
| `OWN-VR-BWO` | Exercisable voting rights of black women | 10.0% | 2 |
| `OWN-EI-BLACK` | Economic interest of black people | 25.0% | 5 |
| `OWN-EI-BWO` | Economic interest of black women | 10.0% | 2 |
| `OWN-DG` | Economic interest of black designated groups | 10.0% | 3 |
| `OWN-NE` | Economic interest of black new entrants | new_entrant | 3 |
| `OWN-NV` | Net value | complex | 8 |

**Entities (5)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `shareholder_name` | Shareholder Name | string | Yes |
| `black_ownership_percent` | Black Ownership Percentage | percentage | Yes |
| `black_women_ownership_percent` | Black Women Ownership Percentage | percentage | Yes |
| `shareholding_percent` | Shareholding Percentage | percentage | Yes |
| `share_value` | Share Value | currency | No |

#### Management Control (`managementControl`)

**Criteria (10)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `MC-BOARD-BLACK` | Board participation — black | 50.0% | 3 |
| `MC-BOARD-BWO` | Board participation — black women | 25.0% | 2 |
| `MC-EXEC-BLACK` | Executive management — black | 50.0% | 4 |
| `MC-EXEC-BWO` | Executive management — black women | 25.0% | 4 |
| `MC-OEXEC-BLACK` | Other executive management — black | 60.0% | 3 |
| `MC-OEXEC-BWO` | Other executive management — black women | 30.0% | 2 |
| `EE-SENIOR` | Senior management — black | EAP | 0 |
| `EE-MIDDLE` | Middle management — black | EAP | 0 |
| `EE-JUNIOR` | Junior management — black | EAP | 0 |
| `EE-DISABLED` | Employees with disabilities | 2.0% | 2 |

**Entities (10)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `employee_name` | Employee Name | string | Yes |
| `employee_gender` | Employee Gender | string | Yes |
| `employee_race` | Employee Race | string | Yes |
| `employee_designation` | Employee Designation | string | Yes |
| `employee_disabled` | Employee Disability Status | boolean | No |
| `ee_employee_name` | EE Employee Name | string | Yes |
| `ee_employee_gender` | EE Employee Gender | string | Yes |
| `ee_employee_race` | EE Employee Race | string | Yes |
| `ee_employee_designation` | EE Employee Designation | string | Yes |
| `ee_employee_disabled` | EE Employee Disability Status | boolean | Yes |

#### Skills Development (`skillsDevelopment`)

**Criteria (5)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SKILLS-LEARNING` | Expenditure on learning programmes for black people | 3 | 15 |
| `SKILLS-BURS` | Expenditure on bursaries for black students | 100.0% | 7 |
| `SKILLS-DISABLED` | Expenditure on learning programmes for disabled black employees | 15.0% | 3 |
| `SKILLS-LEARNERSHIP` | Number of black people in learnerships, apprenticeships or internships | 0.0% | 0 |
| `SKILLS-ABSORPTION` | Absorption of black people after learnerships/apprenticeships/internships | 100.0% | 5 |

**Entities (26)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `training_programme_name` | Training Programme Name | string | Yes |
| `training_category` | Training Category | string | Yes |
| `training_is_abet` | ABET Training | boolean | No |
| `training_is_mandatory` | Mandatory Training | boolean | No |
| `training_is_bursary` | Bursary - Higher Education | boolean | No |
| `training_provider` | Training Provider | string | No |
| `training_cost` | Training Cost | currency | Yes |
| `training_course_cost` | Course Cost | currency | No |
| `training_travel_cost` | Travel Cost | currency | No |
| `training_accommodation_cost` | Accommodation Cost | currency | No |
| `training_meals_cost` | Meals/Catering Cost | currency | No |
| `training_stationery_cost` | Stationery/Materials Cost | currency | No |
| `training_other_cost` | Other Training Costs | currency | No |
| `training_salary_cost` | Salary Cost | currency | No |
| `learner_name` | Learner Name | string | Yes |
| `learner_id_number` | Learner ID Number | string | No |
| `learner_gender` | Learner Gender | string | Yes |
| `learner_race` | Learner Race | string | Yes |
| `learner_disabled` | Learner Disability Status | boolean | Yes |
| `learner_foreign` | Learner Foreign Status | boolean | No |
| `learner_employment_status` | Learner Employment Status | string | Yes |
| `training_is_yes_employee` | YES Employee | boolean | No |
| `training_is_completed` | Training Completed | boolean | No |
| `training_is_absorbed` | Learner Absorbed | boolean | No |
| `training_start_date` | Training Start Date | date | No |
| `training_end_date` | Training End Date | date | No |

#### Preferential Procurement (`preferentialProcurement`)

**Criteria (6)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `PROC-EMP` | B-BBEE procurement from empowering suppliers | 80.0% | 5 |
| `PROC-QSE` | Spend on QSE empowering suppliers | 15.0% | 3 |
| `PROC-EME` | Spend on EME suppliers | 15.0% | 4 |
| `PROC-BO51` | Spend on 51%+ black-owned suppliers | 50.0% | 9 |
| `PROC-BWO30` | Spend on 30%+ black women-owned suppliers | 12.0% | 4 |
| `PROC-DG` | Spend on designated group suppliers | 2.0% | 2 |

**Entities (19)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `supplier_name` | Supplier Name | string | Yes |
| `supplier_size` | Supplier Company Size | string | Yes |
| `supplier_bee_level` | Supplier BEE Level | bee_level | Yes |
| `supplier_vat` | Supplier VAT Number | string | No |
| `supplier_is_empowering` | Empowering Supplier | boolean | No |
| `supplier_is_foreign` | Foreign Supplier | boolean | No |
| `supplier_black_ownership` | Supplier Black Ownership | percentage | No |
| `supplier_black_women_ownership` | Supplier Black Women Ownership | percentage | No |
| `supplier_flow_through_ownership` | Flow-through Black Ownership | percentage | No |
| `supplier_designated_group_ownership` | Designated Group Ownership | percentage | No |
| `supplier_is_sd_recipient` | Supplier Development Recipient | boolean | No |
| `supplier_has_3yr_contract` | Three Year Contract | boolean | No |
| `supplier_spend` | Supplier Spend | currency | Yes |
| `supplier_first_procurement_date` | Date of First Procurement | date | No |
| `supplier_size_at_first_procurement` | Size at First Procurement | string | No |
| `supplier_certificate_expiry` | Certificate Expiry Date | date | No |
| `supplier_location` | Supplier Location | string | No |
| `ict_black_owned_spend` | ICT Black-Owned Spend | currency | No |
| `third_party_ict_spend` | 3rd Party ICT Spend | currency | No |

#### Enterprise & Supplier Development (`enterpriseSupplierDevelopment`)

**Criteria (4)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `ESD-SD` | Supplier development contributions | 100.0% | 5 |
| `ESD-ED` | Enterprise development contributions | 100.0% | 5 |
| `ESD-GRAD` | Bonus: Graduation to supplier development | bonus | 1 |
| `ESD-JOBS` | Bonus: Jobs created | bonus | 1 |

**Entities (15)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `esd_beneficiary` | ESD Beneficiary | string | Yes |
| `esd_first_assistance_date` | Date of First Assistance | date | Yes |
| `esd_initial_black_ownership` | Initial Black Ownership | percentage | Yes |
| `esd_initial_size` | Initial Company Size | string | Yes |
| `esd_current_black_ownership` | Current Black Ownership | percentage | Yes |
| `esd_current_size` | Current Company Size | string | Yes |
| `esd_contribution_description` | Contribution Description | string | No |
| `esd_transaction_date` | Transaction Date | date | Yes |
| `esd_contribution_type` | ESD Contribution Type | string | Yes |
| `esd_amount` | ESD Amount | currency | Yes |
| `esd_invoice_date` | Invoice Date | date | No |
| `esd_payment_date` | Payment Date | date | No |
| `esd_prime_rate` | Prime Rate | percentage | No |
| `esd_actual_rate` | Actual Rate | percentage | No |
| `esd_category` | ESD Category | string | Yes |

#### Socio-Economic Development (`socioEconomicDevelopment`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SED-SPEND` | SED contributions | 100.0% | 12 |

**Entities (13)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `sed_beneficiary` | SED Beneficiary | string | Yes |
| `sed_description` | Description of Spend | string | No |
| `sed_transaction_date` | Transaction Date | date | Yes |
| `sed_contribution_type` | SED Contribution Type | string | Yes |
| `sed_black_benefit_percent` | Black Benefit Percentage | percentage | Yes |
| `sed_amount` | SED Amount | currency | Yes |
| `sed_province` | Province | string | No |
| `sed_african_male_beneficiaries` | African Male Beneficiaries | count | No |
| `sed_african_female_beneficiaries` | African Female Beneficiaries | count | No |
| `sed_coloured_male_beneficiaries` | Coloured Male Beneficiaries | count | No |
| `sed_coloured_female_beneficiaries` | Coloured Female Beneficiaries | count | No |
| `sed_indian_male_beneficiaries` | Indian Male Beneficiaries | count | No |
| `sed_indian_female_beneficiaries` | Indian Female Beneficiaries | count | No |

#### YES Initiative (`yesInitiative`)

**Criteria (3)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `YES-HEADCOUNT` | YES youth headcount target | size_based | 0 |
| `YES-ABSORPTION` | YES absorption rate | 25.0% | 0 |
| `YES-LEVEL` | YES level increase | tier_based | 0 |

**Entities (8)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `yes_participant_name` | YES Participant Name | string | Yes |
| `yes_participant_id` | YES Participant ID | string | Yes |
| `yes_participant_age` | YES Participant Age | count | Yes |
| `yes_start_date` | YES Start Date | date | Yes |
| `yes_end_date` | YES End Date | date | Yes |
| `yes_is_absorbed` | YES Participant Absorbed | boolean | Yes |
| `yes_months_retained` | YES Months Retained | count | Yes |
| `yes_company_size` | YES Host Company Size | string | Yes |


---

## 4. RCOGP QSE Scorecard
**Sector:** RCOGP · **Type:** QSE · **9 pillars · 36 criteria · 115 entities**

*Ontology-based template for RCOGP QSE with 36 criteria across 9 pillars*

### Pillars

| # | Code | Pillar | Max Pts | Sub-Min | Criteria | Entities |
|---|------|--------|---------|---------|----------|----------|
| 1 | `clientInfo` | Client Information | 0 | — | 0 | 12 |
| 2 | `financials` | Financials | 0 | — | 0 | 9 |
| 3 | `ownership` | Ownership | 25 | 10% | 7 | 5 |
| 4 | `managementControl` | Management Control | 15 | — | 10 | 10 |
| 5 | `skillsDevelopment` | Skills Development | 30 | 12% | 5 | 26 |
| 6 | `preferentialProcurement` | Preferential Procurement | 21 | 8.4% | 6 | 17 |
| 7 | `enterpriseSupplierDevelopment` | Enterprise & Supplier Development | 12 | 2% | 4 | 15 |
| 8 | `socioEconomicDevelopment` | Socio-Economic Development | 5 | — | 1 | 13 |
| 9 | `yesInitiative` | YES Initiative | 0 | — | 3 | 8 |

#### Client Information (`clientInfo`)

**Entities (12)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `company_name` | Company Name | string | Yes |
| `trading_name` | Trading Name | string | No |
| `registration_number` | Registration Number | string | Yes |
| `vat_number` | VAT Number | string | No |
| `sector_code` | Sector Code | string | Yes |
| `company_size` | Company Size | string | Yes |
| `annual_turnover` | Annual Turnover | currency | Yes |
| `headcount` | Number of Employees | count | Yes |
| `contact_person` | Contact Person | string | No |
| `contact_email` | Contact Email | string | No |
| `contact_phone` | Contact Phone | string | No |
| `industry` | Industry | string | Yes |

#### Financials (`financials`)

**Entities (9)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `total_revenue` | Total Revenue | currency | Yes |
| `npat` | NPAT | currency | Yes |
| `leviable_amount` | Leviable Amount | currency | Yes |
| `total_payroll` | Total Payroll | currency | No |
| `tmps_inclusions` | TMPS Inclusions | currency | Yes |
| `tmps_exclusions` | TMPS Exclusions | currency | Yes |
| `tmps` | TMPS | currency | Yes |
| `financial_year_end` | Financial Year End | date | Yes |
| `industry_norm` | Industry Norm | percentage | No |

#### Ownership (`ownership`)

**Criteria (7)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `OWN-VR-BLACK` | Exercisable voting rights of black people | 25.0% | 5 |
| `OWN-VR-BWO` | Exercisable voting rights of black women | 10.0% | 2 |
| `OWN-EI-BLACK` | Economic interest of black people | 25.0% | 5 |
| `OWN-EI-BWO` | Economic interest of black women | 10.0% | 2 |
| `OWN-DG` | Economic interest of black designated groups | 10.0% | 3 |
| `OWN-NE` | Economic interest of black new entrants | new_entrant | 3 |
| `OWN-NV` | Net value | complex | 8 |

**Entities (5)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `shareholder_name` | Shareholder Name | string | Yes |
| `black_ownership_percent` | Black Ownership Percentage | percentage | Yes |
| `black_women_ownership_percent` | Black Women Ownership Percentage | percentage | Yes |
| `shareholding_percent` | Shareholding Percentage | percentage | Yes |
| `share_value` | Share Value | currency | No |

#### Management Control (`managementControl`)

**Criteria (10)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `MC-BOARD-BLACK` | Board participation — black | 50.0% | 3 |
| `MC-BOARD-BWO` | Board participation — black women | 25.0% | 2 |
| `MC-EXEC-BLACK` | Executive management — black | 50.0% | 5 |
| `MC-EXEC-BWO` | Executive management — black women | 25.0% | 2 |
| `MC-OEXEC-BLACK` | Other executive management — black | 60.0% | 3 |
| `MC-OEXEC-BWO` | Other executive management — black women | 30.0% | 2 |
| `EE-SENIOR` | Senior management — black | EAP | 0 |
| `EE-MIDDLE` | Middle management — black | EAP | 0 |
| `EE-JUNIOR` | Junior management — black | EAP | 0 |
| `EE-DISABLED` | Employees with disabilities | 2.0% | 2 |

**Entities (10)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `employee_name` | Employee Name | string | Yes |
| `employee_gender` | Employee Gender | string | Yes |
| `employee_race` | Employee Race | string | Yes |
| `employee_designation` | Employee Designation | string | Yes |
| `employee_disabled` | Employee Disability Status | boolean | No |
| `ee_employee_name` | EE Employee Name | string | Yes |
| `ee_employee_gender` | EE Employee Gender | string | Yes |
| `ee_employee_race` | EE Employee Race | string | Yes |
| `ee_employee_designation` | EE Employee Designation | string | Yes |
| `ee_employee_disabled` | EE Employee Disability Status | boolean | Yes |

#### Skills Development (`skillsDevelopment`)

**Criteria (5)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SKILLS-LEARNING` | Expenditure on learning programmes for black people | 3 | 15 |
| `SKILLS-BURS` | Expenditure on bursaries for black students | 100.0% | 7 |
| `SKILLS-DISABLED` | Expenditure on learning programmes for disabled black employees | 15.0% | 3 |
| `SKILLS-LEARNERSHIP` | Number of black people in learnerships, apprenticeships or internships | 0.0% | 0 |
| `SKILLS-ABSORPTION` | Absorption of black people after learnerships/apprenticeships/internships | 100.0% | 5 |

**Entities (26)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `training_programme_name` | Training Programme Name | string | Yes |
| `training_category` | Training Category | string | Yes |
| `training_is_abet` | ABET Training | boolean | No |
| `training_is_mandatory` | Mandatory Training | boolean | No |
| `training_is_bursary` | Bursary - Higher Education | boolean | No |
| `training_provider` | Training Provider | string | No |
| `training_cost` | Training Cost | currency | Yes |
| `training_course_cost` | Course Cost | currency | No |
| `training_travel_cost` | Travel Cost | currency | No |
| `training_accommodation_cost` | Accommodation Cost | currency | No |
| `training_meals_cost` | Meals/Catering Cost | currency | No |
| `training_stationery_cost` | Stationery/Materials Cost | currency | No |
| `training_other_cost` | Other Training Costs | currency | No |
| `training_salary_cost` | Salary Cost | currency | No |
| `learner_name` | Learner Name | string | Yes |
| `learner_id_number` | Learner ID Number | string | No |
| `learner_gender` | Learner Gender | string | Yes |
| `learner_race` | Learner Race | string | Yes |
| `learner_disabled` | Learner Disability Status | boolean | Yes |
| `learner_foreign` | Learner Foreign Status | boolean | No |
| `learner_employment_status` | Learner Employment Status | string | Yes |
| `training_is_yes_employee` | YES Employee | boolean | No |
| `training_is_completed` | Training Completed | boolean | No |
| `training_is_absorbed` | Learner Absorbed | boolean | No |
| `training_start_date` | Training Start Date | date | No |
| `training_end_date` | Training End Date | date | No |

#### Preferential Procurement (`preferentialProcurement`)

**Criteria (6)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `PROC-EMP` | B-BBEE procurement from empowering suppliers | 80.0% | 5 |
| `PROC-QSE` | Spend on QSE empowering suppliers | 15.0% | 3 |
| `PROC-EME` | Spend on EME suppliers | 15.0% | 4 |
| `PROC-BO51` | Spend on 51%+ black-owned suppliers | 50.0% | 9 |
| `PROC-BWO30` | Spend on 30%+ black women-owned suppliers | 12.0% | 4 |
| `PROC-DG` | Spend on designated group suppliers | 2.0% | 2 |

**Entities (17)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `supplier_name` | Supplier Name | string | Yes |
| `supplier_size` | Supplier Company Size | string | Yes |
| `supplier_bee_level` | Supplier BEE Level | bee_level | Yes |
| `supplier_vat` | Supplier VAT Number | string | No |
| `supplier_is_empowering` | Empowering Supplier | boolean | No |
| `supplier_is_foreign` | Foreign Supplier | boolean | No |
| `supplier_black_ownership` | Supplier Black Ownership | percentage | No |
| `supplier_black_women_ownership` | Supplier Black Women Ownership | percentage | No |
| `supplier_flow_through_ownership` | Flow-through Black Ownership | percentage | No |
| `supplier_designated_group_ownership` | Designated Group Ownership | percentage | No |
| `supplier_is_sd_recipient` | Supplier Development Recipient | boolean | No |
| `supplier_has_3yr_contract` | Three Year Contract | boolean | No |
| `supplier_spend` | Supplier Spend | currency | Yes |
| `supplier_first_procurement_date` | Date of First Procurement | date | No |
| `supplier_size_at_first_procurement` | Size at First Procurement | string | No |
| `supplier_certificate_expiry` | Certificate Expiry Date | date | No |
| `supplier_location` | Supplier Location | string | No |

#### Enterprise & Supplier Development (`enterpriseSupplierDevelopment`)

**Criteria (4)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `ESD-SD` | Supplier development contributions | 100.0% | 5 |
| `ESD-ED` | Enterprise development contributions | 100.0% | 5 |
| `ESD-GRAD` | Bonus: Graduation to supplier development | bonus | 1 |
| `ESD-JOBS` | Bonus: Jobs created | bonus | 1 |

**Entities (15)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `esd_beneficiary` | ESD Beneficiary | string | Yes |
| `esd_first_assistance_date` | Date of First Assistance | date | Yes |
| `esd_initial_black_ownership` | Initial Black Ownership | percentage | Yes |
| `esd_initial_size` | Initial Company Size | string | Yes |
| `esd_current_black_ownership` | Current Black Ownership | percentage | Yes |
| `esd_current_size` | Current Company Size | string | Yes |
| `esd_contribution_description` | Contribution Description | string | No |
| `esd_transaction_date` | Transaction Date | date | Yes |
| `esd_contribution_type` | ESD Contribution Type | string | Yes |
| `esd_amount` | ESD Amount | currency | Yes |
| `esd_invoice_date` | Invoice Date | date | No |
| `esd_payment_date` | Payment Date | date | No |
| `esd_prime_rate` | Prime Rate | percentage | No |
| `esd_actual_rate` | Actual Rate | percentage | No |
| `esd_category` | ESD Category | string | Yes |

#### Socio-Economic Development (`socioEconomicDevelopment`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SED-SPEND` | SED contributions | 100.0% | 5 |

**Entities (13)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `sed_beneficiary` | SED Beneficiary | string | Yes |
| `sed_description` | Description of Spend | string | No |
| `sed_transaction_date` | Transaction Date | date | Yes |
| `sed_contribution_type` | SED Contribution Type | string | Yes |
| `sed_black_benefit_percent` | Black Benefit Percentage | percentage | Yes |
| `sed_amount` | SED Amount | currency | Yes |
| `sed_province` | Province | string | No |
| `sed_african_male_beneficiaries` | African Male Beneficiaries | count | No |
| `sed_african_female_beneficiaries` | African Female Beneficiaries | count | No |
| `sed_coloured_male_beneficiaries` | Coloured Male Beneficiaries | count | No |
| `sed_coloured_female_beneficiaries` | Coloured Female Beneficiaries | count | No |
| `sed_indian_male_beneficiaries` | Indian Male Beneficiaries | count | No |
| `sed_indian_female_beneficiaries` | Indian Female Beneficiaries | count | No |

#### YES Initiative (`yesInitiative`)

**Criteria (3)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `YES-HEADCOUNT` | YES youth headcount target | size_based | 0 |
| `YES-ABSORPTION` | YES absorption rate | 25.0% | 0 |
| `YES-LEVEL` | YES level increase | tier_based | 0 |

**Entities (8)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `yes_participant_name` | YES Participant Name | string | Yes |
| `yes_participant_id` | YES Participant ID | string | Yes |
| `yes_participant_age` | YES Participant Age | count | Yes |
| `yes_start_date` | YES Start Date | date | Yes |
| `yes_end_date` | YES End Date | date | Yes |
| `yes_is_absorbed` | YES Participant Absorbed | boolean | Yes |
| `yes_months_retained` | YES Months Retained | count | Yes |
| `yes_company_size` | YES Host Company Size | string | Yes |


---

## 5. FSC Generic Scorecard
**Sector:** FSC · **Type:** Generic · **13 pillars · 39 criteria · 118 entities**

*Ontology-based template for FSC Generic with 39 criteria across 13 pillars*

### Pillars

| # | Code | Pillar | Max Pts | Sub-Min | Criteria | Entities |
|---|------|--------|---------|---------|----------|----------|
| 1 | `clientInfo` | Client Information | 0 | — | 0 | 12 |
| 2 | `financials` | Financials | 0 | — | 0 | 9 |
| 3 | `ownership` | Ownership | 25 | 10% | 7 | 5 |
| 4 | `managementControl` | Management Control | 21 | — | 10 | 10 |
| 5 | `employmentEquity` | Employment Equity | 0 | — | 0 | 0 |
| 6 | `skillsDevelopment` | Skills Development | 23 | 9.200000000000001% | 5 | 26 |
| 7 | `preferentialProcurement` | Preferential Procurement | 24 | 9.600000000000001% | 6 | 17 |
| 8 | `enterpriseSupplierDevelopment` | Enterprise & Supplier Development | 19 | 4% | 4 | 15 |
| 9 | `socioEconomicDevelopment` | Socio-Economic Development | 8 | — | 1 | 13 |
| 10 | `yesInitiative` | YES Initiative | 0 | — | 3 | 8 |
| 11 | `empowermentFinancing` | Empowerment Financing (FSC) | 15 | — | 1 | 3 |
| 12 | `accessToFinancialServices` | Access to Financial Services (FSC) | 12 | — | 1 | 0 |
| 13 | `consumerEducation` | Consumer Education (FSC) | 5 | — | 1 | 0 |

#### Client Information (`clientInfo`)

**Entities (12)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `company_name` | Company Name | string | Yes |
| `trading_name` | Trading Name | string | No |
| `registration_number` | Registration Number | string | Yes |
| `vat_number` | VAT Number | string | No |
| `sector_code` | Sector Code | string | Yes |
| `company_size` | Company Size | string | Yes |
| `annual_turnover` | Annual Turnover | currency | Yes |
| `headcount` | Number of Employees | count | Yes |
| `contact_person` | Contact Person | string | No |
| `contact_email` | Contact Email | string | No |
| `contact_phone` | Contact Phone | string | No |
| `industry` | Industry | string | Yes |

#### Financials (`financials`)

**Entities (9)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `total_revenue` | Total Revenue | currency | Yes |
| `npat` | NPAT | currency | Yes |
| `leviable_amount` | Leviable Amount | currency | Yes |
| `total_payroll` | Total Payroll | currency | No |
| `tmps_inclusions` | TMPS Inclusions | currency | Yes |
| `tmps_exclusions` | TMPS Exclusions | currency | Yes |
| `tmps` | TMPS | currency | Yes |
| `financial_year_end` | Financial Year End | date | Yes |
| `industry_norm` | Industry Norm | percentage | No |

#### Ownership (`ownership`)

**Criteria (7)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `OWN-VR-BLACK` | Exercisable voting rights of black people | 25.0% | 4 |
| `OWN-VR-BWO` | Exercisable voting rights of black women | 10.0% | 2 |
| `OWN-EI-BLACK` | Economic interest of black people | 25.0% | 4 |
| `OWN-EI-BWO` | Economic interest of black women | 10.0% | 2 |
| `OWN-DG` | Economic interest of black designated groups | 10.0% | 3 |
| `OWN-NE` | Economic interest of black new entrants | new_entrant | 2 |
| `OWN-NV` | Net value | complex | 8 |

**Entities (5)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `shareholder_name` | Shareholder Name | string | Yes |
| `black_ownership_percent` | Black Ownership Percentage | percentage | Yes |
| `black_women_ownership_percent` | Black Women Ownership Percentage | percentage | Yes |
| `shareholding_percent` | Shareholding Percentage | percentage | Yes |
| `share_value` | Share Value | currency | No |

#### Management Control (`managementControl`)

**Criteria (10)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `MC-BOARD-BLACK` | Board participation — black | 50.0% | 3 |
| `MC-BOARD-BWO` | Board participation — black women | 25.0% | 2 |
| `MC-EXEC-BLACK` | Executive management — black | 50.0% | 3 |
| `MC-EXEC-BWO` | Executive management — black women | 25.0% | 1 |
| `MC-OEXEC-BLACK` | Other executive management — black | 75.0% | 10 |
| `MC-OEXEC-BWO` | Other executive management — black women | 38.0% | 2 |
| `EE-SENIOR` | Senior management — black | EAP | 0 |
| `EE-MIDDLE` | Middle management — black | EAP | 0 |
| `EE-JUNIOR` | Junior management — black | EAP | 0 |
| `EE-DISABLED` | Employees with disabilities | 2.0% | 0 |

**Entities (10)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `employee_name` | Employee Name | string | Yes |
| `employee_gender` | Employee Gender | string | Yes |
| `employee_race` | Employee Race | string | Yes |
| `employee_designation` | Employee Designation | string | Yes |
| `employee_disabled` | Employee Disability Status | boolean | No |
| `ee_employee_name` | EE Employee Name | string | Yes |
| `ee_employee_gender` | EE Employee Gender | string | Yes |
| `ee_employee_race` | EE Employee Race | string | Yes |
| `ee_employee_designation` | EE Employee Designation | string | Yes |
| `ee_employee_disabled` | EE Employee Disability Status | boolean | Yes |

#### Employment Equity (`employmentEquity`)

#### Skills Development (`skillsDevelopment`)

**Criteria (5)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SKILLS-LEARNING` | Expenditure on learning programmes for black people | 3.5 | 6 |
| `SKILLS-BURS` | Expenditure on bursaries for black students | 2.5 | 4 |
| `SKILLS-DISABLED` | Expenditure on learning programmes for disabled black employees | 30.0% | 4 |
| `SKILLS-LEARNERSHIP` | Number of black people in learnerships, apprenticeships or internships | 5 | 6 |
| `SKILLS-ABSORPTION` | Absorption of black people after learnerships/apprenticeships/internships | 2.5 | 5 |

**Entities (26)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `training_programme_name` | Training Programme Name | string | Yes |
| `training_category` | Training Category | string | Yes |
| `training_is_abet` | ABET Training | boolean | No |
| `training_is_mandatory` | Mandatory Training | boolean | No |
| `training_is_bursary` | Bursary - Higher Education | boolean | No |
| `training_provider` | Training Provider | string | No |
| `training_cost` | Training Cost | currency | Yes |
| `training_course_cost` | Course Cost | currency | No |
| `training_travel_cost` | Travel Cost | currency | No |
| `training_accommodation_cost` | Accommodation Cost | currency | No |
| `training_meals_cost` | Meals/Catering Cost | currency | No |
| `training_stationery_cost` | Stationery/Materials Cost | currency | No |
| `training_other_cost` | Other Training Costs | currency | No |
| `training_salary_cost` | Salary Cost | currency | No |
| `learner_name` | Learner Name | string | Yes |
| `learner_id_number` | Learner ID Number | string | No |
| `learner_gender` | Learner Gender | string | Yes |
| `learner_race` | Learner Race | string | Yes |
| `learner_disabled` | Learner Disability Status | boolean | Yes |
| `learner_foreign` | Learner Foreign Status | boolean | No |
| `learner_employment_status` | Learner Employment Status | string | Yes |
| `training_is_yes_employee` | YES Employee | boolean | No |
| `training_is_completed` | Training Completed | boolean | No |
| `training_is_absorbed` | Learner Absorbed | boolean | No |
| `training_start_date` | Training Start Date | date | No |
| `training_end_date` | Training End Date | date | No |

#### Preferential Procurement (`preferentialProcurement`)

**Criteria (6)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `PROC-EMP` | B-BBEE procurement from empowering suppliers | 80.0% | 5 |
| `PROC-QSE` | Spend on QSE empowering suppliers | 15.0% | 3 |
| `PROC-EME` | Spend on EME suppliers | 15.0% | 4 |
| `PROC-BO51` | Spend on 51%+ black-owned suppliers | 50.0% | 9 |
| `PROC-BWO30` | Spend on 30%+ black women-owned suppliers | 12.0% | 4 |
| `PROC-DG` | Spend on designated group suppliers | 2.0% | 2 |

**Entities (17)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `supplier_name` | Supplier Name | string | Yes |
| `supplier_size` | Supplier Company Size | string | Yes |
| `supplier_bee_level` | Supplier BEE Level | bee_level | Yes |
| `supplier_vat` | Supplier VAT Number | string | No |
| `supplier_is_empowering` | Empowering Supplier | boolean | No |
| `supplier_is_foreign` | Foreign Supplier | boolean | No |
| `supplier_black_ownership` | Supplier Black Ownership | percentage | No |
| `supplier_black_women_ownership` | Supplier Black Women Ownership | percentage | No |
| `supplier_flow_through_ownership` | Flow-through Black Ownership | percentage | No |
| `supplier_designated_group_ownership` | Designated Group Ownership | percentage | No |
| `supplier_is_sd_recipient` | Supplier Development Recipient | boolean | No |
| `supplier_has_3yr_contract` | Three Year Contract | boolean | No |
| `supplier_spend` | Supplier Spend | currency | Yes |
| `supplier_first_procurement_date` | Date of First Procurement | date | No |
| `supplier_size_at_first_procurement` | Size at First Procurement | string | No |
| `supplier_certificate_expiry` | Certificate Expiry Date | date | No |
| `supplier_location` | Supplier Location | string | No |

#### Enterprise & Supplier Development (`enterpriseSupplierDevelopment`)

**Criteria (4)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `ESD-SD` | Supplier development contributions | 2 | 10 |
| `ESD-ED` | Enterprise development contributions | 100.0% | 5 |
| `ESD-GRAD` | Bonus: Graduation to supplier development | bonus | 1 |
| `ESD-JOBS` | Bonus: Jobs created | bonus | 1 |

**Entities (15)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `esd_beneficiary` | ESD Beneficiary | string | Yes |
| `esd_first_assistance_date` | Date of First Assistance | date | Yes |
| `esd_initial_black_ownership` | Initial Black Ownership | percentage | Yes |
| `esd_initial_size` | Initial Company Size | string | Yes |
| `esd_current_black_ownership` | Current Black Ownership | percentage | Yes |
| `esd_current_size` | Current Company Size | string | Yes |
| `esd_contribution_description` | Contribution Description | string | No |
| `esd_transaction_date` | Transaction Date | date | Yes |
| `esd_contribution_type` | ESD Contribution Type | string | Yes |
| `esd_amount` | ESD Amount | currency | Yes |
| `esd_invoice_date` | Invoice Date | date | No |
| `esd_payment_date` | Payment Date | date | No |
| `esd_prime_rate` | Prime Rate | percentage | No |
| `esd_actual_rate` | Actual Rate | percentage | No |
| `esd_category` | ESD Category | string | Yes |

#### Socio-Economic Development (`socioEconomicDevelopment`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SED-SPEND` | SED contributions | 100.0% | 8 |

**Entities (13)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `sed_beneficiary` | SED Beneficiary | string | Yes |
| `sed_description` | Description of Spend | string | No |
| `sed_transaction_date` | Transaction Date | date | Yes |
| `sed_contribution_type` | SED Contribution Type | string | Yes |
| `sed_black_benefit_percent` | Black Benefit Percentage | percentage | Yes |
| `sed_amount` | SED Amount | currency | Yes |
| `sed_province` | Province | string | No |
| `sed_african_male_beneficiaries` | African Male Beneficiaries | count | No |
| `sed_african_female_beneficiaries` | African Female Beneficiaries | count | No |
| `sed_coloured_male_beneficiaries` | Coloured Male Beneficiaries | count | No |
| `sed_coloured_female_beneficiaries` | Coloured Female Beneficiaries | count | No |
| `sed_indian_male_beneficiaries` | Indian Male Beneficiaries | count | No |
| `sed_indian_female_beneficiaries` | Indian Female Beneficiaries | count | No |

#### YES Initiative (`yesInitiative`)

**Criteria (3)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `YES-HEADCOUNT` | YES youth headcount target | size_based | 0 |
| `YES-ABSORPTION` | YES absorption rate | 25.0% | 0 |
| `YES-LEVEL` | YES level increase | tier_based | 0 |

**Entities (8)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `yes_participant_name` | YES Participant Name | string | Yes |
| `yes_participant_id` | YES Participant ID | string | Yes |
| `yes_participant_age` | YES Participant Age | count | Yes |
| `yes_start_date` | YES Start Date | date | Yes |
| `yes_end_date` | YES End Date | date | Yes |
| `yes_is_absorbed` | YES Participant Absorbed | boolean | Yes |
| `yes_months_retained` | YES Months Retained | count | Yes |
| `yes_company_size` | YES Host Company Size | string | Yes |

#### Empowerment Financing (FSC) (`empowermentFinancing`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `EF-BANKS` | Empowerment Financing — Banks | sector_specific | 15 |

**Entities (3)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `access_financial_services` | Access to Financial Services | string | No |
| `empowerment_financing_amount` | Empowerment Financing Amount | currency | No |
| `bee_transaction_financing` | BEE Transaction Financing | currency | No |

#### Access to Financial Services (FSC) (`accessToFinancialServices`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `AFS-SCORE` | Access to Financial Services | sector_specific | 12 |

#### Consumer Education (FSC) (`consumerEducation`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `CE-SCORE` | Consumer Education contributions | sector_specific | 5 |


---

## 6. AGRI Generic Scorecard
**Sector:** AGRI · **Type:** Generic · **10 pillars · 36 criteria · 118 entities**

*Ontology-based template for AGRI Generic with 36 criteria across 10 pillars*

### Pillars

| # | Code | Pillar | Max Pts | Sub-Min | Criteria | Entities |
|---|------|--------|---------|---------|----------|----------|
| 1 | `clientInfo` | Client Information | 0 | — | 0 | 12 |
| 2 | `financials` | Financials | 0 | — | 0 | 9 |
| 3 | `ownership` | Ownership | 25 | 10% | 7 | 6 |
| 4 | `managementControl` | Management Control | 23 | — | 10 | 10 |
| 5 | `employmentEquity` | Employment Equity | 0 | — | 0 | 0 |
| 6 | `skillsDevelopment` | Skills Development | 25 | 10% | 5 | 26 |
| 7 | `preferentialProcurement` | Preferential Procurement | 27 | 10.8% | 6 | 17 |
| 8 | `enterpriseSupplierDevelopment` | Enterprise & Supplier Development | 17 | 4% | 4 | 16 |
| 9 | `socioEconomicDevelopment` | Socio-Economic Development | 15 | — | 1 | 14 |
| 10 | `yesInitiative` | YES Initiative | 0 | — | 3 | 8 |

#### Client Information (`clientInfo`)

**Entities (12)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `company_name` | Company Name | string | Yes |
| `trading_name` | Trading Name | string | No |
| `registration_number` | Registration Number | string | Yes |
| `vat_number` | VAT Number | string | No |
| `sector_code` | Sector Code | string | Yes |
| `company_size` | Company Size | string | Yes |
| `annual_turnover` | Annual Turnover | currency | Yes |
| `headcount` | Number of Employees | count | Yes |
| `contact_person` | Contact Person | string | No |
| `contact_email` | Contact Email | string | No |
| `contact_phone` | Contact Phone | string | No |
| `industry` | Industry | string | Yes |

#### Financials (`financials`)

**Entities (9)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `total_revenue` | Total Revenue | currency | Yes |
| `npat` | NPAT | currency | Yes |
| `leviable_amount` | Leviable Amount | currency | Yes |
| `total_payroll` | Total Payroll | currency | No |
| `tmps_inclusions` | TMPS Inclusions | currency | Yes |
| `tmps_exclusions` | TMPS Exclusions | currency | Yes |
| `tmps` | TMPS | currency | Yes |
| `financial_year_end` | Financial Year End | date | Yes |
| `industry_norm` | Industry Norm | percentage | No |

#### Ownership (`ownership`)

**Criteria (7)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `OWN-VR-BLACK` | Exercisable voting rights of black people | 25.0% | 5 |
| `OWN-VR-BWO` | Exercisable voting rights of black women | 10.0% | 2 |
| `OWN-EI-BLACK` | Economic interest of black people | 25.0% | 5 |
| `OWN-EI-BWO` | Economic interest of black women | 10.0% | 2 |
| `OWN-DG` | Economic interest of black designated groups | 10.0% | 3 |
| `OWN-NE` | Economic interest of black new entrants | new_entrant | 3 |
| `OWN-NV` | Net value | complex | 8 |

**Entities (6)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `shareholder_name` | Shareholder Name | string | Yes |
| `black_ownership_percent` | Black Ownership Percentage | percentage | Yes |
| `black_women_ownership_percent` | Black Women Ownership Percentage | percentage | Yes |
| `shareholding_percent` | Shareholding Percentage | percentage | Yes |
| `share_value` | Share Value | currency | No |
| `land_ownership_black` | Land Ownership Black | percentage | No |

#### Management Control (`managementControl`)

**Criteria (10)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `MC-BOARD-BLACK` | Board participation — black | 50.0% | 3 |
| `MC-BOARD-BWO` | Board participation — black women | 25.0% | 2 |
| `MC-EXEC-BLACK` | Executive management — black | 50.0% | 2 |
| `MC-EXEC-BWO` | Executive management — black women | 25.0% | 1 |
| `MC-OEXEC-BLACK` | Other executive management — black | 60.0% | 3 |
| `MC-OEXEC-BWO` | Other executive management — black women | 30.0% | 2 |
| `EE-SENIOR` | Senior management — black | EAP | 0 |
| `EE-MIDDLE` | Middle management — black | EAP | 0 |
| `EE-JUNIOR` | Junior management — black | EAP | 0 |
| `EE-DISABLED` | Employees with disabilities | 2.0% | 2 |

**Entities (10)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `employee_name` | Employee Name | string | Yes |
| `employee_gender` | Employee Gender | string | Yes |
| `employee_race` | Employee Race | string | Yes |
| `employee_designation` | Employee Designation | string | Yes |
| `employee_disabled` | Employee Disability Status | boolean | No |
| `ee_employee_name` | EE Employee Name | string | Yes |
| `ee_employee_gender` | EE Employee Gender | string | Yes |
| `ee_employee_race` | EE Employee Race | string | Yes |
| `ee_employee_designation` | EE Employee Designation | string | Yes |
| `ee_employee_disabled` | EE Employee Disability Status | boolean | Yes |

#### Employment Equity (`employmentEquity`)

#### Skills Development (`skillsDevelopment`)

**Criteria (5)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SKILLS-LEARNING` | Expenditure on learning programmes for black people | 3 | 15 |
| `SKILLS-BURS` | Expenditure on bursaries for black students | 100.0% | 7 |
| `SKILLS-DISABLED` | Expenditure on learning programmes for disabled black employees | 15.0% | 3 |
| `SKILLS-LEARNERSHIP` | Number of black people in learnerships, apprenticeships or internships | 0.0% | 0 |
| `SKILLS-ABSORPTION` | Absorption of black people after learnerships/apprenticeships/internships | 100.0% | 5 |

**Entities (26)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `training_programme_name` | Training Programme Name | string | Yes |
| `training_category` | Training Category | string | Yes |
| `training_is_abet` | ABET Training | boolean | No |
| `training_is_mandatory` | Mandatory Training | boolean | No |
| `training_is_bursary` | Bursary - Higher Education | boolean | No |
| `training_provider` | Training Provider | string | No |
| `training_cost` | Training Cost | currency | Yes |
| `training_course_cost` | Course Cost | currency | No |
| `training_travel_cost` | Travel Cost | currency | No |
| `training_accommodation_cost` | Accommodation Cost | currency | No |
| `training_meals_cost` | Meals/Catering Cost | currency | No |
| `training_stationery_cost` | Stationery/Materials Cost | currency | No |
| `training_other_cost` | Other Training Costs | currency | No |
| `training_salary_cost` | Salary Cost | currency | No |
| `learner_name` | Learner Name | string | Yes |
| `learner_id_number` | Learner ID Number | string | No |
| `learner_gender` | Learner Gender | string | Yes |
| `learner_race` | Learner Race | string | Yes |
| `learner_disabled` | Learner Disability Status | boolean | Yes |
| `learner_foreign` | Learner Foreign Status | boolean | No |
| `learner_employment_status` | Learner Employment Status | string | Yes |
| `training_is_yes_employee` | YES Employee | boolean | No |
| `training_is_completed` | Training Completed | boolean | No |
| `training_is_absorbed` | Learner Absorbed | boolean | No |
| `training_start_date` | Training Start Date | date | No |
| `training_end_date` | Training End Date | date | No |

#### Preferential Procurement (`preferentialProcurement`)

**Criteria (6)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `PROC-EMP` | B-BBEE procurement from empowering suppliers | 80.0% | 5 |
| `PROC-QSE` | Spend on QSE empowering suppliers | 15.0% | 3 |
| `PROC-EME` | Spend on EME suppliers | 15.0% | 4 |
| `PROC-BO51` | Spend on 51%+ black-owned suppliers | 50.0% | 9 |
| `PROC-BWO30` | Spend on 30%+ black women-owned suppliers | 12.0% | 4 |
| `PROC-DG` | Spend on designated group suppliers | 2.0% | 2 |

**Entities (17)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `supplier_name` | Supplier Name | string | Yes |
| `supplier_size` | Supplier Company Size | string | Yes |
| `supplier_bee_level` | Supplier BEE Level | bee_level | Yes |
| `supplier_vat` | Supplier VAT Number | string | No |
| `supplier_is_empowering` | Empowering Supplier | boolean | No |
| `supplier_is_foreign` | Foreign Supplier | boolean | No |
| `supplier_black_ownership` | Supplier Black Ownership | percentage | No |
| `supplier_black_women_ownership` | Supplier Black Women Ownership | percentage | No |
| `supplier_flow_through_ownership` | Flow-through Black Ownership | percentage | No |
| `supplier_designated_group_ownership` | Designated Group Ownership | percentage | No |
| `supplier_is_sd_recipient` | Supplier Development Recipient | boolean | No |
| `supplier_has_3yr_contract` | Three Year Contract | boolean | No |
| `supplier_spend` | Supplier Spend | currency | Yes |
| `supplier_first_procurement_date` | Date of First Procurement | date | No |
| `supplier_size_at_first_procurement` | Size at First Procurement | string | No |
| `supplier_certificate_expiry` | Certificate Expiry Date | date | No |
| `supplier_location` | Supplier Location | string | No |

#### Enterprise & Supplier Development (`enterpriseSupplierDevelopment`)

**Criteria (4)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `ESD-SD` | Supplier development contributions | 2 | 10 |
| `ESD-ED` | Enterprise development contributions | 100.0% | 5 |
| `ESD-GRAD` | Bonus: Graduation to supplier development | bonus | 1 |
| `ESD-JOBS` | Bonus: Jobs created | bonus | 1 |

**Entities (16)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `esd_beneficiary` | ESD Beneficiary | string | Yes |
| `esd_first_assistance_date` | Date of First Assistance | date | Yes |
| `esd_initial_black_ownership` | Initial Black Ownership | percentage | Yes |
| `esd_initial_size` | Initial Company Size | string | Yes |
| `esd_current_black_ownership` | Current Black Ownership | percentage | Yes |
| `esd_current_size` | Current Company Size | string | Yes |
| `esd_contribution_description` | Contribution Description | string | No |
| `esd_transaction_date` | Transaction Date | date | Yes |
| `esd_contribution_type` | ESD Contribution Type | string | Yes |
| `esd_amount` | ESD Amount | currency | Yes |
| `esd_invoice_date` | Invoice Date | date | No |
| `esd_payment_date` | Payment Date | date | No |
| `esd_prime_rate` | Prime Rate | percentage | No |
| `esd_actual_rate` | Actual Rate | percentage | No |
| `esd_category` | ESD Category | string | Yes |
| `agricultural_development_contribution` | Agricultural Development Contribution | currency | No |

#### Socio-Economic Development (`socioEconomicDevelopment`)

**Criteria (1)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `SED-SPEND` | SED contributions | 100.0% | 15 |

**Entities (14)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `sed_beneficiary` | SED Beneficiary | string | Yes |
| `sed_description` | Description of Spend | string | No |
| `sed_transaction_date` | Transaction Date | date | Yes |
| `sed_contribution_type` | SED Contribution Type | string | Yes |
| `sed_black_benefit_percent` | Black Benefit Percentage | percentage | Yes |
| `sed_amount` | SED Amount | currency | Yes |
| `sed_province` | Province | string | No |
| `sed_african_male_beneficiaries` | African Male Beneficiaries | count | No |
| `sed_african_female_beneficiaries` | African Female Beneficiaries | count | No |
| `sed_coloured_male_beneficiaries` | Coloured Male Beneficiaries | count | No |
| `sed_coloured_female_beneficiaries` | Coloured Female Beneficiaries | count | No |
| `sed_indian_male_beneficiaries` | Indian Male Beneficiaries | count | No |
| `sed_indian_female_beneficiaries` | Indian Female Beneficiaries | count | No |
| `farmworker_housing` | Farmworker Housing | currency | No |

#### YES Initiative (`yesInitiative`)

**Criteria (3)**

| Code | Name | Target | Max Pts |
|------|------|--------|--------|
| `YES-HEADCOUNT` | YES youth headcount target | size_based | 0 |
| `YES-ABSORPTION` | YES absorption rate | 25.0% | 0 |
| `YES-LEVEL` | YES level increase | tier_based | 0 |

**Entities (8)**

| ID | Name | Type | Required |
|----|------|------|----------|
| `yes_participant_name` | YES Participant Name | string | Yes |
| `yes_participant_id` | YES Participant ID | string | Yes |
| `yes_participant_age` | YES Participant Age | count | Yes |
| `yes_start_date` | YES Start Date | date | Yes |
| `yes_end_date` | YES End Date | date | Yes |
| `yes_is_absorbed` | YES Participant Absorbed | boolean | Yes |
| `yes_months_retained` | YES Months Retained | count | Yes |
| `yes_company_size` | YES Host Company Size | string | Yes |


---

