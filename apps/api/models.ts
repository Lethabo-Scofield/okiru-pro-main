import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";

const userSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, default: null },
  fullName: { type: String, default: null },
  role: { type: String, default: "user" },
  organizationId: { type: String, default: null },
  profilePicture: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "users" });

const organizationSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  name: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "organizations" });

const clientSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  financialYear: { type: String, required: true },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  leviableAmount: { type: Number, default: 0 },
  industrySector: { type: String, default: "Generic" },
  eapProvince: { type: String, default: "National" },
  industryNorm: { type: Number, default: null },
  logo: { type: String, default: null },
  pipelineOverrides: { type: Schema.Types.Mixed, default: null },
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
}, { collection: "financialYears" });

const shareholderSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  blackOwnership: { type: Number, default: 0 },
  blackWomenOwnership: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  shareValue: { type: Number, default: 0 },
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
}, { collection: "employees" });

const trainingProgramSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  cost: { type: Number, default: 0 },
  employeeId: { type: String, default: null },
  isEmployed: { type: Boolean, default: false },
  isBlack: { type: Boolean, default: false },
}, { collection: "trainingPrograms" });

const supplierSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  beeLevel: { type: Number, default: 4 },
  blackOwnership: { type: Number, default: 0 },
  spend: { type: Number, default: 0 },
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
}, { collection: "esdContributions" });

const sedContributionSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  beneficiary: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, default: 0 },
  category: { type: String, required: true },
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

sessionBlobSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
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
  verificationAgency: { type: String, default: null },
  certificateNumber: { type: String, default: null },
  slug: { type: String, default: null, index: true },
  status: { type: String, enum: ['valid', 'expiring', 'expired', 'unknown'], default: 'unknown' },
  extractedText: { type: String, default: null },
  extractionStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  extractionError: { type: String, default: null },
  processedAt: { type: Date, default: null },
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
  id: { type: String, default: uuid, unique: true },
  message: { type: String, required: true },
  category: { type: String, enum: ['bug', 'feature', 'general', 'compliance'], default: 'general' },
  pageUrl: { type: String, default: null },
  userName: { type: String, default: null },
  userEmail: { type: String, default: null },
  userId: { type: String, default: null, index: true },
  organizationId: { type: String, default: null, index: true },
  status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open', index: true },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "feedback" });

feedbackSchema.set("toJSON", {
  transform: (_doc: any, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const FeedbackModel = mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

const companyProfileSchema = new Schema({
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
}, { collection: "company_profiles" });

export const CompanyProfileModel = mongoose.models.CompanyProfile || mongoose.model("CompanyProfile", companyProfileSchema);
