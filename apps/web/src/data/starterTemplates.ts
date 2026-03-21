export interface StarterEntity {
  label: string;
  definition: string;
  synonyms: string[];
  positives: string[];
  negatives: string[];
  zones: string[];
  keywords: { must: string[]; nice: string[]; neg: string[] };
  pattern: string;
  // Scorecard pipeline linking
  pillarCode?: string;    // "ownership"|"managementControl"|"employmentEquity"|"skillsDevelopment"|"preferentialProcurement"|"enterpriseSupplierDevelopment"|"socioEconomicDevelopment"|"financials"
  formulaRole?: string;   // exact field in ParseResult/ScorecardInput (e.g. "leviableAmount", "votingRightsPct")
  fieldType?: string;     // "currency"|"percentage"|"count"|"string"|"date"|"bee_level"
  validationMin?: number;
  validationMax?: number;
}

export interface StarterTemplate {
  name: string;
  key: string;
  category: string;
  description: string;
  entities: StarterEntity[];
  // Sector toolkit fields
  sectorCode?: string;         // "RCOGP"|"ICT"|"FSC"|"AGRI"
  sectorType?: 'Generic' | 'QSE' | 'EME';
  maxPoints?: number;
  pillars?: string[];
}

export const starterTemplates: StarterTemplate[] = [
  {
    name: "B-BBEE Certificate",
    key: "bbee_certificate",
    category: "B-BBEE",
    description: "Extract verified B-BBEE status, level, and scorecard details from certificates.",
    entities: [
      {
        label: "BBBEELevel",
        definition: "The B-BBEE contributor level (1–8) or Non-Compliant status assigned to the measured entity.",
        synonyms: ["BEE Level", "Contributor Level", "B-BBEE Status Level", "BBBEE Rating"],
        positives: ["Level 1", "Level 4", "Level 8", "Non-Compliant"],
        negatives: ["Risk Level", "Service Level Agreement", "Employment Level"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["level", "contributor"], nice: ["B-BBEE", "status"], neg: ["risk", "service"] },
        pattern: "Level\\s*[1-8]|Non-Compliant"
      },
      {
        label: "BBBEEScore",
        definition: "The total B-BBEE scorecard points achieved out of the applicable maximum (e.g. 100 or 110 with bonus).",
        synonyms: ["Total Score", "Scorecard Points", "BEE Points", "Overall Score"],
        positives: ["92.45", "78.30 / 110", "65 points", "101.2"],
        negatives: ["Credit Score", "Risk Score", "Assessment Score"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["score", "points"], nice: ["total", "scorecard"], neg: ["credit", "risk"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?\\s*(points|/\\s*1[01]0)?"
      },
      {
        label: "BlackOwnership",
        definition: "The percentage of black ownership recognised in the B-BBEE certificate or scorecard.",
        synonyms: ["Black Shareholding", "Black Equity", "BO%", "Ownership by Black People"],
        positives: ["51%", "30.5%", "100%", "25.1% + 1 vote"],
        negatives: ["Foreign Ownership", "Government Ownership", "Management Shareholding"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["black", "ownership"], nice: ["equity", "shareholding"], neg: ["foreign", "government"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "CertificateNumber",
        definition: "The unique reference number assigned to the B-BBEE certificate by the verification agency.",
        synonyms: ["Certificate Ref", "Cert No", "Verification Number", "Certificate ID"],
        positives: ["CERT-2024-00451", "VER/2023/1098", "SAB-BV-2024-3312", "BVC-00234"],
        negatives: ["Company Reg No", "Tax Reference", "Invoice Number"],
        zones: ["PDF Header", "Footer"],
        keywords: { must: ["certificate", "number"], nice: ["reference", "verification"], neg: ["invoice", "tax"] },
        pattern: "[A-Z]{2,4}[-/]\\d{4}[-/]\\d{3,5}"
      },
      {
        label: "VerificationAgency",
        definition: "The SANAS-accredited verification agency that issued the B-BBEE certificate.",
        synonyms: ["BEE Verification Body", "Verification Agency Name", "Accredited Agency", "BV Agency"],
        positives: ["Empowerdex", "AQRate", "BEE-Connex", "Moore Verification Services"],
        negatives: ["Auditor Name", "Law Firm", "Insurance Company"],
        zones: ["PDF Header", "Footer", "Signature Block"],
        keywords: { must: ["verification", "agency"], nice: ["SANAS", "accredited"], neg: ["auditor", "law firm"] },
        pattern: ""
      },
      {
        label: "CertificateExpiryDate",
        definition: "The date on which the B-BBEE certificate expires and re-verification is required.",
        synonyms: ["Expiry Date", "Valid Until", "Certificate End Date", "Validity Period End"],
        positives: ["2025-03-31", "31 March 2025", "2024/12/31", "30 June 2026"],
        negatives: ["Issue Date", "Measurement Date", "Financial Year End"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["expiry", "valid"], nice: ["until", "end"], neg: ["issue", "start"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}"
      },
      {
        label: "MeasuredEntityName",
        definition: "The legal name of the company or organisation that was measured for B-BBEE compliance.",
        synonyms: ["Company Name", "Entity Name", "Measured Company", "Organisation Name"],
        positives: ["Moyo Retail (Pty) Ltd", "Karoo Telecom Holdings", "Blue Crane Logistics CC"],
        negatives: ["Verification Agency Name", "Shareholder Name", "Director Name"],
        zones: ["PDF Header", "Email Body"],
        keywords: { must: ["entity", "company"], nice: ["measured", "name"], neg: ["agency", "verifier"] },
        pattern: ""
      },
      {
        label: "MeasurementPeriod",
        definition: "The financial year or period over which the B-BBEE measurement was conducted.",
        synonyms: ["Financial Year", "Assessment Period", "Measurement Year", "Reporting Period"],
        positives: ["FY2024", "1 Mar 2023 – 28 Feb 2024", "2023/2024", "Year ended 31 Dec 2023"],
        negatives: ["Certificate Validity Period", "Contract Period", "Warranty Period"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["period", "year"], nice: ["measurement", "financial"], neg: ["contract", "warranty"] },
        pattern: "(FY|fy)?\\d{4}(/\\d{2,4})?"
      }
    ]
  },
  {
    name: "Ownership Verification",
    key: "ownership_verification",
    category: "B-BBEE",
    description: "Extract shareholder demographics, voting rights, and economic interest for B-BBEE ownership scoring.",
    entities: [
      {
        label: "ShareholderName",
        definition: "The full legal name of each shareholder or equity holder in the measured entity.",
        synonyms: ["Equity Holder", "Owner Name", "Member Name", "Partner Name"],
        positives: ["John K. Mabena", "Thandi Holdings (Pty) Ltd", "Amahle Dlamini Family Trust"],
        negatives: ["Director Name", "Employee Name", "Beneficiary Name"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["shareholder", "name"], nice: ["equity", "owner"], neg: ["employee", "beneficiary"] },
        pattern: ""
      },
      {
        label: "ShareholdingPercentage",
        definition: "The percentage of total issued shares held by each shareholder.",
        synonyms: ["Equity %", "Ownership Stake", "Shares Held %", "Holding Percentage"],
        positives: ["51%", "25.1%", "10.5%", "100%"],
        negatives: ["Voting Rights %", "Dividend %", "Attendance %"],
        zones: ["Tables"],
        keywords: { must: ["shareholding", "percentage"], nice: ["equity", "stake"], neg: ["voting", "dividend"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "VotingRightsPercentage",
        definition: "The percentage of exercisable voting rights held by black shareholders.",
        synonyms: ["Voting %", "Vote Rights", "Exercisable Voting Rights", "Voting Power"],
        positives: ["51%", "25.1% + 1 vote", "30%", "100%"],
        negatives: ["Shareholding %", "Board Attendance %", "Quorum %"],
        zones: ["Tables"],
        keywords: { must: ["voting", "rights"], nice: ["exercisable", "power"], neg: ["attendance", "quorum"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "EconomicInterestPercentage",
        definition: "The percentage of economic interest (right to dividends/capital gains) held by black shareholders.",
        synonyms: ["EI %", "Economic Participation", "Profit Sharing %", "Dividend Rights"],
        positives: ["51%", "30%", "25.1%", "40.5%"],
        negatives: ["Voting Rights %", "Management %", "Loan Interest Rate"],
        zones: ["Tables"],
        keywords: { must: ["economic", "interest"], nice: ["participation", "dividend"], neg: ["loan", "rate"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "RaceClassification",
        definition: "The racial classification of the shareholder as per B-BBEE definitions (African, Coloured, Indian, White).",
        synonyms: ["Race", "Demographic Classification", "Population Group", "Race Category"],
        positives: ["African", "Coloured", "Indian", "White"],
        negatives: ["Nationality", "Gender", "Disability Status"],
        zones: ["Tables"],
        keywords: { must: ["race", "classification"], nice: ["demographic", "population"], neg: ["nationality", "gender"] },
        pattern: "(African|Coloured|Indian|White)"
      },
      {
        label: "GenderClassification",
        definition: "The gender of the shareholder for B-BBEE scoring of black female ownership.",
        synonyms: ["Gender", "Sex", "Male/Female", "Gender Category"],
        positives: ["Female", "Male", "F", "M"],
        negatives: ["Race", "Age", "Disability"],
        zones: ["Tables"],
        keywords: { must: ["gender"], nice: ["female", "male"], neg: ["race", "age"] },
        pattern: "(Female|Male|F|M)"
      },
      {
        label: "NewEntrant",
        definition: "Whether the black shareholder qualifies as a new entrant (no prior significant business ownership).",
        synonyms: ["New Entrant Status", "First-Time Owner", "New Entrant Black Person", "Designated Group New"],
        positives: ["Yes", "No", "New Entrant", "Not a New Entrant"],
        negatives: ["New Employee", "New Director", "New Company"],
        zones: ["Tables"],
        keywords: { must: ["new", "entrant"], nice: ["first-time", "designated"], neg: ["employee", "company"] },
        pattern: "(Yes|No|New Entrant|Not a New Entrant)"
      },
      {
        label: "OwnershipFulfilmentDate",
        definition: "The date on which the ownership transaction was fulfilled or completed (relevant to flow-through).",
        synonyms: ["Fulfilment Date", "Transaction Date", "Completion Date", "Ownership Start Date"],
        positives: ["2020-01-15", "15 January 2020", "01/03/2019"],
        negatives: ["Certificate Date", "Expiry Date", "Incorporation Date"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["fulfilment", "date"], nice: ["transaction", "completion"], neg: ["expiry", "certificate"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      }
    ]
  },
  {
    name: "Management Control",
    key: "management_control",
    category: "B-BBEE",
    description: "Extract board composition and senior/executive management demographics for B-BBEE management scoring.",
    entities: [
      {
        label: "BoardMemberName",
        definition: "The full name of each board member or director of the measured entity.",
        synonyms: ["Director Name", "Board Director", "Non-Executive Director", "Executive Director"],
        positives: ["Mr. Sipho Nkosi", "Dr. Fatima Khan", "Ms. Lerato Molefe"],
        negatives: ["Shareholder Name", "Employee Name", "Auditor Name"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["board", "director"], nice: ["member", "executive"], neg: ["shareholder", "employee"] },
        pattern: ""
      },
      {
        label: "BoardMemberRace",
        definition: "The racial classification of each board member for B-BBEE management control scoring.",
        synonyms: ["Director Race", "Board Demographics", "Director Demographic", "Race of Director"],
        positives: ["African", "Coloured", "Indian", "White"],
        negatives: ["Nationality", "Citizenship", "Country of Origin"],
        zones: ["Tables"],
        keywords: { must: ["race", "board"], nice: ["demographic", "director"], neg: ["nationality", "citizenship"] },
        pattern: "(African|Coloured|Indian|White)"
      },
      {
        label: "BoardMemberGender",
        definition: "The gender of each board member for tracking black female representation at board level.",
        synonyms: ["Director Gender", "Board Gender", "Gender of Director"],
        positives: ["Female", "Male", "F", "M"],
        negatives: ["Race", "Age Group", "Disability Status"],
        zones: ["Tables"],
        keywords: { must: ["gender", "director"], nice: ["female", "board"], neg: ["race", "age"] },
        pattern: "(Female|Male|F|M)"
      },
      {
        label: "BoardMemberRole",
        definition: "Whether the board member is Executive, Non-Executive, or Independent Non-Executive.",
        synonyms: ["Director Type", "Board Role", "Director Category", "Executive Status"],
        positives: ["Executive Director", "Non-Executive Director", "Independent Non-Executive", "Chairperson"],
        negatives: ["Manager Title", "Employee Role", "Department Head"],
        zones: ["Tables"],
        keywords: { must: ["executive", "director"], nice: ["independent", "chairperson"], neg: ["manager", "employee"] },
        pattern: ""
      },
      {
        label: "TotalBoardMembers",
        definition: "The total number of board members/directors at the measured entity.",
        synonyms: ["Board Size", "Number of Directors", "Total Directors", "Board Composition Total"],
        positives: ["8", "12", "5", "10 directors"],
        negatives: ["Total Employees", "Total Shareholders", "Total Managers"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["total", "board"], nice: ["directors", "members"], neg: ["employees", "shareholders"] },
        pattern: "\\d{1,3}\\s*(directors|members)?"
      },
      {
        label: "SeniorManagementName",
        definition: "The full name of each senior or executive manager in the measured entity.",
        synonyms: ["Executive Name", "Senior Manager", "C-Suite Executive", "Top Management"],
        positives: ["CEO Thabo Mokoena", "CFO Sarah van Wyk", "COO Priya Naidoo"],
        negatives: ["Board Director", "Shareholder", "Junior Manager"],
        zones: ["Tables"],
        keywords: { must: ["senior", "management"], nice: ["executive", "manager"], neg: ["junior", "intern"] },
        pattern: ""
      },
      {
        label: "SeniorManagementRace",
        definition: "The racial classification of each senior manager for B-BBEE management control scoring.",
        synonyms: ["Executive Race", "Management Demographics", "Senior Manager Race"],
        positives: ["African", "Coloured", "Indian", "White"],
        negatives: ["Nationality", "Language", "Ethnicity (non-SA)"],
        zones: ["Tables"],
        keywords: { must: ["race", "management"], nice: ["senior", "executive"], neg: ["nationality", "language"] },
        pattern: "(African|Coloured|Indian|White)"
      },
      {
        label: "SeniorManagementGender",
        definition: "The gender of each senior manager for tracking black female representation at top management.",
        synonyms: ["Executive Gender", "Management Gender", "Senior Manager Gender"],
        positives: ["Female", "Male", "F", "M"],
        negatives: ["Race", "Age", "Disability"],
        zones: ["Tables"],
        keywords: { must: ["gender", "management"], nice: ["female", "senior"], neg: ["race", "age"] },
        pattern: "(Female|Male|F|M)"
      }
    ]
  },
  {
    name: "Skills Development",
    key: "skills_development",
    category: "B-BBEE",
    description: "Extract training spend, learnership details, and beneficiary demographics for skills development scoring.",
    entities: [
      {
        label: "TotalTrainingSpend",
        definition: "The total annual expenditure on skills development and training programmes.",
        synonyms: ["Training Expenditure", "Skills Spend", "Learning & Development Budget", "Training Cost"],
        positives: ["R2,450,000", "R500,000", "R12.5M", "R3 200 000.00"],
        negatives: ["Salary Cost", "Recruitment Cost", "Total Revenue"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["training", "spend"], nice: ["expenditure", "skills"], neg: ["salary", "recruitment"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "BlackTrainingSpend",
        definition: "The portion of training spend allocated to black employees (African, Coloured, Indian).",
        synonyms: ["Black Skills Spend", "Designated Group Training Spend", "Black Employee Training Cost"],
        positives: ["R1,800,000", "R350,000", "R8.2M"],
        negatives: ["White Training Spend", "Total Spend", "Non-SA Training Spend"],
        zones: ["Tables"],
        keywords: { must: ["black", "training"], nice: ["designated", "spend"], neg: ["white", "total"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "LearnershipCount",
        definition: "The total number of learners enrolled in registered learnership or internship programmes.",
        synonyms: ["Number of Learners", "Learnerships", "Internship Count", "Apprenticeships"],
        positives: ["15", "42 learners", "8 interns", "25 apprentices"],
        negatives: ["Employee Count", "Contractor Count", "Board Members"],
        zones: ["Tables"],
        keywords: { must: ["learnership", "count"], nice: ["intern", "apprentice"], neg: ["employee", "contractor"] },
        pattern: "\\d{1,4}\\s*(learners|interns|apprentices)?"
      },
      {
        label: "BlackLearnershipCount",
        definition: "The number of black beneficiaries in learnership, internship, or apprenticeship programmes.",
        synonyms: ["Black Learners", "Designated Group Learners", "Black Interns"],
        positives: ["12", "35 black learners", "6 black interns"],
        negatives: ["Total Learners", "White Learners", "Overseas Interns"],
        zones: ["Tables"],
        keywords: { must: ["black", "learner"], nice: ["designated", "intern"], neg: ["white", "overseas"] },
        pattern: "\\d{1,4}"
      },
      {
        label: "DisabledLearnerCount",
        definition: "The number of black disabled learners in skills development programmes.",
        synonyms: ["Disabled Trainees", "Black Disabled Learners", "PWD Learners"],
        positives: ["3", "5 disabled learners", "2 PWD"],
        negatives: ["Able-Bodied Learners", "Total Learners", "Disabled Employees"],
        zones: ["Tables"],
        keywords: { must: ["disabled", "learner"], nice: ["PWD", "impaired"], neg: ["able-bodied", "employee"] },
        pattern: "\\d{1,3}"
      },
      {
        label: "TrainingProgrammeName",
        definition: "The name or title of each training programme, learnership, or skills intervention.",
        synonyms: ["Programme Title", "Course Name", "Learnership Name", "Skills Programme"],
        positives: ["National Certificate: Retail Operations NQF4", "Project Management Learnership", "SETA Accredited Bookkeeping"],
        negatives: ["Company Name", "Department Name", "Policy Title"],
        zones: ["Tables", "Email Body"],
        keywords: { must: ["programme", "training"], nice: ["course", "learnership"], neg: ["company", "department"] },
        pattern: ""
      },
      {
        label: "AnnualPayroll",
        definition: "The total annual employee payroll (leviable amount) used as the denominator for skills development spend ratio.",
        synonyms: ["Leviable Amount", "Total Payroll", "Salary Bill", "Annual Wage Bill"],
        positives: ["R45,000,000", "R12.5M", "R120 000 000"],
        negatives: ["Training Spend", "Revenue", "Profit"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["payroll", "annual"], nice: ["leviable", "salary"], neg: ["revenue", "profit"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "AbsorbedLearnerCount",
        definition: "The number of learners or interns absorbed into permanent employment after completing their programme.",
        synonyms: ["Absorbed Interns", "Retained Learners", "Permanent Hires from Learnerships"],
        positives: ["8", "3 absorbed", "12 retained"],
        negatives: ["Total Learners", "Resigned Learners", "Dropped Learners"],
        zones: ["Tables"],
        keywords: { must: ["absorbed", "learner"], nice: ["retained", "permanent"], neg: ["resigned", "dropped"] },
        pattern: "\\d{1,4}"
      }
    ]
  },
  {
    name: "Enterprise & Supplier Development",
    key: "esd",
    category: "B-BBEE",
    description: "Extract ESD contributions, beneficiary details, and supplier development spend for B-BBEE scoring.",
    entities: [
      {
        label: "ESDTotalContribution",
        definition: "The total annual value of all Enterprise and Supplier Development contributions.",
        synonyms: ["ESD Spend", "Total ESD", "Enterprise Development Contribution", "Supplier Development Contribution"],
        positives: ["R5,000,000", "R1.2M", "R800,000", "R15 000 000"],
        negatives: ["SED Spend", "Training Spend", "Total Revenue"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["ESD", "contribution"], nice: ["enterprise", "supplier"], neg: ["SED", "training"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "EDBeneficiaryName",
        definition: "The name of each Enterprise Development (ED) beneficiary — typically a black-owned EME or QSE.",
        synonyms: ["ED Recipient", "Enterprise Beneficiary", "ED Company", "Supported Enterprise"],
        positives: ["Sizwe Catering CC", "Bongi's Cleaning Services", "Mthembu IT Solutions"],
        negatives: ["Supplier Name", "Customer Name", "Shareholder Name"],
        zones: ["Tables", "Email Body"],
        keywords: { must: ["beneficiary", "enterprise"], nice: ["ED", "EME"], neg: ["customer", "shareholder"] },
        pattern: ""
      },
      {
        label: "ContributionType",
        definition: "The type/form of the ESD contribution (grant, loan, guarantee, mentorship, etc.).",
        synonyms: ["ESD Type", "Contribution Category", "Support Type", "Development Type"],
        positives: ["Interest-Free Loan", "Grant", "Guarantee", "Mentorship Programme", "Discounted Rent"],
        negatives: ["Payment Type", "Invoice Type", "Contract Type"],
        zones: ["Tables"],
        keywords: { must: ["contribution", "type"], nice: ["grant", "loan"], neg: ["payment", "invoice"] },
        pattern: ""
      },
      {
        label: "ContributionAmount",
        definition: "The rand value of each individual ESD contribution to a specific beneficiary.",
        synonyms: ["ESD Amount", "Contribution Value", "Development Spend", "Support Amount"],
        positives: ["R500,000", "R1,200,000", "R75,000", "R2.5M"],
        negatives: ["Invoice Amount", "Salary Amount", "Revenue Amount"],
        zones: ["Tables"],
        keywords: { must: ["amount", "contribution"], nice: ["value", "spend"], neg: ["invoice", "salary"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "BenefitFactor",
        definition: "The applicable benefit factor (weighting multiplier) for the type of ESD contribution as per the Codes.",
        synonyms: ["Weighting Factor", "BF", "Contribution Multiplier", "Recognition Factor"],
        positives: ["1.0", "0.9", "0.8", "1.2", "0.6"],
        negatives: ["Interest Rate", "Tax Rate", "Discount Factor"],
        zones: ["Tables"],
        keywords: { must: ["benefit", "factor"], nice: ["weighting", "multiplier"], neg: ["interest", "tax"] },
        pattern: "[01]\\.\\d{1,2}"
      },
      {
        label: "BeneficiaryBBBEELevel",
        definition: "The B-BBEE level of each ESD beneficiary (EME/QSE typically Level 1–4).",
        synonyms: ["Beneficiary BEE Level", "ED Recipient Level", "Supplier BEE Status"],
        positives: ["Level 1", "Level 2", "EME (Level 1)", "QSE Level 2"],
        negatives: ["Measured Entity Level", "Own B-BBEE Level", "Target Level"],
        zones: ["Tables"],
        keywords: { must: ["level", "beneficiary"], nice: ["EME", "QSE"], neg: ["own", "target"] },
        pattern: "(Level\\s*[1-8]|EME|QSE)"
      },
      {
        label: "BlackOwnershipOfBeneficiary",
        definition: "The percentage of black ownership in the ESD beneficiary entity.",
        synonyms: ["Beneficiary Black Ownership", "BO% of ED Entity", "Black Shareholding of Beneficiary"],
        positives: ["100%", "51%", "75%", "30%"],
        negatives: ["Own Black Ownership", "Target Ownership", "Foreign Ownership"],
        zones: ["Tables"],
        keywords: { must: ["black", "ownership", "beneficiary"], nice: ["shareholding"], neg: ["own", "target"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "NPATOfMeasuredEntity",
        definition: "The Net Profit After Tax of the measured entity, used as the denominator for ESD contribution targets.",
        synonyms: ["NPAT", "Net Profit", "After-Tax Profit", "PAT"],
        positives: ["R25,000,000", "R120M", "R8.5M", "R42 000 000"],
        negatives: ["Revenue", "Gross Profit", "EBITDA"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["NPAT", "profit"], nice: ["net", "after tax"], neg: ["revenue", "gross"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      }
    ]
  },
  {
    name: "Socio-Economic Development",
    key: "sed",
    category: "B-BBEE",
    description: "Extract SED/CSI contributions, beneficiary demographics, and community development spend.",
    entities: [
      {
        label: "SEDTotalContribution",
        definition: "The total annual expenditure on Socio-Economic Development (SED) or Corporate Social Investment (CSI).",
        synonyms: ["SED Spend", "CSI Contribution", "Total SED", "Social Spend"],
        positives: ["R3,500,000", "R800,000", "R1.2M", "R5 000 000"],
        negatives: ["ESD Spend", "Training Spend", "Marketing Spend"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["SED", "contribution"], nice: ["CSI", "social"], neg: ["ESD", "marketing"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "SEDBeneficiaryName",
        definition: "The name of each SED/CSI beneficiary organisation (NPO, community project, school, etc.).",
        synonyms: ["CSI Beneficiary", "SED Recipient", "Community Beneficiary", "NPO Name"],
        positives: ["Mandela Education Trust", "Soweto Youth Skills Centre", "KZN Rural Health Foundation"],
        negatives: ["Supplier Name", "Customer Name", "ESD Beneficiary"],
        zones: ["Tables", "Email Body"],
        keywords: { must: ["beneficiary", "SED"], nice: ["NPO", "community"], neg: ["supplier", "customer"] },
        pattern: ""
      },
      {
        label: "SEDBeneficiaryType",
        definition: "The type of SED beneficiary (education, health, community development, youth, etc.).",
        synonyms: ["SED Category", "CSI Focus Area", "Development Category", "Impact Area"],
        positives: ["Education", "Health", "Youth Development", "Community Infrastructure", "Food Security"],
        negatives: ["Industry Type", "Company Type", "Supplier Category"],
        zones: ["Tables"],
        keywords: { must: ["type", "beneficiary"], nice: ["education", "health"], neg: ["industry", "supplier"] },
        pattern: ""
      },
      {
        label: "SEDContributionAmount",
        definition: "The rand value of each individual SED/CSI contribution to a specific beneficiary.",
        synonyms: ["CSI Amount", "SED Spend per Beneficiary", "Donation Amount", "Social Contribution"],
        positives: ["R250,000", "R500,000", "R1,000,000", "R50,000"],
        negatives: ["Invoice Amount", "Training Cost", "ESD Contribution"],
        zones: ["Tables"],
        keywords: { must: ["amount", "SED"], nice: ["contribution", "donation"], neg: ["invoice", "ESD"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "BlackBeneficiaryPercentage",
        definition: "The percentage of SED beneficiaries who are black (African, Coloured, Indian).",
        synonyms: ["% Black Beneficiaries", "Designated Group %", "Black Recipient %"],
        positives: ["75%", "90%", "100%", "85%"],
        negatives: ["Black Ownership %", "Black Employee %", "Black Management %"],
        zones: ["Tables"],
        keywords: { must: ["black", "beneficiary"], nice: ["designated", "percentage"], neg: ["ownership", "employee"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "NPATForSED",
        definition: "The Net Profit After Tax used as the denominator for calculating the SED contribution target (1% of NPAT).",
        synonyms: ["NPAT", "Net Profit After Tax", "SED Target Denominator"],
        positives: ["R25,000,000", "R120M", "R8.5M"],
        negatives: ["Revenue", "Turnover", "Gross Profit"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["NPAT"], nice: ["net", "profit"], neg: ["revenue", "turnover"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      }
    ]
  },
  {
    name: "Preferential Procurement",
    key: "preferential_procurement",
    category: "B-BBEE",
    description: "Extract supplier B-BBEE levels, spend data, and procurement recognition levels for scoring.",
    entities: [
      {
        label: "SupplierName",
        definition: "The legal name of each supplier included in the preferential procurement calculation.",
        synonyms: ["Vendor Name", "Service Provider", "Contractor Name", "Procurement Partner"],
        positives: ["ABC Building Materials (Pty) Ltd", "Nkosi Transport CC", "Digital Solutions SA"],
        negatives: ["Customer Name", "Shareholder Name", "Employee Name"],
        zones: ["Tables", "Email Body"],
        keywords: { must: ["supplier", "name"], nice: ["vendor", "provider"], neg: ["customer", "employee"] },
        pattern: ""
      },
      {
        label: "SupplierBBBEELevel",
        definition: "The B-BBEE contributor level of each supplier (Level 1–8, Non-Compliant, or EME/QSE).",
        synonyms: ["Supplier BEE Level", "Vendor BEE Status", "Procurement BEE Level"],
        positives: ["Level 1", "Level 3", "EME", "QSE Level 2", "Non-Compliant"],
        negatives: ["Own B-BBEE Level", "Target Level", "Risk Level"],
        zones: ["Tables"],
        keywords: { must: ["level", "supplier"], nice: ["BEE", "contributor"], neg: ["own", "target"] },
        pattern: "(Level\\s*[1-8]|EME|QSE|Non-Compliant)"
      },
      {
        label: "ProcurementRecognitionLevel",
        definition: "The B-BBEE procurement recognition level percentage for the supplier's contributor level.",
        synonyms: ["Recognition %", "BEE Procurement %", "Recognition Level", "Procurement Weighting"],
        positives: ["135%", "125%", "110%", "100%", "80%", "10%"],
        negatives: ["Discount %", "VAT %", "Markup %"],
        zones: ["Tables"],
        keywords: { must: ["recognition", "level"], nice: ["procurement", "weighting"], neg: ["discount", "VAT"] },
        pattern: "\\d{1,3}%"
      },
      {
        label: "TotalProcurementSpend",
        definition: "The total measured procurement spend (TMPS) for the measurement period.",
        synonyms: ["TMPS", "Total Procurement", "Total Supplier Spend", "Procurement Budget"],
        positives: ["R120,000,000", "R45M", "R250 000 000"],
        negatives: ["Revenue", "Payroll", "Training Spend"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["total", "procurement"], nice: ["TMPS", "spend"], neg: ["revenue", "payroll"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "SupplierSpendAmount",
        definition: "The total spend with each individual supplier during the measurement period.",
        synonyms: ["Spend per Supplier", "Procurement Amount", "Vendor Spend", "Purchase Value"],
        positives: ["R5,000,000", "R1.2M", "R800,000", "R15 000 000"],
        negatives: ["Budget Amount", "Quote Amount", "Target Spend"],
        zones: ["Tables"],
        keywords: { must: ["spend", "supplier"], nice: ["procurement", "amount"], neg: ["budget", "quote"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "SupplierBlackOwnership",
        definition: "The percentage of black ownership in each supplier entity.",
        synonyms: ["Supplier BO%", "Vendor Black Ownership", "Black-Owned Supplier %"],
        positives: ["51%", "100%", "30%", "25.1%"],
        negatives: ["Own Ownership %", "Foreign Ownership", "Government Ownership"],
        zones: ["Tables"],
        keywords: { must: ["black", "ownership", "supplier"], nice: ["vendor"], neg: ["own", "foreign"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "SupplierBlackWomenOwnership",
        definition: "The percentage of black women ownership in each supplier entity.",
        synonyms: ["BWO%", "Black Women Owned %", "Female Black Ownership"],
        positives: ["30%", "51%", "100%", "25.1%"],
        negatives: ["Black Ownership %", "Female Employee %", "Gender Ratio"],
        zones: ["Tables"],
        keywords: { must: ["black", "women", "ownership"], nice: ["female"], neg: ["employee", "ratio"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "DesignatedGroupSupplier",
        definition: "Whether the supplier qualifies as a Designated Group Supplier (>51% black owned).",
        synonyms: ["DGS", "Majority Black-Owned", "51% Black Supplier"],
        positives: ["Yes", "No", "Designated Group", "Not Designated"],
        negatives: ["EME Status", "QSE Status", "Exempted"],
        zones: ["Tables"],
        keywords: { must: ["designated", "group"], nice: ["supplier", "51%"], neg: ["EME", "exempted"] },
        pattern: "(Yes|No|Designated|Not Designated)"
      }
    ]
  },
  {
    name: "BEE Affidavit / EME Declaration",
    key: "bee_affidavit",
    category: "B-BBEE",
    description: "Capture sworn affidavit details, turnover declarations, and B-BBEE level for EMEs and QSEs.",
    entities: [
      {
        label: "AffidavitDate",
        definition: "The date on which the B-BBEE sworn affidavit was signed and commissioned.",
        synonyms: ["Date of Affidavit", "Sworn Date", "Declaration Date", "Signed Date"],
        positives: ["2024-03-15", "15 March 2024", "2024/03/15"],
        negatives: ["Expiry Date", "Registration Date", "Financial Year End"],
        zones: ["PDF Header", "Signature Block"],
        keywords: { must: ["date", "affidavit"], nice: ["sworn", "signed"], neg: ["expiry", "registration"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}"
      },
      {
        label: "AnnualTurnover",
        definition: "The total annual turnover/revenue declared in the affidavit for EME/QSE classification.",
        synonyms: ["Revenue", "Annual Revenue", "Turnover", "Total Sales"],
        positives: ["R8,500,000", "R5M", "R2,000,000", "R49 000 000"],
        negatives: ["Net Profit", "Gross Profit", "Assets Value"],
        zones: ["Tables", "Email Body"],
        keywords: { must: ["turnover", "annual"], nice: ["revenue", "sales"], neg: ["profit", "assets"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "EntityClassification",
        definition: "Whether the entity is classified as an EME (≤R10M), QSE (R10M–R50M), or Generic (>R50M).",
        synonyms: ["EME/QSE/Generic", "Enterprise Classification", "Entity Type", "B-BBEE Category"],
        positives: ["EME", "QSE", "Generic Enterprise", "Exempted Micro-Enterprise"],
        negatives: ["Industry Classification", "Tax Category", "Company Type"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["EME", "QSE"], nice: ["generic", "classification"], neg: ["industry", "tax"] },
        pattern: "(EME|QSE|Generic|Exempted Micro-Enterprise|Qualifying Small Enterprise)"
      },
      {
        label: "DeclaredBBBEELevel",
        definition: "The B-BBEE contributor level declared in the sworn affidavit (Level 1–4 for EMEs/QSEs).",
        synonyms: ["Affidavit BEE Level", "Declared Level", "Sworn BEE Level"],
        positives: ["Level 1", "Level 2", "Level 4"],
        negatives: ["Verified Level", "Target Level", "Previous Level"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["level", "declared"], nice: ["contributor", "affidavit"], neg: ["verified", "target"] },
        pattern: "Level\\s*[1-4]"
      },
      {
        label: "BlackOwnershipDeclared",
        definition: "The percentage of black ownership declared in the affidavit (affects level for EMEs).",
        synonyms: ["Declared BO%", "Affidavit Black Ownership", "Black Shareholding Declared"],
        positives: ["51%", "100%", "30%", "0%"],
        negatives: ["Verified Ownership", "Target Ownership", "Previous Ownership"],
        zones: ["Tables"],
        keywords: { must: ["black", "ownership"], nice: ["declared", "affidavit"], neg: ["verified", "target"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?%"
      },
      {
        label: "CompanyRegistrationNo",
        definition: "The CIPC company registration number of the entity making the affidavit declaration.",
        synonyms: ["Reg No", "CIPC Number", "Company Number", "Registration Number"],
        positives: ["2015/123456/07", "K2018/654321", "2020/001234/23"],
        negatives: ["VAT Number", "Tax Reference", "ID Number"],
        zones: ["PDF Header", "Email Body"],
        keywords: { must: ["registration", "number"], nice: ["CIPC", "company"], neg: ["VAT", "tax"] },
        pattern: "(K?\\d{4}/\\d{5,6}/\\d{2})"
      },
      {
        label: "DeponentName",
        definition: "The full name of the person who signed and swore the B-BBEE affidavit.",
        synonyms: ["Deponent", "Signatory", "Declarant", "Sworn By"],
        positives: ["Mr. Sipho Nkosi", "Ms. Fatima Patel", "John van der Merwe"],
        negatives: ["Commissioner Name", "Witness Name", "Director Name"],
        zones: ["Signature Block", "PDF Header"],
        keywords: { must: ["deponent", "name"], nice: ["signatory", "declarant"], neg: ["commissioner", "witness"] },
        pattern: ""
      },
      {
        label: "CommissionerStamp",
        definition: "The name, stamp number, or details of the Commissioner of Oaths who witnessed the affidavit.",
        synonyms: ["Commissioner of Oaths", "Stamp Number", "Commissioner Name", "CoO Details"],
        positives: ["Comm. of Oaths: A. Botha, Stamp #12345", "Commissioner: Adv. S. Maharaj"],
        negatives: ["Deponent Details", "Company Stamp", "Notary Public"],
        zones: ["Signature Block", "Footer"],
        keywords: { must: ["commissioner", "oaths"], nice: ["stamp", "witnessed"], neg: ["deponent", "notary"] },
        pattern: ""
      }
    ]
  },
  {
    name: "Tax Clearance (TCS/PIN)",
    key: "tax_clearance",
    category: "Compliance",
    description: "Extract tax compliance status, PIN numbers, and validity from SARS tax clearance certificates.",
    entities: [
      {
        label: "TaxCompliancePin",
        definition: "The unique Tax Compliance Status PIN issued by SARS for verification purposes.",
        synonyms: ["TCS PIN", "Tax PIN", "SARS PIN", "Compliance PIN", "Tax Clearance Number"],
        positives: ["1234567890", "TCS-2024-00001234", "PIN: 9876543210"],
        negatives: ["VAT Number", "Company Reg No", "Income Tax Reference"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["PIN", "tax"], nice: ["compliance", "clearance"], neg: ["VAT", "income"] },
        pattern: "\\d{10}|TCS-\\d{4}-\\d{8}"
      },
      {
        label: "TaxComplianceStatus",
        definition: "Whether the entity's tax affairs are in good standing (Compliant/Non-Compliant).",
        synonyms: ["Tax Status", "Compliance Status", "Good Standing", "SARS Status"],
        positives: ["Compliant", "Tax Compliant", "Good Standing", "Non-Compliant"],
        negatives: ["B-BBEE Status", "Payment Status", "Account Status"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["status", "compliant"], nice: ["good standing", "SARS"], neg: ["BEE", "payment"] },
        pattern: "(Compliant|Non-Compliant|Good Standing)"
      },
      {
        label: "TCSIssueDate",
        definition: "The date on which the Tax Clearance Certificate or PIN was issued by SARS.",
        synonyms: ["Issue Date", "Date Issued", "Certificate Date", "Generated Date"],
        positives: ["2024-01-15", "15 January 2024", "2024/01/15"],
        negatives: ["Expiry Date", "Submission Date", "Assessment Date"],
        zones: ["PDF Header"],
        keywords: { must: ["issue", "date"], nice: ["generated", "certificate"], neg: ["expiry", "submission"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      },
      {
        label: "TCSExpiryDate",
        definition: "The date on which the Tax Clearance Certificate or PIN expires and must be renewed.",
        synonyms: ["Expiry Date", "Valid Until", "Expiration Date", "End Date"],
        positives: ["2025-01-14", "14 January 2025", "2025/01/14"],
        negatives: ["Issue Date", "Filing Date", "Assessment Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["expiry", "date"], nice: ["valid until", "end"], neg: ["issue", "filing"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      },
      {
        label: "TaxpayerName",
        definition: "The registered name of the taxpayer on the tax clearance certificate.",
        synonyms: ["Entity Name", "Company Name", "Taxpayer", "Registered Name"],
        positives: ["Moyo Retail (Pty) Ltd", "Karoo Telecom Holdings", "Blue Crane Logistics CC"],
        negatives: ["SARS Office", "Tax Practitioner", "Auditor Name"],
        zones: ["PDF Header"],
        keywords: { must: ["taxpayer", "name"], nice: ["entity", "registered"], neg: ["SARS", "practitioner"] },
        pattern: ""
      },
      {
        label: "TaxReferenceNumber",
        definition: "The income tax reference number of the entity on the SARS certificate.",
        synonyms: ["Tax Ref", "Income Tax Number", "SARS Reference", "IT Number"],
        positives: ["9012345678", "IT-9012345678", "Ref: 1234567890"],
        negatives: ["VAT Number", "Company Reg No", "PIN Number"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["tax", "reference"], nice: ["income", "number"], neg: ["VAT", "company reg"] },
        pattern: "\\d{10}"
      }
    ]
  },
  {
    name: "Company Registration (CIPC)",
    key: "cipc_registration",
    category: "Corporate",
    description: "Extract company registration details, directors, and incorporation data from CIPC documents.",
    entities: [
      {
        label: "CompanyRegistrationNumber",
        definition: "The unique registration number assigned by CIPC upon company incorporation.",
        synonyms: ["Reg No", "CIPC Number", "Company Number", "CK Number"],
        positives: ["2015/123456/07", "K2018/654321", "2020/001234/23", "CK1999/012345/23"],
        negatives: ["VAT Number", "Tax Reference", "B-BBEE Certificate No"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["registration", "number"], nice: ["CIPC", "company"], neg: ["VAT", "tax"] },
        pattern: "(CK|K)?\\d{4}/\\d{5,6}/\\d{2}"
      },
      {
        label: "CompanyName",
        definition: "The registered legal name of the company as per CIPC records.",
        synonyms: ["Registered Name", "Legal Name", "Entity Name", "Trading Name"],
        positives: ["Moyo Retail (Pty) Ltd", "Blue Crane Logistics CC", "Aurum Financial Services (Pty) Ltd"],
        negatives: ["Director Name", "Shareholder Name", "Brand Name"],
        zones: ["PDF Header"],
        keywords: { must: ["company", "name"], nice: ["registered", "legal"], neg: ["director", "brand"] },
        pattern: ""
      },
      {
        label: "CompanyType",
        definition: "The legal type of company (Private Company, Close Corporation, NPC, etc.).",
        synonyms: ["Entity Type", "Legal Form", "Company Category"],
        positives: ["Private Company (Pty) Ltd", "Close Corporation (CC)", "Non-Profit Company (NPC)", "Public Company (Ltd)"],
        negatives: ["Industry Type", "B-BBEE Category", "Tax Category"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["type", "company"], nice: ["private", "close corporation"], neg: ["industry", "category"] },
        pattern: "(Pty|CC|NPC|Ltd|SOC)"
      },
      {
        label: "IncorporationDate",
        definition: "The date on which the company was officially incorporated/registered with CIPC.",
        synonyms: ["Date of Incorporation", "Registration Date", "Formation Date", "Established Date"],
        positives: ["2015-06-01", "1 June 2015", "2020/03/15"],
        negatives: ["Financial Year End", "Certificate Date", "Amendment Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["incorporation", "date"], nice: ["registration", "established"], neg: ["amendment", "financial"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      },
      {
        label: "DirectorsList",
        definition: "The list of current directors or members registered with CIPC.",
        synonyms: ["Directors", "Members", "Board of Directors", "Company Directors"],
        positives: ["S. Nkosi (Director), F. Patel (Director)", "Directors: John Smith, Mary Jones"],
        negatives: ["Shareholders", "Employees", "Auditors"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["director"], nice: ["member", "board"], neg: ["shareholder", "employee"] },
        pattern: ""
      },
      {
        label: "RegisteredAddress",
        definition: "The official registered address of the company as per CIPC records.",
        synonyms: ["Business Address", "Registered Office", "Principal Place of Business"],
        positives: ["123 Main Road, Sandton, 2196", "Suite 5, Block B, Waterfall, Midrand"],
        negatives: ["Postal Address", "Director Address", "Branch Address"],
        zones: ["PDF Header", "Email Body"],
        keywords: { must: ["registered", "address"], nice: ["office", "business"], neg: ["postal", "branch"] },
        pattern: ""
      },
      {
        label: "CompanyStatus",
        definition: "The current status of the company with CIPC (Active, In Business, Deregistered, etc.).",
        synonyms: ["CIPC Status", "Registration Status", "Entity Status", "Business Status"],
        positives: ["In Business", "Active", "Final Deregistration", "External - In Process of Registration"],
        negatives: ["B-BBEE Status", "Tax Status", "Compliance Status"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["status"], nice: ["active", "in business"], neg: ["BEE", "tax"] },
        pattern: "(In Business|Active|Deregistered|Final Deregistration)"
      }
    ]
  },
  {
    name: "Annual Financial Statements",
    key: "financial_statements",
    category: "Finance",
    description: "Extract key financial figures needed for B-BBEE calculations from annual financial statements.",
    entities: [
      {
        label: "TotalRevenue",
        definition: "The total annual revenue/turnover of the measured entity for B-BBEE classification and calculations.",
        synonyms: ["Revenue", "Turnover", "Total Sales", "Gross Revenue", "Total Income"],
        positives: ["R120,000,000", "R45.5M", "R8,200,000", "R250 000 000"],
        negatives: ["Net Profit", "Gross Profit", "Other Income"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["revenue", "total"], nice: ["turnover", "sales"], neg: ["profit", "other income"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "NetProfitAfterTax",
        definition: "The Net Profit After Tax (NPAT) used as denominator for ESD and SED contribution targets.",
        synonyms: ["NPAT", "Net Profit", "After-Tax Profit", "PAT", "Bottom Line"],
        positives: ["R25,000,000", "R12.5M", "R3,200,000"],
        negatives: ["Revenue", "Gross Profit", "EBITDA", "Operating Profit"],
        zones: ["Tables"],
        keywords: { must: ["net", "profit"], nice: ["NPAT", "after tax"], neg: ["gross", "operating"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "TotalPayroll",
        definition: "The total annual employee payroll (leviable amount) used as denominator for skills development calculations.",
        synonyms: ["Leviable Amount", "Annual Payroll", "Salary Bill", "Total Employee Cost"],
        positives: ["R45,000,000", "R12.5M", "R120 000 000"],
        negatives: ["Revenue", "Net Profit", "Training Cost"],
        zones: ["Tables"],
        keywords: { must: ["payroll", "total"], nice: ["leviable", "salary"], neg: ["revenue", "profit"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "TotalAssets",
        definition: "The total value of the entity's assets as per the balance sheet / statement of financial position.",
        synonyms: ["Assets", "Total Asset Value", "Asset Base", "Balance Sheet Total"],
        positives: ["R500,000,000", "R85M", "R1.2B"],
        negatives: ["Net Assets", "Current Assets Only", "Liabilities"],
        zones: ["Tables"],
        keywords: { must: ["total", "assets"], nice: ["balance sheet"], neg: ["liabilities", "net"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K|B)?"
      },
      {
        label: "FinancialYearEnd",
        definition: "The financial year-end date of the measured entity's reporting period.",
        synonyms: ["FYE", "Year End", "Reporting Date", "Period End"],
        positives: ["28 February 2024", "31 December 2023", "30 June 2024"],
        negatives: ["Start Date", "Incorporation Date", "Certificate Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["year", "end"], nice: ["financial", "period"], neg: ["start", "incorporation"] },
        pattern: "\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}"
      },
      {
        label: "TotalProcurementSpend",
        definition: "The Total Measured Procurement Spend (TMPS) used as the base for preferential procurement scoring.",
        synonyms: ["TMPS", "Total Procurement", "Procurement Expenditure", "Supplier Spend"],
        positives: ["R200,000,000", "R55M", "R120 000 000"],
        negatives: ["Revenue", "Payroll", "Training Spend"],
        zones: ["Tables"],
        keywords: { must: ["procurement", "spend"], nice: ["TMPS", "total"], neg: ["revenue", "payroll"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "AuditorName",
        definition: "The name of the external auditor or audit firm that audited the financial statements.",
        synonyms: ["External Auditor", "Audit Firm", "Auditors", "Independent Auditor"],
        positives: ["Deloitte & Touche", "PwC", "KPMG", "BDO South Africa", "Mazars"],
        negatives: ["Internal Auditor", "Director Name", "Verification Agency"],
        zones: ["PDF Header", "Signature Block"],
        keywords: { must: ["auditor"], nice: ["external", "firm"], neg: ["internal", "director"] },
        pattern: ""
      },
      {
        label: "AuditOpinion",
        definition: "The type of audit opinion expressed on the financial statements (Unqualified, Qualified, etc.).",
        synonyms: ["Audit Report Type", "Opinion", "Auditor's Report", "Clean Audit"],
        positives: ["Unqualified", "Qualified", "Adverse", "Disclaimer of Opinion", "Clean Audit"],
        negatives: ["Management Opinion", "Board Resolution", "Legal Opinion"],
        zones: ["PDF Header", "Email Body"],
        keywords: { must: ["opinion", "audit"], nice: ["unqualified", "qualified"], neg: ["management", "legal"] },
        pattern: "(Unqualified|Qualified|Adverse|Disclaimer)"
      }
    ]
  },
  {
    name: "Employment Equity Report",
    key: "employment_equity",
    category: "B-BBEE",
    description: "Extract workforce demographics, disability data, and occupational level breakdowns from EE reports.",
    entities: [
      {
        label: "TotalEmployees",
        definition: "The total headcount of permanent employees at the measured entity.",
        synonyms: ["Headcount", "Total Staff", "Employee Count", "Workforce Size"],
        positives: ["250", "1,200 employees", "85 staff", "3500"],
        negatives: ["Contractor Count", "Temporary Staff", "Board Members"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["total", "employees"], nice: ["headcount", "staff"], neg: ["contractor", "temporary"] },
        pattern: "\\d{1,5}\\s*(employees|staff)?"
      },
      {
        label: "BlackEmployeeCount",
        definition: "The total number of black employees (African, Coloured, Indian) at the measured entity.",
        synonyms: ["Black Staff", "Designated Group Employees", "ACI Employees"],
        positives: ["180", "950", "65 black employees"],
        negatives: ["White Employees", "Total Employees", "Foreign Employees"],
        zones: ["Tables"],
        keywords: { must: ["black", "employee"], nice: ["designated", "ACI"], neg: ["white", "foreign"] },
        pattern: "\\d{1,5}"
      },
      {
        label: "BlackFemaleEmployeeCount",
        definition: "The total number of black female employees across all occupational levels.",
        synonyms: ["Black Women Staff", "ACI Female Employees", "Black Female Count"],
        positives: ["95", "420", "32 black female employees"],
        negatives: ["White Female Employees", "Total Female Employees", "Male Employees"],
        zones: ["Tables"],
        keywords: { must: ["black", "female"], nice: ["women", "employee"], neg: ["white", "male"] },
        pattern: "\\d{1,5}"
      },
      {
        label: "DisabledEmployeeCount",
        definition: "The number of employees with disabilities as a percentage of total workforce for B-BBEE scoring.",
        synonyms: ["PWD Count", "Disabled Staff", "Employees with Disabilities"],
        positives: ["8", "15 disabled employees", "3% (12 employees)"],
        negatives: ["Able-Bodied Count", "Sick Leave Count", "Injury Count"],
        zones: ["Tables"],
        keywords: { must: ["disabled", "employee"], nice: ["PWD", "disability"], neg: ["able-bodied", "injury"] },
        pattern: "\\d{1,4}"
      },
      {
        label: "TopManagementBlack",
        definition: "The number of black employees at Top Management / Executive level (C-suite, MD, CEO).",
        synonyms: ["Black Executives", "Black Top Management", "ACI C-Suite"],
        positives: ["3", "5 of 8", "2 black executives"],
        negatives: ["White Executives", "Total Management", "Junior Staff"],
        zones: ["Tables"],
        keywords: { must: ["top", "management", "black"], nice: ["executive", "C-suite"], neg: ["junior", "white"] },
        pattern: "\\d{1,3}"
      },
      {
        label: "SeniorManagementBlack",
        definition: "The number of black employees at Senior Management level.",
        synonyms: ["Black Senior Managers", "ACI Senior Management", "Designated Senior Managers"],
        positives: ["8", "12 of 20", "6 black senior managers"],
        negatives: ["White Senior Managers", "Junior Managers", "Total Managers"],
        zones: ["Tables"],
        keywords: { must: ["senior", "management", "black"], nice: ["designated"], neg: ["junior", "white"] },
        pattern: "\\d{1,3}"
      },
      {
        label: "MiddleManagementBlack",
        definition: "The number of black employees at Middle Management / Professionally Qualified level.",
        synonyms: ["Black Middle Managers", "ACI Middle Management", "Professionally Qualified Black"],
        positives: ["25", "40 of 65", "18 black middle managers"],
        negatives: ["Senior Managers", "Junior Staff", "White Middle Managers"],
        zones: ["Tables"],
        keywords: { must: ["middle", "management", "black"], nice: ["professionally qualified"], neg: ["senior", "junior"] },
        pattern: "\\d{1,3}"
      },
      {
        label: "JuniorManagementBlack",
        definition: "The number of black employees at Junior Management / Skilled Technical level.",
        synonyms: ["Black Junior Managers", "ACI Junior Management", "Skilled Technical Black"],
        positives: ["45", "80 of 120", "35 black junior managers"],
        negatives: ["Senior Managers", "Semi-Skilled", "Unskilled"],
        zones: ["Tables"],
        keywords: { must: ["junior", "management", "black"], nice: ["skilled", "technical"], neg: ["senior", "unskilled"] },
        pattern: "\\d{1,3}"
      }
    ]
  },
  {
    name: "B-BBEE Detailed Scorecard Report",
    key: "bbee_scorecard_report",
    category: "B-BBEE",
    description: "Extract full scorecard breakdown with all pillar scores, sub-element points, weightings, and compliance indicators from a B-BBEE verification report.",
    entities: [
      {
        label: "MeasuredEntityName",
        definition: "The legal name of the company or organisation measured in the verification scorecard report.",
        synonyms: ["Company Name", "Entity Name", "Verified Entity", "Organisation Name"],
        positives: ["Moyo Retail (Pty) Ltd", "Karoo Telecom Holdings", "Sizwe Engineering Group"],
        negatives: ["Verification Agency Name", "Shareholder Name", "Director Name"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["entity", "measured"], nice: ["company", "name"], neg: ["agency", "verifier"] },
        pattern: ""
      },
      {
        label: "OverallBBBEELevel",
        definition: "The final B-BBEE contributor level (1–8 or Non-Compliant) after applying all scorecard elements, priority elements, and any discounting.",
        synonyms: ["Final BEE Level", "Contributor Level", "Overall Level", "Verified Level"],
        positives: ["Level 1", "Level 3", "Level 8", "Non-Compliant"],
        negatives: ["Sub-Element Level", "Previous Level", "Target Level"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["level", "overall"], nice: ["contributor", "final"], neg: ["sub-element", "target"] },
        pattern: "Level\\s*[1-8]|Non-Compliant"
      },
      {
        label: "OverallScore",
        definition: "The total scorecard points achieved across all elements out of the applicable maximum (typically 105 or 110 with bonus points).",
        synonyms: ["Total Score", "Aggregate Score", "Scorecard Total", "Overall Points"],
        positives: ["92.45 / 110", "78.30", "101.2 points", "65 / 105"],
        negatives: ["Element Score", "Sub-Minimum Score", "Weighted Score"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["total", "score"], nice: ["aggregate", "overall"], neg: ["element", "sub"] },
        pattern: "\\d{1,3}(\\.\\d{1,2})?(\\s*/\\s*1[01][05])?"
      },
      {
        label: "OwnershipScore",
        definition: "The points scored for the Ownership element of the B-BBEE scorecard (max 25 points for Generic enterprises).",
        synonyms: ["Ownership Points", "Element 1 Score", "Equity Ownership Score"],
        positives: ["25.00 / 25", "18.50", "22.75 / 25", "0.00"],
        negatives: ["Management Score", "Skills Score", "ESD Score"],
        zones: ["Tables"],
        keywords: { must: ["ownership", "score"], nice: ["element", "equity"], neg: ["management", "skills"] },
        pattern: "\\d{1,2}(\\.\\d{1,2})?(\\s*/\\s*25)?"
      },
      {
        label: "ManagementControlScore",
        definition: "The points scored for the Management Control element of the B-BBEE scorecard (max 19 points for Generic enterprises).",
        synonyms: ["Management Score", "Element 2 Score", "MC Points"],
        positives: ["19.00 / 19", "12.50", "15.25 / 19", "8.00"],
        negatives: ["Ownership Score", "Skills Score", "ESD Score"],
        zones: ["Tables"],
        keywords: { must: ["management", "control", "score"], nice: ["element", "board"], neg: ["ownership", "skills"] },
        pattern: "\\d{1,2}(\\.\\d{1,2})?(\\s*/\\s*(15|19))?"
      },
      {
        label: "SkillsDevelopmentScore",
        definition: "The points scored for the Skills Development element of the B-BBEE scorecard (max 20 points plus possible bonus).",
        synonyms: ["Skills Score", "Element 3 Score", "SD Points", "Training Score"],
        positives: ["20.00 / 20", "14.50", "18.75 / 25", "9.00"],
        negatives: ["Ownership Score", "Management Score", "ESD Score"],
        zones: ["Tables"],
        keywords: { must: ["skills", "development", "score"], nice: ["training", "element"], neg: ["ownership", "management"] },
        pattern: "\\d{1,2}(\\.\\d{1,2})?(\\s*/\\s*(20|25))?"
      },
      {
        label: "ESDScore",
        definition: "The points scored for the Enterprise and Supplier Development element (max 40 points for Generic, includes preferential procurement).",
        synonyms: ["ESD Points", "Element 4 Score", "Enterprise Development Score", "Procurement & ESD Score"],
        positives: ["40.00 / 40", "32.50", "38.75 / 44", "25.00"],
        negatives: ["Ownership Score", "Skills Score", "SED Score"],
        zones: ["Tables"],
        keywords: { must: ["ESD", "score"], nice: ["enterprise", "supplier"], neg: ["ownership", "skills"] },
        pattern: "\\d{1,2}(\\.\\d{1,2})?(\\s*/\\s*(40|44))?"
      },
      {
        label: "SEDScore",
        definition: "The points scored for the Socio-Economic Development element of the B-BBEE scorecard (max 5 points).",
        synonyms: ["SED Points", "Element 5 Score", "CSI Score", "Social Development Score"],
        positives: ["5.00 / 5", "3.50", "4.25 / 5", "2.00"],
        negatives: ["ESD Score", "Skills Score", "Ownership Score"],
        zones: ["Tables"],
        keywords: { must: ["SED", "score"], nice: ["socio-economic", "CSI"], neg: ["ESD", "skills"] },
        pattern: "\\d{1,2}(\\.\\d{1,2})?(\\s*/\\s*5)?"
      },
      {
        label: "PriorityElementStatus",
        definition: "Whether priority elements (sub-minimums) have been met. Failure to meet priority elements results in automatic level discounting.",
        synonyms: ["Sub-Minimum Compliance", "Priority Element Compliance", "Discounting Applied", "Sub-Minimum Met"],
        positives: ["All priority elements met", "Sub-minimum not met – discounted by 1 level", "Priority element failed: Ownership", "No discounting applied"],
        negatives: ["Bonus Points", "Target Status", "Compliance Status"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["priority", "element"], nice: ["sub-minimum", "discounting"], neg: ["bonus", "target"] },
        pattern: ""
      },
      {
        label: "BonusPointsAwarded",
        definition: "Any bonus points awarded for exceeding targets or for YES Initiative participation (up to 5 bonus points).",
        synonyms: ["Bonus Score", "Additional Points", "YES Bonus", "Exceed Target Bonus"],
        positives: ["5.00 bonus points", "3.00", "YES: 2 levels up", "0.00"],
        negatives: ["Base Score", "Deducted Points", "Penalty"],
        zones: ["Tables"],
        keywords: { must: ["bonus", "points"], nice: ["additional", "YES"], neg: ["penalty", "deducted"] },
        pattern: "\\d{1,2}(\\.\\d{1,2})?"
      },
      {
        label: "ScorecardType",
        definition: "The type of scorecard used for measurement (Generic, QSE, Sector-Specific Charter Code).",
        synonyms: ["Scorecard Category", "Measurement Type", "Code Applied", "Applicable Codes"],
        positives: ["Generic Scorecard", "QSE Scorecard", "ICT Sector Code", "Construction Sector Charter", "Tourism Sector Code"],
        negatives: ["Certificate Type", "Report Type", "Audit Type"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["scorecard", "type"], nice: ["generic", "sector"], neg: ["certificate", "audit"] },
        pattern: ""
      },
      {
        label: "VerificationStandard",
        definition: "The Amended Codes of Good Practice gazette or sector code version under which the verification was conducted.",
        synonyms: ["Codes Version", "Gazette Number", "Applicable Standard", "Regulatory Framework"],
        positives: ["Amended Codes of Good Practice (2013)", "Gazette 36928", "ICT Sector Code (2016)", "Revised Codes 2019"],
        negatives: ["ISO Standard", "Audit Standard", "Accounting Standard"],
        zones: ["PDF Header", "Footer"],
        keywords: { must: ["codes", "gazette"], nice: ["amended", "standard"], neg: ["ISO", "accounting"] },
        pattern: ""
      },
      {
        label: "VerificationAgencyName",
        definition: "The SANAS-accredited verification agency that conducted the scorecard assessment and issued the report.",
        synonyms: ["BV Agency", "Verification Body", "Accredited Agency", "BEE Verifier"],
        positives: ["Empowerdex", "AQRate", "BEE-Connex", "Moore Verification Services", "NERA"],
        negatives: ["Auditor Name", "Law Firm", "Consultant Name"],
        zones: ["PDF Header", "Footer", "Signature Block"],
        keywords: { must: ["verification", "agency"], nice: ["SANAS", "accredited"], neg: ["auditor", "law firm"] },
        pattern: ""
      },
      {
        label: "MeasurementDate",
        definition: "The date or period on which the B-BBEE scorecard measurement was conducted.",
        synonyms: ["Assessment Date", "Verification Date", "Measurement Period", "Report Date"],
        positives: ["2024-06-15", "15 June 2024", "FY2023/2024", "Year ended 28 Feb 2024"],
        negatives: ["Expiry Date", "Issue Date", "Filing Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["measurement", "date"], nice: ["assessment", "verification"], neg: ["expiry", "filing"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}"
      },
      {
        label: "EmpoweringSupplierStatus",
        definition: "Whether the measured entity qualifies as an Empowering Supplier under the B-BBEE Codes, based on meeting all three criteria.",
        synonyms: ["Empowering Supplier", "ES Status", "Empowering Supplier Recognition"],
        positives: ["Yes – Empowering Supplier", "No – Does not qualify", "Empowering Supplier: Criteria met"],
        negatives: ["Preferred Supplier", "Approved Vendor", "Compliant Supplier"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["empowering", "supplier"], nice: ["criteria", "status"], neg: ["preferred", "approved"] },
        pattern: "(Yes|No|Empowering Supplier)"
      }
    ]
  },
  {
    name: "YES Initiative Report",
    key: "yes_initiative",
    category: "B-BBEE",
    description: "Extract Youth Employment Service (YES) programme data including youth placements, absorption rates, and B-BBEE level uplift for YES compliance reporting.",
    entities: [
      {
        label: "YESProgrammeStatus",
        definition: "Whether the entity is a registered YES participant and the current programme status (Active, Completed, Pending).",
        synonyms: ["YES Registration", "Programme Status", "YES Participation", "YES Active Status"],
        positives: ["Active YES Participant", "YES Programme Completed", "Registered – Pending Placement", "YES Certified"],
        negatives: ["B-BBEE Status", "Tax Status", "Company Status"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["YES", "status"], nice: ["programme", "participant"], neg: ["BEE", "tax"] },
        pattern: "(Active|Completed|Pending|Registered|Certified)"
      },
      {
        label: "YouthPlacementsTotal",
        definition: "The total number of youth placed in work opportunities through the YES Initiative during the measurement period.",
        synonyms: ["Total YES Placements", "Youth Employed", "YES Beneficiaries", "Work Opportunities Created"],
        positives: ["50", "120 youth placed", "25 placements", "200"],
        negatives: ["Total Employees", "Learnerships", "Contractor Count"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["youth", "placements"], nice: ["YES", "total"], neg: ["employee", "contractor"] },
        pattern: "\\d{1,4}\\s*(youth|placements|placed)?"
      },
      {
        label: "YouthBlackPlacements",
        definition: "The number of black youth (African, Coloured, Indian) placed through the YES Initiative.",
        synonyms: ["Black YES Placements", "ACI Youth Placed", "Designated Group Youth"],
        positives: ["45", "110 black youth", "23 ACI placements"],
        negatives: ["White Youth", "Total Placements", "Non-SA Youth"],
        zones: ["Tables"],
        keywords: { must: ["black", "youth"], nice: ["designated", "ACI"], neg: ["white", "total"] },
        pattern: "\\d{1,4}"
      },
      {
        label: "YouthFemalePlacements",
        definition: "The number of female youth placed through the YES Initiative for gender transformation tracking.",
        synonyms: ["Female YES Placements", "Women Youth Placed", "Female Youth Count"],
        positives: ["28", "65 female youth", "15 women placed"],
        negatives: ["Male Youth", "Total Female Employees", "Female Managers"],
        zones: ["Tables"],
        keywords: { must: ["female", "youth"], nice: ["women", "placed"], neg: ["male", "manager"] },
        pattern: "\\d{1,4}"
      },
      {
        label: "YouthDisabledPlacements",
        definition: "The number of youth with disabilities placed through the YES Initiative.",
        synonyms: ["Disabled YES Youth", "PWD Youth Placed", "Youth with Disabilities"],
        positives: ["5", "3 disabled youth", "8 PWD placements"],
        negatives: ["Able-Bodied Youth", "Disabled Employees", "Total Disabled"],
        zones: ["Tables"],
        keywords: { must: ["disabled", "youth"], nice: ["PWD", "placement"], neg: ["able-bodied", "employee"] },
        pattern: "\\d{1,3}"
      },
      {
        label: "PlacementDuration",
        definition: "The duration of each youth work placement in months (typically 12 months for YES compliance).",
        synonyms: ["Contract Duration", "Placement Period", "Employment Duration", "YES Term"],
        positives: ["12 months", "6 months", "12-month placement", "1 year"],
        negatives: ["Probation Period", "Notice Period", "Training Duration"],
        zones: ["Tables"],
        keywords: { must: ["duration", "months"], nice: ["placement", "period"], neg: ["probation", "notice"] },
        pattern: "\\d{1,2}\\s*(months?|year)"
      },
      {
        label: "MonthlyStipend",
        definition: "The monthly stipend or salary paid to each YES youth participant (must meet national minimum wage).",
        synonyms: ["Youth Salary", "Monthly Pay", "Stipend Amount", "YES Remuneration"],
        positives: ["R4,500", "R5,000 per month", "R6,200", "R3,900.00"],
        negatives: ["Training Cost", "Admin Fee", "Management Salary"],
        zones: ["Tables"],
        keywords: { must: ["stipend", "monthly"], nice: ["salary", "remuneration"], neg: ["training cost", "admin"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
      {
        label: "TotalYESInvestment",
        definition: "The total annual investment in the YES programme including stipends, training, and administration costs.",
        synonyms: ["YES Spend", "Total YES Cost", "Programme Investment", "YES Budget"],
        positives: ["R3,500,000", "R8.2M", "R1,200,000", "R12 000 000"],
        negatives: ["ESD Spend", "Training Spend", "SED Spend"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["YES", "investment"], nice: ["total", "spend"], neg: ["ESD", "SED"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
      },
      {
        label: "YESLevelUplift",
        definition: "The number of B-BBEE levels the entity is uplifted by as a result of YES programme participation (up to 2 levels).",
        synonyms: ["Level Improvement", "YES Bonus Levels", "BEE Level Uplift", "Level Enhancement"],
        positives: ["1 level uplift", "2 levels", "+1 level", "Uplifted from Level 4 to Level 2"],
        negatives: ["Base Level", "Previous Level", "Target Level"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["uplift", "level"], nice: ["YES", "improvement"], neg: ["base", "previous"] },
        pattern: "[12]\\s*level"
      },
      {
        label: "AbsorptionRate",
        definition: "The percentage or number of YES youth absorbed into permanent employment after the programme.",
        synonyms: ["Retention Rate", "Youth Absorbed", "Permanent Hire Rate", "Post-YES Employment"],
        positives: ["40%", "15 of 50 absorbed", "60% absorption rate", "25 permanently employed"],
        negatives: ["Attrition Rate", "Dropout Rate", "Resignation Rate"],
        zones: ["Tables"],
        keywords: { must: ["absorption", "rate"], nice: ["retained", "permanent"], neg: ["attrition", "dropout"] },
        pattern: "\\d{1,3}%|\\d{1,4}\\s*(absorbed|retained)"
      },
      {
        label: "YESRegistrationNumber",
        definition: "The unique YES Initiative registration or reference number assigned to the participating entity.",
        synonyms: ["YES Ref", "Registration Number", "YES ID", "Programme Reference"],
        positives: ["YES-2024-00451", "REG/2024/1098", "YES24-3312"],
        negatives: ["Company Reg No", "B-BBEE Certificate No", "Tax Reference"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["YES", "registration"], nice: ["reference", "number"], neg: ["company", "certificate"] },
        pattern: "YES[-/]?\\d{2,4}[-/]\\d{3,5}"
      },
      {
        label: "HostCompanyName",
        definition: "The name of the company hosting the YES youth if different from the measured entity (for group structures).",
        synonyms: ["Host Entity", "Placement Company", "Youth Host", "Operating Company"],
        positives: ["Moyo Retail Sandton Branch", "Karoo Telecom Western Cape", "Blue Crane Logistics Durban"],
        negatives: ["Measured Entity Name", "Shareholder Name", "Partner Company"],
        zones: ["Tables"],
        keywords: { must: ["host", "company"], nice: ["placement", "entity"], neg: ["measured", "shareholder"] },
        pattern: ""
      },
      {
        label: "YESCompliancePeriod",
        definition: "The measurement period or financial year for which YES programme compliance is being reported.",
        synonyms: ["Reporting Period", "YES Year", "Compliance Year", "Programme Period"],
        positives: ["FY2024", "1 Mar 2023 – 28 Feb 2024", "2023/2024", "Year ended 31 Dec 2023"],
        negatives: ["Certificate Validity", "Contract Period", "Training Period"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["period", "compliance"], nice: ["YES", "year"], neg: ["certificate", "contract"] },
        pattern: "(FY|fy)?\\d{4}(/\\d{2,4})?"
      }
    ]
  },
  {
    name: "Board Resolution",
    key: "board_resolution",
    category: "Governance",
    description: "Capture board resolution details, signatories, and governance decisions for compliance records.",
    entities: [
      {
        label: "ResolutionDate",
        definition: "The date on which the board resolution was passed and adopted.",
        synonyms: ["Date of Resolution", "Meeting Date", "Decision Date", "Adopted Date"],
        positives: ["2024-06-15", "15 June 2024", "2024/06/15"],
        negatives: ["Expiry Date", "Implementation Date", "Filing Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["resolution", "date"], nice: ["meeting", "adopted"], neg: ["expiry", "filing"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      },
      {
        label: "ResolutionTitle",
        definition: "The title or subject matter of the board resolution.",
        synonyms: ["Resolution Subject", "Matter Resolved", "Resolution Heading", "Decision Title"],
        positives: ["Appointment of BEE Partner", "Approval of Skills Development Budget", "ESD Fund Allocation"],
        negatives: ["Meeting Title", "Agenda Item", "Policy Title"],
        zones: ["PDF Header", "Email Body"],
        keywords: { must: ["resolution", "title"], nice: ["subject", "matter"], neg: ["agenda", "policy"] },
        pattern: ""
      },
      {
        label: "ResolutionSignatories",
        definition: "The names and designations of directors who signed the board resolution.",
        synonyms: ["Signatories", "Signed By", "Directors Present", "Resolution Approvers"],
        positives: ["Chairperson: S. Nkosi, Director: F. Patel, Director: J. Smith"],
        negatives: ["Witnesses", "Shareholders", "Employees Present"],
        zones: ["Signature Block", "Tables"],
        keywords: { must: ["signatory", "signed"], nice: ["director", "chairperson"], neg: ["witness", "employee"] },
        pattern: ""
      },
      {
        label: "ResolutionPurpose",
        definition: "A summary of the purpose and key decisions made in the board resolution.",
        synonyms: ["Purpose", "Decision Summary", "Resolution Content", "Key Decision"],
        positives: ["To approve the annual B-BBEE strategy and budget allocation", "To appoint a new BEE verification agency"],
        negatives: ["Meeting Minutes", "Policy Content", "Contract Terms"],
        zones: ["Email Body", "PDF Header"],
        keywords: { must: ["purpose", "resolution"], nice: ["decision", "approved"], neg: ["minutes", "policy"] },
        pattern: ""
      },
      {
        label: "QuorumDetails",
        definition: "The quorum details confirming sufficient directors were present for the resolution to be valid.",
        synonyms: ["Quorum", "Directors Present", "Attendance", "Quorum Confirmation"],
        positives: ["Quorum present: 5 of 8 directors", "6 directors present (quorum achieved)"],
        negatives: ["Employee Attendance", "Shareholder Attendance", "Meeting Attendees"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["quorum"], nice: ["present", "directors"], neg: ["employee", "shareholder"] },
        pattern: ""
      }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SECTOR TOOLKIT TEMPLATES  (category: "Toolkit")
  // Each entity mirrors entityManifest.ts with pillarCode + formulaRole wiring
  // so Groq extractions feed directly into buildPipelineResult()
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "RCOGP Generic Scorecard",
    key: "toolkit_rcogp_generic",
    category: "Toolkit",
    description: "Full B-BBEE scorecard data extraction for RCOGP Generic entities (manufacturing, retail, services, construction). Covers all 7 pillars. Max 116 pts.",
    sectorCode: "RCOGP",
    sectorType: "Generic",
    maxPoints: 116,
    pillars: ["Ownership", "MC", "EE", "Skills", "Procurement", "ESD", "SED"],
    entities: [
      { label: "TotalRevenue", definition: "Total annual revenue / turnover for the measurement period.", synonyms: ["turnover","total revenue","annual revenue","sales","gross revenue","income"], positives: ["R150,000,000","R45.5M","R8,200,000"], negatives: ["Net Profit","Cost of Sales"], zones: ["Tables","PDF Header"], keywords: { must: ["revenue","turnover"], nice: ["annual","total","gross"], neg: ["cost","expense","tax"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "revenue", fieldType: "currency", validationMin: 0 },
      { label: "NPAT", definition: "Net Profit After Tax used as base for ESD (2% target) and SED (1% target) contributions.", synonyms: ["net profit after tax","net profit","PAT","net income","profit after tax"], positives: ["R25,000,000","R12.5M","-R3,200,000"], negatives: ["Gross Profit","EBITDA","Revenue"], zones: ["Tables"], keywords: { must: ["net","profit"], nice: ["NPAT","after tax"], neg: ["gross","operating","EBITDA"] }, pattern: "-?R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "npat", fieldType: "currency" },
      { label: "LeviableAmount", definition: "Total leviable payroll on which skills development levy is calculated (3.5% target for Skills Development).", synonyms: ["payroll","total payroll","leviable payroll","salary bill","total remuneration"], positives: ["R45,000,000","R12.5M","R120,000,000"], negatives: ["Revenue","Net Profit","Training Cost"], zones: ["Tables"], keywords: { must: ["leviable","payroll"], nice: ["remuneration","salary"], neg: ["pension","bonus"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "leviableAmount", fieldType: "currency", validationMin: 0 },
      { label: "TMPS", definition: "Total Measured Procurement Spend — the denominator for all Preferential Procurement calculations (80% target).", synonyms: ["total measured procurement spend","total procurement spend","measured procurement"], positives: ["R80,000,000","R50M"], negatives: ["Revenue","NPAT","Payroll"], zones: ["Tables","PDF Header"], keywords: { must: ["procurement","spend"], nice: ["total","measured","TMPS"], neg: ["import","exempt"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "tmps", fieldType: "currency", validationMin: 0 },
      { label: "FinancialYearEnd", definition: "End date of the financial year being measured.", synonyms: ["FYE","year end","financial year end","measurement period end"], positives: ["2024-03-31","31 March 2024","2024/03/31"], negatives: ["N/A","Start Date"], zones: ["PDF Header","Tables"], keywords: { must: ["year end","financial year"], nice: ["measurement period","FYE"], neg: ["start date"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}", pillarCode: "financials", formulaRole: "financialYearEnd", fieldType: "date" },
      { label: "ShareholderName", definition: "Name of each shareholder / equity holder.", synonyms: ["shareholder","equity holder","owner","member"], positives: ["Thabo Investments (Pty) Ltd","John Smith"], negatives: ["N/A","TBC","Employee"], zones: ["Tables","PDF Header"], keywords: { must: ["shareholder","owner"], nice: ["name","entity"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "ownership", formulaRole: "shareholderName", fieldType: "string" },
      { label: "BlackOwnershipPct", definition: "Percentage of equity held by black people — feeds voting rights and economic interest scoring.", synonyms: ["BO%","BO","black %","HDSA","black ownership","black equity"], positives: ["51%","100%","25.1%"], negatives: ["120%","-5%","Foreign Ownership"], zones: ["Tables","PDF Header"], keywords: { must: ["black","ownership"], nice: ["percentage","equity","HDSA"], neg: ["foreign","government","management"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "BlackWomenOwnershipPct", definition: "Percentage of equity held by black women.", synonyms: ["BWO%","BWO","black women %","black female ownership"], positives: ["30%","51%","10%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black women","black female"], nice: ["ownership","equity"], neg: ["employee","management"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackWomenOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ShareholdingPct", definition: "Percentage of total shares held by each specific shareholder (should sum to 100%).", synonyms: ["shares %","equity %","shareholding","stake"], positives: ["25%","100%","50%"], negatives: ["150%","-10%","Profit Share"], zones: ["Tables"], keywords: { must: ["share","equity"], nice: ["percentage","stake","holding"], neg: ["profit share"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "shareholdingPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "EmployeeName", definition: "Full name of each employee — used for Management Control and Employment Equity scoring.", synonyms: ["name","staff name","personnel"], positives: ["Sipho Ndlovu","Jane Doe"], negatives: ["TBC","N/A","Supplier"], zones: ["Tables"], keywords: { must: ["name","employee"], nice: ["first name","surname"], neg: ["supplier","shareholder"] }, pattern: "", pillarCode: "managementControl", formulaRole: "employeeName", fieldType: "string" },
      { label: "EmployeeRace", definition: "Race / population group of each employee (African, Coloured, Indian, White) per EE Act.", synonyms: ["race group","population group","demographic","race"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown","Nationality"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","african","coloured","indian"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "managementControl", formulaRole: "employeeRace", fieldType: "string" },
      { label: "EmployeeGender", definition: "Gender of each employee (Male / Female).", synonyms: ["sex","M/F","gender"], positives: ["Male","Female","M","F"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["gender","sex"], nice: ["M/F","male","female"], neg: ["age"] }, pattern: "(Male|Female|M|F)", pillarCode: "managementControl", formulaRole: "employeeGender", fieldType: "string" },
      { label: "EmployeeDesignation", definition: "Occupational level / designation: Board, Executive, Senior Management, Middle Management, Junior Management, Semi-skilled, Unskilled.", synonyms: ["level","occupational level","position","designation","job title","grade"], positives: ["Top Management","Senior Management","Professionally Qualified","Skilled Technical"], negatives: ["Intern","Contractor","Department"], zones: ["Tables"], keywords: { must: ["level","designation","occupational"], nice: ["position","grade","job title"], neg: ["department"] }, pattern: "(Board|Executive|Senior|Middle|Junior|Semi|Unskilled)", pillarCode: "managementControl", formulaRole: "employeeDesignation", fieldType: "string" },
      { label: "EmployeeDisability", definition: "Whether the employee is a Person With a Disability (PWD).", synonyms: ["disabled","PWD","disability"], positives: ["Yes","No","Y","N","PWD"], negatives: ["Injury","Sick Leave"], zones: ["Tables"], keywords: { must: ["disability","disabled"], nice: ["PWD","person with disability"], neg: ["injury","sick"] }, pattern: "(Yes|No|Y|N|PWD)", pillarCode: "managementControl", formulaRole: "employeeDisability", fieldType: "string" },
      { label: "TrainingProgramme", definition: "Name / title of the skills development training programme or learnership.", synonyms: ["programme","course","training name","qualification","learnership"], positives: ["NQF Level 4 Business Administration","Learnership: Retail"], negatives: ["N/A","Salary"], zones: ["Tables"], keywords: { must: ["programme","training","course"], nice: ["qualification","NQF","learnership"], neg: ["supplier","salary"] }, pattern: "", pillarCode: "skillsDevelopment", formulaRole: "trainingProgramme", fieldType: "string" },
      { label: "TrainingCost", definition: "Amount spent on each training programme — feeds Skills Development spend percentage (target: 3.5% of leviable amount).", synonyms: ["spend","amount","cost","training spend","investment"], positives: ["R50,000","R1,200,000","R250,000"], negatives: ["R0","-R1000","Salary"], zones: ["Tables"], keywords: { must: ["cost","spend","amount"], nice: ["training","investment"], neg: ["salary","payroll"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "skillsDevelopment", formulaRole: "trainingCost", fieldType: "currency", validationMin: 0 },
      { label: "LearnerRace", definition: "Race of each learner — distinguishes black vs non-black training spend for Skills Development scoring.", synonyms: ["learner race","learner demographic","population group"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","learner"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "skillsDevelopment", formulaRole: "learnerRace", fieldType: "string" },
      { label: "LearnerEmploymentStatus", definition: "Whether the learner is employed or unemployed — affects learnership scoring multiplier.", synonyms: ["employment status","employed","unemployed","learnership status"], positives: ["Employed","Unemployed","Learnership"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["employment","status"], nice: ["employed","unemployed","learnership"], neg: ["race","gender"] }, pattern: "(Employed|Unemployed|Learnership)", pillarCode: "skillsDevelopment", formulaRole: "learnerEmploymentStatus", fieldType: "string" },
      { label: "SupplierName", definition: "Registered name of the B-BBEE supplier.", synonyms: ["vendor","service provider","contractor","supplier"], positives: ["ABC Supplies (Pty) Ltd","XYZ Services CC"], negatives: ["N/A","Employee","Shareholder"], zones: ["Tables"], keywords: { must: ["supplier","vendor"], nice: ["name","provider"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "preferentialProcurement", formulaRole: "supplierName", fieldType: "string" },
      { label: "SupplierBEELevel", definition: "B-BBEE compliance level of the supplier (1–8 or Non-Compliant) — determines recognition % for Procurement scoring.", synonyms: ["B-BBEE level","BEE level","compliance level","BEE status"], positives: ["1","2","4","8","Level 1","Non-compliant"], negatives: ["9","-1","ISO","Quality"], zones: ["Tables"], keywords: { must: ["level","B-BBEE","BEE"], nice: ["compliance","status"], neg: ["ISO","quality"] }, pattern: "Level\\s?[1-8]|Non-[Cc]ompliant", pillarCode: "preferentialProcurement", formulaRole: "supplierBeeLevel", fieldType: "bee_level", validationMin: 0, validationMax: 8 },
      { label: "SupplierSpend", definition: "Amount spent with each supplier during the measurement period — aggregated against TMPS for Procurement score.", synonyms: ["procurement spend","amount","spend","purchase value"], positives: ["R1,200,000","R5M","R250,000"], negatives: ["R0","-R50000","Salary"], zones: ["Tables"], keywords: { must: ["spend","amount"], nice: ["procurement","purchase"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "preferentialProcurement", formulaRole: "supplierSpend", fieldType: "currency", validationMin: 0 },
      { label: "SupplierBlackOwnership", definition: "Percentage black ownership of the supplier — used for 51%+ BO and 30%+ BWO procurement bonus points.", synonyms: ["BO%","black owned","black ownership %","supplier BO"], positives: ["51%","100%","30%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black","ownership"], nice: ["supplier","percentage"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "preferentialProcurement", formulaRole: "supplierBlackOwnership", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ESDBeneficiary", definition: "Name of the enterprise or supplier receiving ESD support.", synonyms: ["beneficiary","recipient","enterprise","ESD recipient"], positives: ["Bright Future Trading (Pty) Ltd","Nkosi Welding CC"], negatives: ["N/A","Employee","Shareholder"], zones: ["Tables"], keywords: { must: ["beneficiary","enterprise","supplier development"], nice: ["recipient","ESD"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdBeneficiary", fieldType: "string" },
      { label: "ESDAmount", definition: "Monetary value of the ESD contribution — target is 2% of NPAT (Supplier Development) + 1% of NPAT (Enterprise Development).", synonyms: ["contribution amount","ESD spend","amount","value"], positives: ["R500,000","R2,000,000"], negatives: ["R0","-R100000"], zones: ["Tables"], keywords: { must: ["amount","value","contribution"], nice: ["ESD","enterprise","supplier development"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdAmount", fieldType: "currency", validationMin: 0 },
      { label: "ESDCategory", definition: "Whether the contribution is Enterprise Development (ED) or Supplier Development (SD).", synonyms: ["supplier development","enterprise development","ED","SD","category"], positives: ["Enterprise Development","Supplier Development","ED","SD"], negatives: ["SED","Skills","CSI"], zones: ["Tables"], keywords: { must: ["category","enterprise","supplier"], nice: ["development","ED","SD"], neg: ["SED","socio-economic"] }, pattern: "(Enterprise Development|Supplier Development|ED|SD)", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdCategory", fieldType: "string" },
      { label: "SEDBeneficiary", definition: "Name of the SED beneficiary organisation / project (NPO, NGO, community).", synonyms: ["beneficiary","recipient","organisation","project","NPO","NGO"], positives: ["Thuthuka Foundation","Community Education Trust"], negatives: ["N/A","Supplier","Shareholder"], zones: ["Tables"], keywords: { must: ["beneficiary","recipient"], nice: ["SED","CSI","NPO","NGO"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "socioEconomicDevelopment", formulaRole: "sedBeneficiary", fieldType: "string" },
      { label: "SEDAmount", definition: "Monetary value of the SED contribution — target is 1% of NPAT.", synonyms: ["contribution amount","SED spend","amount","donation"], positives: ["R200,000","R1,000,000"], negatives: ["R0","-R50000"], zones: ["Tables"], keywords: { must: ["amount","value","contribution"], nice: ["SED","CSI","donation"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "socioEconomicDevelopment", formulaRole: "sedAmount", fieldType: "currency", validationMin: 0 },
    ],
  },

  {
    name: "ICT Generic Scorecard",
    key: "toolkit_ict_generic",
    category: "Toolkit",
    description: "Full B-BBEE scorecard for ICT sector entities (software, telecoms, digital, information technology). Includes higher Employment Equity weighting (15 pts). Max 118 pts.",
    sectorCode: "ICT",
    sectorType: "Generic",
    maxPoints: 118,
    pillars: ["Ownership", "MC", "EE", "Skills", "Procurement", "ESD", "SED"],
    entities: [
      { label: "TotalRevenue", definition: "Total annual revenue / turnover for the ICT entity.", synonyms: ["turnover","total revenue","annual revenue","sales","service revenue"], positives: ["R150,000,000","R45.5M","R8,200,000"], negatives: ["Net Profit","Cost of Sales"], zones: ["Tables","PDF Header"], keywords: { must: ["revenue","turnover"], nice: ["annual","total","gross"], neg: ["cost","expense"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "revenue", fieldType: "currency", validationMin: 0 },
      { label: "NPAT", definition: "Net Profit After Tax — base for ESD (2%) and SED (1%) targets.", synonyms: ["net profit after tax","net profit","PAT","net income"], positives: ["R25,000,000","R12.5M","-R3,200,000"], negatives: ["Gross Profit","EBITDA","Revenue"], zones: ["Tables"], keywords: { must: ["net","profit"], nice: ["NPAT","after tax"], neg: ["gross","operating"] }, pattern: "-?R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "npat", fieldType: "currency" },
      { label: "LeviableAmount", definition: "Total leviable payroll for Skills Development calculations (3.5% target).", synonyms: ["payroll","total payroll","leviable payroll","salary bill"], positives: ["R45,000,000","R12.5M"], negatives: ["Revenue","Net Profit","Training Cost"], zones: ["Tables"], keywords: { must: ["leviable","payroll"], nice: ["remuneration","salary"], neg: ["pension","bonus"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "leviableAmount", fieldType: "currency", validationMin: 0 },
      { label: "TMPS", definition: "Total Measured Procurement Spend — denominator for Procurement scoring (80% target, ICT max 25 pts).", synonyms: ["total measured procurement spend","total procurement spend","TMPS"], positives: ["R80,000,000","R50M"], negatives: ["Revenue","NPAT"], zones: ["Tables","PDF Header"], keywords: { must: ["procurement","spend"], nice: ["total","measured","TMPS"], neg: ["import","exempt"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "tmps", fieldType: "currency", validationMin: 0 },
      { label: "FinancialYearEnd", definition: "End date of the measurement financial year.", synonyms: ["FYE","year end","financial year end"], positives: ["2024-03-31","31 March 2024"], negatives: ["N/A","Start Date"], zones: ["PDF Header","Tables"], keywords: { must: ["year end","financial year"], nice: ["measurement period","FYE"], neg: ["start date"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}", pillarCode: "financials", formulaRole: "financialYearEnd", fieldType: "date" },
      { label: "ShareholderName", definition: "Name of each shareholder / equity holder.", synonyms: ["shareholder","equity holder","owner","member"], positives: ["Thabo Investments (Pty) Ltd","Jane Smith"], negatives: ["N/A","TBC","Employee"], zones: ["Tables","PDF Header"], keywords: { must: ["shareholder","owner"], nice: ["name","entity"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "ownership", formulaRole: "shareholderName", fieldType: "string" },
      { label: "BlackOwnershipPct", definition: "Percentage of equity held by black people — ICT Ownership max 25 pts.", synonyms: ["BO%","BO","black %","HDSA","black ownership"], positives: ["51%","100%","25.1%"], negatives: ["120%","-5%","Foreign Ownership"], zones: ["Tables","PDF Header"], keywords: { must: ["black","ownership"], nice: ["percentage","equity","HDSA"], neg: ["foreign","government"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "BlackWomenOwnershipPct", definition: "Percentage of equity held by black women.", synonyms: ["BWO%","BWO","black women %","black female ownership"], positives: ["30%","51%","10%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black women","black female"], nice: ["ownership","equity"], neg: ["employee","management"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackWomenOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ShareholdingPct", definition: "Percentage of total shares held by each specific shareholder.", synonyms: ["shares %","equity %","shareholding","stake"], positives: ["25%","100%","50%"], negatives: ["150%","-10%"], zones: ["Tables"], keywords: { must: ["share","equity"], nice: ["percentage","stake","holding"], neg: ["profit share"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "shareholdingPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "EmployeeName", definition: "Full name of each employee for Management Control and Employment Equity (ICT EE max 15 pts).", synonyms: ["name","staff name","personnel"], positives: ["Sipho Ndlovu","Jane Doe"], negatives: ["TBC","N/A","Supplier"], zones: ["Tables"], keywords: { must: ["name","employee"], nice: ["first name","surname"], neg: ["supplier","shareholder"] }, pattern: "", pillarCode: "managementControl", formulaRole: "employeeName", fieldType: "string" },
      { label: "EmployeeRace", definition: "Race of each employee (African, Coloured, Indian, White) — ICT sector has 15 pts EE weighting.", synonyms: ["race group","population group","demographic","race"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "managementControl", formulaRole: "employeeRace", fieldType: "string" },
      { label: "EmployeeGender", definition: "Gender of each employee.", synonyms: ["sex","M/F","gender"], positives: ["Male","Female","M","F"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["gender","sex"], nice: ["M/F","male","female"], neg: ["age"] }, pattern: "(Male|Female|M|F)", pillarCode: "managementControl", formulaRole: "employeeGender", fieldType: "string" },
      { label: "EmployeeDesignation", definition: "Occupational level — Board, Executive, Senior, Middle, Junior for ICT MC/EE scoring.", synonyms: ["level","occupational level","position","designation"], positives: ["Top Management","Senior Management","Professionally Qualified"], negatives: ["Intern","Contractor"], zones: ["Tables"], keywords: { must: ["level","designation","occupational"], nice: ["position","grade"], neg: ["department"] }, pattern: "(Board|Executive|Senior|Middle|Junior|Semi|Unskilled)", pillarCode: "managementControl", formulaRole: "employeeDesignation", fieldType: "string" },
      { label: "EmployeeDisability", definition: "Person With Disability status.", synonyms: ["disabled","PWD","disability"], positives: ["Yes","No","Y","N","PWD"], negatives: ["Injury","Sick Leave"], zones: ["Tables"], keywords: { must: ["disability","disabled"], nice: ["PWD"], neg: ["injury","sick"] }, pattern: "(Yes|No|Y|N|PWD)", pillarCode: "managementControl", formulaRole: "employeeDisability", fieldType: "string" },
      { label: "TrainingProgramme", definition: "Name of training programme or learnership.", synonyms: ["programme","course","training name","qualification","learnership"], positives: ["NQF Level 4","ICT Learnership","MICT SETA programme"], negatives: ["N/A","Salary"], zones: ["Tables"], keywords: { must: ["programme","training","course"], nice: ["NQF","learnership","MICT"], neg: ["salary"] }, pattern: "", pillarCode: "skillsDevelopment", formulaRole: "trainingProgramme", fieldType: "string" },
      { label: "TrainingCost", definition: "Amount spent on each training programme — 3.5% of leviable amount target.", synonyms: ["spend","amount","cost","training spend"], positives: ["R50,000","R1,200,000"], negatives: ["R0","-R1000","Salary"], zones: ["Tables"], keywords: { must: ["cost","spend","amount"], nice: ["training","investment"], neg: ["salary","payroll"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "skillsDevelopment", formulaRole: "trainingCost", fieldType: "currency", validationMin: 0 },
      { label: "LearnerRace", definition: "Race of each learner for black vs non-black training split.", synonyms: ["learner race","learner demographic","population group"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","learner"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "skillsDevelopment", formulaRole: "learnerRace", fieldType: "string" },
      { label: "SupplierName", definition: "Registered name of the B-BBEE supplier.", synonyms: ["vendor","service provider","contractor"], positives: ["ABC Supplies (Pty) Ltd","XYZ Services CC"], negatives: ["N/A","Employee"], zones: ["Tables"], keywords: { must: ["supplier","vendor"], nice: ["name","provider"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "preferentialProcurement", formulaRole: "supplierName", fieldType: "string" },
      { label: "SupplierBEELevel", definition: "B-BBEE compliance level of the supplier (1–8) — ICT Procurement max 25 pts.", synonyms: ["B-BBEE level","BEE level","compliance level"], positives: ["1","2","4","8","Level 1","Non-compliant"], negatives: ["9","-1","ISO"], zones: ["Tables"], keywords: { must: ["level","B-BBEE","BEE"], nice: ["compliance","status"], neg: ["ISO"] }, pattern: "Level\\s?[1-8]|Non-[Cc]ompliant", pillarCode: "preferentialProcurement", formulaRole: "supplierBeeLevel", fieldType: "bee_level", validationMin: 0, validationMax: 8 },
      { label: "SupplierSpend", definition: "Amount spent with each supplier — ICT TMPS denominator for Procurement scoring.", synonyms: ["procurement spend","amount","spend","purchase value"], positives: ["R1,200,000","R5M"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["spend","amount"], nice: ["procurement","purchase"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "preferentialProcurement", formulaRole: "supplierSpend", fieldType: "currency", validationMin: 0 },
      { label: "SupplierBlackOwnership", definition: "Percentage black ownership of the supplier for ICT procurement bonus points.", synonyms: ["BO%","black owned","black ownership %"], positives: ["51%","100%","30%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black","ownership"], nice: ["supplier","percentage"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "preferentialProcurement", formulaRole: "supplierBlackOwnership", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ESDAmount", definition: "ESD contribution amount — 2% of NPAT target (ICT ESD max 15 pts).", synonyms: ["contribution amount","ESD spend","amount"], positives: ["R500,000","R2,000,000"], negatives: ["R0","-R100000"], zones: ["Tables"], keywords: { must: ["amount","ESD","contribution"], nice: ["enterprise","supplier development"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdAmount", fieldType: "currency", validationMin: 0 },
      { label: "ESDCategory", definition: "Enterprise Development (ED) or Supplier Development (SD).", synonyms: ["supplier development","enterprise development","ED","SD"], positives: ["Enterprise Development","Supplier Development","ED","SD"], negatives: ["SED","Skills"], zones: ["Tables"], keywords: { must: ["category","enterprise","supplier"], nice: ["development","ED","SD"], neg: ["SED"] }, pattern: "(Enterprise Development|Supplier Development|ED|SD)", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdCategory", fieldType: "string" },
      { label: "SEDAmount", definition: "SED contribution amount — 1% of NPAT target.", synonyms: ["contribution amount","SED spend","amount","donation"], positives: ["R200,000","R1,000,000"], negatives: ["R0","-R50000"], zones: ["Tables"], keywords: { must: ["amount","SED","contribution"], nice: ["CSI","donation"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "socioEconomicDevelopment", formulaRole: "sedAmount", fieldType: "currency", validationMin: 0 },
    ],
  },

  {
    name: "FSC Generic Scorecard",
    key: "toolkit_fsc_generic",
    category: "Toolkit",
    description: "Full B-BBEE scorecard for Financial Services sector entities (banking, insurance, asset management, investment). Lower skills (20 pts) and procurement (20 pts) weightings. Max 105 pts.",
    sectorCode: "FSC",
    sectorType: "Generic",
    maxPoints: 105,
    pillars: ["Ownership", "MC", "EE", "Skills", "Procurement", "ESD", "SED"],
    entities: [
      { label: "TotalRevenue", definition: "Total annual revenue / net interest income / total income for the financial services entity.", synonyms: ["turnover","total revenue","net interest income","total income","premium income"], positives: ["R1,500,000,000","R450M","R82,000,000"], negatives: ["Net Profit","Claims Paid"], zones: ["Tables","PDF Header"], keywords: { must: ["revenue","income","interest"], nice: ["total","annual","net interest"], neg: ["cost","claims","tax"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "financials", formulaRole: "revenue", fieldType: "currency", validationMin: 0 },
      { label: "NPAT", definition: "Net Profit After Tax — FSC ESD target 2% of NPAT, SED target 1% of NPAT.", synonyms: ["net profit after tax","net profit","PAT","net earnings after tax"], positives: ["R250,000,000","R12.5M","-R3,200,000"], negatives: ["Gross Income","EBITDA","Revenue"], zones: ["Tables"], keywords: { must: ["net","profit"], nice: ["NPAT","after tax"], neg: ["gross","operating"] }, pattern: "-?R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "financials", formulaRole: "npat", fieldType: "currency" },
      { label: "LeviableAmount", definition: "Total leviable payroll — FSC Skills target 3.5% of leviable amount (max 20 pts).", synonyms: ["payroll","total payroll","leviable payroll","salary bill"], positives: ["R120,000,000","R45M"], negatives: ["Revenue","Net Profit","Training Cost"], zones: ["Tables"], keywords: { must: ["leviable","payroll"], nice: ["remuneration","salary"], neg: ["pension","bonus"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "financials", formulaRole: "leviableAmount", fieldType: "currency", validationMin: 0 },
      { label: "TMPS", definition: "Total Measured Procurement Spend — FSC procurement max 20 pts (lower than RCOGP).", synonyms: ["total measured procurement spend","total procurement spend","TMPS"], positives: ["R800,000,000","R50M"], negatives: ["Revenue","NPAT"], zones: ["Tables","PDF Header"], keywords: { must: ["procurement","spend"], nice: ["total","measured","TMPS"], neg: ["import","exempt"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "financials", formulaRole: "tmps", fieldType: "currency", validationMin: 0 },
      { label: "FinancialYearEnd", definition: "End date of the measurement financial year.", synonyms: ["FYE","year end","financial year end"], positives: ["2024-03-31","31 December 2024"], negatives: ["N/A"], zones: ["PDF Header","Tables"], keywords: { must: ["year end","financial year"], nice: ["measurement period","FYE"], neg: ["start date"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}", pillarCode: "financials", formulaRole: "financialYearEnd", fieldType: "date" },
      { label: "ShareholderName", definition: "Name of each shareholder / equity holder in the financial services entity.", synonyms: ["shareholder","equity holder","owner","member"], positives: ["Thabo Investments (Pty) Ltd","John Smith"], negatives: ["N/A","TBC"], zones: ["Tables","PDF Header"], keywords: { must: ["shareholder","owner"], nice: ["name","entity"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "ownership", formulaRole: "shareholderName", fieldType: "string" },
      { label: "BlackOwnershipPct", definition: "Percentage of equity held by black people — FSC Ownership max 25 pts.", synonyms: ["BO%","BO","black %","HDSA","black ownership"], positives: ["51%","100%","25.1%"], negatives: ["120%","-5%","Foreign Ownership"], zones: ["Tables","PDF Header"], keywords: { must: ["black","ownership"], nice: ["percentage","equity","HDSA"], neg: ["foreign","government"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "BlackWomenOwnershipPct", definition: "Percentage of equity held by black women.", synonyms: ["BWO%","BWO","black women %","black female ownership"], positives: ["30%","51%","10%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black women","black female"], nice: ["ownership","equity"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackWomenOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ShareholdingPct", definition: "Percentage of total shares held by each shareholder.", synonyms: ["shares %","equity %","shareholding","stake"], positives: ["25%","100%","50%"], negatives: ["150%","-10%"], zones: ["Tables"], keywords: { must: ["share","equity"], nice: ["percentage","stake"], neg: ["profit share"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "shareholdingPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "EmployeeName", definition: "Full name of each employee for FSC Management Control (max 8 pts) and Employment Equity (max 12 pts).", synonyms: ["name","staff name","personnel"], positives: ["Sipho Ndlovu","Jane Doe"], negatives: ["TBC","N/A"], zones: ["Tables"], keywords: { must: ["name","employee"], nice: ["first name","surname"], neg: ["supplier","shareholder"] }, pattern: "", pillarCode: "managementControl", formulaRole: "employeeName", fieldType: "string" },
      { label: "EmployeeRace", definition: "Race of each employee — FSC EE max 12 pts (African, Coloured, Indian, White).", synonyms: ["race group","population group","demographic","race"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "managementControl", formulaRole: "employeeRace", fieldType: "string" },
      { label: "EmployeeGender", definition: "Gender of each employee.", synonyms: ["sex","M/F","gender"], positives: ["Male","Female","M","F"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["gender","sex"], nice: ["M/F"], neg: ["age"] }, pattern: "(Male|Female|M|F)", pillarCode: "managementControl", formulaRole: "employeeGender", fieldType: "string" },
      { label: "EmployeeDesignation", definition: "Occupational level — Board, Executive, Senior, Middle, Junior Management.", synonyms: ["level","occupational level","position","designation"], positives: ["Top Management","Senior Management","Professionally Qualified"], negatives: ["Intern","Contractor"], zones: ["Tables"], keywords: { must: ["level","designation"], nice: ["position","grade"], neg: ["department"] }, pattern: "(Board|Executive|Senior|Middle|Junior|Semi|Unskilled)", pillarCode: "managementControl", formulaRole: "employeeDesignation", fieldType: "string" },
      { label: "EmployeeDisability", definition: "Person With Disability (PWD) status.", synonyms: ["disabled","PWD","disability"], positives: ["Yes","No","Y","N","PWD"], negatives: ["Injury","Sick Leave"], zones: ["Tables"], keywords: { must: ["disability","disabled"], nice: ["PWD"], neg: ["injury","sick"] }, pattern: "(Yes|No|Y|N|PWD)", pillarCode: "managementControl", formulaRole: "employeeDisability", fieldType: "string" },
      { label: "TrainingProgramme", definition: "Name of training programme — FSC Skills max 20 pts (lower than RCOGP).", synonyms: ["programme","course","training name","qualification","INSETA","FSCA"], positives: ["INSETA Learnership","NQF Level 5 Finance","Short Course: Compliance"], negatives: ["N/A","Salary"], zones: ["Tables"], keywords: { must: ["programme","training","course"], nice: ["NQF","INSETA","finance"], neg: ["salary"] }, pattern: "", pillarCode: "skillsDevelopment", formulaRole: "trainingProgramme", fieldType: "string" },
      { label: "TrainingCost", definition: "Amount spent per training — 3.5% of leviable amount target (FSC Skills max 20 pts).", synonyms: ["spend","amount","cost","training spend"], positives: ["R150,000","R2,200,000"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["cost","spend","amount"], nice: ["training","investment"], neg: ["salary","payroll"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "skillsDevelopment", formulaRole: "trainingCost", fieldType: "currency", validationMin: 0 },
      { label: "LearnerRace", definition: "Race of each learner for FSC black vs non-black training spend calculation.", synonyms: ["learner race","learner demographic","population group"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","learner"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "skillsDevelopment", formulaRole: "learnerRace", fieldType: "string" },
      { label: "SupplierName", definition: "Registered name of the B-BBEE supplier.", synonyms: ["vendor","service provider","contractor"], positives: ["ABC Supplies (Pty) Ltd","XYZ Services CC"], negatives: ["N/A","Employee"], zones: ["Tables"], keywords: { must: ["supplier","vendor"], nice: ["name","provider"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "preferentialProcurement", formulaRole: "supplierName", fieldType: "string" },
      { label: "SupplierBEELevel", definition: "B-BBEE level of the supplier — FSC Procurement max 20 pts (lower than RCOGP 27 pts).", synonyms: ["B-BBEE level","BEE level","compliance level"], positives: ["1","2","4","8","Level 1","Non-compliant"], negatives: ["9","-1","ISO"], zones: ["Tables"], keywords: { must: ["level","B-BBEE","BEE"], nice: ["compliance","status"], neg: ["ISO"] }, pattern: "Level\\s?[1-8]|Non-[Cc]ompliant", pillarCode: "preferentialProcurement", formulaRole: "supplierBeeLevel", fieldType: "bee_level", validationMin: 0, validationMax: 8 },
      { label: "SupplierSpend", definition: "Amount spent with each supplier — measured against FSC TMPS.", synonyms: ["procurement spend","amount","spend","purchase value"], positives: ["R1,200,000","R5M"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["spend","amount"], nice: ["procurement","purchase"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "preferentialProcurement", formulaRole: "supplierSpend", fieldType: "currency", validationMin: 0 },
      { label: "SupplierBlackOwnership", definition: "Percentage black ownership of the supplier for FSC procurement bonus points.", synonyms: ["BO%","black owned","black ownership %"], positives: ["51%","100%","30%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black","ownership"], nice: ["supplier","percentage"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "preferentialProcurement", formulaRole: "supplierBlackOwnership", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ESDAmount", definition: "ESD contribution — 2% of NPAT target (FSC ESD max 15 pts).", synonyms: ["contribution amount","ESD spend","amount"], positives: ["R500,000","R5,000,000"], negatives: ["R0","-R100000"], zones: ["Tables"], keywords: { must: ["amount","ESD","contribution"], nice: ["enterprise","supplier development"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdAmount", fieldType: "currency", validationMin: 0 },
      { label: "ESDCategory", definition: "Enterprise Development (ED) or Supplier Development (SD).", synonyms: ["supplier development","enterprise development","ED","SD"], positives: ["Enterprise Development","Supplier Development","ED","SD"], negatives: ["SED","Skills"], zones: ["Tables"], keywords: { must: ["category","enterprise","supplier"], nice: ["development","ED","SD"], neg: ["SED"] }, pattern: "(Enterprise Development|Supplier Development|ED|SD)", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdCategory", fieldType: "string" },
      { label: "SEDAmount", definition: "SED contribution — 1% of NPAT target (FSC SED max 5 pts).", synonyms: ["contribution amount","SED spend","amount","donation"], positives: ["R200,000","R2,000,000"], negatives: ["R0","-R50000"], zones: ["Tables"], keywords: { must: ["amount","SED","contribution"], nice: ["CSI","donation"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K|B)?", pillarCode: "socioEconomicDevelopment", formulaRole: "sedAmount", fieldType: "currency", validationMin: 0 },
    ],
  },

  {
    name: "AGRI Generic Scorecard",
    key: "toolkit_agri_generic",
    category: "Toolkit",
    description: "Full B-BBEE scorecard for Agriculture sector entities (farming, agri-processing, agribusiness). Uses AgriBEE Code with adjusted pillar weights. Max 114 pts.",
    sectorCode: "AGRI",
    sectorType: "Generic",
    maxPoints: 114,
    pillars: ["Ownership", "MC", "EE", "Skills", "Procurement", "ESD", "SED"],
    entities: [
      { label: "TotalRevenue", definition: "Total annual revenue / turnover for the agricultural entity.", synonyms: ["turnover","total revenue","annual revenue","farm income","crop sales","produce revenue"], positives: ["R45,000,000","R120M","R8,200,000"], negatives: ["Net Profit","Government Grant"], zones: ["Tables","PDF Header"], keywords: { must: ["revenue","turnover","income"], nice: ["annual","total","farm","produce"], neg: ["cost","expense","grant"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "revenue", fieldType: "currency", validationMin: 0 },
      { label: "NPAT", definition: "Net Profit After Tax — AgriBEE ESD target 2% of NPAT, SED target 1% of NPAT.", synonyms: ["net profit after tax","net profit","PAT","net income"], positives: ["R5,000,000","R12.5M","-R3,200,000"], negatives: ["Gross Profit","Revenue"], zones: ["Tables"], keywords: { must: ["net","profit"], nice: ["NPAT","after tax"], neg: ["gross","operating"] }, pattern: "-?R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "npat", fieldType: "currency" },
      { label: "LeviableAmount", definition: "Total leviable payroll — AgriBEE Skills target 3.5% (max 25 pts).", synonyms: ["payroll","total payroll","leviable payroll","salary bill","farm wages"], positives: ["R12,000,000","R5M"], negatives: ["Revenue","Net Profit","Training Cost"], zones: ["Tables"], keywords: { must: ["leviable","payroll"], nice: ["remuneration","wages","salary"], neg: ["pension","bonus"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "leviableAmount", fieldType: "currency", validationMin: 0 },
      { label: "TMPS", definition: "Total Measured Procurement Spend — AgriBEE Procurement max 25 pts.", synonyms: ["total measured procurement spend","TMPS","total procurement spend"], positives: ["R30,000,000","R15M"], negatives: ["Revenue","NPAT"], zones: ["Tables","PDF Header"], keywords: { must: ["procurement","spend"], nice: ["total","measured","TMPS"], neg: ["import","exempt"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "tmps", fieldType: "currency", validationMin: 0 },
      { label: "FinancialYearEnd", definition: "End date of the AgriBEE measurement financial year.", synonyms: ["FYE","year end","financial year end"], positives: ["2024-03-31","28 February 2024"], negatives: ["N/A"], zones: ["PDF Header","Tables"], keywords: { must: ["year end","financial year"], nice: ["measurement period","FYE"], neg: ["start date"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}", pillarCode: "financials", formulaRole: "financialYearEnd", fieldType: "date" },
      { label: "ShareholderName", definition: "Name of each shareholder / equity holder.", synonyms: ["shareholder","equity holder","owner","member","partner"], positives: ["Thabo Farms (Pty) Ltd","John Smith","ABC Agricultural Trust"], negatives: ["N/A","TBC"], zones: ["Tables","PDF Header"], keywords: { must: ["shareholder","owner"], nice: ["name","entity","partner"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "ownership", formulaRole: "shareholderName", fieldType: "string" },
      { label: "BlackOwnershipPct", definition: "Percentage of equity held by black people — AgriBEE Ownership max 25 pts.", synonyms: ["BO%","BO","black %","HDSA","black ownership","black farmers"], positives: ["51%","100%","25.1%"], negatives: ["120%","-5%","Foreign Ownership"], zones: ["Tables","PDF Header"], keywords: { must: ["black","ownership"], nice: ["percentage","equity","HDSA","farmers"], neg: ["foreign","government"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "BlackWomenOwnershipPct", definition: "Percentage of equity held by black women.", synonyms: ["BWO%","BWO","black women %","black female ownership"], positives: ["30%","51%","10%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black women","black female"], nice: ["ownership","equity"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackWomenOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ShareholdingPct", definition: "Percentage of total shares held by each shareholder.", synonyms: ["shares %","equity %","shareholding","stake"], positives: ["25%","100%","50%"], negatives: ["150%","-10%"], zones: ["Tables"], keywords: { must: ["share","equity"], nice: ["percentage","stake"], neg: ["profit share"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "shareholdingPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "EmployeeName", definition: "Full name of each employee — AgriBEE MC max 8 pts, EE max 11 pts.", synonyms: ["name","staff name","worker","farm worker"], positives: ["Sipho Ndlovu","Jane Doe"], negatives: ["TBC","N/A"], zones: ["Tables"], keywords: { must: ["name","employee"], nice: ["first name","surname","worker"], neg: ["supplier","shareholder"] }, pattern: "", pillarCode: "managementControl", formulaRole: "employeeName", fieldType: "string" },
      { label: "EmployeeRace", definition: "Race of each employee (African, Coloured, Indian, White) — AgriBEE EE max 11 pts.", synonyms: ["race group","population group","demographic","race"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "managementControl", formulaRole: "employeeRace", fieldType: "string" },
      { label: "EmployeeGender", definition: "Gender of each employee.", synonyms: ["sex","M/F","gender"], positives: ["Male","Female","M","F"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["gender","sex"], nice: ["M/F"], neg: ["age"] }, pattern: "(Male|Female|M|F)", pillarCode: "managementControl", formulaRole: "employeeGender", fieldType: "string" },
      { label: "EmployeeDesignation", definition: "Occupational level for AgriBEE MC/EE scoring.", synonyms: ["level","occupational level","position","designation"], positives: ["Top Management","Senior Management","Professionally Qualified"], negatives: ["Intern","Seasonal Worker"], zones: ["Tables"], keywords: { must: ["level","designation"], nice: ["position","grade"], neg: ["department","seasonal"] }, pattern: "(Board|Executive|Senior|Middle|Junior|Semi|Unskilled)", pillarCode: "managementControl", formulaRole: "employeeDesignation", fieldType: "string" },
      { label: "EmployeeDisability", definition: "PWD (Person With Disability) status.", synonyms: ["disabled","PWD","disability"], positives: ["Yes","No","Y","N","PWD"], negatives: ["Injury","Sick Leave"], zones: ["Tables"], keywords: { must: ["disability","disabled"], nice: ["PWD"], neg: ["injury","sick"] }, pattern: "(Yes|No|Y|N|PWD)", pillarCode: "managementControl", formulaRole: "employeeDisability", fieldType: "string" },
      { label: "TrainingProgramme", definition: "Name of training programme — AgriBEE Skills max 25 pts (includes AGRISETA learnerships).", synonyms: ["programme","course","training name","AGRISETA","learnership"], positives: ["AGRISETA Learnership","NQF Level 3 Agri","Farmworker Skills Programme"], negatives: ["N/A","Salary"], zones: ["Tables"], keywords: { must: ["programme","training","course"], nice: ["AGRISETA","NQF","learnership"], neg: ["salary"] }, pattern: "", pillarCode: "skillsDevelopment", formulaRole: "trainingProgramme", fieldType: "string" },
      { label: "TrainingCost", definition: "Amount spent per training — 3.5% of leviable amount target.", synonyms: ["spend","amount","cost","training spend"], positives: ["R50,000","R200,000"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["cost","spend","amount"], nice: ["training","investment"], neg: ["salary","payroll"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "skillsDevelopment", formulaRole: "trainingCost", fieldType: "currency", validationMin: 0 },
      { label: "LearnerRace", definition: "Race of each learner for black vs non-black training spend in AgriBEE Skills.", synonyms: ["learner race","learner demographic","population group"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","learner"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "skillsDevelopment", formulaRole: "learnerRace", fieldType: "string" },
      { label: "SupplierName", definition: "Name of the B-BBEE supplier.", synonyms: ["vendor","service provider","contractor","input supplier"], positives: ["ABC Agri Supplies (Pty) Ltd","Farm Equipment CC"], negatives: ["N/A","Employee"], zones: ["Tables"], keywords: { must: ["supplier","vendor"], nice: ["name","provider","input"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "preferentialProcurement", formulaRole: "supplierName", fieldType: "string" },
      { label: "SupplierBEELevel", definition: "B-BBEE level of the supplier — AgriBEE Procurement max 25 pts.", synonyms: ["B-BBEE level","BEE level","compliance level"], positives: ["1","2","4","8","Level 1","Non-compliant"], negatives: ["9","-1","ISO"], zones: ["Tables"], keywords: { must: ["level","B-BBEE","BEE"], nice: ["compliance","status"], neg: ["ISO"] }, pattern: "Level\\s?[1-8]|Non-[Cc]ompliant", pillarCode: "preferentialProcurement", formulaRole: "supplierBeeLevel", fieldType: "bee_level", validationMin: 0, validationMax: 8 },
      { label: "SupplierSpend", definition: "Amount spent with each supplier measured against AGRI TMPS.", synonyms: ["procurement spend","amount","spend","purchase value"], positives: ["R500,000","R2M"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["spend","amount"], nice: ["procurement","purchase"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "preferentialProcurement", formulaRole: "supplierSpend", fieldType: "currency", validationMin: 0 },
      { label: "SupplierBlackOwnership", definition: "Percentage black ownership of the supplier.", synonyms: ["BO%","black owned","black ownership %"], positives: ["51%","100%","30%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black","ownership"], nice: ["supplier","percentage"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "preferentialProcurement", formulaRole: "supplierBlackOwnership", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ESDAmount", definition: "ESD contribution — 2% of NPAT target (AgriBEE ESD max 15 pts).", synonyms: ["contribution amount","ESD spend","amount"], positives: ["R100,000","R500,000"], negatives: ["R0","-R100000"], zones: ["Tables"], keywords: { must: ["amount","ESD","contribution"], nice: ["enterprise","supplier development"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdAmount", fieldType: "currency", validationMin: 0 },
      { label: "ESDCategory", definition: "Enterprise Development (ED) or Supplier Development (SD).", synonyms: ["supplier development","enterprise development","ED","SD"], positives: ["Enterprise Development","Supplier Development","ED","SD"], negatives: ["SED","Skills"], zones: ["Tables"], keywords: { must: ["category","enterprise","supplier"], nice: ["development","ED","SD"], neg: ["SED"] }, pattern: "(Enterprise Development|Supplier Development|ED|SD)", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdCategory", fieldType: "string" },
      { label: "SEDAmount", definition: "SED contribution — 1% of NPAT target (AgriBEE SED max 5 pts).", synonyms: ["contribution amount","SED spend","amount","donation"], positives: ["R50,000","R500,000"], negatives: ["R0","-R50000"], zones: ["Tables"], keywords: { must: ["amount","SED","contribution"], nice: ["CSI","donation","community"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "socioEconomicDevelopment", formulaRole: "sedAmount", fieldType: "currency", validationMin: 0 },
    ],
  },

  {
    name: "RCOGP QSE Scorecard",
    key: "toolkit_rcogp_qse",
    category: "Toolkit",
    description: "Full B-BBEE scorecard for RCOGP Qualifying Small Enterprises (turnover R10M–R50M). No separate Employment Equity pillar — combined Management Control (19 pts). Max 124 pts.",
    sectorCode: "RCOGP",
    sectorType: "QSE",
    maxPoints: 124,
    pillars: ["Ownership", "MC+EE", "Skills", "Procurement", "ESD", "SED"],
    entities: [
      { label: "TotalRevenue", definition: "Total annual revenue — QSE classification requires R10M–R50M turnover.", synonyms: ["turnover","total revenue","annual revenue","sales","gross revenue"], positives: ["R25,000,000","R15M","R48,000,000"], negatives: ["Net Profit","Cost of Sales"], zones: ["Tables","PDF Header"], keywords: { must: ["revenue","turnover"], nice: ["annual","total","QSE"], neg: ["cost","expense"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "revenue", fieldType: "currency", validationMin: 10000000, validationMax: 50000000 },
      { label: "NPAT", definition: "Net Profit After Tax — QSE ESD target 2% of NPAT, SED target 1% of NPAT.", synonyms: ["net profit after tax","net profit","PAT","net income"], positives: ["R2,500,000","R5M","-R500,000"], negatives: ["Gross Profit","Revenue"], zones: ["Tables"], keywords: { must: ["net","profit"], nice: ["NPAT","after tax"], neg: ["gross","operating"] }, pattern: "-?R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "npat", fieldType: "currency" },
      { label: "LeviableAmount", definition: "Total leviable payroll — QSE Skills target 3.5% (max 25 pts).", synonyms: ["payroll","total payroll","leviable payroll","salary bill"], positives: ["R5,000,000","R12M"], negatives: ["Revenue","Net Profit","Training Cost"], zones: ["Tables"], keywords: { must: ["leviable","payroll"], nice: ["remuneration","salary"], neg: ["pension","bonus"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "leviableAmount", fieldType: "currency", validationMin: 0 },
      { label: "TMPS", definition: "Total Measured Procurement Spend — QSE Procurement max 25 pts.", synonyms: ["total measured procurement spend","total procurement spend","TMPS"], positives: ["R20,000,000","R10M"], negatives: ["Revenue","NPAT"], zones: ["Tables","PDF Header"], keywords: { must: ["procurement","spend"], nice: ["total","measured","TMPS"], neg: ["import","exempt"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "tmps", fieldType: "currency", validationMin: 0 },
      { label: "FinancialYearEnd", definition: "End date of the QSE measurement financial year.", synonyms: ["FYE","year end","financial year end"], positives: ["2024-03-31","31 March 2024"], negatives: ["N/A"], zones: ["PDF Header","Tables"], keywords: { must: ["year end","financial year"], nice: ["measurement period","FYE"], neg: ["start date"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}", pillarCode: "financials", formulaRole: "financialYearEnd", fieldType: "date" },
      { label: "ShareholderName", definition: "Name of each shareholder / equity holder in the QSE entity.", synonyms: ["shareholder","equity holder","owner","member"], positives: ["Thabo Investments (Pty) Ltd","John Smith"], negatives: ["N/A","TBC"], zones: ["Tables","PDF Header"], keywords: { must: ["shareholder","owner"], nice: ["name","entity"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "ownership", formulaRole: "shareholderName", fieldType: "string" },
      { label: "BlackOwnershipPct", definition: "Percentage of equity held by black people — QSE Ownership max 25 pts.", synonyms: ["BO%","BO","black %","HDSA","black ownership"], positives: ["51%","100%","25.1%"], negatives: ["120%","-5%"], zones: ["Tables","PDF Header"], keywords: { must: ["black","ownership"], nice: ["percentage","equity","HDSA"], neg: ["foreign","government"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "BlackWomenOwnershipPct", definition: "Percentage of equity held by black women.", synonyms: ["BWO%","BWO","black women %","black female ownership"], positives: ["30%","51%","10%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black women","black female"], nice: ["ownership","equity"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackWomenOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ShareholdingPct", definition: "Percentage of total shares held by each shareholder.", synonyms: ["shares %","equity %","shareholding","stake"], positives: ["25%","100%","50%"], negatives: ["150%","-10%"], zones: ["Tables"], keywords: { must: ["share","equity"], nice: ["percentage","stake"], neg: ["profit share"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "shareholdingPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "EmployeeName", definition: "Full name of each employee — QSE MC is combined at 19 pts (no separate EE pillar).", synonyms: ["name","staff name","personnel"], positives: ["Sipho Ndlovu","Jane Doe"], negatives: ["TBC","N/A"], zones: ["Tables"], keywords: { must: ["name","employee"], nice: ["first name","surname"], neg: ["supplier","shareholder"] }, pattern: "", pillarCode: "managementControl", formulaRole: "employeeName", fieldType: "string" },
      { label: "EmployeeRace", definition: "Race of each employee — QSE combined MC+EE pillar max 19 pts.", synonyms: ["race group","population group","demographic","race"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "managementControl", formulaRole: "employeeRace", fieldType: "string" },
      { label: "EmployeeGender", definition: "Gender of each employee.", synonyms: ["sex","M/F","gender"], positives: ["Male","Female","M","F"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["gender","sex"], nice: ["M/F"], neg: ["age"] }, pattern: "(Male|Female|M|F)", pillarCode: "managementControl", formulaRole: "employeeGender", fieldType: "string" },
      { label: "EmployeeDesignation", definition: "Occupational level for QSE combined MC+EE scoring (19 pts max, no separate EE).", synonyms: ["level","occupational level","position","designation"], positives: ["Top Management","Senior Management","Middle Management"], negatives: ["Intern","Contractor"], zones: ["Tables"], keywords: { must: ["level","designation"], nice: ["position","grade"], neg: ["department"] }, pattern: "(Board|Executive|Senior|Middle|Junior|Semi|Unskilled)", pillarCode: "managementControl", formulaRole: "employeeDesignation", fieldType: "string" },
      { label: "EmployeeDisability", definition: "PWD (Person With Disability) status.", synonyms: ["disabled","PWD","disability"], positives: ["Yes","No","Y","N","PWD"], negatives: ["Injury","Sick Leave"], zones: ["Tables"], keywords: { must: ["disability","disabled"], nice: ["PWD"], neg: ["injury","sick"] }, pattern: "(Yes|No|Y|N|PWD)", pillarCode: "managementControl", formulaRole: "employeeDisability", fieldType: "string" },
      { label: "TrainingProgramme", definition: "Name of training programme — QSE Skills max 25 pts.", synonyms: ["programme","course","training name","qualification","learnership"], positives: ["NQF Level 4","Learnership Programme","Short Course"], negatives: ["N/A","Salary"], zones: ["Tables"], keywords: { must: ["programme","training","course"], nice: ["qualification","NQF","learnership"], neg: ["salary"] }, pattern: "", pillarCode: "skillsDevelopment", formulaRole: "trainingProgramme", fieldType: "string" },
      { label: "TrainingCost", definition: "Amount spent per training — 3.5% of leviable amount target (QSE Skills max 25 pts).", synonyms: ["spend","amount","cost","training spend"], positives: ["R25,000","R150,000"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["cost","spend","amount"], nice: ["training","investment"], neg: ["salary","payroll"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "skillsDevelopment", formulaRole: "trainingCost", fieldType: "currency", validationMin: 0 },
      { label: "LearnerRace", definition: "Race of each learner for QSE black training spend calculation.", synonyms: ["learner race","learner demographic","population group"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","learner"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "skillsDevelopment", formulaRole: "learnerRace", fieldType: "string" },
      { label: "SupplierName", definition: "Name of the B-BBEE supplier.", synonyms: ["vendor","service provider","contractor"], positives: ["ABC Supplies (Pty) Ltd","XYZ Services CC"], negatives: ["N/A","Employee"], zones: ["Tables"], keywords: { must: ["supplier","vendor"], nice: ["name","provider"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "preferentialProcurement", formulaRole: "supplierName", fieldType: "string" },
      { label: "SupplierBEELevel", definition: "B-BBEE level of the supplier — QSE Procurement max 25 pts.", synonyms: ["B-BBEE level","BEE level","compliance level"], positives: ["1","2","4","8","Level 1","Non-compliant"], negatives: ["9","-1","ISO"], zones: ["Tables"], keywords: { must: ["level","B-BBEE","BEE"], nice: ["compliance","status"], neg: ["ISO"] }, pattern: "Level\\s?[1-8]|Non-[Cc]ompliant", pillarCode: "preferentialProcurement", formulaRole: "supplierBeeLevel", fieldType: "bee_level", validationMin: 0, validationMax: 8 },
      { label: "SupplierSpend", definition: "Amount spent with each supplier — QSE TMPS denominator.", synonyms: ["procurement spend","amount","spend","purchase value"], positives: ["R500,000","R2M"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["spend","amount"], nice: ["procurement","purchase"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "preferentialProcurement", formulaRole: "supplierSpend", fieldType: "currency", validationMin: 0 },
      { label: "SupplierBlackOwnership", definition: "Percentage black ownership of the supplier for QSE procurement bonus.", synonyms: ["BO%","black owned","black ownership %"], positives: ["51%","100%","30%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black","ownership"], nice: ["supplier","percentage"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "preferentialProcurement", formulaRole: "supplierBlackOwnership", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ESDAmount", definition: "ESD contribution — 2% of NPAT target (QSE ESD max 25 pts — higher than Generic).", synonyms: ["contribution amount","ESD spend","amount"], positives: ["R200,000","R1,000,000"], negatives: ["R0","-R100000"], zones: ["Tables"], keywords: { must: ["amount","ESD","contribution"], nice: ["enterprise","supplier development"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdAmount", fieldType: "currency", validationMin: 0 },
      { label: "ESDCategory", definition: "Enterprise Development (ED) or Supplier Development (SD).", synonyms: ["supplier development","enterprise development","ED","SD"], positives: ["Enterprise Development","Supplier Development","ED","SD"], negatives: ["SED","Skills"], zones: ["Tables"], keywords: { must: ["category","enterprise","supplier"], nice: ["development","ED","SD"], neg: ["SED"] }, pattern: "(Enterprise Development|Supplier Development|ED|SD)", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdCategory", fieldType: "string" },
      { label: "SEDAmount", definition: "SED contribution — 1% of NPAT target (QSE SED max 5 pts).", synonyms: ["contribution amount","SED spend","amount","donation"], positives: ["R50,000","R200,000"], negatives: ["R0","-R50000"], zones: ["Tables"], keywords: { must: ["amount","SED","contribution"], nice: ["CSI","donation"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "socioEconomicDevelopment", formulaRole: "sedAmount", fieldType: "currency", validationMin: 0 },
    ],
  },

  {
    name: "ICT QSE Scorecard",
    key: "toolkit_ict_qse",
    category: "Toolkit",
    description: "Full B-BBEE scorecard for ICT Qualifying Small Enterprises (turnover R10M–R50M, ICT sector). Combined Management Control (19 pts), no separate EE pillar. Max 124 pts.",
    sectorCode: "ICT",
    sectorType: "QSE",
    maxPoints: 124,
    pillars: ["Ownership", "MC+EE", "Skills", "Procurement", "ESD", "SED"],
    entities: [
      { label: "TotalRevenue", definition: "Total annual revenue — ICT QSE classification R10M–R50M.", synonyms: ["turnover","total revenue","annual revenue","service revenue","software revenue"], positives: ["R25,000,000","R15M","R48,000,000"], negatives: ["Net Profit","Cost of Sales"], zones: ["Tables","PDF Header"], keywords: { must: ["revenue","turnover"], nice: ["annual","total","ICT","QSE"], neg: ["cost","expense"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "revenue", fieldType: "currency", validationMin: 10000000, validationMax: 50000000 },
      { label: "NPAT", definition: "Net Profit After Tax — ICT QSE ESD 2% target, SED 1% target.", synonyms: ["net profit after tax","net profit","PAT","net income"], positives: ["R2,500,000","R5M","-R500,000"], negatives: ["Gross Profit","Revenue"], zones: ["Tables"], keywords: { must: ["net","profit"], nice: ["NPAT","after tax"], neg: ["gross","operating"] }, pattern: "-?R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "npat", fieldType: "currency" },
      { label: "LeviableAmount", definition: "Total leviable payroll — ICT QSE Skills target 3.5% (max 25 pts).", synonyms: ["payroll","total payroll","leviable payroll","salary bill"], positives: ["R5,000,000","R12M"], negatives: ["Revenue","Net Profit","Training Cost"], zones: ["Tables"], keywords: { must: ["leviable","payroll"], nice: ["remuneration","salary"], neg: ["pension","bonus"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "leviableAmount", fieldType: "currency", validationMin: 0 },
      { label: "TMPS", definition: "Total Measured Procurement Spend — ICT QSE Procurement max 25 pts.", synonyms: ["total measured procurement spend","TMPS","total procurement spend"], positives: ["R20,000,000","R10M"], negatives: ["Revenue","NPAT"], zones: ["Tables","PDF Header"], keywords: { must: ["procurement","spend"], nice: ["total","measured","TMPS"], neg: ["import","exempt"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "financials", formulaRole: "tmps", fieldType: "currency", validationMin: 0 },
      { label: "FinancialYearEnd", definition: "End date of the ICT QSE measurement financial year.", synonyms: ["FYE","year end","financial year end"], positives: ["2024-03-31","31 March 2024"], negatives: ["N/A"], zones: ["PDF Header","Tables"], keywords: { must: ["year end","financial year"], nice: ["measurement period","FYE"], neg: ["start date"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}", pillarCode: "financials", formulaRole: "financialYearEnd", fieldType: "date" },
      { label: "ShareholderName", definition: "Name of each shareholder / equity holder.", synonyms: ["shareholder","equity holder","owner","member"], positives: ["Thabo Tech (Pty) Ltd","Jane Smith"], negatives: ["N/A","TBC"], zones: ["Tables","PDF Header"], keywords: { must: ["shareholder","owner"], nice: ["name","entity"], neg: ["employee","supplier"] }, pattern: "", pillarCode: "ownership", formulaRole: "shareholderName", fieldType: "string" },
      { label: "BlackOwnershipPct", definition: "Percentage of equity held by black people — ICT QSE Ownership max 25 pts.", synonyms: ["BO%","BO","black %","HDSA","black ownership"], positives: ["51%","100%","25.1%"], negatives: ["120%","-5%"], zones: ["Tables","PDF Header"], keywords: { must: ["black","ownership"], nice: ["percentage","equity","HDSA"], neg: ["foreign","government"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "BlackWomenOwnershipPct", definition: "Percentage of equity held by black women.", synonyms: ["BWO%","BWO","black women %","black female ownership"], positives: ["30%","51%","10%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black women","black female"], nice: ["ownership","equity"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "blackWomenOwnershipPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ShareholdingPct", definition: "Percentage of total shares held by each shareholder.", synonyms: ["shares %","equity %","shareholding","stake"], positives: ["25%","100%","50%"], negatives: ["150%","-10%"], zones: ["Tables"], keywords: { must: ["share","equity"], nice: ["percentage","stake"], neg: ["profit share"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "ownership", formulaRole: "shareholdingPct", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "EmployeeName", definition: "Full name of each employee — ICT QSE combined MC+EE max 19 pts.", synonyms: ["name","staff name","personnel"], positives: ["Sipho Ndlovu","Jane Doe"], negatives: ["TBC","N/A"], zones: ["Tables"], keywords: { must: ["name","employee"], nice: ["first name","surname"], neg: ["supplier","shareholder"] }, pattern: "", pillarCode: "managementControl", formulaRole: "employeeName", fieldType: "string" },
      { label: "EmployeeRace", definition: "Race of each employee — ICT QSE combined MC+EE 19 pts (no separate EE pillar).", synonyms: ["race group","population group","demographic","race"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "managementControl", formulaRole: "employeeRace", fieldType: "string" },
      { label: "EmployeeGender", definition: "Gender of each employee.", synonyms: ["sex","M/F","gender"], positives: ["Male","Female","M","F"], negatives: ["Unknown"], zones: ["Tables"], keywords: { must: ["gender","sex"], nice: ["M/F"], neg: ["age"] }, pattern: "(Male|Female|M|F)", pillarCode: "managementControl", formulaRole: "employeeGender", fieldType: "string" },
      { label: "EmployeeDesignation", definition: "Occupational level for ICT QSE MC+EE scoring.", synonyms: ["level","occupational level","position","designation"], positives: ["Top Management","Senior Management","Middle Management"], negatives: ["Intern","Contractor"], zones: ["Tables"], keywords: { must: ["level","designation"], nice: ["position","grade"], neg: ["department"] }, pattern: "(Board|Executive|Senior|Middle|Junior|Semi|Unskilled)", pillarCode: "managementControl", formulaRole: "employeeDesignation", fieldType: "string" },
      { label: "EmployeeDisability", definition: "PWD status.", synonyms: ["disabled","PWD","disability"], positives: ["Yes","No","Y","N","PWD"], negatives: ["Injury","Sick Leave"], zones: ["Tables"], keywords: { must: ["disability","disabled"], nice: ["PWD"], neg: ["injury","sick"] }, pattern: "(Yes|No|Y|N|PWD)", pillarCode: "managementControl", formulaRole: "employeeDisability", fieldType: "string" },
      { label: "TrainingProgramme", definition: "Name of training or learnership — ICT QSE Skills max 25 pts.", synonyms: ["programme","course","training name","qualification","learnership","MICT SETA"], positives: ["NQF Level 4","MICT SETA Learnership","IT Support Short Course"], negatives: ["N/A","Salary"], zones: ["Tables"], keywords: { must: ["programme","training","course"], nice: ["NQF","MICT","learnership"], neg: ["salary"] }, pattern: "", pillarCode: "skillsDevelopment", formulaRole: "trainingProgramme", fieldType: "string" },
      { label: "TrainingCost", definition: "Amount spent per training — 3.5% of leviable amount target.", synonyms: ["spend","amount","cost","training spend"], positives: ["R25,000","R150,000"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["cost","spend","amount"], nice: ["training","investment"], neg: ["salary","payroll"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "skillsDevelopment", formulaRole: "trainingCost", fieldType: "currency", validationMin: 0 },
      { label: "LearnerRace", definition: "Race of each learner for ICT QSE black training spend calculation.", synonyms: ["learner race","learner demographic","population group"], positives: ["African","Coloured","Indian","White"], negatives: ["Other","Unknown"], zones: ["Tables"], keywords: { must: ["race","population group"], nice: ["demographic","learner"], neg: ["nationality"] }, pattern: "(African|Coloured|Indian|White)", pillarCode: "skillsDevelopment", formulaRole: "learnerRace", fieldType: "string" },
      { label: "SupplierName", definition: "Name of the B-BBEE supplier.", synonyms: ["vendor","service provider","contractor"], positives: ["ABC Supplies (Pty) Ltd","XYZ Services CC"], negatives: ["N/A","Employee"], zones: ["Tables"], keywords: { must: ["supplier","vendor"], nice: ["name","provider"], neg: ["employee","shareholder"] }, pattern: "", pillarCode: "preferentialProcurement", formulaRole: "supplierName", fieldType: "string" },
      { label: "SupplierBEELevel", definition: "B-BBEE level of the supplier — ICT QSE Procurement max 25 pts.", synonyms: ["B-BBEE level","BEE level","compliance level"], positives: ["1","2","4","8","Level 1","Non-compliant"], negatives: ["9","-1","ISO"], zones: ["Tables"], keywords: { must: ["level","B-BBEE","BEE"], nice: ["compliance","status"], neg: ["ISO"] }, pattern: "Level\\s?[1-8]|Non-[Cc]ompliant", pillarCode: "preferentialProcurement", formulaRole: "supplierBeeLevel", fieldType: "bee_level", validationMin: 0, validationMax: 8 },
      { label: "SupplierSpend", definition: "Amount spent with each supplier — ICT QSE TMPS denominator.", synonyms: ["procurement spend","amount","spend","purchase value"], positives: ["R500,000","R2M"], negatives: ["R0","Salary"], zones: ["Tables"], keywords: { must: ["spend","amount"], nice: ["procurement","purchase"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "preferentialProcurement", formulaRole: "supplierSpend", fieldType: "currency", validationMin: 0 },
      { label: "SupplierBlackOwnership", definition: "Percentage black ownership of the supplier for ICT QSE procurement bonus.", synonyms: ["BO%","black owned","black ownership %"], positives: ["51%","100%","30%"], negatives: ["120%","-5%"], zones: ["Tables"], keywords: { must: ["black","ownership"], nice: ["supplier","percentage"], neg: ["employee"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", pillarCode: "preferentialProcurement", formulaRole: "supplierBlackOwnership", fieldType: "percentage", validationMin: 0, validationMax: 100 },
      { label: "ESDAmount", definition: "ESD contribution — 2% of NPAT target (ICT QSE ESD max 25 pts — higher than Generic).", synonyms: ["contribution amount","ESD spend","amount"], positives: ["R200,000","R1,000,000"], negatives: ["R0","-R100000"], zones: ["Tables"], keywords: { must: ["amount","ESD","contribution"], nice: ["enterprise","supplier development"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdAmount", fieldType: "currency", validationMin: 0 },
      { label: "ESDCategory", definition: "Enterprise Development (ED) or Supplier Development (SD).", synonyms: ["supplier development","enterprise development","ED","SD"], positives: ["Enterprise Development","Supplier Development","ED","SD"], negatives: ["SED","Skills"], zones: ["Tables"], keywords: { must: ["category","enterprise","supplier"], nice: ["development","ED","SD"], neg: ["SED"] }, pattern: "(Enterprise Development|Supplier Development|ED|SD)", pillarCode: "enterpriseSupplierDevelopment", formulaRole: "esdCategory", fieldType: "string" },
      { label: "SEDAmount", definition: "SED contribution — 1% of NPAT target (ICT QSE SED max 5 pts).", synonyms: ["contribution amount","SED spend","amount","donation"], positives: ["R50,000","R200,000"], negatives: ["R0","-R50000"], zones: ["Tables"], keywords: { must: ["amount","SED","contribution"], nice: ["CSI","donation"], neg: ["salary","training"] }, pattern: "R\\s?[\\d,. ]+(M|K)?", pillarCode: "socioEconomicDevelopment", formulaRole: "sedAmount", fieldType: "currency", validationMin: 0 },
    ],
  },
];
