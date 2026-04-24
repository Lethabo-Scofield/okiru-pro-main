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
    registrationNumber: string;
    vatNumber: string;
    financialYearEnd: string;
    industrySector: string;
    applicableScorecard: string;
    applicableCodes: string;
    certificateNumber: string;
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
}
