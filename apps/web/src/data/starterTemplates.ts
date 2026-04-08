export interface StarterEntity {
  label: string;
  definition: string;
  synonyms: string[];
  positives: string[];
  negatives: string[];
  zones: string[];
  keywords: { must: string[]; nice: string[]; neg: string[] };
  pattern: string;
}

export interface StarterTemplate {
  name: string;
  key: string;
  category: string;
  description: string;
  entities: StarterEntity[];
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
];
