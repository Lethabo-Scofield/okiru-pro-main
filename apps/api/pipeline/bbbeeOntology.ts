/**
 * B-BBEE Extraction Ontology
 * =========================================================
 * Single source of truth for:
 *   - Entity definitions (what exists in B-BBEE data)
 *   - Property definitions (fields per entity, types, valid values)
 *   - Alias dictionaries (all ways a field might appear in Excel)
 *   - Sheet-name hints (for sheet matching)
 *   - Relationship definitions (how entities link to each other)
 *   - Validation rules (what makes a value valid)
 *   - Scoring relevance (why a field matters to the scorecard)
 *   - Business rules (computed fields, thresholds, derived logic)
 *
 * HOW TO USE:
 *   - Extractor: query aliases to find columns, validate values against rules
 *   - Reconciler: validate LLM output against enums and rules
 *   - Conversation AI: traverse relationships to answer questions
 *   - Expert: fill in all sections marked with TODO
 *
 * EDITING GUIDE FOR B-BBEE EXPERT:
 *   Search the file for "TODO:" to find every gap that needs expert input.
 *   Each TODO describes what is missing and why it matters.
 *   You do NOT need to know TypeScript — just fill in the string/number
 *   values inside the existing structure.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive types
// ─────────────────────────────────────────────────────────────────────────────

type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'currency' | 'date' | 'percent';

interface PropertyDef {
  description: string;
  type: PropType;
  required?: boolean;
  unit?: string;
  aliases?: string[];
  values?: readonly string[];            // for enum types
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    pattern?: string;
  };
  scoringRelevance?: string;
  businessRule?: string;
  derivedFrom?: string;
  expertNote?: string;                   // TODO sections for the B-BBEE expert
}

interface EntityDef {
  description: string;
  scoringRelevance: string;
  linkedTo?: string[];
  sheetHints?: {
    nameHints: string[];
    tableIndicators?: string[];
    rowType?: string;
    layoutVariants?: string[];
    expertNote?: string;
  };
  properties: Record<string, PropertyDef>;
  relationships?: Record<string, {
    description: string;
    formula?: string;
    scoringThreshold?: string;
    expertNote?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Ontology
// ─────────────────────────────────────────────────────────────────────────────

export const BBBEE_ONTOLOGY = {
  version: "1.0.0",
  lastUpdated: "2026-05-14",
  description: "B-BBEE domain ontology for the Okiru extraction pipeline",

  // ══════════════════════════════════════════════════════════════════════════
  // ENUM REGISTRIES
  // Centralised lists validated by extractionReconciler.ts
  // ══════════════════════════════════════════════════════════════════════════
  enums: {

    sectorCodes: {
      values: [
        "RCOGP",         // Revised Codes of Good Practice (generic)
        "ICT",           // ICT Sector Code
        "FSC",           // Financial Sector Code
        "AGRI",          // AgriBEE Sector Code
        "TRANSPORT",     // Transport Sector Code
        "CONSTRUCTION",  // Construction Sector Code
        "TOURISM",       // Tourism Sector Code
        "MINING",        // Mining Charter
        "PROPERTY",      // Property Sector Code
        "CAS",           // Chartered Accountants Sector Code
        "FORESTRY",      // Forestry Sector Code
        "MAC",           // Marketing, Advertising & Communication Charter
      ] as const,
      expertNote: "TODO: confirm complete authoritative list; add LIQUID FUELS, MEDIA, and any recently gazetted sector codes that should be recognised",
    },

    applicableScorecards: {
      values: ["EME", "QSE", "Generic"] as const,
      thresholds: {
        defaultEme: "< R10 000 000 annual turnover",
        defaultQse: "R10 000 000 – R50 000 000 annual turnover",
        defaultGeneric: "> R50 000 000 annual turnover",
        expertNote: "TODO: confirm exact turnover thresholds per sector — FSC, AGRI, MINING differ from RCOGP Generic",
      },
    },

    eapProvinces: {
      values: [
        "National",
        "Gauteng",
        "Western Cape",
        "Eastern Cape",
        "KZN",
        "Free State",
        "Limpopo",
        "Mpumalanga",
        "North West",
        "Northern Cape",
      ] as const,
      expertNote: "TODO: confirm whether 'National' EAP table is always the conservative/default — does the Codes require province-specific EAP or is it entity's choice?",
    },

    raceGroups: {
      values: ["African", "Coloured", "Indian", "White", "Foreign National"] as const,
      blackDefinition: "African OR Coloured OR Indian per Employment Equity Act s.1",
      expertNote: "TODO: how are 'Mixed' heritage individuals classified in practice? How is this evidenced?",
    },

    genderValues: {
      values: ["Male", "Female"] as const,
      expertNote: "TODO: confirm whether non-binary / other gender classifications appear in SA B-BBEE toolkits",
    },

    occupationalLevels: {
      values: [
        "Board",
        "Executive",
        "Executive Director",
        "Other Executive Management",
        "Senior",
        "Middle",
        "Junior",
        "Skilled Technical",
        "Semi-skilled",
        "Unskilled",
      ] as const,
      managementControlLevels: ["Board", "Executive", "Executive Director", "Other Executive Management", "Senior", "Middle", "Junior"],
      employmentEquityLevels: ["Board", "Executive", "Executive Director", "Other Executive Management", "Senior", "Middle", "Junior", "Skilled Technical", "Semi-skilled", "Unskilled"],
      expertNote: "TODO: confirm exact Codes mapping — does 'Top Management' in some toolkits mean Executive, Board, or combined? Does 'Other Management' exist as a separate level?",
    },

    beeLevels: {
      values: [0, 1, 2, 3, 4, 5, 6, 7, 8] as const,
      recognitionPercents: {
        1: 135,
        2: 125,
        3: 110,
        4: 100,
        5: 80,
        6: 60,
        7: 50,
        8: 10,
        0: 0,
        expertNote: "TODO: confirm recognition % values per current Gazette — Level 1=135% is RCOGP Generic; verify FSC and other sectors differ",
      },
    },

    supplierEnterpriseTypes: {
      values: ["eme", "qse", "generic", "exempted"] as const,
      expertNote: "TODO: what documentation is acceptable evidence for each type — affidavit, certificate, sworn declaration?",
    },

    designatedGroupTypes: {
      values: ["youth", "orphan", "disabled", "military"] as const,
      definitions: {
        youth: "Under 35 years of age at time of acquisition",
        orphan: "Child-headed household / orphan",
        disabled: "Person with a disability (as per Employment Equity Act definition)",
        military: "Military veteran",
      },
      expertNote: "TODO: are 'rural community' or 'collective ownership structures' additional types per recent Gazette amendments?",
    },

    ownershipTypes: {
      values: ["shareholder", "sale_of_assets", "equity_equivalent"] as const,
      expertNote: "TODO: when is Equity Equivalent used and does it score differently from direct shareholding?",
    },

    skillsCategories: {
      values: ["A", "B", "C", "D", "E", "F", "G"] as const,
      descriptions: {
        A: "Learnerships and apprenticeships (SETA-accredited)",
        B: "Skills programmes and short courses",
        C: "Bursaries for employees",
        D: "Bursaries for unemployed persons",
        E: "Internships",
        F: "External unaccredited training",
        G: "Informal / on-the-job training",
        expertNote: "TODO: confirm exact definitions per Codes — especially where F and G differ and how ABET/mandatory sectoral training is classified",
      },
    },

    esdContributionTypes: {
      values: [
        "equity_investment",
        "loan",
        "interest_free_loan",
        "lower_interest_loan",
        "guarantee",
        "collateral",
        "credit_facility",
        "direct_cost",
        "overhead_costs",
        "professional_services_free",
        "professional_services_discounted",
        "employee_secondment",
        "employee_mentorship",
        "non_core_business_transfer",
      ] as const,
      expertNote: "TODO: confirm which contribution types qualify for Supplier Development vs Enterprise Development sub-elements, and if any carry multipliers",
    },

    esdCategories: {
      values: ["supplier_development", "enterprise_development"] as const,
      expertNote: "TODO: can a single contribution split across both categories, or must it be assigned entirely to one?",
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET NAME HINTS
  // Used by matchSheetName() in the extraction pipeline
  // ══════════════════════════════════════════════════════════════════════════
  sheetHints: {
    client: [
      "client information", "client info", "client data", "client details",
      "company info", "company information", "entity info", "entity information",
      "cover", "summary", "client", "instructions", "instruction", "measured entity",
    ],
    financials: [
      "financials", "financial data", "financial information", "finance",
      "income statement", "p&l", "profit and loss", "revenue",
      "financial summary", "fin data", "financial", "imports", "import",
    ],
    ownership: [
      "ownership", "ownership data", "ownership information",
      "shareholder", "shareholders", "share register", "share holding",
      "ownership chain", "own data", "own", "voting rights", "equity",
    ],
    management: [
      "management control", "management", "mc data", "mc", "management data",
      "employment equity", "employees", "employee data", "staff", "personnel",
      "human resources", "hr", "ee data", "ee",
    ],
    skills: [
      "skills development", "skills", "skills data", "training", "training data",
      "learnerships", "bursaries", "sdp", "sd data", "sd", "skills dev",
    ],
    procurement: [
      "procurement", "procurement data", "preferential procurement",
      "pp", "pp data", "suppliers", "supplier data",
      "vendor", "vendors", "supply chain", "pref procurement",
    ],
    esd: [
      "esd", "esd data", "enterprise development",
      "enterprise and supplier development", "supplier development",
      "economic development", "ed data", "sd ed", "enterprise supplier development",
    ],
    sed: [
      "sed", "sed data", "socio economic development", "socio-economic",
      "social development", "social", "csi", "corporate social investment",
      "socio economic",
    ],
    yes: [
      "yes", "yes employees", "y.e.s employees", "y.e.s",
      "youth employment service", "yes initiative", "yes data",
    ],
    scorecard: [
      "scorecard", "summary scorecard", "bbbee scorecard", "b-bbee scorecard",
      "score", "results", "dashboard", "bee scorecard", "bee summary",
    ],
    eap: ["eap", "economically active population", "demographics", "population"],
    industry: ["industry norms", "industry", "norms", "sector codes", "industry codes"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ENTITY DEFINITIONS
  // ══════════════════════════════════════════════════════════════════════════
  entities: {

    // ────────────────────────────────────────────────────────────────────────
    Company: {
      description: "The measured entity (ME) undergoing B-BBEE assessment",
      scoringRelevance: "Provides metadata that determines which scorecard applies (Generic/QSE/EME) and which sector rules govern calculation",
      sheetHints: {
        nameHints: ["client information", "client info", "measured entity"],
        layoutVariants: ["key-value pairs (label in one column, value in adjacent column)"],
        expertNote: "TODO: are there SA toolkits that put client data in a structured table rather than key-value pairs?",
      },
      properties: {
        name: {
          description: "Legal registered company name as per CIPC",
          type: "string",
          required: true,
          aliases: [
            "company name", "entity name", "client name", "name", "company",
            "entity", "organisation", "organization", "business name",
            "registered name", "legal name", "measured entity", "measured entity name",
            "name of company", "name of entity", "name of client",
          ],
          validation: { minLength: 2 },
          expertNote: "TODO: any additional common aliases found in SA agency-specific toolkits?",
        } as PropertyDef,

        tradeName: {
          description: "Trading name (DBA / T/A) if different from legal name",
          type: "string",
          aliases: ["trading as", "trading name", "t/a", "trade name", "known as", "dba"],
          expertNote: "TODO: is trading name mandatory for any scorecard calculations or purely informational?",
        } as PropertyDef,

        registrationNumber: {
          description: "CIPC company registration number",
          type: "string",
          required: true,
          aliases: [
            "registration number", "registration no", "registration #",
            "reg no", "reg number", "reg #", "company reg",
            "cipc number", "cipc no",
            "ck number", "ck no",           // older Close Corporations
            "cc number", "cc no",
            "enterprise number", "company number",
            "company registration",
          ],
          validation: {
            pattern: "must contain at least one digit",
            minLength: 6,
          },
          expertNote: "TODO: valid CIPC formats: 'YYYY/NNNNNN/NN' (companies), 'CK YYYY/NNNNN/NN' (CCs), 'NPOYYYY/NNNNNN/NN' (non-profits). Are all variants handled?",
        } as PropertyDef,

        vatNumber: {
          description: "SARS VAT registration number",
          type: "string",
          aliases: [
            "vat number", "vat no", "vat reg", "vat registration",
            "vat", "vat #",
          ],
          validation: {
            pattern: "10 digits, typically starting with 4",
            minLength: 10,
          },
          expertNote: "TODO: SARS VAT numbers are exactly 10 digits starting with 4. Is this always the case for all entity types?",
        } as PropertyDef,

        taxNumber: {
          description: "SARS income tax reference number (separate from VAT)",
          type: "string",
          aliases: [
            "income tax", "tax number", "tax no", "tax ref",
            "income tax ref", "sars tax", "income tax number",
          ],
          expertNote: "TODO: is income tax number ever required for B-BBEE scoring or only for administrative completeness?",
        } as PropertyDef,

        physicalAddress: {
          description: "Physical/registered business address",
          type: "string",
          aliases: [
            "physical address", "street address", "address",
            "registered address", "business address", "head office address",
          ],
          expertNote: "TODO: is province derivable from physical address for EAP fallback?",
        } as PropertyDef,

        postalAddress: {
          description: "Postal address (if different from physical)",
          type: "string",
          aliases: [
            "postal address", "po box", "p.o. box", "mailing address",
          ],
        } as PropertyDef,

        contactPerson: {
          description: "Primary contact person name",
          type: "string",
          aliases: [
            "contact person", "primary contact", "responsible person",
            "name of contact", "contact name", "contact",
          ],
        } as PropertyDef,

        contactEmail: {
          description: "Primary contact email address",
          type: "string",
          aliases: [
            "email", "e-mail", "email address", "contact email",
            "e-mail address",
          ],
          validation: { pattern: "valid email format" },
        } as PropertyDef,

        contactPhone: {
          description: "Primary contact telephone number",
          type: "string",
          aliases: [
            "telephone", "phone", "tel", "contact number",
            "cell", "mobile", "contact phone",
          ],
        } as PropertyDef,

        financialYearEnd: {
          description: "Financial year-end date (or year string)",
          type: "date",
          aliases: [
            "financial year end", "year end", "financial year", "year",
            "fy", "fin year", "period", "fy end",
          ],
          expertNote: "TODO: can a company use a non-calendar year-end? How does this affect measurement period alignment?",
        } as PropertyDef,

        measurementPeriodStart: {
          description: "ISO start date of the B-BBEE measurement/verification period",
          type: "date",
          aliases: [
            "measurement period start", "verification period start",
            "period start", "fy start", "financial year start",
            "measurement period from",
          ],
          expertNote: "TODO: must measurement period equal the full financial year, or can it differ?",
        } as PropertyDef,

        measurementPeriodEnd: {
          description: "ISO end date of the B-BBEE measurement/verification period",
          type: "date",
          aliases: [
            "measurement period end", "verification period end",
            "period end", "fy end", "year end", "measurement period to",
          ],
        } as PropertyDef,

        sectorCode: {
          description: "Normalised sector code determining which sector scorecard applies",
          type: "enum",
          required: true,
          values: [
            "RCOGP", "ICT", "FSC", "AGRI", "TRANSPORT",
            "CONSTRUCTION", "TOURISM", "MINING", "PROPERTY",
            "CAS", "FORESTRY", "MAC",
          ],
          aliases: [
            "sector", "sector code", "bee sector", "b-bbee sector",
            "industry sector code", "applicable sector", "scorecard sector",
            "applicable code", "code",
          ],
          scoringRelevance: "Determines which pillar weights, sub-element targets, and EME/QSE thresholds apply",
          expertNote: "TODO: confirm full list, especially for newer sectors like Liquid Fuels, Media, and Property sub-sectors",
        } as PropertyDef,

        industrySector: {
          description: "Free-text industry description (e.g. 'IT Services', 'Construction')",
          type: "string",
          aliases: [
            "industry sector", "industry", "sector", "sic code",
            "industry code", "line of business",
          ],
          scoringRelevance: "Used to determine industry norm (NPAT %) for deemed NPAT calculation",
          expertNote: "TODO: what is the mapping from industrySector free-text to sectorCode enum? Is there an official concordance table?",
        } as PropertyDef,

        applicableScorecard: {
          description: "Which measurement classification applies: EME, QSE, or Generic",
          type: "enum",
          values: ["EME", "QSE", "Generic"],
          aliases: [
            "applicable scorecard", "scorecard type", "enterprise size",
            "enterprise type", "eme / qse", "qse / generic",
            "measurement classification",
          ],
          derivedFrom: "revenue + sectorCode",
          businessRule: "EME: turnover < R10M (RCOGP); QSE: R10M–R50M; Generic: > R50M. Thresholds vary by sector.",
          scoringRelevance: "Determines total available points, pillar weights, and which sub-elements are mandatory",
          expertNote: "TODO: confirm sector-specific thresholds — FSC EME threshold is R10M? AGRI? MINING? Provide authoritative source.",
        } as PropertyDef,

        applicableCodes: {
          description: "Full description of the applicable codes (e.g. 'Revised Codes of Good Practice')",
          type: "string",
          aliases: [
            "applicable codes", "applicable code", "revised code",
            "amended code", "codes of good practice",
          ],
        } as PropertyDef,

        eapProvince: {
          description: "Province used to select the Economically Active Population (EAP) comparator table",
          type: "enum",
          values: [
            "National", "Gauteng", "Western Cape", "Eastern Cape", "KZN",
            "Free State", "Limpopo", "Mpumalanga", "North West", "Northern Cape",
          ],
          aliases: [
            "eap province", "province", "region", "eap",
            "economically active population", "eap region",
          ],
          scoringRelevance: "Sets Management Control and Employment Equity EAP targets for each occupational level",
          expertNote: "TODO: how is EAP data sourced — Census, QLFS, or Stats SA? How current must the data be? Is 'National' always acceptable regardless of entity size/location?",
        } as PropertyDef,

        numberOfEmployees: {
          description: "Total full-time-equivalent headcount",
          type: "number",
          aliases: [
            "number of employees", "total employees", "headcount",
            "number of staff", "fte", "total headcount",
            "no. of employees", "no of employees",
          ],
          validation: { min: 0, max: 999999 },
          expertNote: "TODO: does this field affect any pillar score directly, or is it only used for sizing/EAP context?",
        } as PropertyDef,

        beeCertificateNumber: {
          description: "Existing B-BBEE certificate number from previous verification",
          type: "string",
          aliases: [
            "certificate number", "cert no", "verification number",
            "bee certificate no", "sanas no", "sanas number",
            "verification ref",
          ],
          expertNote: "TODO: is the prior certificate number ever used in the scoring calculation, or is it purely for record-keeping?",
        } as PropertyDef,

        beeCertificateExpiry: {
          description: "Expiry date of existing B-BBEE certificate (ISO format)",
          type: "date",
          aliases: [
            "certificate expiry", "cert expiry", "expiry date",
            "valid until", "valid to", "certificate valid until",
          ],
        } as PropertyDef,

        beeCertificateLevel: {
          description: "B-BBEE level from most recent certificate (1–8)",
          type: "number",
          aliases: [
            "bee level", "b-bbee level", "current level",
            "contributor level", "previous level",
            "bee status level",
          ],
          validation: { min: 1, max: 8 },
          scoringRelevance: "Historical reference; current measurement replaces this",
        } as PropertyDef,

        verificationAgency: {
          description: "SANAS-accredited agency that issued the prior certificate",
          type: "string",
          aliases: [
            "verification agency", "verifier", "verification company",
            "sanas agency", "issued by",
          ],
        } as PropertyDef,
      },
    } as EntityDef,

    // ────────────────────────────────────────────────────────────────────────
    Financials: {
      description: "Financial metrics of the measured entity for the assessment period",
      scoringRelevance: "Drives ESD and SED targets (% of NPAT), Skills target (% of leviable amount), and Procurement base (TMPS)",
      sheetHints: {
        nameHints: [
          "financials", "financial data", "finance", "income statement",
          "p&l", "profit and loss", "revenue", "financial summary",
        ],
        layoutVariants: ["key-value pairs (label / value in adjacent cells)"],
        expertNote: "TODO: are SA toolkits ever structured as a full IFRS income statement? How would that be parsed differently?",
      },
      properties: {
        revenue: {
          description: "Total annual revenue / turnover for the measurement period",
          type: "currency",
          required: true,
          unit: "ZAR",
          aliases: [
            "revenue", "total revenue", "turnover", "income",
            "gross revenue", "annual revenue", "sales",
            "total turnover", "annual turnover",
          ],
          scoringRelevance: "Determines EME/QSE/Generic classification; base for deemed NPAT calculation",
          expertNote: "TODO: should this include VAT or exclude VAT? Is turnover = revenue for all entity types?",
        } as PropertyDef,

        npat: {
          description: "Net Profit After Tax for the measurement period",
          type: "currency",
          unit: "ZAR",
          aliases: [
            "npat", "net profit", "net profit after tax", "profit after tax",
            "pat", "net income", "bottom line",
          ],
          scoringRelevance: "Base for ESD target (2% of NPAT) and SED target (1% of NPAT); triggers deemed NPAT if below threshold",
          expertNote: "TODO: can NPAT be negative? How is a loss-making entity treated for ESD/SED targets?",
        } as PropertyDef,

        leviableAmount: {
          description: "Leviable amount — the payroll subset on which skills levy is calculated",
          type: "currency",
          required: true,
          unit: "ZAR",
          aliases: [
            "leviable amount", "leviable", "leviable payroll",
            "payroll", "total payroll", "salary bill", "wage bill",
            "total remuneration", "annual payroll",
          ],
          businessRule: "Typically 80% of total payroll (non-leviable staff excluded). Used as Skills Development spend base.",
          scoringRelevance: "Denominator for Skills Development spend target (1.5% or 3% of leviable amount)",
          expertNote: "TODO: exact definition of 'leviable amount' per SDL Act — which employees/payments are excluded from the levy base?",
        } as PropertyDef,

        payroll: {
          description: "Total payroll / wage bill (may differ from leviable amount)",
          type: "currency",
          unit: "ZAR",
          aliases: [
            "payroll", "total wages", "salaries & wages",
            "total salary", "wages and salaries",
          ],
          businessRule: "Fallback: if leviableAmount is absent, use payroll",
          expertNote: "TODO: is total payroll ever used directly in a B-BBEE calculation, or only leviable amount?",
        } as PropertyDef,

        tmps: {
          description: "Total Measured Procurement Spend — base for Preferential Procurement",
          type: "currency",
          unit: "ZAR",
          aliases: [
            "tmps", "total measured procurement", "total measured procurement spend",
            "measured procurement spend", "total procurement",
          ],
          derivedFrom: "tmpsInclusions - tmpsExclusions",
          scoringRelevance: "Denominator for Preferential Procurement score; also used for ESD Supplier Development target",
          expertNote: "TODO: what exactly is included vs excluded? Are all cost-of-sales included? Capital expenditure? Rates and taxes?",
        } as PropertyDef,

        tmpsInclusions: {
          description: "Gross procurement spend before exclusions (numerator components of TMPS)",
          type: "currency",
          unit: "ZAR",
          aliases: [
            "tmps inclusions", "total inclusions", "cost of sales",
            "inclusions",
          ],
          expertNote: "TODO: provide complete list of what is included in TMPS per Codes statement 400",
        } as PropertyDef,

        tmpsExclusions: {
          description: "Amounts excluded from TMPS (e.g. imports, payments to public entities)",
          type: "currency",
          unit: "ZAR",
          aliases: [
            "tmps exclusions", "total exclusions", "exclusions",
            "import", "imports",
          ],
          expertNote: "TODO: complete list of TMPS exclusions per Codes — payments to non-SA residents, public entities, inter-group, etc.",
        } as PropertyDef,

        deemedNpat: {
          description: "Deemed NPAT applied when actual NPAT is below the industry norm threshold",
          type: "currency",
          unit: "ZAR",
          derivedFrom: "revenue × industryNormPercent",
          businessRule: "Applied when actual NPAT margin < 25% of industry norm. deemedNpat = revenue × industryNorm%.",
          expertNote: "TODO: confirm the 25%-of-norm threshold is standard across all sectors and scorecards",
        } as PropertyDef,

        industryNormPercent: {
          description: "Industry-specific NPAT margin norm (%)",
          type: "percent",
          unit: "percent",
          scoringRelevance: "Used to compute deemed NPAT threshold",
          expertNote: "TODO: are the industry norms in FinancialsForm.tsx (Retail 4%, IT 10%, etc.) based on an official DTI/dtic source? Provide reference.",
        } as PropertyDef,
      },
    } as EntityDef,

    // ────────────────────────────────────────────────────────────────────────
    Shareholder: {
      description: "An individual or entity holding an equity stake in the measured entity",
      scoringRelevance: "Drives Ownership pillar — black ownership %, voting rights, economic interest, net value, designated group bonus",
      linkedTo: ["Company via ownership stake"],
      sheetHints: {
        nameHints: [
          "ownership", "shareholders", "share register",
          "ownership chain", "voting rights", "equity",
        ],
        tableIndicators: ["shareholder", "shares", "voting rights", "black", "economic interest"],
        rowType: "one row per shareholder (tabular) OR key-value block per shareholder (vertical)",
        layoutVariants: [
          "tabular: columns = Name | BO% | BWO% | Shares | VotingRights% | EconomicInterest%",
          "key-value: Shareholder 1 Name: [value], Black Ownership: [value], ...",
        ],
        expertNote: "TODO: are there common SA toolkits that use a shareholding chain diagram rather than a flat table? How should multi-tier ownership be handled?",
      },
      properties: {
        name: {
          description: "Full legal name of the shareholder (individual or entity)",
          type: "string",
          required: true,
          aliases: [
            "shareholder name", "name", "shareholder", "entity name",
            "holder", "investor", "member", "owner",
            "name of shareholder", "name of entity", "name of owner",
          ],
        } as PropertyDef,

        shareholderId: {
          description: "SA ID number, passport number, or company registration number of the shareholder",
          type: "string",
          aliases: [
            "id number", "id", "sa id", "passport", "registration",
            "shareholder id", "id / registration",
          ],
          expertNote: "TODO: is SA ID number ever used to verify race/gender automatically, or is it always manually specified?",
        } as PropertyDef,

        blackOwnershipPercent: {
          description: "Percentage of this shareholder's stake that is black-owned (0–100). 100 if shareholder is black individual; derived for holding companies.",
          type: "percent",
          required: true,
          unit: "percent (0–100)",
          aliases: [
            "bo%", "bo", "black %", "black ownership %", "black owned",
            "bo percent", "black shareholding", "% black", "hdsa",
            "historically disadvantaged", "black ownership",
          ],
          validation: { min: 0, max: 100 },
          scoringRelevance: "Aggregated to total black ownership % for Ownership pillar",
          businessRule: "For a black individual: 100%. For entities: apply modified flow-through.",
          expertNote: "TODO: does the extractor ever infer BO% from race field for individual shareholders? Should it?",
        } as PropertyDef,

        blackWomenOwnershipPercent: {
          description: "Percentage of this shareholder's stake held by black women (0–100)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: [
            "bwo%", "bwo", "black women %", "black women ownership %",
            "bw%", "women %", "female black", "black female",
            "black women ownership", "black female ownership",
          ],
          validation: { min: 0, max: 100 },
          scoringRelevance: "Sub-score for black women ownership in Ownership pillar",
          expertNote: "TODO: confirm BWO cannot exceed BO% — is this enforced in the scorecard?",
        } as PropertyDef,

        shares: {
          description: "Number of shares held (or percentage of total shares)",
          type: "number",
          aliases: [
            "shares", "shares %", "share %", "shareholding",
            "percentage", "equity %", "stake", "equity stake",
            "no of shares", "number of shares",
          ],
          expertNote: "TODO: when shares is a % vs absolute number — how does the extractor distinguish? Is the unit always in the column header?",
        } as PropertyDef,

        shareValue: {
          description: "Rand value per share or total share value for this shareholder",
          type: "currency",
          unit: "ZAR",
          aliases: [
            "value", "share value", "investment value", "rand value",
            "amount", "total value",
          ],
          scoringRelevance: "Used for net value calculation (company value × black ownership % − outstanding debt)",
          expertNote: "TODO: net value sub-score formula — how is company total value determined? Market value, book value, or directors valuation?",
        } as PropertyDef,

        votingRightsPercent: {
          description: "Percentage of voting rights held by this shareholder (0–100, stored as fraction 0–1 internally)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: [
            "voting rights", "voting rights %", "voting %",
            "voting interest", "voting power", "vr %",
            "voting rights percentage",
          ],
          validation: { min: 0, max: 100 },
          scoringRelevance: "Primary measure for Ownership pillar voting rights sub-score",
          businessRule: "Defaults to blackOwnershipPercent if not specified",
          expertNote: "TODO: in modified flow-through, how do voting rights chain upward through holding companies?",
        } as PropertyDef,

        economicInterestPercent: {
          description: "Percentage of economic interest / profit entitlement held (0–100, stored as fraction 0–1 internally)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: [
            "economic interest", "economic interest %", "ei%",
            "economic %", "economic stake", "profit entitlement",
            "economic entitlement",
          ],
          validation: { min: 0, max: 100 },
          scoringRelevance: "Separate sub-score for economic interest in Ownership pillar",
          businessRule: "Defaults to blackOwnershipPercent if not specified",
          expertNote: "TODO: when does economic interest materially differ from voting rights in practice? Preference shares? Structured deals?",
        } as PropertyDef,

        isDesignatedGroup: {
          description: "Whether this shareholder belongs to a designated group (youth, orphan, disabled, military veteran)",
          type: "boolean",
          aliases: [
            "designated group", "designated", "is designated",
            "youth/orphan/disabled/military", "designated status",
          ],
          scoringRelevance: "Designated group ownership earns bonus points in Ownership pillar",
          expertNote: "TODO: what bonus points and thresholds apply for designated group ownership in RCOGP Generic?",
        } as PropertyDef,

        designatedGroupType: {
          description: "Which designated group category applies",
          type: "enum",
          values: ["youth", "orphan", "disabled", "military"],
          aliases: ["designated group type", "dg type"],
          expertNote: "TODO: does each designated group type score the same bonus, or are there different weights?",
        } as PropertyDef,

        blackNewEntrant: {
          description: "Whether this black shareholder qualifies as a new entrant to the economy",
          type: "boolean",
          aliases: [
            "black new entrant", "new entrant", "bne",
            "is new entrant",
          ],
          scoringRelevance: "New entrant status may earn additional bonus points",
          expertNote: "TODO: definition of 'new entrant' per Codes — asset threshold? Prior participation in B-BBEE? How is it evidenced?",
        } as PropertyDef,

        yearsHeld: {
          description: "How long (years) the shares have been held by the current owner",
          type: "number",
          aliases: ["years held", "holding period", "years", "tenure"],
          scoringRelevance: "Graduation factor applied to net value sub-score based on years held",
          businessRule: "Graduation factor: ≤1yr=100%, 1–3yr=90%, 3–5yr=80%, 5–10yr=70%, >10yr=60%",
          expertNote: "TODO: confirm graduation factor schedule against current Codes — has it changed since the 2013 RCOGP?",
        } as PropertyDef,

        modifiedFlowThrough: {
          description: "Modified flow-through percentage — adjusted ownership accounting for holding company chains",
          type: "percent",
          unit: "percent (0–100)",
          aliases: ["modified flow through", "mft", "flow through %", "adjusted ownership"],
          scoringRelevance: "Used when the direct shareholder is itself a company",
          expertNote: "TODO: explain the modified flow-through formula step by step — when does it apply and how is it calculated for multi-tier structures?",
        } as PropertyDef,

        ownershipType: {
          description: "Method by which ownership is held",
          type: "enum",
          values: ["shareholder", "sale_of_assets", "equity_equivalent"],
          aliases: ["ownership type", "type"],
          expertNote: "TODO: how does Sale of Assets differ from Shareholder for scoring purposes? What is Equity Equivalent used for?",
        } as PropertyDef,
      },
      relationships: {
        aggregatedBlackOwnership: {
          description: "Total black ownership % across all shareholders",
          formula: "SUM(shareholders.blackOwnershipPercent × shareholders.shares) / totalShares",
          expertNote: "TODO: confirm whether this uses voting rights or equity shares as the denominator",
        },
        aggregatedBlackWomenOwnership: {
          description: "Total black women ownership % across all shareholders",
          formula: "SUM(shareholders.blackWomenOwnershipPercent × shareholders.shares) / totalShares",
          expertNote: "TODO: confirm threshold for full points — commonly 10% BWO for max sub-score?",
        },
        netValueCalculation: {
          description: "Net value sub-score based on company value less outstanding debt, adjusted for black ownership and graduation",
          formula: "(companyValue - outstandingDebt) × blackOwnershipPercent × graduationFactor",
          expertNote: "TODO: confirm exact net value formula per Codes — especially for leveraged buyouts and vendor finance structures",
        },
      },
    } as EntityDef,

    // ────────────────────────────────────────────────────────────────────────
    Employee: {
      description: "An employee of the measured entity, categorised by occupational level, race, and gender",
      scoringRelevance: "Drives Management Control and Employment Equity pillars; also contributes to Skills Development (learner demographic)",
      sheetHints: {
        nameHints: [
          "management control", "mc", "employment equity", "ee",
          "employees", "employee data", "staff", "personnel", "hr",
        ],
        tableIndicators: ["name", "race", "gender", "level", "designation", "occupational"],
        rowType: "one row per employee (roster) OR aggregated cross-tab (race×gender columns, level rows)",
        layoutVariants: [
          "Roster: Name | Gender | Race | Designation | Disabled | ID | Province",
          "Cross-tab: rows = occupational level, columns = African M/F | Coloured M/F | Indian M/F | White M/F",
        ],
        expertNote: "TODO: are there other common MC sheet formats in SA agency toolkits (e.g. pivot tables, summary only)?",
      },
      properties: {
        name: {
          description: "Full name of the employee",
          type: "string",
          required: true,
          aliases: [
            "full name", "employee name", "staff name", "person",
            "surname", "first name", "name & surname", "name and surname",
            "name",
          ],
        } as PropertyDef,

        gender: {
          description: "Gender of the employee",
          type: "enum",
          required: true,
          values: ["Male", "Female"],
          aliases: [
            "gender", "sex", "male/female", "m/f", "gender identity",
          ],
          scoringRelevance: "Female employees count separately for black women sub-scores",
        } as PropertyDef,

        race: {
          description: "Population group per Employment Equity Act",
          type: "enum",
          required: true,
          values: ["African", "Coloured", "Indian", "White"],
          aliases: [
            "race", "race group", "population group", "ethnicity",
            "demographic", "racial group",
            "african/coloured/indian/white",
          ],
          scoringRelevance: "African/Coloured/Indian = Black; drives EAP representation percentages",
        } as PropertyDef,

        designation: {
          description: "Occupational level per Employment Equity / OFLP classification",
          type: "enum",
          required: true,
          values: [
            "Board", "Executive", "Executive Director", "Other Executive Management",
            "Senior", "Middle", "Junior",
            "Skilled Technical", "Semi-skilled", "Unskilled",
          ],
          aliases: [
            "designation", "level", "occupational level", "position",
            "role", "job title", "grade", "category", "management level",
            "occ level", "occupational category",
          ],
          scoringRelevance: "Board/Executive count for MC sub-scores; all levels count for EE sub-scores",
          expertNote: "TODO: what is the correct mapping from common toolkit labels (e.g. 'Top Management', 'Professionally Qualified') to these enum values?",
        } as PropertyDef,

        isDisabled: {
          description: "Whether the employee has a declared disability",
          type: "boolean",
          aliases: [
            "disabled", "disability", "is disabled", "pwd",
            "person with disability", "differently abled", "disability status",
          ],
          scoringRelevance: "Disabled employees count for disability sub-score (target typically 2% of workforce)",
          expertNote: "TODO: must the disability be formally declared/documented? What % threshold triggers full points?",
        } as PropertyDef,

        isForeign: {
          description: "Whether the employee is a foreign national",
          type: "boolean",
          aliases: [
            "foreign", "is foreign", "foreign national",
            "nationality", "citizen",
          ],
          scoringRelevance: "Foreign nationals are excluded from EAP-based calculations",
          expertNote: "TODO: are foreign nationals excluded from ALL B-BBEE calculations, or only EAP-denominator calculations?",
        } as PropertyDef,

        idNumber: {
          description: "SA identity number or passport number",
          type: "string",
          aliases: [
            "id number", "id no", "sa id", "identity number",
            "passport", "national id",
          ],
          expertNote: "TODO: is SA ID number ever used in the pipeline to derive race/gender/age? Should it be?",
        } as PropertyDef,

        province: {
          description: "Province where the employee works (for EAP comparison)",
          type: "enum",
          values: [
            "Gauteng", "Western Cape", "Eastern Cape", "KZN",
            "Free State", "Limpopo", "Mpumalanga", "North West", "Northern Cape",
            "National",
          ],
          aliases: ["province", "region", "work location", "location"],
          expertNote: "TODO: is employee-level province used in any calculation, or is it only the company-level eapProvince that matters?",
        } as PropertyDef,

        hireDate: {
          description: "Date the employee was hired / engagement started (ISO)",
          type: "date",
          aliases: [
            "hire date", "start date", "date employed",
            "date of appointment", "engagement date", "commencement date",
          ],
        } as PropertyDef,

        terminationDate: {
          description: "Date the employee left / was terminated (ISO), if applicable",
          type: "date",
          aliases: ["termination date", "end date", "date left", "last day"],
          expertNote: "TODO: how are employees who left during the measurement period counted — pro-rated or excluded entirely?",
        } as PropertyDef,
      },
      relationships: {
        eapComparator: {
          description: "EAP % benchmarks used to calculate representation gaps per occupational level",
          expertNote: "TODO: provide EAP table reference (Stats SA source, year). Which edition is currently used?",
        },
        boardBlackPercent: {
          description: "% of Board members who are black",
          formula: "COUNT(employees WHERE designation='Board' AND isBlack) / COUNT(employees WHERE designation='Board')",
          expertNote: "TODO: confirm MC scoring: Board score = achieved vs EAP target weighted to X pts",
        },
        execBlackPercent: {
          description: "% of Executive/Senior Management who are black",
          formula: "COUNT(employees WHERE designation IN ['Executive','Executive Director','Senior'] AND isBlack) / COUNT(employees WHERE designation IN ['Executive','Executive Director','Senior'])",
          expertNote: "TODO: confirm which levels are counted for the 'Top Management' MC sub-score",
        },
      },
    } as EntityDef,

    // ────────────────────────────────────────────────────────────────────────
    Supplier: {
      description: "A supplier or vendor from whom the measured entity procures goods or services",
      scoringRelevance: "Drives Preferential Procurement pillar — recognised spend based on B-BBEE level and qualifying criteria",
      sheetHints: {
        nameHints: [
          "procurement", "preferential procurement", "pp", "suppliers",
          "supplier data", "vendor", "vendors", "supply chain",
        ],
        tableIndicators: ["supplier", "vendor", "b-bbee level", "spend", "amount"],
        rowType: "one row per supplier",
        expertNote: "TODO: some toolkits aggregate suppliers — how should aggregated rows be handled?",
      },
      properties: {
        name: {
          description: "Full legal name of the supplier",
          type: "string",
          required: true,
          aliases: [
            "supplier name", "name", "supplier", "vendor", "vendor name",
            "company", "entity", "service provider",
          ],
        } as PropertyDef,

        beeLevel: {
          description: "The supplier's B-BBEE recognition level (1–8; 0 = non-compliant)",
          type: "number",
          required: true,
          aliases: [
            "bee level", "b-bbee level", "level", "bbbee level",
            "recognition level", "supplier level", "compliance level",
            "bee status", "bbbee status", "contributor level",
          ],
          validation: { min: 0, max: 8 },
          scoringRelevance: "Determines recognition % applied to spend for procurement score",
          expertNote: "TODO: confirm recognition percentages: L1=135%, L2=125%, L3=110%, L4=100%, L5=80%, L6=60%, L7=50%, L8=10%, non-compliant=0%",
        } as PropertyDef,

        spend: {
          description: "Annual procurement spend with this supplier (ZAR)",
          type: "currency",
          required: true,
          unit: "ZAR",
          aliases: [
            "spend", "amount", "spend amount", "total spend",
            "procurement spend", "value", "rand value", "cost",
            "total", "annual spend",
          ],
          scoringRelevance: "Recognised spend = spend × recognition% / TMPS × scorecard weighting",
        } as PropertyDef,

        blackOwnershipPercent: {
          description: "Percentage of the supplier that is black-owned (0–100)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: [
            "bo%", "bo", "black owned", "black ownership %",
            "% black", "black ownership percentage", "black ownership",
          ],
          validation: { min: 0, max: 100 },
          scoringRelevance: "≥51% BO triggers black-owned supplier bonus; ≥30% black women ownership triggers BWO bonus",
          expertNote: "TODO: confirm exact bonus point thresholds and % triggers for black-owned and black-women-owned supplier sub-elements",
        } as PropertyDef,

        blackWomenOwnershipPercent: {
          description: "Percentage of the supplier held by black women (0–100)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: [
            "bwo%", "bwo", "black women %", "black women owned",
            "bw ownership", "black women ownership",
          ],
          validation: { min: 0, max: 100 },
          expertNote: "TODO: does BWO ≥ 30% earn a specific bonus or is it included in the BO bonus calculation?",
        } as PropertyDef,

        vatNumber: {
          description: "Supplier VAT number (for verification and deduplication)",
          type: "string",
          aliases: ["vat number", "vat no", "vat reg", "vat"],
          validation: { pattern: "10 digits" },
        } as PropertyDef,

        enterpriseType: {
          description: "Size classification of the supplier: EME, QSE, or Generic",
          type: "enum",
          values: ["eme", "qse", "generic", "exempted"],
          aliases: [
            "enterprise type", "eme/qse/generic", "eme/qse", "size",
            "classification", "measurement type",
          ],
          scoringRelevance: "EME and QSE suppliers may qualify for automatic recognition regardless of BEE level",
          expertNote: "TODO: at what turnover threshold does a supplier auto-qualify as EME for procurement purposes? Does it differ from the general scorecard threshold?",
        } as PropertyDef,

        isEmpoweringSupplier: {
          description: "Whether the supplier qualifies as an Empowering Supplier per the Codes",
          type: "boolean",
          aliases: [
            "empowering supplier", "empowering", "is empowering", "es",
          ],
          scoringRelevance: "Spend to Empowering Suppliers earns higher recognition",
          expertNote: "TODO: exact criteria for Empowering Supplier — what sub-elements of the scorecard must the supplier demonstrate?",
        } as PropertyDef,

        isDesignatedGroupSupplier: {
          description: "Whether the supplier is majority-owned by a designated group member",
          type: "boolean",
          aliases: [
            "designated group supplier", "designated supplier", "dg supplier",
          ],
          scoringRelevance: "Designated group supplier bonus points in Procurement pillar",
          expertNote: "TODO: which designated group qualifications apply to suppliers? Is it the same list as for shareholders?",
        } as PropertyDef,

        youthOwnershipPercent: {
          description: "Percentage of the supplier held by black youth (under 35)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: ["youth ownership", "youth %", "black youth %"],
          expertNote: "TODO: is youth ownership tracked separately or as a subset of designated group?",
        } as PropertyDef,

        disabledOwnershipPercent: {
          description: "Percentage of the supplier held by persons with disabilities",
          type: "percent",
          unit: "percent (0–100)",
          aliases: ["disabled ownership", "pwd %", "disability ownership"],
          expertNote: "TODO: same question as youth ownership — tracked separately or under designated group?",
        } as PropertyDef,

        isSupplierDevRecipient: {
          description: "Whether this supplier has received supplier development support from the ME",
          type: "boolean",
          aliases: ["supplier dev recipient", "received sd support"],
          scoringRelevance: "Links supplier to ESD Supplier Development spend",
          expertNote: "TODO: must ESD beneficiary be on the procurement list for SD spend to be recognised?",
        } as PropertyDef,

        hasThreeYearContract: {
          description: "Whether the supplier holds a long-term contract (≥3 years)",
          type: "boolean",
          aliases: ["three year contract", "long term contract", "3 year contract"],
          expertNote: "TODO: does a multi-year contract trigger any scoring benefit or only evidentiary implications?",
        } as PropertyDef,
      },
    } as EntityDef,

    // ────────────────────────────────────────────────────────────────────────
    TrainingProgram: {
      description: "A skills development training, learnership, bursary, internship, or other learning intervention",
      scoringRelevance: "Drives Skills Development pillar — spend by category and beneficiary demographics",
      sheetHints: {
        nameHints: [
          "skills development", "skills", "training", "training data",
          "learnerships", "bursaries", "sdp", "sd data",
        ],
        tableIndicators: ["training", "learner", "cost", "race", "gender", "category", "employed"],
        rowType: "one row per training programme or per learner",
        expertNote: "TODO: is it common for one row to represent multiple learners (aggregated), or is it always one row per learner?",
      },
      properties: {
        name: {
          description: "Name of the training programme, course, or learning intervention",
          type: "string",
          required: true,
          aliases: [
            "program name", "programme name", "training name", "course name",
            "course", "qualification", "description", "intervention",
            "training", "program", "programme",
          ],
        } as PropertyDef,

        categoryCode: {
          description: "Skills Development category (A–G) per Codes of Good Practice",
          type: "enum",
          required: true,
          values: ["A", "B", "C", "D", "E", "F", "G"],
          aliases: [
            "category", "type", "training type", "learning type",
            "intervention type", "program type", "programme type",
          ],
          scoringRelevance: "Category determines which sub-element the spend counts toward and associated weighting",
          expertNote: "TODO: confirm correct category descriptions (see enums.skillsCategories) and thresholds for each category",
        } as PropertyDef,

        cost: {
          description: "Monetary cost of this training intervention (ZAR)",
          type: "currency",
          required: true,
          unit: "ZAR",
          aliases: [
            "cost", "amount", "spend", "value", "total cost",
            "training cost", "rand value", "expenditure",
            "course cost",
          ],
          scoringRelevance: "Summed against leviable amount threshold to calculate skills spend %",
          expertNote: "TODO: are travel, accommodation, and materials costs included? See SkillsForm expanded cost fields.",
        } as PropertyDef,

        learnerName: {
          description: "Name of the learner/beneficiary of this training",
          type: "string",
          aliases: [
            "learner", "learner name", "name", "employee", "employee name",
            "participant", "student", "trainee",
            "learner name & surname",
          ],
        } as PropertyDef,

        learnerIdNumber: {
          description: "SA ID number or passport of the learner",
          type: "string",
          aliases: ["learner id", "id number", "sa id", "passport"],
          expertNote: "TODO: is learner ID required for SETA claims or just for B-BBEE evidence?",
        } as PropertyDef,

        race: {
          description: "Race of the learner",
          type: "enum",
          values: ["African", "Coloured", "Indian", "White"],
          aliases: ["race", "race group", "population group", "demographic"],
          scoringRelevance: "Black learners (African/Coloured/Indian) count toward black skills spend sub-element",
        } as PropertyDef,

        gender: {
          description: "Gender of the learner",
          type: "enum",
          values: ["Male", "Female"],
          aliases: ["gender", "sex"],
          scoringRelevance: "Black women learners may earn separate sub-score in some scorecards",
          expertNote: "TODO: is there a separate black women skills spend sub-element in RCOGP Generic scorecard?",
        } as PropertyDef,

        isDisabled: {
          description: "Whether the learner has a disability",
          type: "boolean",
          aliases: ["disabled", "disability", "pwd", "is disabled"],
          scoringRelevance: "Learners with disabilities may count toward a separate disability skills sub-score",
          expertNote: "TODO: is there a disability learner sub-element in the Skills scorecard and what is the target?",
        } as PropertyDef,

        employmentStatus: {
          description: "Whether the learner is employed, fixed-term, or unemployed",
          type: "enum",
          values: ["Permanent", "Fixed-Term", "Unemployed"],
          aliases: ["employed", "is employed", "employment status", "currently employed", "status"],
          scoringRelevance: "Unemployed learners qualify for different category allocation (Cat D vs Cat C)",
          expertNote: "TODO: confirm how 'fixed-term' or contract employees are classified — do they count as employed for Skills?",
        } as PropertyDef,

        isYesEmployee: {
          description: "Whether the learner is part of the Youth Employment Service (YES) programme",
          type: "boolean",
          aliases: ["yes", "yes initiative", "y.e.s", "yes candidate", "is yes"],
          scoringRelevance: "YES participants may count toward both Skills and YES Initiative pillars",
          expertNote: "TODO: explain the YES Initiative pillar scoring — how does it interact with Skills Development? Is it a separate element?",
        } as PropertyDef,

        isAbsorbed: {
          description: "Whether the learner was absorbed into permanent employment after the learning programme",
          type: "boolean",
          aliases: ["absorbed", "is absorbed", "absorption", "permanently employed"],
          scoringRelevance: "Absorption bonus: additional points for learners employed post-learnership",
          expertNote: "TODO: what is the absorption bonus magnitude and which categories qualify?",
        } as PropertyDef,

        isAbet: {
          description: "Whether this is an ABET (Adult Basic Education and Training) programme",
          type: "boolean",
          aliases: ["abet", "is abet", "adult basic education", "mandatory sectoral"],
          expertNote: "TODO: do ABET programmes qualify under category A or G? Do they have a separate sub-element?",
        } as PropertyDef,

        isMandatory: {
          description: "Whether this training is mandatory/compulsory (e.g. professional CPD)",
          type: "boolean",
          aliases: ["mandatory", "is mandatory", "compulsory", "cpdqualifying"],
          expertNote: "TODO: does mandatory training qualify for Skills Development points? Any cap or exclusion?",
        } as PropertyDef,

        transactionDate: {
          description: "Date of the training invoice or payment (ISO)",
          type: "date",
          aliases: [
            "transaction date", "invoice date", "date", "spend date",
            "start date", "end date",
          ],
          expertNote: "TODO: must training fall within the measurement period? How are multi-year learnerships handled?",
        } as PropertyDef,

        startDate: {
          description: "Start date of the training programme (ISO)",
          type: "date",
          aliases: ["start date", "commencement date", "from"],
        } as PropertyDef,

        endDate: {
          description: "End date of the training programme (ISO)",
          type: "date",
          aliases: ["end date", "completion date", "to"],
        } as PropertyDef,
      },
    } as EntityDef,

    // ────────────────────────────────────────────────────────────────────────
    Contribution: {
      description: "An ESD (Enterprise/Supplier Development) or SED (Socio-Economic Development) monetary or in-kind contribution",
      scoringRelevance: "Drives ESD pillar (supplier development + enterprise development sub-elements) and SED pillar",
      sheetHints: {
        nameHints: [
          "esd", "enterprise development", "supplier development",
          "enterprise and supplier development",
          "sed", "socio economic development", "csi", "social",
        ],
        tableIndicators: ["beneficiary", "amount", "type", "contribution", "black benefit"],
        rowType: "one row per contribution / beneficiary",
        expertNote: "TODO: are ESD and SED always on separate sheets, or combined in some toolkits?",
      },
      properties: {
        beneficiary: {
          description: "Name of the ESD/SED beneficiary organisation or individual",
          type: "string",
          required: true,
          aliases: [
            "beneficiary", "beneficiary name", "recipient", "entity",
            "company", "supplier name", "enterprise", "name",
          ],
        } as PropertyDef,

        contributionType: {
          description: "Form of the ESD/SED contribution",
          type: "enum",
          values: [
            "equity_investment", "loan", "interest_free_loan", "lower_interest_loan",
            "guarantee", "collateral", "credit_facility", "direct_cost",
            "overhead_costs", "professional_services_free",
            "professional_services_discounted", "employee_secondment",
            "employee_mentorship", "non_core_business_transfer",
          ],
          aliases: [
            "type", "contribution type", "nature", "form", "method",
            "support type", "type of contribution",
          ],
          expertNote: "TODO: do non-monetary contributions (secondment, mentorship) receive the same rand-value recognition as monetary contributions?",
        } as PropertyDef,

        amount: {
          description: "Monetary value of the contribution (ZAR)",
          type: "currency",
          required: true,
          unit: "ZAR",
          aliases: [
            "amount", "value", "rand value", "spend",
            "contribution amount", "cost", "total",
            "monetary value",
          ],
          scoringRelevance: "Summed against NPAT-based target (2% for ESD, 1% for SED)",
        } as PropertyDef,

        category: {
          description: "Whether the contribution is Supplier Development (SD) or Enterprise Development (ED) for ESD; or general for SED",
          type: "enum",
          values: ["supplier_development", "enterprise_development", "sed"],
          aliases: ["category", "pillar", "ed/sd", "classification", "sub-element"],
          scoringRelevance: "SD and ED have different % targets and maximum points within ESD pillar",
          expertNote: "TODO: confirm SD target (2% of NPAT) and ED target (1% of NPAT) are RCOGP Generic defaults — verify for QSE/EME and sector variants",
        } as PropertyDef,

        description: {
          description: "Free-text description of the nature of the contribution",
          type: "string",
          aliases: [
            "description", "details", "narrative", "summary",
            "project", "nature", "purpose",
          ],
        } as PropertyDef,

        blackBenefitPercent: {
          description: "Percentage of the contribution that flows to black beneficiaries (0–100)",
          type: "percent",
          unit: "percent (0–100)",
          aliases: [
            "black benefit %", "black benefit", "benefit %",
            "% black benefit", "beneficiary %",
          ],
          validation: { min: 0, max: 100 },
          scoringRelevance: "Only the black-benefit portion counts toward ESD/SED recognised spend",
          expertNote: "TODO: for SED, must 100% of beneficiaries be black? Or is partial black benefit allowed? How is it evidenced?",
        } as PropertyDef,

        transactionDate: {
          description: "Date the contribution was made or invoiced (ISO)",
          type: "date",
          aliases: [
            "date", "transaction date", "invoice date",
            "contribution date", "payment date",
          ],
          expertNote: "TODO: must contributions fall within the measurement year? Are pledges/commitments counted?",
        } as PropertyDef,

        jobsCreated: {
          description: "Number of jobs created as a direct result of this ESD contribution",
          type: "number",
          aliases: [
            "jobs created", "jobs", "# jobs", "employment created",
            "new jobs",
          ],
          scoringRelevance: "Jobs-created bonus applies to ESD Enterprise Development",
          expertNote: "TODO: how are jobs counted — full-time equivalents? Minimum duration? How is this evidenced?",
        } as PropertyDef,
      },
    } as EntityDef,

  }, // end entities

  // ══════════════════════════════════════════════════════════════════════════
  // BUSINESS RULES
  // Derived calculations and scoring thresholds
  // ══════════════════════════════════════════════════════════════════════════
  businessRules: {

    blackDefinition: {
      description: "A person is 'black' for B-BBEE purposes if they are African, Coloured, or Indian",
      legalBasis: "Employment Equity Act No. 55 of 1998, section 1 definition of 'Black People'",
      codeReference: "B-BBEE Codes of Good Practice, Amended General Codes, Code 000",
      expertNote: "TODO: does the definition include SA citizens only, or also permanent residents of African/Coloured/Indian heritage?",
    },

    blackWomanDefinition: {
      description: "A person who is both Female AND black (African/Coloured/Indian)",
    },

    scorecardClassification: {
      eme: {
        description: "Exempted Micro Enterprise — not required to measure against full scorecard",
        defaultThreshold: "Annual turnover < R10 000 000",
        defaultLevel: "Level 4 recognition (100%) if >51% black-owned; Level 3 (110%) if >30% black women owned",
        expertNote: "TODO: confirm EME thresholds and automatic level grants per current Codes (post-2018 amendments). Are there sector-specific variations?",
      },
      qse: {
        description: "Qualifying Small Enterprise — measures against simplified QSE scorecard",
        defaultThreshold: "Annual turnover R10 000 000 – R50 000 000",
        expertNote: "TODO: confirm QSE pillars (typically 4 best-of scorecard elements) and their weights",
      },
      generic: {
        description: "Generic — full scorecard with all 8 pillars",
        defaultThreshold: "Annual turnover > R50 000 000",
        expertNote: "TODO: confirm all 8 pillar weights and maximum points for RCOGP Generic",
      },
    },

    ownership: {
      subMinimumThreshold: "40% of available Ownership points (net value sub-element)",
      expertNote: "TODO: confirm exact sub-minimum rule — is it 40% of net value points specifically, or 40% of total ownership points?",
    },

    managementControl: {
      expertNote: "TODO: fill in EAP comparator methodology — which Stats SA publication, which year, national vs provincial. Provide sub-score weights for Board, Executive, Senior, Middle, Junior levels.",
    },

    skillsDevelopment: {
      genericTarget: "1.5% of leviable amount (combined black and disabled target)",
      qseTarget: "2% of leviable amount",
      expertNote: "TODO: confirm 1.5% vs 2% split between Generic and QSE and sub-element percentages. What is the sub-minimum threshold for this pillar?",
    },

    preferentialProcurement: {
      expertNote: "TODO: fill in TMPS definition, recognition % per BEE level, bonus supplier criteria and thresholds, sub-minimum rule",
    },

    esd: {
      sdTarget: "2% of Net Profit After Tax (Supplier Development)",
      edTarget: "1% of Net Profit After Tax (Enterprise Development)",
      expertNote: "TODO: confirm current SD/ED targets and whether they have changed since 2016 Gazette. Confirm jobs-created bonus formula.",
    },

    sed: {
      target: "1% of Net Profit After Tax",
      expertNote: "TODO: confirm SED target is 1% of NPAT; confirm whether deemed NPAT applies to SED the same way as ESD",
    },

    discounting: {
      description: "A measured entity that fails to meet sub-minimums for Ownership, Skills, Procurement, or Supplier Development is discounted one level",
      expertNote: "TODO: confirm exact discounting rule — is it always one level down, or can multiple failures stack?",
    },

    levelDetermination: {
      expertNote: "TODO: provide current B-BBEE level points thresholds table from Codes. Are they the same across all scorecard types (Generic, QSE)?",
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION RULES
  // Constraints the reconciler enforces on LLM-generated field values
  // ══════════════════════════════════════════════════════════════════════════
  validationRules: {
    percentRange: { min: 0, max: 100, description: "All percentages must be 0–100" },
    beeLevelRange: { min: 1, max: 8, description: "B-BBEE levels must be 1–8; 0 means non-compliant" },
    currencyNonNegative: { min: 0, description: "All currency amounts must be ≥ 0" },
    dateFormat: { pattern: "YYYY-MM-DD", description: "All dates must be ISO format" },
    vatFormat: { pattern: "^\\d{10}$", description: "VAT numbers must be 10 digits" },
    registrationPattern: {
      description: "Registration numbers must contain at least one digit and be ≥ 6 chars",
      minLength: 6,
      mustContainDigit: true,
    },
    bwoLeBoConstraint: {
      description: "Black women ownership % cannot exceed total black ownership %",
      expertNote: "TODO: is this enforced in the scoring engine or only validated at extraction time?",
    },
  },

} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Exported type helpers
// ─────────────────────────────────────────────────────────────────────────────

export type BbbeeEntityType = keyof typeof BBBEE_ONTOLOGY.entities;
export type SectorCode = typeof BBBEE_ONTOLOGY.enums.sectorCodes.values[number];
export type ApplicableScorecard = typeof BBBEE_ONTOLOGY.enums.applicableScorecards.values[number];
export type EapProvince = typeof BBBEE_ONTOLOGY.enums.eapProvinces.values[number];
export type RaceGroup = typeof BBBEE_ONTOLOGY.enums.raceGroups.values[number];
export type OccupationalLevel = typeof BBBEE_ONTOLOGY.enums.occupationalLevels.values[number];
export type BeeLevel = typeof BBBEE_ONTOLOGY.enums.beeLevels.values[number];
export type SkillsCategoryCode = typeof BBBEE_ONTOLOGY.enums.skillsCategories.values[number];
export type EsdContributionType = typeof BBBEE_ONTOLOGY.enums.esdContributionTypes.values[number];
export type DesignatedGroupType = typeof BBBEE_ONTOLOGY.enums.designatedGroupTypes.values[number];

/**
 * Returns all known aliases for a given entity property, suitable for
 * column-matching in the extraction pipeline.
 *
 * @example
 *   getAliases('Shareholder', 'blackOwnershipPercent')
 *   // → ["bo%", "bo", "black %", "black ownership %", ...]
 */
export function getAliases(entityType: BbbeeEntityType, propertyName: string): string[] {
  const entity = BBBEE_ONTOLOGY.entities[entityType] as EntityDef;
  const prop = entity?.properties?.[propertyName] as PropertyDef | undefined;
  return prop?.aliases ?? [];
}

/**
 * Returns all entity types defined in the ontology.
 */
export function getEntityTypes(): BbbeeEntityType[] {
  return Object.keys(BBBEE_ONTOLOGY.entities) as BbbeeEntityType[];
}

/**
 * Returns all sheet name hints for a given pillar key.
 * Pillar keys match BBBEE_ONTOLOGY.sheetHints keys.
 */
export function getSheetHints(pillar: keyof typeof BBBEE_ONTOLOGY.sheetHints): string[] {
  return [...BBBEE_ONTOLOGY.sheetHints[pillar]];
}
