# B-BBEE Scorecard Automation Platform - Goal Document

## Vision

Build a production-ready B-BBEE (Broad-Based Black Economic Empowerment) scorecard automation platform that:

- Accepts **ANY document type** (PDF, CSV, XLSX, TXT, DOCX) containing B-BBEE-related data
- Extracts entities using **AI-powered hybrid RAG** (BM25 + embeddings + GPT-4o-mini)
- Presents extracted data for **human review and approval**
- Calculates **complete B-BBEE scorecards** using formula-driven computation
- Produces results **identical to manually-completed Excel toolkits**

Zero hardcoded scoring logic. All calculations derive from the official B-BBEE toolkit Excel templates compiled into the Computation Engine.

---

## Success Criteria

### Primary: Lake Trading Validation

The completed `Lake Trading Toolkit (RCOGP).xlsx` is our ground truth. This manually-completed toolkit shows:

| Metric | Value |
|--------|-------|
| **TotalRevenue** | R 120,000,000 |
| **NPAT** | R 18,500,000 |
| **LeviableAmount** | R 32,400,000 |
| **TMPS** | R 65,200,000 |
| **Ownership (Black %)** | 51% |
| **Black Women Ownership** | 30.5% |
| **Skills Spend** | R 1,200,000 |
| **Procurement Spend with Level 1** | R 52,160,000 |
| **ESD Contribution** | R 370,000 |
| **SED Contribution** | R 185,000 |
| **TOTAL B-BBEE POINTS** | **~80 points** |
| **B-BBEE Level** | **Level 4** |

**Success**: Our platform must produce the **exact same ~80 points** when processing the `lake-trading.csv` file (or the raw data), using the RCOGP Generic scorecard template.

### Secondary: Template Coverage

Support all **4 B-BBEE sector codes** with their **6 scorecard templates**:

| Sector Code | Sector Name | Generic | QSE |
|-------------|-------------|---------|-----|
| RCOGP | Revised Codes of Good Practice | Yes (>R50M) | Yes (R10M-R50M) |
| ICT | ICT Sector Code | Yes (>R50M) | Yes (R10M-R50M) |
| FSC | Financial Sector Code | Yes | No |
| AGRI | AgriBEE Sector Code | Yes | No |

### Tertiary: Document Type Support

| Type | Status |
|------|--------|
| CSV | Full support |
| XLSX/XLS | Full support |
| PDF | Full support |
| TXT | Full support |
| DOCX | Full support |

---

## What Winning Looks Like

### User Journey (Happy Path)

1. **Company Setup**
   - User selects sector: RCOGP
   - Enters turnover: R 50,000,000 (QSE detected)
   - All other company details

2. **Document Upload**
   - User uploads `financial-data.pdf` (or any format)
   - System extracts text, chunks, indexes (BM25 + embeddings)

3. **AI Extraction**
   - Hybrid retrieval finds relevant passages
   - GPT-4o-mini extracts 40+ entities
   - Confidence scores calculated for each

4. **Review & Approval**
   - User reviews all extracted entities in tabular format
   - Edits any incorrect values inline
   - Approves/rejects each entity
   - **Cannot proceed until 100% approved**

5. **Scorecard Generation**
   - Approved entities map to toolkit cell overrides
   - Computation Engine evaluates the full formula DAG
   - Returns: all 7 pillar scores, sub-minimum checks, total points, level

6. **Final Output**
   - Complete scorecard matching Excel toolkit format
   - PDF export available
   - Excel export available
   - All values match manual toolkit calculation

### Winning Metrics

| Metric | Target |
|--------|--------|
| Entity extraction accuracy | >95% |
| Scorecard calculation accuracy | 100% (match toolkit) |
| End-to-end processing time | <5 minutes |
| User review requirement | 100% approval mandatory |
| Supported document types | 5+ |
| Supported sector codes | 4 |
| Supported scorecard templates | 6 |

---

## Scope

### In Scope

1. **4 Sector Codes**: RCOGP, ICT, FSC, AGRI
2. **6 Scorecard Templates**: Generic and QSE variants where applicable
3. **7 B-BBEE Elements**:
   - Ownership (voting rights, economic interest, net value)
   - Management Control (board/exec composition)
   - Employment Equity (senior/middle/junior levels + disability)
   - Skills Development (training spend, bursaries, learnerships)
   - Preferential Procurement (BEE level-weighted spend)
   - Enterprise & Supplier Development (SD/ED contributions)
   - Socio-Economic Development (SED contributions)
4. **Hybrid AI Extraction**: BM25 + embeddings + entity NER + GPT-4o-mini
5. **Human-in-the-loop**: Mandatory review and approval
6. **Formula-driven scoring**: No hardcoded logic, all from toolkit Excel formulas

### Out of Scope (Future Phases)

1. **EME (Exempted Micro Enterprises)**: <R10M turnover, automatic Level 4/1
2. **Additional Sector Codes**: Tourism, Forestry, Transport, Construction, Legal, MAC
3. **QSE variants for FSC/AGRI**: Not in current toolkit set
4. **Auto-learning from corrections**: Static templates only
5. **Multi-year comparison**: Single measurement period only

---

## Technical Reference: Lake Trading Toolkit

### Source Data Structure

The `lake-trading.csv` contains these key entities:

```csv
Entity Label,Extracted Value,Source Sheet
TotalRevenue,R 120 000 000.00,1. General Information
NPAT,R 18 500 000.00,1. General Information
LeviableAmount,R 32 400 000.00,1. General Information
TMPS,R 65 200 000.00,1. General Information
FinancialYearEnd,2024-02-28,1. General Information
CompanyName,Lake Trading 447 (Pty) Ltd,1. General Information
Sector,Generic,1. General Information
ScorecardType,Generic,1. General Information
Black Ownership Percentage,51%,2. Ownership
Black Women Ownership Percentage,30.5%,2. Ownership
Black Economic Interest,51%,2. Ownership
Black Women Economic Interest,30.5%,2. Ownership
Shareholder Name,Nkosi Investments (Pty) Ltd,2. Ownership
Shareholding Percentage,51%,2. Ownership
Share Value,R 15 000 000.00,2. Ownership
Black Board Members,60%,3. Management Control
Black Women Board Members,30%,3. Management Control
Black Executive Directors,75%,3. Management Control
Black Women Executive,40%,3. Management Control
Skills Development Spend,R 1 200 000.00,4. Skills Development
Training Programme Name,Advanced Leadership Programme,4. Skills Development
Training Cost,R 120 000.00,4. Skills Development
Learner Name,Thandi Mokoena,4. Skills Development
Learner Employment Status,Employed,4. Skills Development
Learner Race Status,African,4. Skills Development
Supplier Name,Sizwe Logistics,5. Preferential Procurement
Supplier BEE Level,Level 1,5. Preferential Procurement
Supplier Black Ownership,100%,5. Preferential Procurement
Supplier Spend,R 52 160 000.00,5. Preferential Procurement
Preferential Procurement Spend,R 52 160 000.00,5. Preferential Procurement
ESD Beneficiary,Bright Future Trading,6. Enterprise & Supplier Development
ESD Contribution Type,Grant,6. Enterprise & Supplier Development
ESD Amount,R 370 000.00,6. Enterprise & Supplier Development
ESD Category,Supplier Development,6. Enterprise & Supplier Development
SED Beneficiary,Thembalethu Foundation,7. Socio-Economic Development
SED Contribution Type,Monetary,7. Socio-Economic Development
SED Amount,R 185 000.00,7. Socio-Economic Development
```

### Expected Scorecard Output

When these values are fed into the RCOGP Generic toolkit template (`BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx`), the calculated result is:

| Element | Points | Max Points | % Achieved |
|---------|--------|------------|------------|
| Ownership | ~23 | 25 | 92% |
| Management Control | ~6 | 19 | 32% |
| Employment Equity | ~3 | 11 | 27% |
| Skills Development | ~20 | 25 | 80% |
| Preferential Procurement | ~18 | 27 | 67% |
| ESD | ~8 | 15 | 53% |
| SED | ~4 | 5 | 80% |
| **TOTAL** | **~80** | **~109** | **~73%** |

**B-BBEE Level**: Level 4
**Recognition**: 100%

---

## Definition of Done

The project is complete when:

1. [ ] Goal.md and implementation_summary.md are created and approved
2. [ ] ArangoDB is running locally with all 6 toolkit templates compiled
3. [ ] Azure OpenAI integration is working (embeddings + GPT-4o-mini)
4. [ ] UI shows only 4 sector codes with auto Generic/QSE detection
5. [ ] Hybrid extraction endpoint works for all document types
6. [ ] Document Processor uses the new extraction endpoint
7. [ ] Review step enforces 100% approval before proceeding
8. [ ] Entity-to-cell mapping exists for all 6 templates
9. [ ] Scorecard evaluation via Computation Engine returns correct results
10. [ ] Lake Trading validation produces ~80 points matching reference
11. [ ] PDF and Excel export of final scorecard works

---

## Non-Goals

- No new sector codes beyond the 4 listed
- No EME (Exempted Micro Enterprise) automatic handling
- No machine learning model training (uses GPT-4o-mini only)
- No real-time collaboration features
- No blockchain or distributed ledger
- No mobile app (web-only)

---

*Document Version: 1.0*
*Last Updated: March 2026*
