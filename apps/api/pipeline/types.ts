export interface PipelineLog {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export interface PipelineResult {
  status: 'success' | 'partial_success' | 'failed';
  processedAt: string;
  sourceFiles: string[];
  extractionSummary: {
    sheetsParsed: number;
    sheetsTotal: number;
    rowsExtracted: number;
    entitiesExtracted: number;
    warnings: string[];
    errors: string[];
  };

  client: {
    name: string;
    tradeName: string;
    address: string;
    /** Postal address (if separate from physical). */
    postalAddress?: string;
    registrationNumber: string;
    vatNumber: string;
    /** SARS income tax number (separate from VAT). */
    taxNumber?: string;
    financialYearEnd: string;
    /** ISO start of measurement period. */
    measurementPeriodStart?: string;
    /** ISO end of measurement period. */
    measurementPeriodEnd?: string;
    industrySector: string;
    applicableScorecard: string;
    applicableCodes: string;
    /** Normalized sector code (RCOGP / ICT / FSC / AGRI / TRANSPORT …). */
    sectorCode?: string;
    /** Province used for EAP comparators. */
    eapProvince?: string;
    /** Total headcount (full-time-equivalent) used for sizing / EAP. */
    numberOfEmployees?: number;
    /** Primary contact person name. */
    contactPerson?: string;
    /** Primary contact email. */
    contactEmail?: string;
    /** Primary contact phone. */
    contactPhone?: string;
    certificateNumber: string;
    /** Existing B-BBEE certificate expiry (ISO). */
    certificateExpiry?: string;
    /** Existing B-BBEE level (1–8). */
    certificateLevel?: number;
    /** SANAS-accredited verification agency name. */
    verificationAgency?: string;
  };

  financials: {
    revenue: number;
    npat: number;
    payroll: number;
    leviableAmount: number;
    tmpsInclusions: number;
    tmpsExclusions: number;
    tmps: number;
    deemedNpat: number;
    deemedNpatUsed: boolean;
    industryNormUsed: number;
  };

  ownership: {
    blackOwnershipPercent: number;
    blackFemaleOwnershipPercent: number;
    votingRightsBlack: number;
    economicInterestBlack: number;
    calculatedPoints: number;
    subMinimumMet: boolean;
    shareholders: Array<{
      name: string;
      boPercent: number;
      bwoPercent: number;
      shares: number;
      shareValue: number;
      /** Voting rights percent (0–100). */
      votingRightsPercent?: number;
      /** Economic interest percent (0–100). */
      economicInterestPercent?: number;
      isDesignatedGroup?: boolean;
      designatedGroupType?: 'youth' | 'orphan' | 'disabled' | 'military';
      blackNewEntrant?: boolean;
      yearsHeld?: number;
    }>;
  };

  managementControl: {
    calculatedPoints: number;
    employeesCount: number;
    blackBoardPercent: number;
    blackExecPercent: number;
    disabledPercent: number;
    employees: Array<{
      name: string;
      gender: string;
      race: string;
      designation: string;
      disabled: boolean;
      idNumber?: string;
      isForeign?: boolean;
      province?: string;
      hireDate?: string;
    }>;
  };

  skillsDevelopment: {
    calculatedPoints: number;
    subMinimumMet: boolean;
    leviableAmount: number;
    totalSpendBlack: number;
    trainingProgramsCount: number;
    trainings: Array<{
      name: string;
      category: string;
      cost: number;
      isBlack: boolean;
      isEmployed: boolean;
      learnerName?: string;
      race?: string;
      gender?: string;
      isDisabled?: boolean;
      isYesEmployee?: boolean;
      isAbsorbed?: boolean;
      isAbet?: boolean;
      transactionDate?: string;
    }>;
  };

  preferentialProcurement: {
    calculatedPoints: number;
    subMinimumMet: boolean;
    tmps: number;
    recognizedSpend: number;
    suppliersCount: number;
    suppliers: Array<{
      supplierName: string;
      level: number;
      spend: number;
      blackOwnership: number;
      /** Black-women ownership percent (0–100). */
      blackWomenOwnership?: number;
      vatNumber?: string;
      enterpriseType?: 'generic' | 'qse' | 'eme';
      isEmpoweringSupplier?: boolean;
      isDesignatedGroupSupplier?: boolean;
    }>;
  };

  enterpriseSupplierDevelopment: {
    calculatedPoints: number;
    totalContributions: number;
    esdList: Array<{
      beneficiary: string;
      type: string;
      amount: number;
      category: string;
      description?: string;
      blackBenefitPercent?: number;
      transactionDate?: string;
      jobsCreated?: number;
    }>;
  };

  socioEconomicDevelopment: {
    calculatedPoints: number;
    totalSpend: number;
    sedList: Array<{
      beneficiary: string;
      type: string;
      amount: number;
      category: string;
      description?: string;
      blackBenefitPercent?: number;
      transactionDate?: string;
    }>;
  };

  yes: {
    qualified: boolean;
    youthCount: number;
    absorbedCount: number;
  };

  scorecard: {
    pillars: {
      ownership: number;
      managementControl: number;
      employmentEquity: number;
      skillsDevelopment: number;
      preferentialProcurement: number;
      enterpriseSupplierDevelopment: number;
      socioEconomicDevelopment: number;
      yesInitiative: number;
      totalPoints: number;
    };
    beeLevel: string;
    recognitionLevelPercent: number;
    blackOwnershipPercent: number;
    blackFemaleOwnershipPercent: number;
    valueAddingSupplier: string;
    edBeneficiary: string;
    edCategory: string;
    subMinimumsMet: boolean;
    discountedLevel: string;
    isDiscounted: boolean;
    yesTier: string | null;
  };

  rawData: {
    financeRaw: string[];
    ownershipRaw: string[];
    mcRaw: string[];
  };

  pdfCertificateData: {
    docNo: string;
    approvedBy: string;
    revisionNo: string;
    lastModified: string;
    verificationDate: string;
    analyst: string;
    signatory: string;
  };

  strategyPackSuggestions: string[];

  sheetsFound: string[];
  sheetsMatched: Array<{ sheetName: string; matchedTo: string; confidence: number }>;

  logs: PipelineLog[];

  /** True when the LLM reconciliation pass ran and improved the result. */
  reconciliationApplied: boolean;
  /** Human-readable notes describing what the reconciliation step corrected. */
  reconciliationNotes: string[];
}
