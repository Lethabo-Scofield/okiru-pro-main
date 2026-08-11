import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export interface TemplateEntity {
  label: string;
  definition: string;
  synonyms: string[];
  positives: string[];
  negatives: string[];
  zones: string[];
  keywords: { must: string[]; nice: string[]; neg: string[] };
  pattern: string;
}

export interface CalculatorConfig {
  /** Populated by sectorConfigToCalculatorConfig — drives pillar config guards. */
  sectorCode?: string;
  scorecardType?: string;
  totalMaxPoints: number;
  /**
   * How many members of each `chooseOneGroup` are elected (default 1).
   * Transport QSE: { transport_qse_elective: 4 } — any four of seven elements.
   */
  electiveGroupSizes?: Record<string, number>;
  ownership: {
    votingRightsMax: number;
    womenBonusMax: number;
    /** ESOP/BBOS scheme bonus points — awarded only when scheme rows exist (Transport). */
    esopBonusMaxPts?: number;
    economicInterestMax: number;
    netValueMax: number;
    targetEconomicInterest: number;
    subMinNetValue: number;
    /** Sector-specific targets — populated by sectorConfigToCalculatorConfig */
    votingRightsTarget?: number;
    womenVotingTarget?: number;
    womenEIMax?: number;
    womenEITarget?: number;
    newEntrantsMax?: number;
    newEntrantsTarget?: number;
    designatedGroupsMax?: number;
    designatedGroupsTarget?: number;
    /**
     * Sectors where black-women voting rights / black-women economic interest are
     * BONUS points on top of the element weighting rather than part of it. Default
     * (absent/false) is the generic Codes treatment, where both are base
     * indicators. Transport sets these so the scorecard can show ownership as
     * "25 base + 3 bonus" instead of a merged 28.
     */
    womenVotingIsBonus?: boolean;
    womenEIIsBonus?: boolean;
    /**
     * QSE-only: the toolkit collapses "Black New Entrants" and "Designated Groups"
     * into a single combined economic-interest indicator. When true, a shareholder
     * qualifies for the designated-group indicator on EITHER criterion
     * (isDesignatedGroup OR blackNewEntrant), and the separate new-entrants slot is 0.
     * (TOOLKIT-RESOLVED.md Q8; RCOGP QSE / ICT QSE Ownership Scorecard r9.)
     */
    combinedNewEntrantsDesignated?: boolean;
  };
  management: {
    boardBlackTarget: number;
    boardBlackPoints: number;
    boardWomenTarget: number;
    boardWomenPoints: number;
    execBlackTarget: number;
    execBlackPoints: number;
    execWomenTarget: number;
    execWomenPoints: number;
    disabledTarget?: number;
    execBWTarget?: number;
    execBWMaxPts?: number;
  };
  managementControl?: {
    maxPoints: number;
    subMinimumPercent?: number;
    boardBlackTarget?: number;
    boardBlackMaxPts?: number;
    boardBWTarget?: number;
    boardBWMaxPts?: number;
    execBlackTarget?: number;
    execBlackMaxPts?: number;
    execBWTarget?: number;
    execBWMaxPts?: number;
    otherExecBlackTarget?: number;
    otherExecBlackMaxPts?: number;
    otherExecBWTarget?: number;
    otherExecBWMaxPts?: number;
    seniorMaxPts?: number;
    seniorBWMaxPts?: number;
    middleMaxPts?: number;
    middleBWMaxPts?: number;
    juniorMaxPts?: number;
    juniorBWMaxPts?: number;
    /**
     * Per-band black / black-female targets. Each is split across demographic
     * groups by the effective EAP for the client's province (workbook MC model).
     * RCOGP: 0.60/0.75/0.88 (black) and 0.30/0.38/0.44 (black female).
     */
    seniorBlackTarget?: number;
    seniorBWTarget?: number;
    middleBlackTarget?: number;
    middleBWTarget?: number;
    juniorBlackTarget?: number;
    juniorBWTarget?: number;
    disabledTarget?: number;
    disabledMaxPts?: number;
  };
  employmentEquity?: {
    maxPoints: number;
    disabledTarget?: number;
    disabledMaxPts?: number;
    // Transport Large EE (Transport Codes "Road Freight Large" rows 33-43;
    // mirrored from apps/api/pipeline sectorConfig TRANSPORT_GENERIC targets).
    disabledWomenTarget?: number;
    disabledWomenMaxPts?: number;
    semiUnskilledWomenMaxPts?: number;
    eapBonusMaxPts?: number;
  };
  skills: {
    generalMax: number;
    bursaryMax: number;
    overallTarget: number;
    bursaryTarget: number;
    subMinThreshold: number;
    categoryECap?: number;
    categoryFCap?: number;
    overallSpendPercent?: number;
    bursarySpendPercent?: number;
    disabledSpendPercent?: number;
    learningProgrammesMaxPts?: number;
    bursaryMaxPts?: number;
    disabledLearningMaxPts?: number;
    learnershipsMaxPts?: number;
    absorptionMaxPts?: number;
    learnershipTargetPercent?: number;
    absorptionTargetPercent?: number;
    /**
     * AgriBEE-only: the "unemployed Black people in training" indicator (2.1.2.2)
     * is scored on a HEADCOUNT basis (count of unemployed Black learners vs a
     * % -of-headcount target), not on a spend basis. When true, the bursary slot
     * (bursaryMaxPts) is scored from the unemployed-learner headcount.
     * (TOOLKIT-RESOLVED.md Q13; AGRI Skills Scorecard r39, header "Headcount".)
     */
    bursaryIsHeadcount?: boolean;
    /**
     * QSE only: the bursary slot (bursaryMaxPts) represents "Spend on Black women"
     * (7 pts @ 1% leviable), so it is scored from Black-FEMALE learning spend across
     * all categories rather than bursary-category spend. (DISCREPANCY-LEDGER D-03.)
     */
    bursaryIsBlackFemale?: boolean;
    /**
     * ICT Generic only: the 2.1.3 absorption bonus is scored over UNEMPLOYED Black
     * learners who COMPLETED an LAI, not over all Black learners. (DISCREPANCY-LEDGER
     * ict/generic D-05.) QSE absorption keeps the all-learners basis (open item Q-E).
     */
    absorptionBasisUnemployedLAI?: boolean;
  };
  procurement: {
    baseMax: number;
    bonusMax: number;
    tmpsTarget: number;
    subMinThreshold: number;
    blackOwnedThreshold: number;
    blackWomenThreshold?: number;
    allSuppliersTarget?: number;
    allSuppliersMaxPts?: number;
    qseTarget?: number;
    qseMaxPts?: number;
    emeTarget?: number;
    emeMaxPts?: number;
    bo51Target?: number;
    bo51MaxPts?: number;
    bwo30Target?: number;
    bwo30MaxPts?: number;
    dgTarget?: number;
    dgMaxPts?: number;
    /** FSC Banks/LTI: PP sub-minimum always passes (toolkit formula returns pass). */
    alwaysPassSubMin?: boolean;
  };
  esd: {
    supplierDevMax: number;
    enterpriseDevMax: number;
    supplierDevTarget: number;
    enterpriseDevTarget: number;
    /** Max points for the ED graduation tick-box bonus (default 1). */
    edGraduationBonusMax?: number;
    /**
     * Max points for the ED "jobs created" bonus (default 1). ICT awards a tiered
     * bonus: ≤10% of workforce → 1 pt, ≥11% → 2 pts (mutually exclusive). Set to 2
     * to enable the upper tier. (TOOLKIT-RESOLVED.md S6.)
     */
    edJobsBonusMax?: number;
    /**
     * FSC-only: separate ED bonus for "support of black stockbrokers / fund
     * managers / intermediaries" (0.5% NPAT / 2 pts). Default 0. Scored from
     * ESDData.stockbrokerSpend against npat × edStockbrokerTarget.
     * (TOOLKIT-RESOLVED.md Q42; FSC ESD Scorecard r12.)
     */
    edStockbrokerBonusMax?: number;
    /** FSC-only: NPAT fraction target for the stockbroker bonus (e.g. 0.005). */
    edStockbrokerTarget?: number;
  };
  sed: {
    maxPoints: number;
    npatTarget: number;
    /** FSC: SED base portion max points (row contributions). Default: maxPoints (combined model). */
    sedBaseMaxPts?: number;
    /** FSC: SED base NPAT target fraction (e.g. 0.006 = 0.6%). */
    sedNpatTarget?: number;
    /** FSC: CE base max points from ceSpend meta. */
    ceMaxPts?: number;
    ceNpatTarget?: number;
    /** FSC: additional CE bonus from ceBonusSpend meta. */
    ceBonusMaxPts?: number;
    ceBonusNpatTarget?: number;
    /** FSC: Fundisa grant bonus from fundisaSpend meta. */
    fundisaMaxPts?: number;
    fundisaNpatTarget?: number;
  };
  yes?: {
    tier1Points: number;
    tier2Points: number;
    tier3Points: number;
    tier1Multiplier: number;
    tier2Multiplier: number;
    tier3Multiplier: number;
    headcountTarget5: number;
    headcountTarget10: number;
    headcountTarget15: number;
    blackYouthPercent: number;
  };
  discounting: {
    dropLevels: number;
    maxDropLevel: number;
  };
  recognitionTable?: { level: number; multiplier: number }[];
  levelThresholds?: Array<{ level: number; minPoints: number; recognition?: number }>;
  pillarConfigs?: {
    ownership?: { maxPoints: number; subMinimumPercent?: number; chooseOneGroup?: string };
    managementControl?: { maxPoints: number; subMinimumPercent?: number; chooseOneGroup?: string };
    employmentEquity?: { maxPoints: number; chooseOneGroup?: string };
    skillsDevelopment?: { maxPoints: number; subMinimumPercent?: number; chooseOneGroup?: string };
    preferentialProcurement?: { maxPoints: number; subMinimumPercent?: number; chooseOneGroup?: string };
    supplierDevelopment?: { maxPoints: number; subMinimumPercent?: number; chooseOneGroup?: string };
    enterpriseDevelopment?: { maxPoints: number; subMinimumPercent?: number; chooseOneGroup?: string };
    socioEconomicDevelopment?: { maxPoints: number; chooseOneGroup?: string };
    yesInitiative?: { maxPoints: number; chooseOneGroup?: string };
  };
  /**
   * FSC Banks/LTI — Empowerment Financing pillar config.
   * Point values for Targeted Investments and Transaction Financing are 0 by default
   * (not readable from the toolkit template when sub-sector = Others — Q44).
   * SD/ED targets differ from Generic (Banks: SD 1.8%, ED 0.2%; LTI: same + stockbroker).
   */
  empowermentFinancing?: {
    maxPoints: number;
    /** Targeted Investments — % of balance-sheet (Banks) / qualifying exposure (LTI). */
    targetedInvestmentMaxPts: number;
    /** Transaction Financing and Risk Capital contributions. */
    transactionFinancingMaxPts: number;
    /** Supplier Development (part of EF scorecard for Banks/LTI). */
    sdMaxPts: number;
    sdTarget: number;   // e.g. 0.018 (1.8% NPAT)
    /** Enterprise Development (part of EF scorecard). */
    edMaxPts: number;
    edTarget: number;   // e.g. 0.002 (0.2% NPAT)
    /** ED graduation bonus. */
    graduationBonusMaxPts: number;
    /** ED jobs-created bonus. */
    jobsBonusMaxPts: number;
    /** LTI-only: ED stockbroker / fund manager / intermediary support (0.5% NPAT / 2 pts). */
    stockbrokerBonusMaxPts?: number;
    stockbrokerTarget?: number;
  };
  /**
   * FSC Banks/LTI/STI — Access to Financial Services (AFS) pillar config.
   * Total AFS = 12 pts for all sub-sectors; structure differs by sub-sector.
   */
  accessToFinancialServices?: {
    subSector: 'Banks' | 'LTI' | 'STI';
    maxPoints: number;
    // Banks: geographic / electronic access (total 12 pts)
    transactionPointTarget?: number;    // 0.85 (85%)
    transactionPointMaxPts?: number;    // 1
    servicePointTarget?: number;        // 0.70 (70%)
    servicePointMaxPts?: number;        // 1
    salesPointTarget?: number;          // 0.60 (60%)
    salesPointMaxPts?: number;          // 2
    electronicAccessMaxPts?: number;    // 2 (national target — yes/no)
    pointOfPresenceMaxPts?: number;     // 3 (at least one PoP per measurement unit)
    activeAccountsMaxPts?: number;      // 3 (active accounts in target market)
    // LTI: products / penetration / transactional access (total 12 pts)
    appropriateProductsMaxPts?: number; // 3
    marketPenetrationMaxPts?: number;   // 7
    transactionalAccessTarget?: number; // 0.80 (80%)
    transactionalAccessMaxPts?: number; // 2
    // STI: commercial products + insurance policies (total 12 pts)
    commercialProductsMaxPts?: number;  // 2 (6 lines × 0.333)
    commercialLinesCount?: number;      // 6
    insurancePoliciesTarget?: number;   // 1.0 (100%)
    insurancePoliciesMaxPts?: number;   // 10
  };
  benefitFactors: { type: string; factor: number }[];
  industryNorms: { name: string; norm: string }[];
}

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  secondaryRoles?: string[];
  organizationId: string | null;
  organizationName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  twofaEnabled: boolean;
  otpCode: string | null;
  otpExpiry: Date | null;
  otpAttempts: number;
  lastLogin: Date | null;
  createdAt: Date;
}

export interface InsertUser {
  username: string;
  password: string;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  profilePicture?: string | null;
  isVerified?: boolean;
  twofaEnabled?: boolean;
}

export interface Template {
  id: number;
  userId: string | null;
  name: string;
  description: string | null;
  version: string;
  entities: TemplateEntity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertTemplate {
  name: string;
  description?: string | null;
  version?: string;
  entities: TemplateEntity[];
  userId?: string | null;
}

export interface CalculatorConfigRow {
  id: number;
  clientId: string;
  config: CalculatorConfig;
  updatedAt: Date;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

/** Same collection/shape as API `organizations` — created on web sign-up for tenant isolation. */
const organizationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // Company-admin model (mirrors apps/api/models.ts). adminUserId is the
    // current tenant administrator (first registrant, transferable);
    // createdByUserId is the immutable founder for audit.
    adminUserId: { type: String, default: null, index: true },
    createdByUserId: { type: String, default: null },
    createdAt: { type: String, default: () => new Date().toISOString() },
    // ---- Credit wallet -------------------------------------------------
    // Document processing is bought as credit tokens up front rather than
    // charged per upload. The wallet belongs to the ORGANISATION, not the
    // user: colleagues working the same client must draw on one balance, and
    // an admin buying tokens must top up for the whole team.
    //
    // `tokenBalance` is deliberately NOT defaulted here. A default would make
    // every organisation that has never been read look like it already holds
    // the free grant, which makes "have we granted this org its tokens yet?"
    // unanswerable. `seededAt` is the record of the grant, and
    // tokenWallet.ensureWallet() is the only thing that writes it.
    plan: { type: String, enum: ["free", "pro"], default: "free" },
    tokenBalance: { type: Number, default: null },
    tokensSeededAt: { type: String, default: null },
    /** When the current Pro term ends. null on the free plan. */
    planRenewsAt: { type: String, default: null },
  },
  { collection: "organizations" }
);

organizationSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    if (ret._id) {
      delete ret._id;
    }
    delete ret.__v;
  },
});

const userSchema = new Schema(
  {
    // Persisted UUID for shared `users` collection with API. `id: false` disables Mongoose's default `id` virtual so this path is stored.
    id: { type: String, default: () => crypto.randomUUID(), unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, default: null },
    email: { type: String, default: null },
    role: { type: String, default: "user" },
    secondaryRoles: { type: [String], default: [] },
    organizationId: { type: String, default: null },
    organizationName: { type: String, default: null },
    profilePicture: { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    twofaEnabled: { type: Boolean, default: false },
    otpCode: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { id: false }
);

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const templateSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: null },
  version: { type: String, default: "1.0" },
  entities: { type: Schema.Types.Mixed, required: true },
  userId: { type: String, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const CounterModel = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

async function getNextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

templateSchema.pre("save", async function () {
  if (this.isNew && !(this as any).seqId) {
    (this as any).seqId = await getNextSequence("template");
  }
});

templateSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.seqId || ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

templateSchema.add({ seqId: { type: Number, unique: true, sparse: true } });

const calculatorConfigSchema = new Schema({
  clientId: { type: String, required: true, unique: true },
  config: { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

calculatorConfigSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const conversationSchema = new Schema({
  seqId: { type: Number, unique: true },
  title: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

conversationSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.seqId || ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const messageSchema = new Schema({
  seqId: { type: Number, unique: true },
  conversationId: { type: Number, required: true },
  role: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.seqId || ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const processorSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  assessmentId: { type: String, default: null, index: true, sparse: true },
  organizationId: { type: String, default: null, index: true },
  createdByUserId: { type: String, default: null },
  /** Assessment owner (matches Assessment.createdBy in storage layer). */
  createdBy: { type: String, default: null, index: true },
  companyInfo: {
    name: { type: String, required: true },
    registrationNumber: { type: String, default: '' },
    sector: { type: String, default: '' },
    annualTurnover: { type: String, default: '' },
    employees: { type: String, default: '' },
    financialYearEnd: { type: String, default: '' },
    address: { type: String, default: '' },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    currentBBEELevel: { type: String, default: '' },
    notes: { type: String, default: '' },
    logo: { type: String, default: '' },
  },
  currentStep: { type: String, default: 'company-info' },
  filesData: { type: Schema.Types.Mixed, default: [] },
  fileClassifications: { type: Schema.Types.Mixed, default: {} },
  extractionResults: { type: Schema.Types.Mixed, default: [] },
  docStatuses: { type: Schema.Types.Mixed, default: {} },
  isComplete: { type: Boolean, default: false },
  scorecardResult: { type: Schema.Types.Mixed, default: null },
  toolkitClientId: { type: String, default: null },
  clientId: { type: String, default: null },
  clientInfo: { type: Schema.Types.Mixed, default: null },
  financials: { type: Schema.Types.Mixed, default: null },
  pillars: { type: Schema.Types.Mixed, default: null },
  status: { type: String, default: "draft" },
  workspaceId: { type: String, default: null, index: true },
  pillarActivity: { type: Schema.Types.Mixed, default: {} },
  scorecardSnapshots: { type: [Schema.Types.Mixed], default: [] },
  flowMode: { type: String, default: null },
  integratedToolkitUpload: { type: Boolean, default: false },
  /** Large blob also stored in API `sessionBlobs.integratedToolkitState` when using apps/api */
  integratedToolkitState: { type: Schema.Types.Mixed, default: null },
  foundationData: { type: Schema.Types.Mixed, default: null },
  pillarData: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

processorSessionSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.sessionId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export interface Client {
  id: string;
  name: string;
  financialYear: string;
  industrySector: string | null;
  eapProvince: string | null;
  logo: string | null;
  revenue: number;
  npat: number;
  leviableAmount: number;
  organizationId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertClient {
  name: string;
  financialYear?: string;
  industrySector?: string | null;
  eapProvince?: string | null;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
}

const clientSchema = new Schema({
  /** Aligns with API `clients.id` unique index — set equal to clientId on create. */
  id: { type: String, default: null, sparse: true, unique: true },
  clientId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  financialYear: { type: String, default: () => new Date().getFullYear().toString() },
  industrySector: { type: String, default: null },
  eapProvince: { type: String, default: null },
  // CEE report vintage for MC/Skills EAP targets (e.g. 2026 = 26th CEE report).
  // null = latest ingested year; pinned for legacy-workbook clients.
  eapYear: { type: Number, default: null },
  logo: { type: String, default: null },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  leviableAmount: { type: Number, default: 0 },
  tmps: { type: Number, default: 0 },
  companyValue: { type: Number, default: 0 },
  outstandingDebt: { type: Number, default: 0 },
  organizationId: { type: String, default: null, index: true },
  createdByUserId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  shareholders: { type: [Schema.Types.Mixed], default: [] },
  employees: { type: [Schema.Types.Mixed], default: [] },
  trainingPrograms: { type: [Schema.Types.Mixed], default: [] },
  suppliers: { type: [Schema.Types.Mixed], default: [] },
  esdContributions: { type: [Schema.Types.Mixed], default: [] },
  sedContributions: { type: [Schema.Types.Mixed], default: [] },
  
  // Extended Foundation Layer fields from TOOLKIT_TAB_MAP.md Sheet 1
  registrationNumber: { type: String, default: null, index: true },
  tradingName: { type: String, default: null },
  vatNumber: { type: String, default: null },
  taxNumber: { type: String, default: null },
  physicalAddress: { type: String, default: null },
  postalAddress: { type: String, default: null },
  contactPerson: { type: String, default: null },
  contactEmail: { type: String, default: null },
  contactPhone: { type: String, default: null },
  sectorCode: { type: String, default: 'RCOGP' },
  scorecardType: { type: String, default: 'Generic' },
  industry: { type: String, default: 'Other' },
  companySize: { type: String, default: 'Generic' },
  annualTurnover: { type: Number, default: 0 },
  numberOfEmployees: { type: Number, default: 0 },
  measurementPeriodStart: { type: String, default: null },
  measurementPeriodEnd: { type: String, default: null },
  beeCertificateNumber: { type: String, default: null },
  beeCertificateExpiry: { type: String, default: null },
  beeCertificateLevel: { type: Number, default: null },
  verificationAgency: { type: String, default: null },
  financials: { type: Schema.Types.Mixed, default: null },
  pillars: { type: Schema.Types.Mixed, default: null },
  // Audit P1 #1 — schema parity: fields the Toolkit edits via
  // PATCH /api/clients/:id but apps/web schema was silently dropping under
  // strict mode (apps/api added these in 1c848788 + bffde3b5; this makes the
  // apps/web side write-through too — the parallel handler at routes.ts:1752
  // now allowlists these field names and the schema accepts them).
  pipelineOverrides: { type: Schema.Types.Mixed, default: null },
  afs: { type: Schema.Types.Mixed, default: null },
  fscSubSector: { type: String, default: null },
  fscReinsurer: { type: Boolean, default: null },
  combineExcoSenior: { type: Boolean, default: false },
  farmWorkersIncluded: { type: Boolean, default: true },
  constructionSubSector: { type: String, default: null },
  industryNorm: { type: Number, default: null },
  graduationBonus: { type: Boolean, default: false },
  jobsCreatedBonus: { type: Boolean, default: false },
  jobsCreatedCount: { type: Number, default: 0 },
  graduationEvidence: { type: String, default: '' },
  jobsCreatedEvidence: { type: String, default: '' },
  ceSpend: { type: Number, default: 0 },
  ceBonusSpend: { type: Number, default: 0 },
  fundisaSpend: { type: Number, default: 0 },
  /** Platform demo workbook (Lake Trading ground truth); visible to super_admin only. */
  lakeTradingDemo: { type: Boolean, default: false, index: true },
});

clientSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.clientId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

/**
 * Every movement of credit tokens, append-only.
 *
 * The balance on the organisation is a cache of this ledger's sum, kept there
 * so a balance read is one document rather than a scan. The ledger is the
 * record of truth for "where did my tokens go", which is the first question a
 * customer asks when a number surprises them.
 *
 * `reference` is what makes a debit IDEMPOTENT: it is unique, and every debit
 * carries the id of the thing being paid for (a quote id, a PayFast payment
 * id). A retried request therefore collides on the index and is recognised as
 * the same movement instead of charging twice.
 */
const tokenLedgerSchema = new Schema(
  {
    id: { type: String, default: () => crypto.randomUUID(), unique: true },
    organizationId: { type: String, required: true, index: true },
    /** Who triggered it. null for system grants. */
    userId: { type: String, default: null },
    /** Negative for spend, positive for grants/top-ups/refunds. */
    delta: { type: Number, required: true },
    /** Organisation balance immediately after this movement was applied. */
    balanceAfter: { type: Number, required: true },
    kind: {
      type: String,
      enum: ["grant", "purchase", "extraction", "refund", "adjustment"],
      required: true,
    },
    /** Human-readable, shown verbatim in the billing ledger. */
    description: { type: String, default: "" },
    /** Idempotency key — the id of whatever was paid for. */
    reference: { type: String, required: true, unique: true },
    metadata: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "tokenLedger", id: false }
);

tokenLedgerSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

/**
 * A token purchase in flight.
 *
 * Written before the user is sent to PayFast and settled only by a verified
 * ITN, so the tokens a customer receives are decided by our record of what
 * they bought — never by anything the browser hands back on return.
 */
const tokenOrderSchema = new Schema(
  {
    id: { type: String, default: () => crypto.randomUUID(), unique: true },
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, default: null },
    packId: { type: String, required: true },
    tokens: { type: Number, required: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "ZAR" },
    /** Whether this pack also moves the org onto the Pro plan. */
    grantsPro: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    providerRef: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
    settledAt: { type: Date, default: null },
  },
  { collection: "tokenOrders", id: false }
);

tokenOrderSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const TokenLedgerModel =
  mongoose.models.TokenLedger || mongoose.model("TokenLedger", tokenLedgerSchema);
export const TokenOrderModel =
  mongoose.models.TokenOrder || mongoose.model("TokenOrder", tokenOrderSchema);

export const OrganizationModel =
  mongoose.models.Organization || mongoose.model("Organization", organizationSchema);
export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const TemplateModel = mongoose.models.Template || mongoose.model("Template", templateSchema);
export const CalculatorConfigModel = mongoose.models.CalculatorConfig || mongoose.model("CalculatorConfig", calculatorConfigSchema);
export const ConversationModel = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
export const MessageModel = mongoose.models.Message || mongoose.model("Message", messageSchema);
export const ProcessorSessionModel = mongoose.models.ProcessorSession || mongoose.model("ProcessorSession", processorSessionSchema);
export const ClientModel = mongoose.models.Client || mongoose.model("Client", clientSchema);

const feedbackSchema = new Schema({
  /** Primary business id (preferred over legacy `id` field in Mongo). */
  feedbackId: { type: String, required: true, unique: true },
  /** Legacy field — keep populated (= feedbackId) for existing `id_1` unique index. */
  id: { type: String, sparse: true, unique: true },
  message: { type: String, required: true },
  category: { type: String, enum: ['bug', 'feature', 'general', 'compliance'], default: 'general' },
  pillar: { type: String, default: null, index: true },
  pageUrl: { type: String, default: null },
  userName: { type: String, default: null },
  userEmail: { type: String, default: null },
  userId: { type: String, default: null, index: true },
  organizationId: { type: String, default: null, index: true },
  status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open', index: true },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "feedback", id: false });

feedbackSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.feedbackId ?? ret.id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const FeedbackModel = mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

const companyProfileSchema = new Schema({
  /** Business id (not Mongo _id). Required for legacy `id_1` unique index — omitting caused E11000 dup key { id: null }. */
  id: { type: String, sparse: true, unique: true },
  userId: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, required: true },
  role: { type: String, default: null },
  beeLevel: { type: String, default: null },
  employeeRange: { type: String, default: null },
  industry: { type: String, default: null },
  industryOther: { type: String, default: null },
  annualRevenue: { type: String, default: null },
  acquisitionSource: { type: String, default: null },
  acquisitionSourceOther: { type: String, default: null },
  toolsUsed: { type: [String], default: [] },
  toolsUsedOther: { type: String, default: null },
  biggestChallenge: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "company_profiles" });

companyProfileSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const CompanyProfileModel = mongoose.models.CompanyProfile || mongoose.model("CompanyProfile", companyProfileSchema);

export interface CompanyProfile {
  id?: string;
  userId: string;
  companyName: string;
  role?: string | null;
  beeLevel?: string | null;
  employeeRange?: string | null;
  industry?: string | null;
  industryOther?: string | null;
  annualRevenue?: string | null;
  acquisitionSource?: string | null;
  acquisitionSourceOther?: string | null;
  toolsUsed?: string[];
  toolsUsedOther?: string | null;
  biggestChallenge?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InsertCompanyProfile = Omit<CompanyProfile, "id" | "createdAt" | "updatedAt">;

// ----- Workspaces -----

export type WorkspaceRole = "owner" | "collaborator" | "viewer";

/** High-level display role chosen by the admin at invite time. */
export type WorkspaceDisplayRole = "admin" | "contributor" | "reviewer" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  /** Display role chosen at invite time (admin | contributor | reviewer | viewer). */
  displayRole?: WorkspaceDisplayRole;
  /** When set for collaborators, limits which scorecard pillars they may view or edit. Empty/absent = all pillars. */
  pillarScopes?: string[];
  joinedAt: Date;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  /** Display role chosen at invite time. */
  displayRole?: WorkspaceDisplayRole;
  /** Pillar keys the invitee will be scoped to (contributor role only). */
  pillarScopes?: string[];
  token: string;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const workspaceSchema = new Schema({
  workspaceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  ownerUserId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "workspaces" });

workspaceSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.workspaceId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const workspaceMemberSchema = new Schema({
  memberId: { type: String, required: true, unique: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  role: { type: String, enum: ["owner", "collaborator", "viewer"], required: true },
  displayRole: { type: String, enum: ["owner", "admin", "contributor", "reviewer", "viewer"], default: null },
  pillarScopes: { type: [String], default: undefined },
  joinedAt: { type: Date, default: Date.now },
}, { collection: "workspace_members" });

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

workspaceMemberSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.memberId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const workspaceInviteSchema = new Schema({
  inviteId: { type: String, required: true, unique: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  email: { type: String, required: true, lowercase: true, index: true },
  role: { type: String, enum: ["collaborator", "viewer"], required: true },
  displayRole: { type: String, enum: ["admin", "contributor", "reviewer", "viewer"], default: null },
  pillarScopes: { type: [String], default: undefined },
  token: { type: String, required: true, unique: true, index: true },
  invitedByUserId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { collection: "workspace_invites" });

workspaceInviteSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.inviteId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const WorkspaceModel = mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);
export const WorkspaceMemberModel = mongoose.models.WorkspaceMember || mongoose.model("WorkspaceMember", workspaceMemberSchema);
export const WorkspaceInviteModel = mongoose.models.WorkspaceInvite || mongoose.model("WorkspaceInvite", workspaceInviteSchema);

// ----- Information Request Workbook -----

const workbookSchema = new Schema(
  {
    companyId: { type: String, required: true, unique: true, index: true },
    ownerOrganizationId: { type: String, default: null, index: true },
    ownerUserId: { type: String, required: true, index: true },
    sections: { type: Schema.Types.Mixed, default: {} },
    submittedAt: { type: Date, default: null },
    submittedByUserId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "workbooks", minimize: false },
);

workbookSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.companyId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const WorkbookModel =
  mongoose.models.Workbook || mongoose.model("Workbook", workbookSchema);

export { getNextSequence };
