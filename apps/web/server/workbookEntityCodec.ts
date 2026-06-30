/**
 * workbookEntityCodec.ts — entity → workbook-row inverse mapping.
 *
 * The forward direction (workbook → entity) lives in projectWorkbookToClient
 * (apps/web/server/workbookRoutes.ts ~line 893). The inverse here lets the
 * Toolkit→Workbook back-sync turn a per-entity record back into a row that
 * the workbook editor can render. We keep it minimal: only the columns the
 * workbook section actually displays + the `_id` join key.
 *
 * Fields we deliberately don't try to invert (and the workbook editor doesn't
 * mind being missing): construction-only template columns, derived raw stats,
 * audit metadata. The workbook /sync path stays the source-of-truth for
 * sector-import provenance.
 */
import { randomUUID } from 'crypto';

export type WorkbookEntityType =
  | 'shareholder'
  | 'employee'
  | 'trainingProgram'
  | 'supplier'
  | 'esdContribution'
  | 'sedContribution';

/** Map entity type → workbook section key. */
export const ENTITY_TYPE_TO_SECTION: Record<WorkbookEntityType, string> = {
  shareholder: 'ownership',
  employee: 'management-control',
  trainingProgram: 'skills-development',
  supplier: 'procurement',
  esdContribution: 'esd',
  sedContribution: 'sed',
};

/** Inverse of pctToFraction: fraction (0..1) → percent (0..100), rounded. */
function fracToPct(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return n; // already in % space
  return Math.round(n * 10000) / 100; // 2-decimal-place %
}

function ensureRowId(entity: any): string {
  return entity?.workbookRowId || randomUUID();
}

/** Inverse of mapEnterpriseType (workbook label → enum). */
function enterpriseTypeToWorkbookSize(t: string | undefined): string {
  if (!t) return '';
  const lc = String(t).toLowerCase();
  if (lc === 'eme' || lc.includes('exempt')) return 'EME';
  if (lc === 'qse' || lc.includes('qualifying')) return 'QSE';
  if (lc === 'generic' || lc.includes('large')) return 'Generic';
  return t;
}

/** Inverse of mapContributionType. The forward map normalises to a small set
 * of calculator keys; for back-sync we just keep whatever the entity already
 * stored on its `contributionType` (workbook) or fall back to its `type`. */
function contributionTypeToWorkbookLabel(entity: any): string {
  return entity?.contributionType || entity?.type || '';
}

export function shareholderToWorkbookRow(sh: any): any {
  const blackOwnPct = fracToPct(sh.blackOwnership);
  const blackWomenPct = fracToPct(sh.blackWomenOwnership);
  return {
    _id: ensureRowId(sh),
    shareholderName: sh.name ?? sh.shareholderName ?? '',
    idNumber: sh.shareholderId ?? sh.idNumber ?? '',
    ownershipType: sh.ownershipType ?? 'shareholder',
    blackOwnership: blackOwnPct,
    blackWomenOwnership: blackWomenPct,
    designatedGroupOwnership: sh.isDesignatedGroup ? blackOwnPct : 0,
    blackNewEntrantOwnership: sh.blackNewEntrant ? blackOwnPct : 0,
    numberOfShares: sh.shares ?? 0,
    shareValue: sh.shareValue ?? 0,
    votingRights: fracToPct(sh.votingRightsPercent ?? sh.votingRights),
    economicInterest: fracToPct(sh.economicInterestPercent ?? sh.economicInterest),
    shareholding: fracToPct(sh.shareholding ?? sh.votingRightsPercent),
    yearsHeld: sh.yearsHeld ?? 0,
    isDesignatedGroup: !!sh.isDesignatedGroup,
    isNewEntrant: !!sh.blackNewEntrant,
  };
}

export function employeeToWorkbookRow(emp: any): any {
  return {
    _id: ensureRowId(emp),
    name: emp.name ?? '',
    surname: emp.surname ?? '',
    idNumber: emp.idNumber ?? '',
    race: emp.race ?? '',
    gender: emp.gender ?? '',
    designation: emp.designation ?? emp.occupationalLevel ?? '',
    occupationalLevel: emp.occupationalLevel ?? emp.designation ?? '',
    department: emp.department ?? '',
    salary: emp.annualSalary ?? emp.salary ?? 0,
    isDisabled: !!emp.isDisabled,
    isForeign: !!emp.isForeign,
    votingRights: fracToPct(emp.votingRightsPercent ?? emp.votingRights),
    startDate: emp.hireDate ?? emp.startDate ?? '',
    province: emp.province ?? '',
    terminationDate: emp.terminationDate ?? '',
  };
}

export function trainingProgramToWorkbookRow(tp: any): any {
  return {
    _id: ensureRowId(tp),
    programName: tp.programName ?? tp.name ?? '',
    trainingProvider: tp.trainingProvider ?? '',
    categoryCode: tp.categoryCode ?? tp.category ?? '',
    learnerName: tp.learnerName ?? '',
    idNumber: tp.learnerIdNumber ?? tp.idNumber ?? '',
    race: tp.race ?? '',
    gender: tp.gender ?? '',
    isDisabled: !!tp.isDisabled,
    isForeign: !!tp.isForeign,
    employed: !!tp.isEmployed,
    employmentStatus: tp.employmentStatus ?? '',
    isYesEmployee: !!tp.isYesEmployee,
    completed: !!tp.isCompleted,
    absorbed: !!tp.isAbsorbed,
    isBursary: !!tp.isBursary,
    courseCost: tp.courseCost ?? 0,
    travelCost: tp.travelCost ?? 0,
    accommodationCost: tp.accommodationCost ?? 0,
    cateringCost: tp.cateringCost ?? 0,
    stationeryCost: tp.stationeryCost ?? 0,
    trainingFacilityCost: tp.facilityCost ?? 0,
    salaryCost: tp.salaryCost ?? 0,
    otherCosts: tp.otherCosts ?? 0,
    totalCost: tp.totalCost ?? tp.cost ?? 0,
    startDate: tp.startDate ?? tp.transactionDate ?? '',
    endDate: tp.endDate ?? '',
  };
}

export function supplierToWorkbookRow(sup: any): any {
  return {
    _id: ensureRowId(sup),
    supplierName: sup.name ?? sup.supplierName ?? '',
    registrationNumber: sup.registrationNumber ?? '',
    currentSize: enterpriseTypeToWorkbookSize(sup.enterpriseType ?? sup.size ?? sup.currentSize),
    bbbeeLevel: sup.beeLevel ?? sup.bbbeeLevel ?? 0,
    vatNumber: sup.vatNumber ?? '',
    measuredUnder: sup.measuredUnder ?? '',
    empoweringSupplier: !!sup.isEmpoweringSupplier,
    currentBlackOwnership: fracToPct(sup.blackOwnership ?? sup.currentBlackOwnership),
    currentBlackFemaleOwnership: fracToPct(sup.blackWomenOwnership ?? sup.blackFemaleOwnership ?? sup.currentBlackFemaleOwnership),
    sdRecipient: !!sup.isSupplierDevRecipient,
    threeYearContract: !!sup.hasThreeYearContract,
    designated: !!sup.isDesignatedGroup,
    spend: sup.spend ?? sup.amount ?? 0,
    firstProcurementDate: sup.firstProcurementDate ?? '',
    certificateExpiryDate: sup.certificateExpiryDate ?? '',
  };
}

export function esdContributionToWorkbookRow(c: any): any {
  return {
    _id: ensureRowId(c),
    supplierName: c.beneficiary ?? c.supplierName ?? '',
    contributionType: contributionTypeToWorkbookLabel(c),
    esdCategory: c.category ?? '',
    currentBlackOwnership: c.blackBenefitPercent ?? c.currentBlackOwnership ?? 0,
    contributionDescription: c.contributionDescription ?? '',
    amount: c.amount ?? 0,
    dateOfTransaction: c.dateOfTransaction ?? '',
    invoiceDate: c.invoiceDate ?? '',
    paymentDate: c.paymentDate ?? '',
  };
}

export function sedContributionToWorkbookRow(c: any): any {
  return {
    _id: ensureRowId(c),
    beneficiaryName: c.beneficiary ?? c.beneficiaryName ?? '',
    contributionType: contributionTypeToWorkbookLabel(c),
    descriptionOfSpend: c.descriptionOfSpend ?? '',
    percentBenefitingBlack: c.blackBenefitPercent ?? c.percentBenefitingBlack ?? 0,
    amount: c.amount ?? 0,
    dateOfTransaction: c.dateOfTransaction ?? '',
  };
}

/** Single entry point — dispatch by entity type. */
export function entityToWorkbookRow(entityType: WorkbookEntityType, entity: any): any {
  switch (entityType) {
    case 'shareholder': return shareholderToWorkbookRow(entity);
    case 'employee': return employeeToWorkbookRow(entity);
    case 'trainingProgram': return trainingProgramToWorkbookRow(entity);
    case 'supplier': return supplierToWorkbookRow(entity);
    case 'esdContribution': return esdContributionToWorkbookRow(entity);
    case 'sedContribution': return sedContributionToWorkbookRow(entity);
  }
}

/** Composite-key fields per entity, used to find an existing workbook row when
 * workbookRowId is unset (legacy entities, hand-typed workbook rows). */
export const COMPOSITE_KEY_FIELDS: Record<WorkbookEntityType, string[]> = {
  shareholder: ['shareholderName', 'idNumber'],
  employee: ['name', 'surname', 'idNumber'],
  trainingProgram: ['programName', 'learnerName', 'idNumber'],
  supplier: ['supplierName', 'registrationNumber'],
  esdContribution: ['supplierName', 'dateOfTransaction', 'amount'],
  sedContribution: ['beneficiaryName', 'dateOfTransaction', 'amount'],
};

export function compositeKey(entityType: WorkbookEntityType, row: any): string {
  return COMPOSITE_KEY_FIELDS[entityType]
    .map((f) => String(row?.[f] ?? '').trim().toLowerCase())
    .join('|');
}
