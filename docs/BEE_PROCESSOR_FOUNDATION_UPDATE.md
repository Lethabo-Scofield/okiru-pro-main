# DocumentProcessor Foundation Layer Update

**Date:** 2026-03-31  
**Status:** In Progress  
**Goal:** Bridge the gap between DocumentProcessor and Toolkit, implementing Sheet 1-2 structure from TOOLKIT_TAB_MAP.md

---

## Summary

The DocumentProcessor was disconnected from the Toolkit's data model and had shallow manual entry (only 6 basic fields). This update creates a proper Foundation Layer that matches the Excel toolkit structure.

---

## What Was Built

### 1. Client Information Form (`ClientInformationForm.tsx`)
**Matches TOOLKIT_TAB_MAP.md Sheet 1 - Client Information**

- Company identification (name, trading name, registration, VAT, tax)
- Addresses (physical, postal)
- Contact details (person, email, phone)
- BEE configuration (sector code, industry, company size auto-detection)
- Financials for sizing (turnover, headcount)
- Measurement period dates
- Verification details (certificate number, expiry, level, agency)

**Key Features:**
- Auto-detects EME/QSE/Generic based on turnover
- Shows QSE variant availability per sector
- Form validation for required fields

### 2. Financials Form (`FinancialsForm.tsx`)
**Matches TOOLKIT_TAB_MAP.md Sheet 2 - Financials**

- Core financials (Revenue, NPAT, leviable amount, payroll)
- TMPS calculation (inclusions - exclusions)
- Industry norm selection
- **Deemed NPAT calculation** - automatic based on margin vs quarter threshold

**Key Features:**
- Live TMPS calculation
- Margin analysis with industry norm comparison
- Automatic deemed NPAT when below quarter threshold
- Visual indicators when deemed NPAT applies

### 3. Foundation Step (`FoundationStep.tsx`)
**Combines Client Information + Financials**

- Tab navigation between Client Info and Financials
- Visual progress indicators per section
- Input mode toggle (manual vs upload - upload coming soon)
- Cross-field sync (industry selection updates financials)
- Navigation to Pillars step

### 4. Build Pillars Step (`BuildPillarsStep.tsx`)
**Framework for 8 B-BBEE Pillars**

- Sidebar navigation for all 8 pillars
- Live score calculation from Toolkit calculators
- Pillar status tracking (complete, score, sub-minimum check)
- Per-pillar input mode toggle (manual vs upload)
- Overall progress tracking
- Sub-minimum warnings

**Pillars Configured:**
1. Ownership (25 pts, sub-min 10)
2. Management Control (19 pts)
3. Employment Equity (11 pts)
4. Skills Development (25 pts, sub-min 15)
5. Preferential Procurement (27 pts, sub-min 16)
6. Enterprise & Supplier Dev (15 pts)
7. Socio-Economic Development (5 pts)
8. YES Initiative (level uplift)

### 5. DocumentProcessor Integration

- Added Foundation Data state to DocumentProcessor
- Replaced shallow build-foundation UI with new FoundationStep
- Connected foundation data to companyInfo for backward compatibility
- Auto-detects scorecard type (Generic/QSE) based on company size
- Loads appropriate manifest based on sector + size

---

## Files Created

```
apps/web/src/components/build/
├── ClientInformationForm.tsx    # Sheet 1 - Client Info
├── FinancialsForm.tsx           # Sheet 2 - Financials
├── FoundationStep.tsx           # Combined Foundation UI
├── BuildPillarsStep.tsx         # Pillar entry framework
└── index.ts                     # Exports
```

## Files Modified

```
apps/web/src/pages/DocumentProcessor.tsx
- Added imports for new components
- Added foundationData state
- Replaced build-foundation UI with FoundationStep
- Connected foundation data to existing companyInfo
```

---

## What's Next

### Immediate (To Complete Foundation)

1. **Connect to Toolkit Store**
   - DocumentProcessor foundation data should sync with Toolkit store
   - When user enters data in processor, it should populate Toolkit forms
   - Need bidirectional sync between processor state and Toolkit store

2. **Deep Pillar Forms**
   - Integrate actual Toolkit pillar forms into BuildPillarsStep
   - Port Ownership, Management Control, Skills, etc. forms from Toolkit
   - Each pillar needs its full form with all fields from TOOLKIT_TAB_MAP.md

3. **Upload Integration**
   - Implement per-pillar document upload
   - Extracted data should pre-fill the appropriate pillar form
   - Allow mixing: upload for some pillars, manual for others

### Medium Term

4. **Store in Graph Ontology**
   - Save client info, financials, and pillar data to ArangoDB
   - Create proper nodes: Client, Financials, PillarData
   - Link to evidence items

5. **Scorecard Calculation**
   - Wire BuildPillarsStep to calculation engine
   - Live score updates as data is entered
   - Final scorecard generation

6. **Progress Persistence**
   - Save foundation/pillar progress to session
   - Allow resuming a build session
   - Track which pillars are complete

---

## How It Works Now

1. User enters DocumentProcessor
2. Chooses "Build" mode (manual data entry)
3. Foundation Step appears with Client Info tab active
4. User fills company details (name, sector, turnover, etc.)
5. User switches to Financials tab
6. Financials form shows with industry norm auto-selection
7. TMPS and deemed NPAT calculate automatically
8. When both sections valid, "Continue to Pillars" enables
9. Pillars step shows sidebar with all 8 pillars
10. User clicks through pillars, entering data manually
11. Live scores calculate using Toolkit calculators
12. When done, user calculates final scorecard

---

## Testing Checklist

- [ ] Client Information form validates required fields
- [ ] Company size auto-detects correctly (< R10M = EME, R10M-R50M = QSE, > R50M = Generic)
- [ ] QSE variant only shows for RCOGP and ICT sectors
- [ ] Financials form calculates TMPS (inclusions - exclusions)
- [ ] Deemed NPAT applies when margin < quarter threshold
- [ ] Industry norm syncs from Client Info to Financials
- [ ] Foundation step blocks "Continue" until both sections valid
- [ ] Pillars step shows all 8 pillars in sidebar
- [ ] Live scores calculate from Toolkit calculators
- [ ] Sub-minimum warnings display correctly
- [ ] Foundation data syncs to companyInfo for backward compatibility
