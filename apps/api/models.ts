import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";

const userSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, default: null },
  fullName: { type: String, default: null },
  role: { type: String, default: "user" },
  secondaryRoles: { type: [String], default: [] },
  organizationId: { type: String, default: null },
  profilePicture: { type: String, default: null },
  isDemo: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "users" });

const organizationSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  name: { type: String, required: true },
  // Company-admin model: the user who currently administers this organization
  // (the tenant). Set to the first registrant at signup; reassignable via the
  // admin-transfer endpoint. `createdByUserId` records the original founder for
  // audit even after admin is transferred away.
  adminUserId: { type: String, default: null, index: true },
  createdByUserId: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "organizations" });

const clientSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  /** Web toolkit business id (same as `id` when created via Information Request). */
  clientId: { type: String, default: null, index: true, sparse: true },
  createdByUserId: { type: String, default: null, index: true },
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  financialYear: { type: String, required: true },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  leviableAmount: { type: Number, default: 0 },
  industrySector: { type: String, default: "Generic" },
  eapProvince: { type: String, default: "National" },
  // CEE report vintage for MC/Skills EAP targets (e.g. 2026 = 26th CEE report).
  // null = latest ingested year; pinned for legacy-workbook clients.
  eapYear: { type: Number, default: null },
  industryNorm: { type: Number, default: null },
  // Foundation Layer fields used by the Toolkit + Workbook. apps/web/shared/
  // schema.ts has these on its clientSchema; apps/api was missing them, so
  // every PATCH /api/clients/:id from the Toolkit was SILENTLY DROPPING
  // industry/sectorCode/scorecardType/companySize (strict schema). That broke
  // the "company details aren't reflected well" complaint — e.g. picking
  // an industry vertical or changing the sector code never round-tripped.
  industry: { type: String, default: 'Other' },
  sectorCode: { type: String, default: 'RCOGP' },
  scorecardType: { type: String, default: 'Generic' },
  companySize: { type: String, default: 'Generic' },
  logo: { type: String, default: null },
  pipelineOverrides: { type: Schema.Types.Mixed, default: null },
  // Persisted via PATCH /api/clients/:id but previously dropped by the strict
  // schema: FSC sub-sector, ESD graduation/jobs bonuses, and AFS (FSC) data.
  fscSubSector: { type: String, default: null },
  graduationBonus: { type: Boolean, default: false },
  jobsCreatedBonus: { type: Boolean, default: false },
  jobsCreatedCount: { type: Number, default: 0 },
  graduationEvidence: { type: String, default: '' },
  jobsCreatedEvidence: { type: String, default: '' },
  afs: { type: Schema.Types.Mixed, default: null },
  // FSC-only SED spend fields: Consumer Education (+ CE bonus) and Fundisa.
  // calculateSedScore already scores these when sc.ceMaxPts / sc.fundisaMaxPts > 0
  // (i.e. FSC variants). Previously read only from the financials blob via
  // the load path — surfacing them as top-level fields makes updateSed
  // persistable via the existing updateClient route.
  ceSpend: { type: Number, default: 0 },
  ceBonusSpend: { type: Number, default: 0 },
  fundisaSpend: { type: Number, default: 0 },
  // Phase 4 schema parity sweep: fields apps/web/shared/schema.ts defines on
  // clientSchema that the apps/api strict mode was silently dropping. Without
  // these, every PATCH /api/clients/:id from the Toolkit (or workbook /sync
  // setting top-level fields) lost data.
  fscReinsurer: { type: Boolean, default: null },
  farmWorkersIncluded: { type: Boolean, default: true },
  combineExcoSenior: { type: Boolean, default: false },
  constructionSubSector: { type: String, default: null },
  measurementPeriodStart: { type: String, default: null },
  measurementPeriodEnd: { type: String, default: null },
  numberOfEmployees: { type: Number, default: 0 },
  annualTurnover: { type: Number, default: 0 },
  beeCertificateNumber: { type: String, default: '' },
  beeCertificateExpiry: { type: String, default: '' },
  beeCertificateLevel: { type: Number, default: null },
  verificationAgency: { type: String, default: '' },
  // Foundation contact + identity fields
  tradingName: { type: String, default: '' },
  registrationNumber: { type: String, default: '' },
  vatNumber: { type: String, default: '' },
  taxNumber: { type: String, default: '' },
  physicalAddress: { type: String, default: '' },
  postalAddress: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  // Mixed financials blob (deemedNpat/effectiveNpat/industryNormPercent/
  // groupLeviableAmount/trainingManagerSalary/etc.). The workbook /sync writes
  // here; pre-Phase 4 the field wasn't declared so strict mode dropped the
  // whole object → next read returned undefined → deemed-NPAT branch lost,
  // industry norm lookup defaulted, etc.
  financials: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "clients" });

const financialYearSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  year: { type: String, required: true },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  indicativeNpat: { type: Number, default: null },
  notes: { type: String, default: null },
  // workbookRowId stamps the workbook row's `_id` onto the persisted entity so
  // Toolkit→Workbook back-sync can match on this stable join key. Null for
  // entities created Toolkit-only; populated on workbook /submit projection.
  workbookRowId: { type: String, default: null, index: true, sparse: true },
}, { collection: "financialYears" });

const shareholderSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  blackOwnership: { type: Number, default: 0 },
  blackWomenOwnership: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  shareValue: { type: Number, default: 0 },
  // Modern Shareholder fields the Toolkit form captures (were dropped: strict schema).
  // Some are not yet read by ownership scoring (Wave 3); persisting them now prevents
  // data loss and unblocks the scoring fix without a second round-trip.
  shareholderId: { type: String, default: '' },
  ownershipType: { type: String, default: 'shareholder' },
  votingRightsPercent: { type: Number, default: 0 },
  economicInterestPercent: { type: Number, default: 0 },
  isDesignatedGroup: { type: Boolean, default: false },
  designatedGroupType: { type: String, default: '' },
  blackNewEntrant: { type: Boolean, default: false },
  yearsHeld: { type: Number, default: 0 },
  graduationFactor: { type: Number, default: 0 },
  workbookRowId: { type: String, default: null, index: true, sparse: true },
}, { collection: "shareholders" });

const ownershipDataSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, unique: true },
  companyValue: { type: Number, default: 0 },
  outstandingDebt: { type: Number, default: 0 },
  yearsHeld: { type: Number, default: 0 },
}, { collection: "ownershipData" });

const employeeSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  gender: { type: String, required: true },
  race: { type: String, required: true },
  designation: { type: String, required: true },
  isDisabled: { type: Boolean, default: false },
  annualSalary: { type: Number, default: 0 },
  votingRightsPercent: { type: Number, default: 0 },
  // Captured by the form/import and needed for foreign-national exclusion and
  // active-during-measurement-period filtering (were dropped: strict schema).
  idNumber: { type: String, default: '' },
  isForeign: { type: Boolean, default: false },
  province: { type: String, default: '' },
  hireDate: { type: String, default: '' },
  terminationDate: { type: String, default: '' },
  workbookRowId: { type: String, default: null, index: true, sparse: true },
}, { collection: "employees" });

const trainingProgramSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  // Legacy fields kept for backward compatibility with already-persisted docs.
  name: { type: String, required: false, default: '' },
  category: { type: String, required: false, default: '' },
  cost: { type: Number, default: 0 },
  employeeId: { type: String, default: null },
  isEmployed: { type: Boolean, default: false },
  isBlack: { type: Boolean, default: false },
  municipality: { type: String, default: '' },
  // Modern TrainingProgram fields the Toolkit form + scoring use (were dropped).
  programName: { type: String, default: '' },
  trainingProvider: { type: String, default: '' },
  categoryCode: { type: String, default: '' },
  learnerName: { type: String, default: '' },
  learnerIdNumber: { type: String, default: '' },
  gender: { type: String, default: '' },
  race: { type: String, default: '' },
  isDisabled: { type: Boolean, default: false },
  isForeign: { type: Boolean, default: false },
  employmentStatus: { type: String, default: '' },
  isYesEmployee: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  isAbsorbed: { type: Boolean, default: false },
  transactionDate: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  courseCost: { type: Number, default: 0 },
  travelCost: { type: Number, default: 0 },
  accommodationCost: { type: Number, default: 0 },
  cateringCost: { type: Number, default: 0 },
  stationeryCost: { type: Number, default: 0 },
  facilityCost: { type: Number, default: 0 },
  salaryCost: { type: Number, default: 0 },
  otherCosts: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  isAbet: { type: Boolean, default: false },
  isMandatory: { type: Boolean, default: false },
  isBursary: { type: Boolean, default: false },
  workbookRowId: { type: String, default: null, index: true, sparse: true },
}, { collection: "trainingPrograms" });

const supplierSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  beeLevel: { type: Number, default: 4 },
  blackOwnership: { type: Number, default: 0 },
  // Demographic + classification fields the Toolkit form/import already capture
  // and the procurement calculator scores (were silently dropped: strict schema).
  blackWomenOwnership: { type: Number, default: 0 },
  youthOwnership: { type: Number, default: 0 },
  disabledOwnership: { type: Number, default: 0 },
  enterpriseType: { type: String, default: '' },
  spend: { type: Number, default: 0 },
  registrationNumber: { type: String, default: '' },
  // Phase 4 schema parity: Toolkit Procurement.tsx collects all of these but
  // the strict schema was dropping them on PATCH /api/suppliers/:id, so the
  // empowering-supplier sub-minimum, foreign-supplier exclusion, 3-year
  // contract bonus and SD-recipient linkage all reset to false on reload.
  isEmpoweringSupplier: { type: Boolean, default: false },
  isForeignSupplier: { type: Boolean, default: false },
  isBlackOwned51: { type: Boolean, default: false },
  isBlackWomanOwned30: { type: Boolean, default: false },
  isDesignatedGroup: { type: Boolean, default: false },
  isSupplierDevRecipient: { type: Boolean, default: false },
  hasThreeYearContract: { type: Boolean, default: false },
  certificateExpiryDate: { type: String, default: '' },
  firstProcurementDate: { type: String, default: '' },
  vatNumber: { type: String, default: '' },
}, { collection: "suppliers" });

const procurementDataSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, unique: true },
  tmps: { type: Number, default: 0 },
}, { collection: "procurementData" });

const esdContributionSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  beneficiary: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, default: 0 },
  category: { type: String, required: true },
  // Phase 4 schema parity: workbook + Toolkit collect these; previously
  // silently dropped. blackBenefitPercent feeds scoring; construction-only
  // flags drive the construction ESD indicators.
  blackBenefitPercent: { type: Number, default: 0 },
  contributionType: { type: String, default: '' },
  contributionDescription: { type: String, default: '' },
  dateOfTransaction: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  paymentDate: { type: String, default: '' },
  supplierDevProgramme: { type: Boolean, default: false },
  isBlackWomenOwnedBeneficiary: { type: Boolean, default: false },
  workbookRowId: { type: String, default: null, index: true, sparse: true },
}, { collection: "esdContributions" });

const sedContributionSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  beneficiary: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, default: 0 },
  category: { type: String, required: true },
  // Phase 4 schema parity: same as esdContributionSchema. percentBenefitingBlack
  // ↔ blackBenefitPercent; construction-only flags drive the SED indicators.
  blackBenefitPercent: { type: Number, default: 0 },
  contributionType: { type: String, default: '' },
  descriptionOfSpend: { type: String, default: '' },
  dateOfTransaction: { type: String, default: '' },
  ictSpecificInitiative: { type: Boolean, default: false },
  isStructuredProject: { type: Boolean, default: false },
  isLimitedServicesCommunity: { type: Boolean, default: false },
  workbookRowId: { type: String, default: null, index: true, sparse: true },
}, { collection: "sedContributions" });

const scenarioSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "scenarios" });

const importLogSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, default: null, index: true },
  userId: { type: String, required: true },
  fileName: { type: String, required: true },
  status: { type: String, required: true },
  sheetsFound: { type: Number, default: 0 },
  sheetsMatched: { type: Number, default: 0 },
  entitiesExtracted: { type: Number, default: 0 },
  importErrors: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "importLogs", suppressReservedKeysWarning: true });

const exportLogSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  exportType: { type: String, required: true },
  fileName: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "exportLogs" });

const documentSchema = new Schema({
  filename: { type: String, required: true },
  fileType: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  userId: { type: String, default: null },
  entityId: { type: String, default: null, index: true },
  fileHash: { type: String, required: true, unique: true },
  fileSize: { type: Number, default: 0 },
  rawContent: { type: Buffer, default: null },
  status: { type: String, default: 'uploaded' },
  chunkCount: { type: Number, default: 0 },
}, { collection: "documents" });

const documentChunkSchema = new Schema({
  documentId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'Document' },
  chunkIndex: { type: Number, required: true },
  text: { type: String, required: true },
  pageNumber: { type: Number, default: null },
  sheetName: { type: String, default: null },
  sectionPath: { type: String, default: '' },
  chunkType: { type: String, default: 'text' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  tokenCount: { type: Number, default: 0 },
}, { collection: "document_chunks" });

const entityTemplateSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  version: { type: String, default: '1.0' },
  entities: { type: Schema.Types.Mixed, default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "entityTemplates" });

const processorSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  organizationId: { type: String, default: null, index: true },
  createdByUserId: { type: String, default: null },
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
  _scorecardCompressed: { type: Boolean, default: false },
  toolkitClientId: { type: String, default: null },
  foundationData: { type: Schema.Types.Mixed, default: null },
  _foundationCompressed: { type: Boolean, default: false },
  pillarData: { type: Schema.Types.Mixed, default: null },
  _pillarCompressed: { type: Boolean, default: false },
  flowMode: { type: String, default: null },
  integratedToolkitUpload: { type: Boolean, default: false },
  integratedToolkitState: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "processorSessions" });

processorSessionSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.sessionId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const UserModel = mongoose.model("User", userSchema);
export const OrganizationModel = mongoose.model("Organization", organizationSchema);
export const ClientModel = mongoose.model("Client", clientSchema);
export const FinancialYearModel = mongoose.model("FinancialYear", financialYearSchema);
export const ShareholderModel = mongoose.model("Shareholder", shareholderSchema);
export const OwnershipDataModel = mongoose.model("OwnershipData", ownershipDataSchema);
export const EmployeeModel = mongoose.model("Employee", employeeSchema);
export const TrainingProgramModel = mongoose.model("TrainingProgram", trainingProgramSchema);
export const SupplierModel = mongoose.model("Supplier", supplierSchema);
export const ProcurementDataModel = mongoose.model("ProcurementData", procurementDataSchema);
export const EsdContributionModel = mongoose.model("EsdContribution", esdContributionSchema);
export const SedContributionModel = mongoose.model("SedContribution", sedContributionSchema);
export const ScenarioModel = mongoose.model("Scenario", scenarioSchema);
export const ImportLogModel = mongoose.model("ImportLog", importLogSchema);
export const ExportLogModel = mongoose.model("ExportLog", exportLogSchema);
export const Document = mongoose.model("Document", documentSchema);
export const DocumentChunk = mongoose.model("DocumentChunk", documentChunkSchema);
export const EntityTemplateModel = mongoose.model("EntityTemplate", entityTemplateSchema);
export const ProcessorSessionModel = mongoose.models.ProcessorSession || mongoose.model("ProcessorSession", processorSessionSchema);

// ============================================================================
// Session Blob Model - Stores large session data fields separately to avoid
// MongoDB's 16MB document limit. Each blob is one field from a session.
// ============================================================================

const sessionBlobSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  createdByUserId: { type: String, default: null, index: true },
  field: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "sessionBlobs" });

sessionBlobSchema.index({ sessionId: 1, field: 1 }, { unique: true });

sessionBlobSchema.pre('save', function() {
  (this as mongoose.Document & { updatedAt?: Date }).updatedAt = new Date();
});

sessionBlobSchema.set("toJSON", {
  transform: (_doc: any, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const SessionBlobModel = mongoose.models.SessionBlob || mongoose.model("SessionBlob", sessionBlobSchema);

const certificateMetadataSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  blobName: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  expiryDate: { type: Date, default: null },
  issueDate: { type: Date, default: null },
  supplierName: { type: String, default: null },
  vatNumber: { type: String, default: null, index: true },
  companySize: { type: String, default: null, index: true },
  bbbeeLevel: { type: Number, default: null },
  bbbeeScore: { type: Number, default: null },
  blackOwnership: { type: Number, default: null },
  blackWomenOwnership: { type: Number, default: null },
  flowThroughBlackOwnership: { type: Number, default: null },
  blackDesignatedGroupOwnership: { type: Number, default: null },
  empoweringSupplier: { type: Boolean, default: null },
  firstProcurementDate: { type: Date, default: null },
  sizeAtFirstProcurement: { type: String, default: null },
  sdRecipient: { type: Boolean, default: null },
  threeYearContract: { type: Boolean, default: null },
  annualSpend: { type: Number, default: null },
  location: { type: String, default: null },
  businessUnit: { type: String, default: null },
  sectorCode: { type: String, default: null, index: true },
  sectorName: { type: String, default: null },
  verificationAgency: { type: String, default: null },
  certificateNumber: { type: String, default: null },
  slug: { type: String, default: null, index: true },
  status: { type: String, enum: ['valid', 'expiring', 'expired', 'unknown'], default: 'unknown' },
  extractedText: { type: String, default: null },
  extractionStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  extractionError: { type: String, default: null },
  processedAt: { type: Date, default: null },
  enrichmentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'review_required', 'failed'],
    default: 'pending',
    index: true,
  },
  lastEnrichedAt: { type: Date, default: null },
  enrichmentVersion: { type: String, default: null },
  fieldConfidence: { type: Schema.Types.Mixed, default: {} },
  reviewFields: { type: [String], default: [] },
  auditLog: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  uploadedByUserId: { type: String, default: null, index: true },
  // Verification (Phase 1 — production readiness)
  verified: { type: Boolean, default: false, index: true },
  verifiedBy: { type: String, default: null },
  verifiedByName: { type: String, default: null },
  verifiedAt: { type: Date, default: null },
  // VAT dedupe + versioning. The top-level fields above represent the LATEST
  // active version; older versions are appended here on update.
  vatNumberNormalized: { type: String, default: null, index: true },
  versions: {
    type: [{
      _id: false,
      blobName: { type: String, required: true },
      fileName: { type: String, default: null },
      expiryDate: { type: Date, default: null },
      issueDate: { type: Date, default: null },
      bbbeeLevel: { type: Number, default: null },
      bbbeeScore: { type: Number, default: null },
      blackOwnership: { type: Number, default: null },
      blackWomenOwnership: { type: Number, default: null },
      companySize: { type: String, default: null },
      uploadedByUserId: { type: String, default: null },
      uploadedAt: { type: Date, default: Date.now },
      replacedAt: { type: Date, default: Date.now },
    }],
    default: [],
  },
  reportCount: { type: Number, default: 0, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "certificate_metadata" });

certificateMetadataSchema.index({ expiryDate: 1 });
certificateMetadataSchema.index({ status: 1 });
certificateMetadataSchema.index({ bbbeeLevel: 1 });
certificateMetadataSchema.index({ verified: 1, updatedAt: -1 });

export const CertificateMetadataModel = mongoose.models.CertificateMetadata || mongoose.model("CertificateMetadata", certificateMetadataSchema);

// ---------------------------------------------------------------------------
// Certificate reports — the "report incorrect data" workflow
// ---------------------------------------------------------------------------
const certificateReportSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  certificateId: { type: String, required: true, index: true },
  certificateSlug: { type: String, default: null, index: true },
  reason: {
    type: String,
    enum: ['incorrect-data', 'expired', 'fraudulent', 'duplicate', 'other'],
    required: true,
  },
  message: { type: String, required: true },
  email: { type: String, default: null },
  status: {
    type: String,
    enum: ['open', 'reviewing', 'resolved', 'dismissed'],
    default: 'open',
    index: true,
  },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: null },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
}, { collection: "certificate_reports" });

certificateReportSchema.set("toJSON", {
  transform: (_doc: any, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const CertificateReportModel = mongoose.models.CertificateReport || mongoose.model("CertificateReport", certificateReportSchema);

// ---------------------------------------------------------------------------
// Certificate analytics events — internal usage tracking (Phase 3)
// ---------------------------------------------------------------------------
const certificateEventSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  type: {
    type: String,
    enum: ['view', 'search', 'upload', 'download', 'verify', 'unverify', 'report'],
    required: true,
    index: true,
  },
  certificateId: { type: String, default: null, index: true },
  certificateSlug: { type: String, default: null },
  userId: { type: String, default: null, index: true },
  query: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: null },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
}, { collection: "certificate_events" });

certificateEventSchema.set("toJSON", {
  transform: (_doc: any, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const CertificateEventModel = mongoose.models.CertificateEvent || mongoose.model("CertificateEvent", certificateEventSchema);

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
  transform: (_doc: any, ret: any) => {
    ret.id = ret.feedbackId ?? ret.id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const FeedbackModel = mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

const companyProfileSchema = new Schema({
  /** Stable business id for legacy DB unique index `id_1` (avoids dup key { id: null }). */
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
  /** Align with web `shared/schema` (`apps/web`) — same collection `company_profiles`. */
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "company_profiles", strict: false });

export const CompanyProfileModel = mongoose.models.CompanyProfile || mongoose.model("CompanyProfile", companyProfileSchema);

// Phase 6 of the sync plan — persistent retry queue for back-sync fan-outs
// that fail (apps/web down, network blip, transient 5xx). The drainer worker
// picks up entries whose nextAttemptAt has passed, replays them, and either
// removes (success) or pushes them back with exponential backoff.
const workbookBackSyncOutboxSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  companyId: { type: String, required: true, index: true },
  kind: { type: String, enum: ['entity', 'clientMeta'], required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: () => new Date(), index: true },
  lastError: { type: String, default: null },
  createdAt: { type: Date, default: () => new Date() },
}, { collection: 'workbook_backsync_outbox' });

export const WorkbookBackSyncOutboxModel = mongoose.models.WorkbookBackSyncOutbox || mongoose.model('WorkbookBackSyncOutbox', workbookBackSyncOutboxSchema);

// Mirror of apps/web/shared/schema.ts `workspaceMemberSchema` — same collection
// `workspace_members`. Defined here so the apps/api per-entity write routes can
// resolve pillarScopes without crossing the apps/web/server boundary (audit
// B15-srv). Read-only from here.
const workspaceMemberSchema = new Schema({
  memberId: { type: String, required: true, unique: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  role: { type: String, enum: ["owner", "collaborator", "viewer"], required: true },
  displayRole: { type: String, default: null },
  pillarScopes: { type: [String], default: undefined },
  joinedAt: { type: Date, default: Date.now },
}, { collection: "workspace_members" });
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceMemberModel = mongoose.models.WorkspaceMember || mongoose.model("WorkspaceMember", workspaceMemberSchema);
