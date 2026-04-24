# B-BBEE Toolkit Fixes Log

**Created:** 2026-03-31  
**Status:** In Progress  
**Goal:** Bring the web toolkit to full feature parity with the Excel toolkit per TOOLKIT_TAB_MAP.md

---

## Summary of Issues Identified

### Critical Gaps (Breaks Compliance Accuracy)
1. **Skills Development** - Most under-built pillar
2. **YES Initiative** - Completely missing
3. **Ownership** - Missing voting rights, economic interest, designated group
4. **Management Control** - Missing foreign flag (inflates percentages)
5. **Procurement** - Merged with ESD, missing critical supplier fields
6. **SED** - Missing % black benefit (can't weight correctly)

### UX/Workflow Issues
7. No bulk upload for Skills/Procurement (only MC has it)
8. Scorecard Summary page orphaned (no navigation to it)
9. Export Report is a stub (no actual export)
10. Dashboard routing broken for Supplier Development, YES

### Data Model Issues
11. No Client Information form (Sheet 1 of toolkit)
12. No measurement period filtering
13. No cross-pillar data cascading
14. Skills: per-program instead of per-learner tracking

---

## Detailed Fix Plan

### 1. Skills Development Overhaul

**Current State:**
- Single "program name" with learner demographics mixed in
- Only one "cost" field
- No dates

**Required Changes:**

#### Type Updates (`types.ts`)
```typescript
// OLD - Per program
interface TrainingProgram {
  id: string;
  name: string;           // Program name
  category: 'bursary' | 'learnership' | ...;
  cost: number;           // Single cost
  isEmployed: boolean;
  isBlack: boolean;
  ...
}

// NEW - Per intervention per learner
interface TrainingIntervention {
  id: string;
  // Program info
  programName: string;
  trainingProvider: string;
  categoryCode: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  
  // Learner info
  learnerName: string;
  learnerIdNumber?: string;
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  isDisabled: boolean;
  isForeign: boolean;           // NEW - excludes from calcs
  employmentStatus: 'Permanent' | 'Fixed-Term' | 'Unemployed';
  
  // YES linkage
  isYesEmployee: boolean;
  isCompleted: boolean;
  isAbsorbed: boolean;
  
  // Dates
  transactionDate: string;      // Invoice date
  startDate?: string;
  endDate?: string;
  
  // Cost breakdown (per toolkit)
  courseCost: number;
  travelCost: number;
  accommodationCost: number;
  cateringCost: number;
  stationeryCost: number;
  facilityCost: number;
  salaryCost: number;           // Stipends for B/C/D
  otherCosts: number;
  
  // Flags
  isAbet: boolean;
  isMandatory: boolean;
  isBursary: boolean;
}
```

#### UI Changes
- Rename "Add Program" → "Add Training Intervention"
- Form sections:
  - Program Details (name, provider, category, dates)
  - Learner Details (name, ID, demographics, employment)
  - Cost Breakdown (all 8 cost fields)
  - YES/Completion Status
- Table columns: Program | Learner | Category | Status | Total Cost
- Bulk upload (CSV/Excel) matching MC pattern

#### Calculator Updates
- Weight costs by category (A-F have different caps)
- ABET and mandatory flags affect recognition
- Bursary spend tracked separately (2.5% target)
- YES flags feed YES pillar

---

### 2. YES Initiative Page (NEW)

**Current State:** None exists

**Required:**

#### Types (`types.ts`)
```typescript
interface YESData {
  id: string;
  clientId: string;
  
  // Targets (calculated from headcount)
  yesHeadcountTarget: number;      // Based on total employees
  
  // Youth enrolled
  yesYouthEnrolled: number;        // Total YES youth
  yesBlackYouthCount: number;        // For 50% threshold
  
  // Absorption
  yesAbsorbedCount: number;
  yesAbsorptionRate: number;       // absorbed / enrolled
  
  // Cost tracking
  yesCostPerCandidate: number;
  
  // Tier achievement
  yesTierAchieved: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3';
  yesBeeLevelIncrease: number;     // 0, 1, or 2
}

interface YESCandidate {
  id: string;
  name: string;
  idNumber?: string;
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  gender: 'Male' | 'Female';
  isDisabled: boolean;
  startDate: string;
  endDate?: string;
  isAbsorbed: boolean;
  absorptionDate?: string;
  cost: number;
}
```

#### UI
- Page: `/pillars/yes`
- Summary cards: Target | Enrolled | Black Youth % | Absorbed | Tier
- Candidates table with absorption toggle
- Tier visualization (Tier 1/2/3 thresholds)
- BEE level increase preview

#### Integration
- Pull `isYesEmployee` from Skills interventions
- Calculate headcount target from MC employee count

---

### 3. Ownership Missing Fields

**Add to `Shareholder` type:**
```typescript
interface Shareholder {
  id: string;
  name: string;
  shareholderId?: string;              // ID/Registration Number
  ownershipType: 'shareholder' | 'sale_of_assets' | 'equity_equivalent';
  
  // Ownership percentages
  blackOwnership: number;
  blackWomenOwnership: number;
  
  // NEW: Separate voting and economic interest
  votingRightsPercent: number;         // Can differ from ownership
  economicInterestPercent: number;     // Can differ from ownership
  
  // NEW: Designated group
  isDesignatedGroup: boolean;
  
  // NEW: New entrant (exists but verify)
  blackNewEntrant?: boolean;
  yearsHeld?: number;                  // For graduation factor
  
  // Shares and value
  shares: number;
  shareValue: number;
}
```

**Add to form:**
- Shareholder ID field
- Voting Rights % (default to ownership %)
- Economic Interest % (default to ownership %)
- Designated Group toggle
- Years Held (for graduation calculation)

**Add to Company Value section:**
- Valuation Date
- Valuation Method

---

### 4. Management Control Missing Fields

**Add to `Employee` type:**
```typescript
interface Employee {
  id: string;
  name: string;
  idNumber?: string;              // NEW
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  designation: 'Board' | 'Executive' | 'Executive Director' | 'Other Executive Management' | 'Senior' | 'Middle' | 'Junior';
  isDisabled: boolean;
  isForeign: boolean;             // NEW - critical! Excludes from calcs
  province?: string;               // NEW - affects EAP
  hireDate?: string;               // NEW
  terminationDate?: string;        // NEW
}
```

**UI Changes:**
- Add "Foreign National" checkbox (with warning that it excludes from BEE)
- Add ID Number field
- Add Hire/Termination dates
- Add Province selector (for EAP targets)
- Add "Active during measurement period" filter

---

### 5. Procurement Separation from ESD

**Current:** ESD.tsx handles both Procurement and ESD

**Required:** Create separate `Procurement.tsx` page

**Supplier type updates:**
```typescript
interface Supplier {
  id: string;
  name: string;
  vatNumber?: string;                    // NEW
  beeLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 0;
  
  // Ownership
  blackOwnership: number;
  blackWomenOwnership: number;
  flowThroughOwnership?: number;         // NEW - for trusts
  designatedGroupOwnership?: number;     // NEW - for PROC-DG
  
  // Size and status
  enterpriseType: 'eme' | 'qse' | 'generic';
  isEmpoweringSupplier: boolean;         // NEW
  isSupplierDevRecipient: boolean;       // NEW - links to ESD
  hasThreeYearContract: boolean;         // NEW
  
  // Dates
  firstProcurementDate?: string;          // NEW
  sizeAtFirstProcurement?: 'eme' | 'qse' | 'generic';
  certificateExpiryDate?: string;
  
  // Spend
  spend: number;
  location?: string;                     // NEW
}
```

**New Procurement Page:**
- TMPS card with manual override (move from ESD)
- Suppliers table with all fields
- Recognition % calculation
- Spend analysis by category (Empowering, QSE, EME, 51% Black, 30% Black Women, Designated Group)
- Graduation bonus toggle
- Jobs created bonus toggle

**ESD Page becomes:**
- SD contributions only
- ED contributions only
- Benefit factor calculations
- Links to Procurement for beneficiary selection

---

### 6. SED Missing Fields

**Contribution type expansion:**
```typescript
type SEDContributionType = 
  | 'grant'
  | 'direct_cost'
  | 'discounts'
  | 'overhead_costs'
  | 'professional_services_free'
  | 'professional_services_discounted'
  | 'employee_time';
```

**Add to `Contribution` for SED:**
```typescript
interface SEDContribution {
  id: string;
  beneficiary: string;
  description: string;                    // NEW
  type: SEDContributionType;
  amount: number;
  blackBenefitPercent: number;           // NEW - critical for weighting
  transactionDate: string;               // NEW
  province?: string;
  businessUnit?: string;
  
  // Demographic tracking
  africanMaleBeneficiaries: number;
  africanFemaleBeneficiaries: number;
  colouredMaleBeneficiaries: number;
  colouredFemaleBeneficiaries: number;
  indianMaleBeneficiaries: number;
  indianFemaleBeneficiaries: number;
}
```

---

### 7. Client Information Form (NEW)

**New page:** `/client-info` or modal

**Fields (from TOOLKIT_TAB_MAP.md Sheet 1):**
```typescript
interface ClientInfo {
  // Company details
  companyName: string;
  tradingName?: string;
  registrationNumber: string;        // CIPC
  vatNumber?: string;                 // SARS VAT
  
  // Addresses
  physicalAddress: string;
  postalAddress?: string;
  
  // Contact
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  
  // BEE specifics
  sectorCode: 'RCOGP' | 'ICT' | 'FSC' | 'AGRI';
  industry: string;                   // For industry norm lookup
  companySize: 'EME' | 'QSE' | 'Generic';  // Auto from turnover
  annualTurnover: number;
  
  // Measurement period
  financialYearEnd: string;          // Date
  measurementPeriodStart: string;
  measurementPeriodEnd: string;
  numberOfEmployees: number;
}
```

---

### 8. Bulk Upload Expansion

**Skills Bulk Upload:**
- CSV template with all cost columns
- Column mapping (reuse MC pattern)
- Validation: required fields, date formats, cost types

**Procurement Bulk Upload:**
- CSV template with supplier fields
- Auto-recognition of BEE levels
- VAT number validation

---

### 9. Dashboard & Navigation Fixes

**Fix routing:**
```typescript
// Dashboard.tsx
const routes: Record<string, string> = {
  ownership: "/pillars/ownership",
  managementControl: "/pillars/management",
  skillsDevelopment: "/pillars/skills",
  procurement: "/pillars/procurement",        // NEW separate route
  supplierDevelopment: "/pillars/esd",        // FIXED
  enterpriseDevelopment: "/pillars/esd",
  socioEconomicDevelopment: "/pillars/sed",
  yesInitiative: "/pillars/yes",                // NEW
};
```

**Connect Scorecard Summary:**
- Add "View Summary Report" button to Dashboard
- Add "View Summary Report" button to Full Scorecard
- Make Export Report on Summary actually generate PDF

---

### 10. Export Report Implementation

**Options:**
1. **PDF Generation** - Using `jspdf` + `html2canvas`
2. **Excel Export** - Using `xlsx` library (already imported)
3. **JSON Export** - For backup/interop

**PDF Content:**
- Cover page with company info, level, total score
- Pillar-by-pillar breakdown (like Scorecard Summary)
- Sub-minimum compliance table
- Cost per point analysis
- Sign-off page for verification

---

## Implementation Order

1. ✅ Create this fixes log
2. 🔄 Skills Development overhaul (biggest impact)
3. 🔄 YES Initiative page (missing pillar)
4. 🔄 Ownership missing fields
5. 🔄 Management Control missing fields
6. 🔄 Separate Procurement from ESD
7. 🔄 SED enhancements
8. 🔄 Client Information form
9. 🔄 Bulk uploads
10. 🔄 Dashboard routing fixes
11. 🔄 Export Report implementation

---

## Files to Modify

### Core Types
- `apps/web/Toolkit/src/lib/types.ts`

### Store
- `apps/web/Toolkit/src/lib/store.ts` (actions for new fields)

### Calculators
- `apps/web/Toolkit/src/lib/calculators/skills.ts`
- `apps/web/Toolkit/src/lib/calculators/yes.ts` (NEW)
- `apps/web/Toolkit/src/lib/calculators/procurement.ts` (split from esd-sed)

### Pages
- `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx` (major refactor)
- `apps/web/Toolkit/src/pages/pillars/YES.tsx` (NEW)
- `apps/web/Toolkit/src/pages/pillars/Ownership.tsx` (add fields)
- `apps/web/Toolkit/src/pages/pillars/ManagementControl.tsx` (add fields)
- `apps/web/Toolkit/src/pages/pillars/Procurement.tsx` (NEW - split from ESD)
- `apps/web/Toolkit/src/pages/pillars/ESD.tsx` (remove procurement)
- `apps/web/Toolkit/src/pages/pillars/SED.tsx` (add fields)
- `apps/web/Toolkit/src/pages/ClientInfo.tsx` (NEW)
- `apps/web/Toolkit/src/pages/Dashboard.tsx` (fix routing)
- `apps/web/Toolkit/src/pages/ScorecardSummary.tsx` (connect export)

### Routing
- `apps/web/Toolkit/src/App.tsx` (add new routes)

### Navigation
- `apps/web/Toolkit/src/components/layout/AppLayout.tsx` or nav component

---

## Progress Tracker

| Fix | Status | Commit/Notes |
|-----|--------|--------------|
| Create fixes log | ✅ Done | This file |
| Skills Development | ✅ Done | Per-learner tracking, 8 cost fields, YES linkage, dates |
| YES Initiative | ✅ Done | Full page with tier tracking, absorption, BEE level impact |
| Ownership fields | ✅ Done | ID, voting rights, economic interest, designated group, years held, graduation factor |
| MC fields | ✅ Done | Foreign flag, ID number, province, hire/termination dates, edit functionality |
| Procurement split | ⏳ Pending | |
| SED fields | ⏳ Pending | |
| Client Info | ⏳ Pending | |
| Bulk uploads | ⏳ Pending | Skills bulk upload (placeholder), Procurement bulk upload |
| Dashboard fixes | ✅ Done | YES route added, Supplier Development routing fixed |
| Export Report | ⏳ Pending | |

---

## Implementation Notes

### Skills Development Overhaul (COMPLETED)
- **New Type Structure**: `TrainingProgram` now tracks per-learner interventions with:
  - Program details (name, provider, category code A-G)
  - Learner demographics (name, ID, gender, race, disability, foreign status)
  - Cost breakdown (8 fields: course, travel, accommodation, catering, stationery, facility, salary/stipend, other)
  - YES 4 Youth linkage (isYesEmployee, isCompleted, isAbsorbed)
  - Dates (transaction, start, end)
  - Flags (ABET, mandatory, bursary)
- **UI Changes**: Tabbed dialog with 4 sections (Program, Learner, Costs, Status)
- **YES Integration**: Automatically feeds into YES Initiative pillar

### YES Initiative Page (COMPLETED)
- **New Calculator**: `calculateYESScore` with tier achievement logic
- **Tier Tracking**: Tier 1 (1.5x target), Tier 2 (1.0x target), Tier 3 (0.5x target)
- **BEE Level Impact**: +2 levels for Tier 1, +1 level for Tier 2/3 (requires 50%+ Black Youth)
- **UI Components**: Tier cards with progress indicators, demographics tracking, absorption rates
- **Linked to Skills**: Pulls candidates from interventions with isYesEmployee flag

### Ownership Enhancements (COMPLETED)
- **New Fields**: shareholderId, votingRightsPercent, economicInterestPercent, isDesignatedGroup, designatedGroupType, yearsHeld, graduationFactor
- **Tabbed Form**: Basic info, Rights (voting/economic), Advanced (designated group, new entrant, years held)
- **Graduation Factor**: Auto-calculated based on years held (1.0, 0.9, 0.8, 0.7, 0.6)
- **Valuation Section**: Added valuation date and method fields

### Management Control Enhancements (COMPLETED)
- **New Fields**: idNumber, isForeign, province, hireDate, terminationDate
- **Foreign National Handling**: Checkbox with warning, excluded from BEE calculations
- **Filtering**: Added filters for foreign employees and inactive employees
- **Edit Functionality**: Employees can now be edited inline
- **Employment Period**: Hire and termination dates for measurement period filtering
- **Province Selector**: All 9 provinces + National for EAP targeting

### Dashboard Routing Fixes (COMPLETED)
- **YES Route**: Added `/pillars/yes` route in App.tsx
- **Pillar Meta**: Added route field to all pillar definitions
- **Dashboard Cards**: All pillar cards now navigate to correct routes

---

**Next Action:** Continue with Procurement/ESD separation, SED enhancements, or Client Information form
