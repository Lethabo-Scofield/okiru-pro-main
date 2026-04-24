import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";

interface ParsedRow {
  [key: string]: string | number | boolean | null;
}

interface SheetData {
  name: string;
  headers: string[];
  rows: ParsedRow[];
}

function normalise(s: string): string {
  return (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchHeader(header: string, targets: string[]): boolean {
  const h = normalise(header);
  return targets.some((t) => h.includes(normalise(t)));
}

function parseSheets(workbook: XLSX.WorkBook): SheetData[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: "" });
    if (json.length < 2) return { name, headers: [], rows: [] };

    const headerRow = (json[0] as any[]).map((h: any) => String(h || "").trim());
    const rows: ParsedRow[] = [];
    for (let i = 1; i < json.length; i++) {
      const row: ParsedRow = {};
      const vals = json[i] as any[];
      let hasData = false;
      headerRow.forEach((h, idx) => {
        const v = vals[idx] !== undefined ? vals[idx] : null;
        if (v !== null && v !== "") hasData = true;
        row[h] = v;
      });
      if (hasData) rows.push(row);
    }
    return { name, headers: headerRow, rows };
  });
}

function findVal(row: ParsedRow, targets: string[]): any {
  for (const key of Object.keys(row)) {
    if (matchHeader(key, targets)) return row[key];
  }
  return null;
}

function toNum(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toStr(v: any): string {
  return v == null ? "" : String(v).trim();
}

function matchSheet(sheets: SheetData[], targets: string[]): SheetData | null {
  for (const t of targets) {
    const found = sheets.find((s) => normalise(s.name).includes(normalise(t)));
    if (found && found.rows.length > 0) return found;
  }
  return null;
}

function inferRace(_name: string): string {
  return "";
}

function inferGender(name: string): string {
  const lower = name.toLowerCase();
  const femaleIndicators = ["ms", "mrs", "miss", "lindiwe", "nomsa", "thandi", "fatima", "ayesha", "naledi", "zanele", "mpho", "sarah", "nkosi"];
  if (femaleIndicators.some((f) => lower.includes(f))) return "Female";
  return "Male";
}

function extractShareholders(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "ownership", "shareholder", "voting", "equity",
  ]);
  if (!sheet) return [];

  const shareholders: any[] = [];
  for (const row of sheet.rows) {
    const name = toStr(findVal(row, ["name", "shareholder", "entity", "investor"]));
    if (!name) continue;

    const shares = toNum(findVal(row, ["shares", "percentage", "holding", "%"]));
    const bo = toNum(findVal(row, ["black", "blackownership", "bo%", "bo"]));
    const bwo = toNum(findVal(row, ["blackwomen", "bwo", "women", "female"]));
    const sv = toNum(findVal(row, ["value", "sharevalue", "cost"]));

    shareholders.push({
      id: uuidv4(),
      name,
      shares: shares > 1 ? shares : shares * 100,
      blackOwnership: bo > 1 ? bo / 100 : bo,
      blackWomenOwnership: bwo > 1 ? bwo / 100 : bwo,
      shareValue: sv,
      ownershipType: "shareholder",
    });
  }
  return shareholders;
}

function extractEmployees(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "management", "employee", "staff", "board", "ee", "employment equity",
  ]);
  if (!sheet) return [];

  const employees: any[] = [];
  for (const row of sheet.rows) {
    const name = toStr(findVal(row, ["name", "employee", "person", "staff"]));
    if (!name) continue;

    const designation = toStr(findVal(row, ["designation", "level", "position", "role", "grade"]));
    const gender = toStr(findVal(row, ["gender", "sex"]));
    const race = toStr(findVal(row, ["race", "demographic", "population"]));
    const disabled = findVal(row, ["disabled", "disability"]);

    const mappedDesignation = mapDesignation(designation);
    const mappedRace = mapRace(race);
    const mappedGender = gender ? mapGender(gender) : inferGender(name);

    employees.push({
      id: uuidv4(),
      name,
      designation: mappedDesignation,
      gender: mappedGender,
      race: mappedRace || "African",
      isDisabled: disabled === true || normalise(toStr(disabled)) === "yes" || disabled === 1,
    });
  }
  return employees;
}

function mapDesignation(d: string): string {
  const n = normalise(d);
  if (n.includes("board") || n.includes("director") || n.includes("ned")) return "Board";
  if (n.includes("exec") || n.includes("ceo") || n.includes("cfo") || n.includes("coo") || n.includes("cto") || n.includes("md")) return "Executive";
  if (n.includes("senior") || n.includes("snr") || n.includes("head")) return "Senior";
  if (n.includes("middle") || n.includes("manager") || n.includes("mid")) return "Middle";
  if (n.includes("junior") || n.includes("jnr") || n.includes("entry") || n.includes("clerk") || n.includes("assistant")) return "Junior";
  return "Middle";
}

function mapRace(r: string): string {
  const n = normalise(r);
  if (n.includes("african") || n.includes("black")) return "African";
  if (n.includes("coloured") || n.includes("colored")) return "Coloured";
  if (n.includes("indian") || n.includes("asian")) return "Indian";
  if (n.includes("white") || n.includes("caucasian")) return "White";
  return "";
}

function mapGender(g: string): string {
  const n = normalise(g);
  if (n.includes("female") || n.includes("woman") || n === "f") return "Female";
  if (n.includes("male") || n.includes("man") || n === "m") return "Male";
  return "Male";
}

function extractTrainingPrograms(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "skills", "training", "learnership", "bursary", "education",
  ]);
  if (!sheet) return [];

  const programs: any[] = [];
  for (const row of sheet.rows) {
    const name = toStr(findVal(row, ["name", "programme", "program", "course", "training"]));
    if (!name) continue;

    const cost = toNum(findVal(row, ["cost", "amount", "spend", "value"]));
    const cat = toStr(findVal(row, ["category", "type"]));
    const isBlack = findVal(row, ["black", "isblack", "hdsa"]);
    const employed = findVal(row, ["employed", "isemployed", "absorbed"]);
    const gender = toStr(findVal(row, ["gender", "sex"]));
    const race = toStr(findVal(row, ["race", "demographic"]));
    const disabled = findVal(row, ["disabled", "disability"]);

    programs.push({
      id: uuidv4(),
      name,
      cost,
      category: mapCategory(cat),
      isBlack: isBlack === true || normalise(toStr(isBlack)) === "yes" || isBlack === 1 || (race ? ["african", "coloured", "indian"].includes(normalise(mapRace(race))) : false),
      isEmployed: employed === true || normalise(toStr(employed)) === "yes" || employed === 1,
      gender: gender ? mapGender(gender) : "",
      race: race ? mapRace(race) : "",
      isDisabled: disabled === true || normalise(toStr(disabled)) === "yes" || disabled === 1,
    });
  }
  return programs;
}

function mapCategory(c: string): string {
  const n = normalise(c);
  if (n.includes("learner")) return "learnership";
  if (n.includes("intern")) return "internship";
  if (n.includes("bursary") || n.includes("scholarship")) return "bursary";
  if (n.includes("short") || n.includes("course")) return "short_course";
  return "other";
}

function extractSuppliers(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "procurement", "supplier", "vendor", "preferential",
  ]);
  if (!sheet) return [];

  const suppliers: any[] = [];
  for (const row of sheet.rows) {
    const name = toStr(findVal(row, ["name", "supplier", "vendor", "company"]));
    if (!name) continue;

    const spend = toNum(findVal(row, ["spend", "amount", "value", "total"]));
    const level = toNum(findVal(row, ["level", "beelevel", "bbbee", "rating"]));
    const bo = toNum(findVal(row, ["blackownership", "bo", "black%"]));
    const bwo = toNum(findVal(row, ["blackwomen", "bwo", "women"]));
    const entType = toStr(findVal(row, ["type", "enterprise", "size", "category"]));

    suppliers.push({
      id: uuidv4(),
      name,
      spend,
      beeLevel: Math.min(Math.max(Math.round(level) || 4, 1), 8),
      blackOwnership: bo > 1 ? bo / 100 : bo,
      blackWomenOwnership: bwo > 1 ? bwo / 100 : bwo,
      youthOwnership: 0,
      disabledOwnership: 0,
      enterpriseType: mapEnterpriseType(entType),
    });
  }
  return suppliers;
}

function mapEnterpriseType(t: string): string {
  const n = normalise(t);
  if (n.includes("eme") || n.includes("exempt")) return "eme";
  if (n.includes("qse") || n.includes("qualifying")) return "qse";
  return "generic";
}

function extractESD(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "esd", "enterprise", "supplier development",
  ]);
  if (!sheet) return [];

  const contributions: any[] = [];
  for (const row of sheet.rows) {
    const beneficiary = toStr(findVal(row, ["beneficiary", "name", "entity", "recipient"]));
    if (!beneficiary) continue;

    const amount = toNum(findVal(row, ["amount", "value", "contribution", "spend"]));
    const type = toStr(findVal(row, ["type", "category"]));

    contributions.push({
      id: uuidv4(),
      beneficiary,
      amount,
      type: type || "Grant",
      category: normalise(type).includes("supplier") ? "supplier_development" : "enterprise_development",
    });
  }
  return contributions;
}

function extractSED(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "sed", "socio", "csi", "social",
  ]);
  if (!sheet) return [];

  const contributions: any[] = [];
  for (const row of sheet.rows) {
    const beneficiary = toStr(findVal(row, ["beneficiary", "name", "entity", "recipient", "organisation"]));
    if (!beneficiary) continue;

    const amount = toNum(findVal(row, ["amount", "value", "contribution", "spend"]));
    const type = toStr(findVal(row, ["type", "category"]));

    contributions.push({
      id: uuidv4(),
      beneficiary,
      amount,
      type: type || "Donation",
      category: type || "social",
    });
  }
  return contributions;
}

function extractFinancials(sheets: SheetData[]) {
  const sheet = matchSheet(sheets, [
    "financial", "finance", "income", "overview", "summary", "scorecard",
  ]);

  const result = {
    revenue: 0,
    npat: 0,
    leviableAmount: 0,
    tmps: 0,
    industrySector: "",
  };

  if (!sheet) return result;

  for (const row of sheet.rows) {
    for (const key of Object.keys(row)) {
      const nk = normalise(key);
      const val = toNum(row[key]);

      if (nk.includes("revenue") || nk.includes("turnover") || nk.includes("income")) {
        if (val > result.revenue) result.revenue = val;
      }
      if (nk.includes("npat") || nk.includes("netprofit") || nk.includes("profit")) {
        if (val > 0 && (result.npat === 0 || val < result.revenue)) result.npat = val;
      }
      if (nk.includes("leviable") || nk.includes("payroll") || nk.includes("sdl")) {
        if (val > result.leviableAmount) result.leviableAmount = val;
      }
      if (nk.includes("tmps") || nk.includes("procurement") && nk.includes("spend")) {
        if (val > result.tmps) result.tmps = val;
      }
    }
  }

  for (const row of sheet.rows) {
    const sectorVal = toStr(findVal(row, ["sector", "industry"]));
    if (sectorVal && sectorVal.length > 2) {
      result.industrySector = sectorVal;
      break;
    }
  }

  return result;
}

export interface ClientSideImportResult {
  status: "success" | "partial_success" | "failed";
  sheetsFound: string[];
  sheetsMatched: string[];
  shareholders: any[];
  employees: any[];
  trainingPrograms: any[];
  suppliers: any[];
  esdContributions: any[];
  sedContributions: any[];
  financials: {
    revenue: number;
    npat: number;
    leviableAmount: number;
    tmps: number;
    industrySector: string;
  };
  logs: { message: string; type: "info" | "success" | "warning" | "error"; timestamp: string }[];
  entityCount: number;
}

export function generateMockImportResult(fileName: string): ClientSideImportResult {
  const ts = () => new Date().toISOString();
  const logs: ClientSideImportResult["logs"] = [];

  logs.push({ message: `Processing file: ${fileName}`, type: "info", timestamp: ts() });
  logs.push({ message: "Using sample B-BBEE data for demonstration", type: "info", timestamp: ts() });

  const shareholders = [
    { id: uuidv4(), name: "Thabo Mokoena", ownershipType: "shareholder", blackOwnership: 1.0, blackWomenOwnership: 0, shares: 35, shareValue: 15750000 },
    { id: uuidv4(), name: "Naledi Investments", ownershipType: "shareholder", blackOwnership: 1.0, blackWomenOwnership: 1.0, shares: 20, shareValue: 9000000 },
    { id: uuidv4(), name: "Asset Trust SA", ownershipType: "sale_of_assets", blackOwnership: 0.75, blackWomenOwnership: 0.40, shares: 15, shareValue: 6750000 },
    { id: uuidv4(), name: "Johan van der Merwe", ownershipType: "shareholder", blackOwnership: 0, blackWomenOwnership: 0, shares: 30, shareValue: 13500000 },
  ];
  logs.push({ message: `Loaded ${shareholders.length} shareholders`, type: "success", timestamp: ts() });

  const employees = [
    { id: uuidv4(), name: "Sipho Ndlovu", gender: "Male", race: "African", designation: "Executive", isDisabled: false },
    { id: uuidv4(), name: "Lindiwe Dlamini", gender: "Female", race: "African", designation: "Executive", isDisabled: false },
    { id: uuidv4(), name: "Raj Patel", gender: "Male", race: "Indian", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "Nomsa Khumalo", gender: "Female", race: "African", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "David Botha", gender: "Male", race: "White", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "Zanele Mthembu", gender: "Female", race: "African", designation: "Middle", isDisabled: false },
    { id: uuidv4(), name: "Pieter Joubert", gender: "Male", race: "White", designation: "Middle", isDisabled: false },
    { id: uuidv4(), name: "Fatima Adams", gender: "Female", race: "Coloured", designation: "Middle", isDisabled: false },
    { id: uuidv4(), name: "Thandi Molefe", gender: "Female", race: "African", designation: "Junior", isDisabled: true },
    { id: uuidv4(), name: "Craig Williams", gender: "Male", race: "White", designation: "Junior", isDisabled: false },
    { id: uuidv4(), name: "Bongani Sithole", gender: "Male", race: "African", designation: "Junior", isDisabled: false },
    { id: uuidv4(), name: "Ayesha Naidoo", gender: "Female", race: "Indian", designation: "Junior", isDisabled: false },
    { id: uuidv4(), name: "Kagiso Mokone", gender: "Male", race: "African", designation: "Board", isDisabled: false },
    { id: uuidv4(), name: "Sarah du Plessis", gender: "Female", race: "White", designation: "Board", isDisabled: false },
    { id: uuidv4(), name: "Mpho Tshabalala", gender: "Female", race: "African", designation: "Board", isDisabled: false },
  ];
  logs.push({ message: `Loaded ${employees.length} employees`, type: "success", timestamp: ts() });

  const trainingPrograms = [
    { id: uuidv4(), name: "NQF 5 Management Programme", category: "learnership", cost: 185000, isEmployed: true, isBlack: true, gender: "Female", race: "African", isDisabled: false },
    { id: uuidv4(), name: "Artisan Apprenticeship", category: "learnership", cost: 120000, isEmployed: true, isBlack: true, gender: "Male", race: "African", isDisabled: false },
    { id: uuidv4(), name: "Graduate Engineering Internship", category: "internship", cost: 95000, isEmployed: false, isBlack: true, gender: "Male", race: "Coloured", isDisabled: false },
    { id: uuidv4(), name: "IT Skills Bootcamp", category: "short_course", cost: 45000, isEmployed: true, isBlack: true, gender: "Female", race: "African", isDisabled: true },
    { id: uuidv4(), name: "BCom Accounting Bursary", category: "bursary", cost: 280000, isEmployed: false, isBlack: true, gender: "Female", race: "African", isDisabled: false },
    { id: uuidv4(), name: "Leadership Development", category: "short_course", cost: 65000, isEmployed: true, isBlack: true, gender: "Male", race: "Indian", isDisabled: false },
    { id: uuidv4(), name: "Safety & Compliance Training", category: "other", cost: 32000, isEmployed: true, isBlack: false, gender: "Male", race: "White", isDisabled: false },
  ];
  logs.push({ message: `Loaded ${trainingPrograms.length} training programs`, type: "success", timestamp: ts() });

  const suppliers = [
    { id: uuidv4(), name: "Masakhane Steel (Pty) Ltd", beeLevel: 1, blackOwnership: 0.85, blackWomenOwnership: 0.45, youthOwnership: 0.20, disabledOwnership: 0, enterpriseType: "generic", spend: 12500000 },
    { id: uuidv4(), name: "Ubuntu Office Supplies", beeLevel: 2, blackOwnership: 1.0, blackWomenOwnership: 1.0, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "eme", spend: 3200000 },
    { id: uuidv4(), name: "Kagiso Logistics", beeLevel: 1, blackOwnership: 0.70, blackWomenOwnership: 0.30, youthOwnership: 0.40, disabledOwnership: 0, enterpriseType: "qse", spend: 8700000 },
    { id: uuidv4(), name: "Global Tech Solutions", beeLevel: 4, blackOwnership: 0.25, blackWomenOwnership: 0.10, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "generic", spend: 15000000 },
    { id: uuidv4(), name: "Nkosi Cleaning Services", beeLevel: 1, blackOwnership: 1.0, blackWomenOwnership: 0.60, youthOwnership: 0, disabledOwnership: 0.15, enterpriseType: "eme", spend: 1800000 },
    { id: uuidv4(), name: "Protea Engineering", beeLevel: 3, blackOwnership: 0.51, blackWomenOwnership: 0, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "generic", spend: 6500000 },
  ];
  logs.push({ message: `Loaded ${suppliers.length} suppliers`, type: "success", timestamp: ts() });

  const esdContributions = [
    { id: uuidv4(), beneficiary: "Masakhane Steel Development", type: "Supplier", amount: 180000, category: "supplier_development" },
    { id: uuidv4(), beneficiary: "Youth Enterprise Incubator", type: "Enterprise", amount: 95000, category: "enterprise_development" },
  ];
  logs.push({ message: `Loaded ${esdContributions.length} ESD contributions`, type: "success", timestamp: ts() });

  const sedContributions = [
    { id: uuidv4(), beneficiary: "Diepsloot Community School", type: "Education", amount: 75000, category: "education" },
    { id: uuidv4(), beneficiary: "Alexandra Skills Centre", type: "Skills", amount: 50000, category: "skills" },
  ];
  logs.push({ message: `Loaded ${sedContributions.length} SED contributions`, type: "success", timestamp: ts() });

  const entityCount = shareholders.length + employees.length + trainingPrograms.length + suppliers.length + esdContributions.length + sedContributions.length;
  logs.push({ message: `Total: ${entityCount} entities ready to apply`, type: "success", timestamp: ts() });

  return {
    status: "success",
    sheetsFound: ["Ownership", "Management", "Skills", "Procurement", "ESD", "SED", "Financials"],
    sheetsMatched: ["Ownership", "Management", "Skills", "Procurement", "ESD", "SED"],
    shareholders,
    employees,
    trainingPrograms,
    suppliers,
    esdContributions,
    sedContributions,
    financials: {
      revenue: 85000000,
      npat: 12500000,
      leviableAmount: 42000000,
      tmps: 52000000,
      industrySector: "Manufacturing",
    },
    logs,
    entityCount,
  };
}

export async function parseExcelClientSide(file: File): Promise<ClientSideImportResult> {
  const logs: ClientSideImportResult["logs"] = [];
  const ts = () => new Date().toISOString();

  logs.push({ message: `Reading file: ${file.name}`, type: "info", timestamp: ts() });

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  logs.push({ message: `Found ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(", ")}`, type: "info", timestamp: ts() });

  const sheets = parseSheets(workbook);
  const sheetsWithData = sheets.filter((s) => s.rows.length > 0);

  logs.push({ message: `${sheetsWithData.length} sheets contain data`, type: "info", timestamp: ts() });

  const shareholders = extractShareholders(sheets);
  if (shareholders.length > 0) logs.push({ message: `Extracted ${shareholders.length} shareholders`, type: "success", timestamp: ts() });

  const employees = extractEmployees(sheets);
  if (employees.length > 0) logs.push({ message: `Extracted ${employees.length} employees`, type: "success", timestamp: ts() });

  const trainingPrograms = extractTrainingPrograms(sheets);
  if (trainingPrograms.length > 0) logs.push({ message: `Extracted ${trainingPrograms.length} training programs`, type: "success", timestamp: ts() });

  const suppliers = extractSuppliers(sheets);
  if (suppliers.length > 0) logs.push({ message: `Extracted ${suppliers.length} suppliers`, type: "success", timestamp: ts() });

  const esdContributions = extractESD(sheets);
  if (esdContributions.length > 0) logs.push({ message: `Extracted ${esdContributions.length} ESD contributions`, type: "success", timestamp: ts() });

  const sedContributions = extractSED(sheets);
  if (sedContributions.length > 0) logs.push({ message: `Extracted ${sedContributions.length} SED contributions`, type: "success", timestamp: ts() });

  const financials = extractFinancials(sheets);
  if (financials.revenue > 0 || financials.npat > 0) logs.push({ message: `Extracted financial data (Revenue: R${(financials.revenue / 1000000).toFixed(1)}M)`, type: "success", timestamp: ts() });

  const entityCount = shareholders.length + employees.length + trainingPrograms.length + suppliers.length + esdContributions.length + sedContributions.length;

  if (entityCount === 0) {
    logs.push({ message: "No B-BBEE data could be extracted from this file. Please check the sheet names and column headers match expected patterns.", type: "error", timestamp: ts() });
  }

  const sheetsMatched: string[] = [];
  if (shareholders.length > 0) sheetsMatched.push("Ownership");
  if (employees.length > 0) sheetsMatched.push("Management");
  if (trainingPrograms.length > 0) sheetsMatched.push("Skills");
  if (suppliers.length > 0) sheetsMatched.push("Procurement");
  if (esdContributions.length > 0) sheetsMatched.push("ESD");
  if (sedContributions.length > 0) sheetsMatched.push("SED");

  return {
    status: entityCount > 0 ? (entityCount > 3 ? "success" : "partial_success") : "failed",
    sheetsFound: workbook.SheetNames,
    sheetsMatched,
    shareholders,
    employees,
    trainingPrograms,
    suppliers,
    esdContributions,
    sedContributions,
    financials,
    logs,
    entityCount,
  };
}
