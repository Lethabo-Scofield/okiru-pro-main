/**
 * What a pillar's bulk upload accepts, and what it turns a row into.
 *
 * Each pillar states three things: which workbook section its register is (so
 * the file's sheets and headings are read exactly as the workbook's own
 * "Import section" reads them), how to turn one parsed row into the record the
 * toolkit stores, and how to tell two records apart so a second upload updates
 * rather than duplicates.
 *
 * Nothing here parses. Parsing is `readSectionSheet` in the main app — one
 * implementation for the whole product. The toolkit used to carry two parsers
 * of its own: one looked for headings that existed only in a template the
 * product never offered to download, and the other read sheet 1 of the file,
 * which on every real information-gathering workbook is the Instructions tab.
 * Both reported "0 rows" on the files consultants actually hold.
 */
import { v4 as uuidv4 } from "uuid";
import {
  MC_EE_COLUMNS,
  OWNERSHIP_COLUMNS,
  PROCUREMENT_COLUMNS,
  SKILLS_COLUMNS,
  ESD_COLUMNS,
  SED_COLUMNS,
  type ColumnDef,
} from "@/components/workbook/sections";
import type {
  Contribution,
  Employee,
  Shareholder,
  Supplier,
  TrainingProgram,
} from "@toolkit/lib/types";

/** A row as the shared parser hands it over: workbook column keys to values. */
export type ParsedRow = Record<string, unknown>;

export interface BulkImportSpec<T> {
  /** Workbook section key — picks the sheet and the column definitions. */
  sectionKey: string;
  /** The pillar as a person would name it. */
  label: string;
  /** What one row is, in plural ("employees", "shareholders"). */
  noun: string;
  columns: ColumnDef[];
  /**
   * Sheet names this register goes by, for a register that is not a workbook
   * section. Without it YES would be read from the Management Control tab:
   * the two hold the same columns, so only the name tells them apart.
   */
  sheetHints?: string[];
  /**
   * Check these rows against the B-BBEE certificate registry before importing.
   * Only procurement: a supplier is the one record we hold an independent
   * source for, and their level and expiry are the fields most often stale in
   * a client's own spreadsheet.
   */
  certificateLookup?: boolean;
  /**
   * Column keys without which a row is not a record. A row missing one is
   * counted and reported, never quietly dropped and never half-imported.
   */
  requiredKeys: string[];
  /** Turn one parsed row into a stored record. */
  toEntity: (row: ParsedRow) => T;
  /** What makes two records the same record, for the second upload. */
  identity: (entity: T) => string;
  /**
   * How a repeated record reads in the duplicate warning. Falls back to the
   * identity string, which is machine-shaped and not much use to a person.
   */
  duplicateLabel?: (entity: T) => string;
  /**
   * Amount field to add together when two rows are the same record.
   *
   * Only for registers where a repeat is usually a second real transaction
   * rather than a re-typed row: a supplier on two invoice lines, a beneficiary
   * paid twice. Dropping the second row there would take real spend out of the
   * total, which lowers a score built on correct data. Registers without this
   * keep the first row and discard the rest, which is what a re-typed person
   * calls for.
   */
  duplicateAmountField?: keyof T & string;
  /** How a record reads in the preview table. */
  describe: (entity: T) => string[];
  /** Column headings for that preview table. */
  previewColumns: string[];
}

// ---------------------------------------------------------------- coercion --

const str = (v: unknown): string => String(v ?? "").trim();

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(str(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * A percentage as the workbook writes it, as the FRACTION the calculators read.
 *
 * Sheets are written both ways — "27" and "0.27" both mean 27% — so anything
 * above 1 is read as already-a-percentage and divided down.
 *
 * This used to return a percentage while its own docstring promised a fraction,
 * and nothing downstream agreed with it. The manual form converts on the way in
 * (`blackOwnership: formState.blackOwnership / 100`) and the calculators test
 * fractions (`sup.blackOwnership >= 0.51`), so a bulk-uploaded supplier with 5%
 * black ownership arrived as `5` — and `5 >= 0.51` cleared EVERY ownership
 * threshold: the ≥51% line, both black-women lines, and designated group. The
 * grid showed it plainly as "4079%". Bulk and manual entry now store the same
 * unit, which is the only way the same numbers can score the same way.
 */
const pct = (v: unknown): number => {
  const n = num(v);
  if (n === 0) return 0;
  return n > 1 ? n / 100 : n;
};

/**
 * The same reading, kept as a PERCENTAGE out of 100.
 *
 * The units are genuinely mixed and the types say so: Shareholder and Supplier
 * ownership are fractions (`sup.blackOwnership >= 0.51`), but
 * `Contribution.blackBenefitPercent` is documented "0-100%, critical for SED
 * scoring" and the API parser converts INTO that unit. One helper for both was
 * how a single change could fix procurement and silently divide every SED
 * contribution's black benefit by a hundred.
 */
const pctOf100 = (v: unknown): number => {
  const n = num(v);
  if (n === 0) return 0;
  return n > 1 ? n : n * 100;
};

/**
 * The registry match `applyCertificateMatches` attaches to a row.
 *
 * Written as `_certificate` alongside the filled cells, so it is present only
 * when the row actually matched something in the certificate database.
 */
function certProvenance(row: ParsedRow): {
  certificateId?: string | null;
  companyName?: string | null;
  basis?: string | null;
} | null {
  const raw = (row as Record<string, unknown>)._certificate;
  return raw && typeof raw === "object" ? (raw as Record<string, never>) : null;
}

/** The workbook stores Yes/No columns as booleans, but a raw sheet may not. */
const bool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  return /^(y|yes|true|1)$/i.test(str(v));
};

/**
 * Yes/No as the sheet ACTUALLY states it, or undefined when it does not ask.
 *
 * The difference decides whether spend scores. `calculateProcurementScore`
 * reads `isEmpoweringSupplier ?? (the supplier has a valid B-BBEE level)` and
 * honours an explicit false as strict exclusion — so answering "no" on behalf
 * of a sheet that never carried the column zeroed every imported supplier.
 * Twenty suppliers, half a million rand of spend, and a score that did not
 * move. Silence is not a no.
 */
const statedBool = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") return v;
  const raw = str(v);
  if (raw === "") return undefined;
  return /^(y|yes|true|1)$/i.test(raw);
};

/** A grid splits a combined "Name & Surname" column; a person has one name. */
const fullName = (row: ParsedRow): string =>
  [str(row.name), str(row.surname)].filter(Boolean).join(" ").trim();

type Race = "African" | "Coloured" | "Indian" | "White";

const race = (v: unknown): Race => {
  const s = str(v).toLowerCase();
  if (s.startsWith("afr") || s.startsWith("bla")) return "African";
  if (s.startsWith("col")) return "Coloured";
  if (s.startsWith("ind") || s.startsWith("asi")) return "Indian";
  return "White";
};

const gender = (v: unknown): "Male" | "Female" => (/^f/i.test(str(v)) ? "Female" : "Male");

const DESIGNATIONS: Employee["designation"][] = [
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
];

/**
 * A designation as the toolkit's bands name it.
 *
 * Unrecognised text falls to "Junior" rather than to a senior band on purpose:
 * guessing upward hands an entity management points it has not evidenced.
 */
const designation = (v: unknown): Employee["designation"] => {
  const s = str(v).toLowerCase();
  if (!s) return "Junior";
  const exact = DESIGNATIONS.find((d) => d.toLowerCase() === s);
  if (exact) return exact;
  if (s.includes("non-exec") || s.includes("non exec")) return "Board";
  if (s.includes("executive director")) return "Executive Director";
  if (s.includes("other executive")) return "Other Executive Management";
  if (s.includes("exec") || s.includes("top management")) return "Executive";
  if (s.includes("senior")) return "Senior";
  if (s.includes("middle")) return "Middle";
  if (s.includes("junior")) return "Junior";
  if (s.includes("skilled technical") || s.includes("professional")) return "Skilled Technical";
  if (s.includes("semi")) return "Semi-skilled";
  if (s.includes("unskilled") || s.includes("elementary")) return "Unskilled";
  if (s.includes("board") || s.includes("director")) return "Board";
  return "Junior";
};

const beeLevel = (v: unknown): Supplier["beeLevel"] => {
  const n = Math.round(num(v));
  return (n >= 1 && n <= 8 ? n : 0) as Supplier["beeLevel"];
};

const enterpriseType = (v: unknown): Supplier["enterpriseType"] => {
  const s = str(v).toLowerCase();
  if (s.includes("eme")) return "eme";
  if (s.includes("qse")) return "qse";
  if (s.includes("generic") || s.includes("large")) return "generic";
  return "generic";
};

const CATEGORY_CODES = ["A", "B", "C", "D", "E", "F", "G"] as const;

const categoryCode = (v: unknown): TrainingProgram["categoryCode"] => {
  const c = str(v).toUpperCase().charAt(0) as (typeof CATEGORY_CODES)[number];
  return CATEGORY_CODES.includes(c) ? c : "C";
};

// -------------------------------------------------------------------- specs --

const ownership: BulkImportSpec<Shareholder> = {
  sectionKey: "ownership",
  label: "Ownership",
  noun: "shareholders",
  columns: OWNERSHIP_COLUMNS,
  requiredKeys: ["shareholderName"],
  toEntity: (row) => {
    const r = race(row.race);
    const isBlack = r !== "White";
    const isFemale = gender(row.gender) === "Female";
    const voting = pct(row.votingRights);
    const economic = pct(row.economicInterest);
    const holding = pct(row.shareholding) || voting || economic;
    // A black individual is wholly black-owned; the SIZE of what they hold is
    // the share percentage, not the black percentage. Conflating the two halves
    // an entity's black ownership.
    const explicitBlack = row.blackOwnership;
    const explicitBlackWomen = row.blackWomenOwnership;
    return {
      id: uuidv4(),
      name: str(row.shareholderName) || str(row.name),
      shareholderId: str(row.idNumber) || undefined,
      ownershipType: str(row.ownershipType) || "shareholder",
      // 1 is 100% as a fraction — the unit pct() now returns.
      blackOwnership: explicitBlack != null && str(explicitBlack) !== "" ? pct(explicitBlack) : isBlack ? 1 : 0,
      blackWomenOwnership:
        explicitBlackWomen != null && str(explicitBlackWomen) !== ""
          ? pct(explicitBlackWomen)
          : isBlack && isFemale
            ? 1
            : 0,
      votingRightsPercent: voting,
      economicInterestPercent: economic,
      // The register carries designated-group and new-entrant holdings as
      // percentages as well as flags. A percentage above zero IS the claim, so
      // a row that gives only the percentage still earns its points.
      isDesignatedGroup:
        bool(row.isYouth) || bool(row.isDisabled) || pct(row.designatedGroupOwnership) > 0,
      designatedGroupType: bool(row.isYouth) ? "youth" : bool(row.isDisabled) ? "disabled" : undefined,
      blackNewEntrant: pct(row.blackNewEntrantOwnership) > 0,
      yearsHeld: num(row.yearsHeld) || undefined,
      shares: Math.max(1, Math.round(holding * 100)),
      shareValue: num(row.shareValue) || 1,
    };
  },
  identity: (s) => s.name.toLowerCase(),
  duplicateLabel: (s) => s.name,
  previewColumns: ["Shareholder", "Voting %", "Economic %", "Black %"],
  describe: (s) => [
    s.name,
    `${s.votingRightsPercent}`,
    `${s.economicInterestPercent}`,
    `${s.blackOwnership}`,
  ],
};

const managementControl: BulkImportSpec<Employee> = {
  sectionKey: "management-control",
  label: "Management Control & Employment Equity",
  noun: "employees",
  columns: MC_EE_COLUMNS,
  requiredKeys: ["name"],
  toEntity: (row) => ({
    id: uuidv4(),
    name: fullName(row),
    idNumber: str(row.idNumber) || undefined,
    gender: gender(row.gender),
    race: race(row.race),
    designation: designation(row.designation || row.occupationalLevel),
    isDisabled: bool(row.isDisabled),
    isForeign: bool(row.isForeign),
    // No province column on this register: the EAP province is a Skills
    // Development setting, asked once for the entity, not per employee.
    hireDate: str(row.startDate) || undefined,
    annualSalary: num(row.salary) || undefined,
    votingRightsPercent: pct(row.votingRights) || undefined,
  }),
  identity: (e) => `${e.name.toLowerCase()}|${(e.idNumber ?? "").toLowerCase()}`,
  duplicateLabel: (e) => e.name,
  previewColumns: ["Name", "Designation", "Race", "Gender"],
  describe: (e) => [e.name, e.designation, e.race, e.gender],
};

const skillsDevelopment: BulkImportSpec<TrainingProgram> = {
  sectionKey: "skills-development",
  label: "Skills Development",
  noun: "interventions",
  columns: SKILLS_COLUMNS,
  requiredKeys: ["programName", "learnerName"],
  toEntity: (row) => {
    const category = categoryCode(row.categoryCode);
    const courseCost = num(row.courseCost);
    const travelCost = num(row.travelCost);
    const accommodationCost = num(row.accommodationCost);
    const cateringCost = num(row.cateringCost);
    const stationeryCost = num(row.stationeryCost);
    const facilityCost = num(row.trainingFacilityCost);
    const salaryCost = num(row.salaryCost);
    const otherCosts = num(row.otherCosts);
    const parts =
      courseCost + travelCost + accommodationCost + cateringCost + stationeryCost + facilityCost + salaryCost + otherCosts;
    // A sheet that carries only a total is the common case; one that itemises
    // wins, because the parts are what the cost-breakdown view shows.
    const totalCost = parts > 0 ? parts : num(row.totalCost);
    const learnerRace = race(row.race);
    return {
      id: uuidv4(),
      programName: str(row.programName),
      trainingProvider: str(row.trainingProvider) || undefined,
      categoryCode: category,
      learnerName: str(row.learnerName),
      learnerIdNumber: str(row.idNumber) || undefined,
      gender: gender(row.gender),
      race: learnerRace,
      isDisabled: bool(row.isDisabled),
      isForeign: bool(row.isForeign),
      // Unstated means employed, not unemployed. Skills scores unemployed
      // learners on their own line, so reading a missing column as "No" would
      // have claimed that line for every learner in an imported register —
      // the same mistake as the supplier one, pointing the other way: there it
      // withheld points, here it would invent them. A company's skills
      // register is its own people unless the sheet says otherwise.
      employmentStatus: statedBool(row.employed) === false ? "Unemployed" : "Permanent",
      isYesEmployee: false,
      isCompleted: bool(row.completed),
      isAbsorbed: bool(row.absorbed),
      municipality: str(row.municipality) || undefined,
      transactionDate: str(row.startDate) || new Date().toISOString().slice(0, 10),
      startDate: str(row.startDate) || undefined,
      endDate: str(row.endDate) || undefined,
      courseCost,
      travelCost,
      accommodationCost,
      cateringCost,
      stationeryCost,
      facilityCost,
      salaryCost,
      otherCosts,
      manHours: num(row.manHours) || undefined,
      isAbet: false,
      isMandatory: false,
      isBursary: category === "A",
      totalCost,
      name: str(row.programName),
      category: category === "A" ? "bursary" : category === "B" ? "learnership" : "short_course",
      cost: totalCost,
      isEmployed: statedBool(row.employed) !== false,
      isBlack: learnerRace !== "White",
    } as TrainingProgram;
  },
  identity: (p) => `${p.learnerName.toLowerCase()}|${p.programName.toLowerCase()}`,
  duplicateLabel: (p) => `${p.learnerName} — ${p.programName}`,
  previewColumns: ["Learner", "Programme", "Category", "Cost"],
  describe: (p) => [p.learnerName, p.programName, p.categoryCode, `${p.totalCost}`],
};

const procurement: BulkImportSpec<Supplier> = {
  sectionKey: "procurement",
  label: "Procurement / Suppliers",
  noun: "suppliers",
  columns: PROCUREMENT_COLUMNS,
  certificateLookup: true,
  requiredKeys: ["supplierName"],
  toEntity: (row) => ({
    id: uuidv4(),
    name: str(row.supplierName) || str(row.name),
    vatNumber: str(row.vatNumber) || undefined,
    registrationNumber: str(row.registrationNumber) || undefined,
    beeLevel: beeLevel(row.bbbeeLevel),
    blackOwnership: pct(row.currentBlackOwnership),
    blackWomenOwnership: pct(row.currentBlackFemaleOwnership),
    youthOwnership: 0,
    disabledOwnership: 0,
    designatedGroupOwnership: pct(row.designated) || undefined,
    flowThroughOwnership: pct(row.unmodifiedBlackOwnership) || undefined,
    enterpriseType: enterpriseType(row.currentSize),
    // Unstated stays unstated: the calculator then falls back to "has a valid
    // B-BBEE level", which is what an imported register means. The two below
    // only ever ADD points, so a false there claims nothing that was not
    // evidenced — the asymmetry is deliberate.
    isEmpoweringSupplier: statedBool(row.empoweringSupplier) as boolean,
    isSupplierDevRecipient: bool(row.sdRecipient),
    hasThreeYearContract: bool(row.threeYearContract),
    firstProcurementDate: str(row.firstProcurementDate) || undefined,
    sizeAtFirstProcurement: str(row.sizeAtFirstProcurement)
      ? enterpriseType(row.sizeAtFirstProcurement)
      : undefined,
    certificateExpiryDate: str(row.certificateExpiryDate) || undefined,
    // The registry match, carried onto the record rather than dropped here.
    // Without it the level and expiry survived but the document they came from
    // did not, so Procurement could assert a supplier's B-BBEE status and never
    // show it.
    certificateId: certProvenance(row)?.certificateId ?? undefined,
    certificateMatchedName: certProvenance(row)?.companyName ?? undefined,
    certificateMatchBasis: certProvenance(row)?.basis ?? undefined,
    spend: num(row.spend),
  }),
  identity: (s) => s.name.toLowerCase(),
  duplicateLabel: (s) => s.name,
  // Two lines for one supplier are usually two invoices against one account.
  duplicateAmountField: "spend",
  previewColumns: ["Supplier", "Spend", "B-BBEE level", "Black %"],
  describe: (s) => [s.name, `${s.spend}`, s.beeLevel ? `${s.beeLevel}` : "—", `${s.blackOwnership}`],
};

/**
 * ESD and SED are the same record with a different home, so they share a
 * builder. `category` is what separates them and it is never guessed: a
 * contribution the sheet does not classify is stored unclassified, which scores
 * nothing and is reported, rather than being counted as whichever pays best.
 */
function contributionSpec(
  which: "esd" | "sed",
  label: string,
  columns: ColumnDef[],
): BulkImportSpec<Contribution> {
  return {
    sectionKey: which,
    label,
    noun: "contributions",
    columns,
    // ESD names its subject "supplierName" (the beneficiary IS a supplier);
    // SED names it "beneficiaryName". Same record, different register.
    requiredKeys: [which === "esd" ? "supplierName" : "beneficiaryName"],
    toEntity: (row) => {
      const declared = str(row.esdCategory).toLowerCase();
      const category: Contribution["category"] =
        which === "sed"
          ? "socio_economic"
          : declared.includes("supplier")
            ? "supplier_development"
            : declared.includes("enterprise")
              ? "enterprise_development"
              : "unclassified";
      return {
        id: uuidv4(),
        beneficiary: str(row.supplierName) || str(row.beneficiaryName),
        description:
          str(row.contributionDescription) || str(row.descriptionOfSpend) || undefined,
        type: str(row.contributionType) as Contribution["type"],
        amount: num(row.amount),
        category,
        transactionDate:
          str(row.paymentDate) || str(row.invoiceDate) || str(row.dateOfTransaction) || undefined,
        // SED scoring weights a contribution by how much of it reaches black
        // beneficiaries, so an unstated percentage must stay unstated rather
        // than defaulting to full benefit.
        blackBenefitPercent:
          which === "sed" ? pctOf100(row.percentBenefitingBlack) || undefined : undefined,
      } as Contribution;
    },
    identity: (c) => `${c.beneficiary.toLowerCase()}|${c.amount}`,
    duplicateLabel: (c) => c.beneficiary,
    duplicateAmountField: "amount",
    previewColumns: ["Beneficiary", "Amount", "Type", "Classified as"],
    describe: (c) => [
      c.beneficiary,
      `${c.amount}`,
      String(c.type ?? "—"),
      c.category === "unclassified" ? "Unclassified" : c.category.replace(/_/g, " "),
    ],
  };
}

/**
 * YES 4 Youth placements.
 *
 * The workbook has a "Y.E.S Employees" sheet — a staff register: name, ID,
 * job title, race, gender, disabled, occupational level — and the toolkit
 * stores a YES candidate as a training programme carrying `isYesEmployee`,
 * which is what the YES page filters on. So it reads with the Management
 * Control columns and lands as a flagged programme.
 *
 * Two things are deliberately NOT invented, because the sheet does not carry
 * them and guessing either would hand out points nobody evidenced:
 *
 *   - cost stays zero. A placement's cost belongs to Skills Development and
 *     this sheet states none, so these rows add no skills spend.
 *   - absorption stays false. Absorption is a large part of the YES uplift and
 *     the register does not record it; it is set per candidate afterwards.
 */
const yes: BulkImportSpec<TrainingProgram> = {
  sectionKey: "management-control",
  sheetHints: ["y.e.s employees", "yes employees", "yes 4 youth", "yes4youth", "yes"],
  label: "YES 4 Youth",
  noun: "candidates",
  columns: MC_EE_COLUMNS,
  requiredKeys: ["name"],
  toEntity: (row) => {
    const learnerRace = race(row.race);
    return {
      id: uuidv4(),
      programName: "YES 4 Youth placement",
      categoryCode: "C",
      learnerName: fullName(row),
      learnerIdNumber: str(row.idNumber) || undefined,
      gender: gender(row.gender),
      race: learnerRace,
      isDisabled: bool(row.isDisabled),
      isForeign: bool(row.isForeign),
      employmentStatus: "Fixed-Term",
      isYesEmployee: true,
      isCompleted: false,
      isAbsorbed: false,
      transactionDate: new Date().toISOString().slice(0, 10),
      courseCost: 0,
      travelCost: 0,
      accommodationCost: 0,
      cateringCost: 0,
      stationeryCost: 0,
      facilityCost: 0,
      salaryCost: 0,
      otherCosts: 0,
      isAbet: false,
      isMandatory: false,
      isBursary: false,
      totalCost: 0,
      name: "YES 4 Youth placement",
      category: "short_course",
      cost: 0,
      isEmployed: true,
      isBlack: learnerRace !== "White",
    } as TrainingProgram;
  },
  identity: (p) => `${p.learnerName.toLowerCase()}|${(p.learnerIdNumber ?? "").toLowerCase()}`,
  duplicateLabel: (p) => p.learnerName,
  previewColumns: ["Candidate", "Race", "Gender", "Black youth"],
  describe: (p) => [p.learnerName, p.race, p.gender, p.isBlack ? "Yes" : "No"],
};

export const BULK_IMPORT_SPECS = {
  ownership,
  "management-control": managementControl,
  "skills-development": skillsDevelopment,
  procurement,
  yes,
  esd: contributionSpec("esd", "Enterprise & Supplier Development", ESD_COLUMNS),
  sed: contributionSpec("sed", "Socio-Economic Development", SED_COLUMNS),
} as const;

export type BulkImportSpecKey = keyof typeof BULK_IMPORT_SPECS;
