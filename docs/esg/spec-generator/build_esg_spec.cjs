/* Builds the Okiru ESG specification (.docx) for BEE / ESG professionals.
 * Plain-English document. Data-driven from JSON dumps of the live code plus
 * hand-written narrative. Run: node build_esg_spec.cjs <outDir>
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
  AlignmentType, WidthType, ShadingType, BorderStyle, PageBreak, TableOfContents,
  Footer, Header, PageNumber, LevelFormat, VerticalAlign,
} = require("docx");

const OUT = process.argv[2] || __dirname;
const P = (f) => path.join(__dirname, f);
const J = (f) => JSON.parse(fs.readFileSync(P(f), "utf8"));

const MATRIX = J("esg_matrix.json");
const ALLOW = J("esg_allowlist.json");
const FIELD_MAPS = J("esg_field_mappings.json");
const BRIDGE = J("esg_bridge.json");
const GRIDS = J("esg_grid_sections.json");
const CFG = J("esg_section_configs.json");
const SCORE = J("esg_scorecard_defs.json");

const REPO = "C:/Users/Administrator/Documents/GitHub/okiru-pro-main";
const p2w = fs.readFileSync(REPO + "/apps/web/src/lib/esg/esgParserToWorkbook.ts", "utf8");
const NO_HOME = {};
{
  const start = p2w.indexOf("const NO_HOME_BY_KEY");
  const end = p2w.indexOf("};", start);
  const block = p2w.slice(start, end);
  const re = /"([a-z]+\.[a-z0-9_]+)":\s*\n?\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block))) NO_HOME[m[1]] = m[2];
}
const dom = fs.readFileSync(REPO + "/okiru-ai-parser/src/services/extractionDomain.ts", "utf8");
const GRID_SHAPES = {};
{
  const start = dom.indexOf("const ESG_GRIDS");
  const end = dom.indexOf("};", start);
  const block = dom.slice(start, end);
  const re = /([a-z_]+__[a-z0-9_]+):\s*\{\s*rowsField:\s*'([^']+)',\s*containerKeys:\s*\[([^\]]*)\],\s*rowFields:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block))) {
    GRID_SHAPES[m[1]] = {
      rowsField: m[2],
      container: m[3].replace(/['\s]/g, ""),
      rowFields: m[4].replace(/['\s\n]/g, "").split(",").filter(Boolean),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Plain-English vocab                                                  */
/* ------------------------------------------------------------------ */
const ELEMENTS = [
  { id: "GHG_ENERGY", pillar: "E", title: "Energy, emissions and climate targets",
    feeds: "Environmental data sheet (electricity, solar, generator diesel and LPG monthly blocks), the greenhouse-gas summary, the carbon tax sheet and the net-zero roadmap.",
    intro: "Everything the company buys or generates as energy, and everything that converts into tonnes of CO₂e. The carbon tax return sits here too, because its payload is emissions even though it is a tax filing." },
  { id: "FLEET", pillar: "E", title: "Fleet and fuel",
    feeds: "Fleet register (one row per vehicle), driver debrief register and the fleet-diesel monthly block on the Environmental data sheet.",
    intro: "Vehicle-level evidence. It is kept apart from energy because the same litres drive three different scores: Scope 1 emissions, fuel efficiency (litres per 100 km) and the electric-vehicle share of the fleet." },
  { id: "WASTE", pillar: "E", title: "Waste",
    feeds: "Waste register (one row per site, month and waste stream) and the contractor totals on the Environmental data sheet.",
    intro: "Waste evidence comes from a contractor, in kilograms, with a diversion rate and a safe-disposal certificate number. No other document type uses that vocabulary." },
  { id: "WATER", pillar: "E", title: "Water",
    feeds: "Water monthly block on the Environmental data sheet (kilolitres by site and month).",
    intro: "Municipal water accounts. Kept apart from electricity because one municipal statement can be water-only, electricity-only or combined, and the kilolitres must not be lost when the kWh dominates the page." },
  { id: "ISO_ENVIRONMENTAL", pillar: "E", title: "Environmental management (ISO 14001, policy, legal register)",
    feeds: "ISO tracker (ISO 14001 clause block), the environmental policy row on the Governance data sheet, and the four ISO / policy / legal indicators on the Environmental scorecard.",
    intro: "Status evidence rather than measurements: a certificate, a board-approved policy, an aspects and impacts register and a legal register." },
  { id: "EMPLOYMENT_EQUITY", pillar: "S", title: "Employment equity",
    feeds: "The employment equity headcount grid on the Social data sheet (race × gender × occupational level) and the EE Scorecard maturity rows.",
    intro: "The EEA2 return is the one genuinely two-dimensional table in the whole ESG set: one row per occupational level, ten race-and-gender columns." },
  { id: "HEALTH_SAFETY", pillar: "S", title: "Health and safety",
    feeds: "The quarterly health-and-safety block on the Social data sheet (hours worked, injuries, incidents) and the ISO 45001 clause block on the ISO tracker.",
    intro: "Injury statistics, the ISO 45001 certificate, and induction, training and legal-appointment registers. LTIFR and TRIFR are calculated by the system from these figures." },
  { id: "TRAINING", pillar: "S", title: "Training and skills development",
    feeds: "The WSP/ATR and payroll block on the Social data sheet (leviable payroll, grants, hours, spend) and the OFO training register.",
    intro: "Kept apart from employment equity because the denominator is leviable payroll, not headcount." },
  { id: "COMMUNITY_CSI", pillar: "S", title: "Community investment (CSI / SED)",
    feeds: "The CSI initiative register on the Social data sheet and the NPAT cell it is scored against.",
    intro: "Corporate social investment and socio-economic development spend, with the beneficiary evidence behind it. Scored against net profit after tax, so it depends on the financial statements as well." },
  { id: "SUPPLIER_ESG", pillar: "S", title: "Suppliers",
    feeds: "The supplier self-assessment register (one row per supplier, 1–5 per criterion).",
    intro: "Third-party data about someone else. It is the only family whose subject is not the measured company, which is why it never merges with the company's own ISO or ethics evidence." },
  { id: "BOARD_GOVERNANCE", pillar: "G", title: "Board and governance",
    feeds: "The board block on the Governance data sheet (composition, committees, meetings, integrated report) and the King V scorecard.",
    intro: "Board composition, committees, King V application and the integrated report." },
  { id: "ETHICS_COMPLIANCE", pillar: "G", title: "Ethics and compliance",
    feeds: "The ethics, POPIA and penalties rows on the Governance data sheet.",
    intro: "Policies, hotlines, POPIA appointments and penalties. Separated from the board family because the evidence is policies and incident registers rather than minutes and registers of people." },
  { id: "RISK_ASSURANCE", pillar: "G", title: "Risk and assurance",
    feeds: "The risk rows on the Governance data sheet, the GARP/GRAP risk register and the IFRS S1/S2 tracker; verified emissions totals from an assurance statement.",
    intro: "Risk registers, IFRS S1/S2 readiness and external assurance statements." },
  { id: "FINANCIAL", pillar: "X", title: "Company financials and B-BBEE status",
    feeds: "The Cover and Assumptions sheets (entity, sector, currency) and the denominators every ESG ratio divides by: NPAT, revenue, payroll and the public interest score. Also the company's B-BBEE status read by the B-BBEE bridge sheet.",
    intro: "Not an ESG topic in itself, but every percentage in the toolkit divides by something in the annual financial statements." },
];
const ELEMENT_BY_ID = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]));

const SECTION_NAMES = {
  "company-reporting-setup": "Cover sheet (company and reporting setup)",
  assumptions: "Assumptions sheet",
  "e-data": "Environmental data sheet (E_Data)",
  "s-data": "Social data sheet (S_Data)",
  "g-data": "Governance data sheet (G_Data)",
  ee: "EE Scorecard sheet",
  fleet: "Fleet register",
  waste: "Waste register",
  "driver-debrief": "Driver debrief register",
  "iso-tracker": "ISO tracker",
  king5: "King V scorecard",
  ifrs: "IFRS S1/S2 tracker",
  garp: "GARP / GRAP risk register",
  saq: "Supplier self-assessment register",
  "s-data-ofo": "Training OFO register (Social data sheet)",
  "s-data-csi": "CSI / community register (Social data sheet)",
};
const SHEET_OF_SECTION = {
  "company-reporting-setup": "Cover", assumptions: "Assumptions", "e-data": "E_Data", "s-data": "S_Data",
  "g-data": "G_Data", ee: "EE_Scorecard", fleet: "Fleet_Register", waste: "Waste_Register",
  "driver-debrief": "Driver_Debrief", "iso-tracker": "ISO_Tracker", king5: "King5_Scorecard", ifrs: "IFRS_S1_S2",
  garp: "GARP_GRAP", saq: "SAQ_Supplier", "s-data-ofo": "S_Data", "s-data-csi": "S_Data",
};
const MONTHLY = {
  "energy.electricity_kwh": { block: "grid electricity (Scope 2)", unit: "kWh", by: "site and month" },
  "energy.solar_kwh_generated": { block: "on-site solar generation", unit: "kWh", by: "site and month" },
  "energy.generator_diesel_litres": { block: "generator diesel (Scope 1B)", unit: "litres", by: "site and month" },
  "energy.lpg_kg": { block: "LPG (Scope 1C, one company-wide row)", unit: "kg", by: "month" },
  "water.kl": { block: "municipal water (Scope 3)", unit: "kilolitres", by: "site and month" },
};
const KIND_NOTE = {
  percentFraction: "stored as a fraction (45% becomes 0.45)",
  percentWhole: "stored exactly as printed (45% becomes 45)",
  select: "must match the sheet's own dropdown wording",
  count: "a whole number",
  year: "a four-digit year",
  date: "a date",
  number: "a number",
  text: "text",
};
const TYPE_TEXT = {
  text: "Text, copied as printed",
  number: "A number (the unit is in the name)",
  money: "A Rand amount, excluding VAT unless the document states otherwise",
  percentage: "A percentage as printed (45 means 45%)",
  boolean: "Yes or No only. \"Partial\" is not accepted here and is sent to review",
  tri_state: "Yes, No or Partial. \"Partial\" is kept as its own answer, never rounded",
  iso_date: "A date (year-month-day)",
  year: "A four-digit year",
};
const UNIT_WORDS = [
  [/\bkwh\b/g, "kWh"], [/\bkva\b/g, "kVA"], [/\bkwp\b/g, "kWp"], [/\bkl\b/g, "kL"], [/\bkg\b/g, "kg"],
  [/\bkm\b/g, "km"], [/\btco2e\b/g, "tCO₂e"], [/\bco2\b/g, "CO₂"], [/\brand\b/g, "Rand"], [/\bexcl vat\b/g, "excl. VAT"],
  [/\bnpat\b/g, "NPAT"], [/\bsdl\b/g, "SDL"], [/\bseta\b/g, "SETA"], [/\bofo\b/g, "OFO"], [/\bwsp\b/g, "WSP"],
  [/\batr\b/g, "ATR"], [/\bpopia\b/g, "POPIA"], [/\bpaia\b/g, "PAIA"], [/\bifrs\b/g, "IFRS"], [/\bsbti\b/g, "SBTi"],
  [/\biso14001\b/g, "ISO 14001"], [/\biso45001\b/g, "ISO 45001"], [/\bgvm\b/g, "GVM"], [/\bnqf\b/g, "NQF"],
  [/\bcsi\b/g, "CSI"], [/\bsed\b/g, "SED"], [/\bltifr\b/g, "LTIFR"], [/\btrifr\b/g, "TRIFR"], [/\bev\b/g, "EV"],
  [/\bpv\b/g, "PV"], [/\blpg\b/g, "LPG"], [/\bid\b/g, "ID"], [/\bnpo\b/g, "NPO"], [/\bpbo\b/g, "PBO"],
  [/\b18a\b/g, "18A"], [/\bhira\b/g, "HIRA"], [/\bking\b/g, "King"], [/\bee\b/g, "EE"], [/\bohs\b/g, "OHS"],
  [/\bsaq\b/g, "SAQ"], [/\bgri\b/g, "GRI"], [/\bghg\b/g, "GHG"], [/\bpaye\b/g, "PAYE"], [/\buif\b/g, "UIF"],
  [/\bbbbee\b/g, "B-BBEE"], [/\bafs\b/g, "AFS"], [/\bl per 100km\b/g, "litres per 100 km"],
  [/\bscope1 2\b/g, "Scope 1+2"], [/\bscope1\b/g, "Scope 1"], [/\bscope2\b/g, "Scope 2"], [/\bscope3\b/g, "Scope 3"],
  [/\bs1 s2\b/g, "S1/S2"], [/\bpercent\b/g, "%"], [/\bnema\b/g, "NEMA"], [/\bnwa\b/g, "NWA"], [/\bnemwa\b/g, "NEMWA"],
  [/\bs&ec\b/g, "S&EC"], [/\bineds?\b/g, "INED"], [/\bpia\b/g, "PIA"], [/\bemp201\b/g, "EMP201"], [/\bemp501\b/g, "EMP501"],
];
function human(name) {
  let s = String(name).replace(/^[a-z]+\./, "").replace(/_/g, " ").toLowerCase();
  for (const [re, w] of UNIT_WORDS) s = s.replace(re, w);
  s = s.replace(/\bis (.+)/, "is $1?").replace(/\bexcl\b/g, "excl.");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const ALLOW_BY_KEY = Object.fromEntries(ALLOW.map((a) => [a.key, a]));
function mappingFor(field, element) {
  return FIELD_MAPS.find((m) => m.field === field && (m.elements.length === 0 || m.elements.includes(element))) || null;
}
const GRID_LABEL = {};
for (const [sid, g] of Object.entries(GRIDS)) for (const c of g.columns) GRID_LABEL[`${sid}.${c.key}`] = c.label;

function destinationFor(key) {
  if (!key) return "Read as supporting evidence only. No cell in the workbook uses it yet.";
  if (MONTHLY[key]) {
    const m = MONTHLY[key];
    return `Environmental data sheet, ${m.block} monthly block, in ${m.unit}, filed by ${m.by} of the billing period.`;
  }
  const derived = BRIDGE.ESG_DERIVED_KEY_HOMES[key];
  if (derived) return `Calculated by the system, not typed in: ${derived.cell}. ${cap(derived.detail)}. A figure read from a document is shown for comparison but never written into that cell.`;
  const scalars = BRIDGE.ESG_SCALAR_TARGETS[key];
  if (scalars) {
    return scalars.map((t) => {
      const cellName = /^[A-Z]+\d+$/.test(t.cell) ? `${SHEET_OF_SECTION[t.sectionId]}!${t.cell}` : `"${t.cell}" field`;
      return `${SECTION_NAMES[t.sectionId]} (${cellName}); ${KIND_NOTE[t.kind] || t.kind}.`;
    }).join(" Also: ");
  }
  for (const [rows, g] of Object.entries(BRIDGE.ESG_GRID_TARGETS)) {
    if (g.columns[key]) return `${SECTION_NAMES[g.sectionId]}, column "${GRID_LABEL[`${g.sectionId}.${g.columns[key]}`] || g.columns[key]}" (one row per source row).`;
  }
  if (BRIDGE.ESG_SAQ_ROW_TARGET.columns[key]) return `${SECTION_NAMES.saq}, column "${GRID_LABEL[`saq.${BRIDGE.ESG_SAQ_ROW_TARGET.columns[key]}`]}" (one row per questionnaire).`;
  if (BRIDGE.ESG_HEADCOUNT_COLUMN_ORDER.includes(key)) return "Employment equity headcount grid on the Social data sheet (S_Data!B5:K11); the row is the occupational level, the column is this race-and-gender group.";
  if (BRIDGE.ESG_HS_QUARTERLY_ROWS[key]) {
    const r = BRIDGE.ESG_HS_QUARTERLY_ROWS[key];
    return `Health and safety block on the Social data sheet, row ${r.row}; the column is the quarter the report covers (Q1 Jul–Sep … Q4 Apr–Jun).`;
  }
  if (NO_HOME[key]) return NO_HOME[key];
  return "Read and kept as evidence. The workbook has no cell for it yet (a candidate for the expert to place).";
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ------------------------------------------------------------------ */
/* docx helpers                                                         */
/* ------------------------------------------------------------------ */
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134, USABLE = PAGE_W - 2 * MARGIN; // 9638
const FONT = "Calibri";
const COL = { head: "1F3864", grey: "E7E6E6", yellow: "FFF2CC", blue: "DEEAF6", green: "E2EFDA", rose: "FBE4E4", mono: "F2F2F2" };

function run(text, o = {}) {
  return new TextRun({ text, bold: o.bold, italics: o.italic, size: o.size || 21, font: o.mono ? "Consolas" : FONT, color: o.color });
}
function p(text, o = {}) {
  const children = Array.isArray(text) ? text : [run(text, o)];
  return new Paragraph({ children, spacing: { after: o.after ?? 120, before: o.before ?? 0 }, alignment: o.align, keepNext: o.keepNext });
}
function h1(t) { return new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }); }
function h2(t) { return new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 }); }
function h3(t) { return new Paragraph({ text: t, heading: HeadingLevel.HEADING_3 }); }
function h4(t) { return new Paragraph({ text: t, heading: HeadingLevel.HEADING_4 }); }
function bullet(text, level = 0) {
  const children = Array.isArray(text) ? text : [run(text)];
  return new Paragraph({ children, numbering: { reference: "bullets", level }, spacing: { after: 60 } });
}
function bullets(list) { return list.map((t) => bullet(t)); }
function numbered(list) { return list.map((t) => new Paragraph({ children: Array.isArray(t) ? t : [run(t)], numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 } })); }
function formula(text) {
  return new Paragraph({ children: [run(text, { mono: true, size: 17 })], shading: { type: ShadingType.CLEAR, fill: COL.mono, color: "auto" }, spacing: { after: 100 }, indent: { left: 360 } });
}
function cell(content, o = {}) {
  const paras = (Array.isArray(content) ? content : [content]).map((c) =>
    c instanceof Paragraph ? c : new Paragraph({ children: Array.isArray(c) ? c : [run(String(c ?? ""), { bold: o.bold, size: o.size || 18, color: o.color, italic: o.italic })], spacing: { after: 40 } }));
  return new TableCell({
    width: { size: o.width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    verticalAlign: VerticalAlign.TOP,
    children: paras,
  });
}
function table(headers, rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = USABLE / total;
  const w = widths.map((x) => Math.round(x * scale));
  const headFill = o.headFill || COL.grey;
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { width: w[i], bold: true, fill: headFill, size: 18 })),
  });
  const body = rows.map((r, ri) => new TableRow({
    cantSplit: o.cantSplit ?? true,
    children: r.map((c, i) => cell(c, { width: w[i], fill: o.rowFill ? o.rowFill(ri, i, r) : undefined, size: o.size || 18 })),
  }));
  return new Table({ columnWidths: w, width: { size: USABLE, type: WidthType.DXA }, rows: [headRow, ...body] });
}
function box(title, lines, fill = COL.blue) {
  const paras = [new Paragraph({ children: [run(title, { bold: true, size: 20 })], spacing: { after: 60 } })];
  for (const l of lines) paras.push(new Paragraph({ children: Array.isArray(l) ? l : [run(l, { size: 19 })], spacing: { after: 60 } }));
  return new Table({
    columnWidths: [USABLE], width: { size: USABLE, type: WidthType.DXA },
    rows: [new TableRow({ children: [new TableCell({ width: { size: USABLE, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill, color: "auto" }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: paras })] })],
  });
}
function expertTable(headers, rows, widths) {
  return table(headers, rows, widths, { headFill: COL.yellow, rowFill: () => "FFFBEA" });
}
function blankRows(n, cols) { return Array.from({ length: n }, () => Array.from({ length: cols }, () => "")); }
function spacer() { return new Paragraph({ spacing: { after: 120 } }); }

/* ------------------------------------------------------------------ */
/* Hand-written content                                                 */
/* ------------------------------------------------------------------ */

// Plain-English scoring rules per indicator, keyed by pillar + row key.
const RULES = {
  E: {
    d5: { rule: "5 points if any fleet diesel has been captured for the year (total litres above zero). Otherwise 0.", inputs: "Fleet diesel monthly block total (E_Data!L19)", evidence: "Fuel card statements, fleet fuel reports", status: "Live" },
    d6: { rule: "Compare this year's Scope 1+2 figure with the baseline. Reduction = (baseline − this year) ÷ baseline. A reduction of 10% or more earns the full 10. Between 10% and half of that (5% on the Standard stance) it is pro-rata: 10 × reduction ÷ 10%. Below that, 0. No baseline entered, 0.", inputs: "Baseline tCO₂e (E_Data!B90), current year (E_Data!F90), target 10% (Assumptions!B43), stance floor (B9)", evidence: "SBTi letter or net-zero statement for the baseline; prior-year inventory", status: "Live, but see the mixed-unit warning in section 3.4: F90 is a sum of litres and kWh, not tonnes" },
    d7: { rule: "Solar generation as a share of grid electricity. 20% or more earns 8; between 20% and 20% × floor pro-rata; below that 0. In the original workbook this formula points at two empty cells and could never score; the corrected calculation reads the real totals.", inputs: "Solar kWh (E_Data!L81 = sum of L50:L54), grid kWh (L80 = L46), target 20% (B44)", evidence: "Solar generation reports, electricity bills", status: "Live (corrected)" },
    d8: { rule: "5 points if any municipal water has been captured for the year (total kilolitres above zero). Water is the toolkit's only Scope 3 line, so this is what \"Scope 3 tracking\" means here.", inputs: "Water monthly block total (E_Data!L63)", evidence: "Municipal water bills", status: "Live" },
    d9: { rule: "5 points if the net-zero target year is between 2030 and 2060. 2.5 if some other year is set. 0 if none is set. The original code substituted 2050 when nothing was entered, which gave every company the points; that default is gone.", inputs: "Net-zero target year (Assumptions!B107)", evidence: "SBTi commitment letter, net-zero target statement", status: "Live (corrected)" },
    d11: { rule: "5 points if any grid electricity has been captured for the year (total kWh above zero).", inputs: "Electricity monthly block total (E_Data!L46)", evidence: "Municipal electricity bills", status: "Live" },
    d12: { rule: "Improvement = (prior-year kWh − this year kWh) ÷ prior-year kWh, banded exactly like the Scope 1 reduction (10% target, stance floor). Needs the prior-year total.", inputs: "Prior-year kWh (E_Data!B92), this year (L46), target (B43)", evidence: "Prior-year electricity bills or energy report", status: "Live once B92 is entered; the workbook itself never computed it" },
    d13: { rule: "Solar kWh across all sites ÷ grid kWh. 20% or more earns 8, pro-rata down to 20% × floor, then 0.", inputs: "Solar rows (E_Data!L50:L54), grid (L46), target (B44)", evidence: "Solar generation reports", status: "Live" },
    d15: { rule: "Share of measured vehicles whose actual litres per 100 km is within 5% of the manufacturer norm, × 8. Only vehicles with a measured figure count in the denominator.", inputs: "Fleet register columns: actual L/100km, norm L/100km; tolerance 1.05 (Assumptions!B45)", evidence: "Fleet vehicle register, fuel card statements, telematics", status: "Live" },
    d16: { rule: "5 points if at least one vehicle has both a payload (kg) and monthly kilometres recorded, which is what makes a tonne-kilometre figure possible.", inputs: "Fleet register: carry (kg) and monthly km", evidence: "Fleet vehicle register", status: "Live" },
    d17: { rule: "Electric vehicles ÷ total vehicles. 5% or more earns 5, pro-rata down to 5% × floor, then 0.", inputs: "EV count and total vehicles, counted from the fleet register (Fleet_Register!H28, B28); target 5% (B46)", evidence: "Fleet vehicle register (EV flag per vehicle)", status: "Live" },
    d19: { rule: "Diversion rate = recycled kg ÷ total kg across the waste register. 75% or more earns 5, pro-rata down to 75% × floor, then 0. There is no extra credit for the 90% excellence benchmark.", inputs: "Waste register totals (Waste_Register!B16); target 75% (B48)", evidence: "Waste contractor reports", status: "Live" },
    d20: { rule: "4 points if the average monthly recycling percentage reported by the waste contractor (Cority) is above zero.", inputs: "Cority monthly % recycled row (Waste_Register!B17)", evidence: "Waste contractor monthly report", status: "Live" },
    d21: { rule: "3 points if landfill emissions have been calculated: landfill kg × 0.58 ÷ 1000 above zero.", inputs: "Landfill kg from the register (Waste_Register!B18)", evidence: "Waste contractor reports", status: "Live" },
    d23: { rule: "4 points if any water has been captured for the year.", inputs: "Water monthly block total (E_Data!L63)", evidence: "Municipal water bills", status: "Live" },
    d24: { rule: "Yes earns 3, Partial 1.5, No 0. A named water-saving project with an approved scope counts as Yes.", inputs: "Water efficiency initiative (E_Data!B94)", evidence: "Project charter or capex approval for a water-reduction project", status: "Live once entered; the workbook never computed it" },
    d26: { rule: "Proposed: half the points for holding an ISO 14001 certificate (the certification row on the ISO tracker) and half for overall EMS maturity (the ISO 14001 block score out of 60). Today this scores 0 because the ISO tracker block totals are not yet calculated.", inputs: "ISO tracker rows (ISO_Tracker!E16, E17)", evidence: "ISO 14001 certificate, stage-1 audit report", status: "Not yet scored (dead points)" },
    d27: { rule: "Proposed: 4 × the aspects-register clause score ÷ 5 (Fully compliant 4, Partially 2.4, Gap 0). Today 0.", inputs: "ISO tracker clause 6.1.2 row (ISO_Tracker!E10)", evidence: "Environmental aspects and impacts register", status: "Not yet scored (dead points)" },
    d28: { rule: "Proposed: the stricter of the board-approval answer on the Governance data sheet and the ISO tracker policy clause, scaled to 4. Today 0.", inputs: "Environmental policy board-approved (G_Data!B27), ISO tracker clause 5.2 (E8)", evidence: "Board-approved environmental policy with resolution reference", status: "Not yet scored (dead points)" },
    d29: { rule: "Proposed: 4 × the legal-register clause score ÷ 5, but only if the governance legal register is maintained. Today 0.", inputs: "ISO tracker clause 6.1.3 (E11), legal register maintained (G_Data!F21)", evidence: "Environmental legal register, permits, licences", status: "Not yet scored (dead points)" },
  },
  S: {
    d5: { rule: "Black employees as a share of headcount. 60% or more earns 8, pro-rata down to 60% × floor, then 0. Note: the workbook's own formula only looks at the top-management row (row 5), despite the label saying all levels. See the decision list.", inputs: "EE Scorecard B5 (calculated from the headcount grid); target 60% (Assumptions!B50)", evidence: "EEA2 / EEA4 return", status: "Live" },
    d6: { rule: "Black female headcount at top and senior management ÷ total headcount at those two levels. 30% or more earns 6, pro-rata down to 30% × floor, then 0. The label says levels 1–3 but the formula counts levels 1 and 2 only.", inputs: "Headcount grid rows 5–6, African/Coloured/Indian female columns; target 30% (B51)", evidence: "EEA2 / EEA4 return", status: "Live" },
    d7: { rule: "EE plan submitted and compliant: Yes 5, Partial 2.5, No 0.", inputs: "EE Scorecard B9", evidence: "EE plan, EEA2 submission reference", status: "Live" },
    d8: { rule: "Employees with disabilities ÷ total headcount. 2% or more earns 5, pro-rata down to 2% × floor, then 0.", inputs: "Disabled headcount (S_Data!B88) ÷ total (L12); target 2% (B52)", evidence: "EEA2 / EEA4 return (disability column)", status: "Live once B88 is entered" },
    d9: { rule: "EE forum or consultation active: Yes 3, Partial 1.5, No 0.", inputs: "EE Scorecard B10", evidence: "EE forum minutes", status: "Live" },
    d10: { rule: "Numerical EE targets set and tracked: Yes 3, Partial 1.5, No 0.", inputs: "EE Scorecard B12", evidence: "EE plan with numerical goals", status: "Live" },
    d12: { rule: "WSP submitted to the SETA on time: Yes 5, otherwise 0. There is no partial credit on this row.", inputs: "S_Data!B45", evidence: "WSP/ATR submission confirmation", status: "Live" },
    d13: { rule: "ATR submitted on time: Yes 5, otherwise 0.", inputs: "S_Data!B46", evidence: "WSP/ATR submission confirmation", status: "Live" },
    d14: { rule: "Training hours ÷ total headcount. 40 hours or more per employee earns 5, pro-rata down to 40 × floor, then 0.", inputs: "Training hours (S_Data!B49), headcount (L12); target 40 (B53)", evidence: "ATR, training register", status: "Live" },
    d15: { rule: "Mandatory grant claimed ÷ SDL levy paid (the levy is calculated as 1% of leviable payroll). 80% or more earns 5, pro-rata down to 80% × floor, then 0.", inputs: "Grant claimed (S_Data!B47), levy (B44 = B43 × 1%); target 80% (B54)", evidence: "SETA grant remittance, EMP201 / EMP501", status: "Live" },
    d17: { rule: "LTIFR = lost-time injuries × 1,000,000 ÷ hours worked. At or below 2.0 earns 8. Between 2.0 and 2.0 ÷ floor (4.0 on Standard) the score falls on a straight line: 8 × (1 + floor − LTIFR ÷ 2.0), never below 0. Above that, 0. If hours worked are missing the rate cannot be computed and the row scores 0.", inputs: "Quarterly LTIs and hours (S_Data rows 27 and 29, calculated into G35); limit 2.0 (B55)", evidence: "OHS injury statistics report", status: "Live" },
    d18: { rule: "8 points only when the company has reported zero fatalities for the four quarters. The original workbook also gave 8 when the cell was blank or held a dash, which rewarded not reporting; the corrected rule needs an actual zero.", inputs: "Quarterly fatalities (S_Data row 28)", evidence: "OHS injury statistics report", status: "Live (corrected)" },
    d19: { rule: "5 points if a driver fatigue programme is evidenced: learners on the fatigue-management OFO line above zero, or a driver debrief register present.", inputs: "S_Data!C59; driver debrief rows", evidence: "OFO training register, telematics / driver debrief report", status: "Live (the debrief trigger is an extension of the workbook rule)" },
    d20: { rule: "4 points if any incident has been recorded and therefore investigated (lost-time, medical-treatment, first-aid, near-miss or vehicle incidents).", inputs: "S_Data rows 29–33 quarter totals", evidence: "OHS incident register", status: "Live" },
    d22: { rule: "Total CSI spend ÷ NPAT. 1% or more earns 5, pro-rata down to 1% × floor, then 0. No NPAT, 0.", inputs: "CSI register total (S_Data!D82) ÷ NPAT (B84); target 1% (B56)", evidence: "CSI/SED spend records, annual financial statements", status: "Live once NPAT is entered" },
    d23: { rule: "Count the initiatives in the CSI register. 6 or more earns 5. At least 6 × floor (3 on Standard) earns 5 × count ÷ 6. Fewer, 0.", inputs: "CSI register rows (S_Data!A72:A79)", evidence: "CSI/SED spend records, beneficiary letters", status: "Live" },
    d24: { rule: "Local procurement spend ÷ total measured procurement. 40% or more earns 5, pro-rata down to 40% × floor, then 0.", inputs: "Local spend (S_Data!B86) ÷ total (B87); target 40% (B57)", evidence: "Creditors ledger split by supplier locality", status: "Live once B86/B87 are entered; no document type reads them yet" },
    d26: { rule: "Proposed: average supplier health-and-safety score ÷ 5 against 80%, banded. Today 0 because the supplier column averages are not yet calculated.", inputs: "Supplier register H&S column; target 80% (B58)", evidence: "Supplier self-assessment questionnaires", status: "Not yet scored (dead points)" },
    d27: { rule: "Proposed: same rule on the food safety column. Today 0.", inputs: "Supplier register food safety column", evidence: "Supplier self-assessment questionnaires, certificates of analysis", status: "Not yet scored (dead points)" },
  },
  G: {
    d5: { rule: "King V total ÷ 170 × 25. Each of the 17 principles scores Applied 10, Explained 7, Partially applied 5, Not applied 0; 170 is 17 × 10.", inputs: "King V scorecard total (King5_Scorecard!E21)", evidence: "King IV / King V application register, integrated report", status: "Live" },
    d6: { rule: "Social and ethics committee established: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 13", evidence: "Committee terms of reference and minutes", status: "Live" },
    d7: { rule: "ESG-linked executive remuneration: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 14", evidence: "Remuneration committee minutes, remuneration policy", status: "Live" },
    d9: { rule: "10 × IFRS tracker score ÷ 110. Each of the 22 requirements scores Disclosed 5, Partially disclosed 3, Not applicable 5, Not disclosed 0. The original workbook counted the word \"Yes\" in a column that never contains it, so it always scored 0.", inputs: "IFRS S1/S2 tracker total (IFRS_S1_S2!E29)", evidence: "IFRS S1/S2 readiness assessment", status: "Live (corrected)" },
    d10: { rule: "Climate risk on the board agenda: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 23", evidence: "Board minutes, risk register", status: "Live" },
    d12: { rule: "If a legal register is maintained: 8 when climate risk is also in the risk register, otherwise 4. No legal register, 0.", inputs: "G_Data rows 21 and 23", evidence: "Legal register, enterprise risk register", status: "Live" },
    d14: { rule: "5 points if the board has at least one member recorded (the public-interest gate).", inputs: "G_Data row 5 (board members)", evidence: "Board composition schedule", status: "Live" },
    d16: { rule: "POPIA information officer appointed: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 17", evidence: "Information officer appointment letter, regulator registration", status: "Live" },
    d17: { rule: "Cyber and data risk assessed: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 18", evidence: "POPIA impact assessment, risk register", status: "Live" },
    d19: { rule: "Integrated report published, scaled: Yes 8, Partial 4, No 0.", inputs: "G_Data row 20", evidence: "Integrated annual report", status: "Live" },
    d20: { rule: "External assurance of the ESG report: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 19", evidence: "External assurance statement", status: "Live" },
    d22: { rule: "Average of the code-of-ethics and whistleblower-hotline answers, scaled to 4 (both Yes earns 4).", inputs: "G_Data rows 15 and 16", evidence: "Code of ethics, whistleblower policy", status: "Live" },
    d24: { rule: "Legal register maintained: Yes 5, Partial 2.5, No 0.", inputs: "G_Data row 21", evidence: "Legal register", status: "Live" },
    d25: { rule: "5 points only when the company explicitly declares zero material regulatory penalties for the period. The original workbook read a row that does not exist and gave everyone 5.", inputs: "Penalties count (G_Data!B25)", evidence: "Penalties and sanctions disclosure (a nil return counts)", status: "Live (corrected)" },
  },
};

// Element-level rules and edge cases (plain English), plus expert prompts.
const ELEMENT_NOTES = {
  GHG_ENERGY: {
    rules: [
      "A bill is filed under the month of its billing-period end date. A bill for a month outside the reporting window is not filed anywhere; it is listed for review instead of being pushed into the nearest month.",
      "The site on the bill must match one of the company's depots on the workbook's own site list (spelling differences and punctuation are ignored). An unknown site is held for review; it is never filed under the first row.",
      "A combined municipal account that bills both electricity and water is read twice: once as an electricity bill and once as a water bill. Neither reading is dropped.",
      "Estimated meter readings are accepted but flagged; where an actual reading exists for the same period the actual one wins.",
      "A landlord recovery statement for a site that also has a direct municipal account is a double-count risk and is flagged.",
      "Scope 1, Scope 2 and total tonnes read from a document (for example a GHG verification statement) are shown for comparison only. The workbook calculates its own totals from the monthly figures and those cells are never overwritten.",
      "The net-zero target year is written to both the Cover sheet and the Assumptions sheet because both are read by different parts of the workbook.",
      "Fleet diesel litres per depot per month (the largest Scope 1 line) are NOT yet filed automatically from fuel card statements. Today they are typed or imported by the consultant. This is the biggest open gap in this family.",
    ],
    expert: [
      "Which other documents carry Scope 1 or Scope 2 activity (for example refrigerant gas top-ups, steam or heat purchases, company-car logbooks)? Each needs a document type, the values to read and the block it feeds.",
      "Confirm the emission factors and their vintages (DEFRA 2024, Eskom 2024). Should a company be allowed to supply its own factors with evidence?",
      "Decide the prior-year baseline rule: is the SBTi letter the baseline source, or the prior-year inventory?",
      "Confirm the reporting window rule for a bill that straddles two months (end date today).",
    ],
  },
  FLEET: {
    rules: [
      "A vehicle register is read as a table: every row becomes a row in the fleet register. A 134-vehicle list produces 134 rows; the system never summarises or samples.",
      "Litres per 100 km is calculated per vehicle as monthly litres ÷ monthly km × 100 when both are present; a figure printed on the document is accepted as well.",
      "The electric-vehicle flag per vehicle is what makes the EV share score possible. A register without that column cannot earn those points.",
      "Fuel card transactions are read line by line (date, registration, litres, Rand, odometer) but the workbook has no per-transaction home for them yet; they are kept as evidence and totals are shown for comparison.",
      "The register has one Model / Category column. The make and model fills it; a separate category value is reported rather than overwriting the model.",
      "Vehicle counts (total vehicles, EV count) are counted by the system from the register rows. Totals printed on a document are never written into those cells.",
    ],
    expert: [
      "Should fuel card litres be summed per depot per month and filed into the fleet-diesel monthly block? If yes, define the depot rule (vehicle's home depot versus the filling-station site).",
      "Confirm the manufacturer norm source for litres per 100 km, and the 5% tolerance.",
      "Define what counts as an electric vehicle (battery-electric only, or hybrids too).",
      "Is the tonne-kilometre indicator to be calculated (payload × km) or simply evidenced? Today it is evidenced only.",
    ],
  },
  WASTE: {
    rules: [
      "Every waste stream on a contractor report becomes a row: site, stream type, total kg, recycled kg, landfill kg. The per-row diverted percentage and landfill tCO₂e are calculated by the system, not read.",
      "Diversion rate for scoring = recycled kg ÷ total kg across all rows (rows that are themselves totals are excluded so nothing is double-counted).",
      "Landfill emissions = landfill kg × 0.58 ÷ 1000 tCO₂e (DEFRA 2024 landfill factor).",
      "Waste reported in tonnes is converted to kilograms; the unit on the document is read alongside the figures for this reason.",
      "A safe-disposal certificate number, disposal facility and permit number are read as evidence for the assurance provider, not as scoring inputs.",
      "A report expressing recycling as a percentage only (no tonnages) feeds the Cority monthly average row, not the diversion rate.",
    ],
    expert: [
      "Confirm whether hazardous waste should be tracked separately for scoring (it is read today but not scored).",
      "Confirm the diversion-rate definition: recycled ÷ total, or (recycled + recovered) ÷ total.",
      "Should the 90% excellence benchmark earn anything extra?",
    ],
  },
  WATER: {
    rules: [
      "Kilolitres are stored exactly as billed. No unit conversion is applied.",
      "The Scope 3 water figure = kilolitres × 0.000344 tCO₂e per kL (GHG Protocol).",
      "Sanitation (sewerage) kilolitres are read separately and never added to water withdrawal; adding them would double-count the water footprint.",
      "Borehole or other alternative-source water is read but has no scored cell today.",
      "A water bill is filed by site and month on the same rules as electricity (end-date month, exact site match).",
    ],
    expert: [
      "Should alternative-source water (borehole, rainwater) count towards Scope 3 or be excluded?",
      "Is a per-employee or per-tonne water intensity indicator wanted? None exists today.",
    ],
  },
  ISO_ENVIRONMENTAL: {
    rules: [
      "Certificate status is read as Certified, In progress, Expired or Not certified together with issue and expiry dates and the certification body. An expired certificate is flagged.",
      "Clause-level status uses the ISO tracker's exact wording: Fully Compliant, Partially Compliant, Gap, Not Applicable. \"Compliant\" is accepted as Fully Compliant; \"in progress\" is not accepted and goes to review.",
      "The aspects register and legal register are read as tables (one row per aspect or obligation). Today those rows are kept as evidence: the ISO tracker roll-ups that would score them are not yet calculated, which is why the four ISO / policy / legal indicators score 0.",
      "The environmental policy is only board-approved if a board resolution reference or minuted approval date is present; an executive-committee approval is recorded as Partial.",
    ],
    expert: [
      "Approve or amend the four proposed scoring rules for ISO 14001, the aspects register, the environmental policy and legal compliance (section 3.2, rows 26–29).",
      "Define what evidence proves \"in progress\" for certification (stage-1 audit report, engagement letter).",
      "List the permits and licences a legal register must show for each sector (water use licence, air emissions licence, waste licence).",
    ],
  },
  EMPLOYMENT_EQUITY: {
    rules: [
      "The occupational level on each EEA2 row must be one of the return's own wordings (Top management, Senior management, Professionally qualified, Skilled technical, Semi-skilled, Unskilled, Temporary). A level that is not recognised is held for review rather than filed under the nearest band, because a wrong row moves the Black-management indicators without anyone seeing it.",
      "Ten headcount columns are read per level: African, Coloured, Indian and White by male and female, plus foreign nationals male and female. Level totals and the workforce total are calculated by the system; totals printed on the return are shown for comparison only.",
      "Employees with disabilities are read as a company-wide count (S_Data!B88), which is what the 2% indicator divides by headcount.",
      "EE plan, forum, monitoring, targets, barriers and affirmative measures are Yes / No / Partial answers. Partial is kept as Partial.",
    ],
    expert: [
      "Decide whether the Black-employee indicator should use all levels (as labelled) or top management only (as the workbook formula does).",
      "Decide whether Black female management should include level 3 (as labelled) or levels 1–2 only (as the formula does).",
      "Confirm whether foreign nationals are excluded from the Black share denominator.",
    ],
  },
  HEALTH_SAFETY: {
    rules: [
      "Injury statistics are filed by quarter on a July-to-June year: Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun. A report that spans two quarters is held for review rather than assigned to the quarter it starts in.",
      "LTIFR and TRIFR are always calculated by the system: LTIFR = lost-time injuries × 1,000,000 ÷ hours worked; TRIFR = (lost-time + medical-treatment injuries) × 1,000,000 ÷ hours worked. A rate printed on a report is shown for comparison and its basis (200,000 or 1,000,000 hours) is read so the comparison is fair.",
      "Fatalities are read but there is no field on the health-and-safety form for them yet, so a fatality count is reported to the consultant rather than filed. The zero-fatalities indicator therefore needs a manual entry today.",
      "Hours worked are essential: without them LTIFR cannot be computed and that indicator scores 0.",
      "Days lost, first-aiders, safety representatives and appointment letters are read as evidence only.",
    ],
    expert: [
      "Confirm the LTIFR basis (1,000,000 hours) and the 2.0 limit; the Assumptions sheet help text still says 200,000.",
      "Should fatalities become a captured quarterly row (recommended), and should any fatality set the indicator to 0 regardless of the other quarters?",
      "Should contractor injuries and hours be included or reported separately?",
    ],
  },
  TRAINING: {
    rules: [
      "Leviable payroll is read from the SDL / payroll certificate (EMP201 / EMP501) and the SDL levy is calculated as 1% of it. A levy printed on the certificate is shown for comparison only.",
      "The percentages on the training block (employees trained, Black, female, youth, disabled) are stored as printed (45 means 45%). They are not used by any scoring formula today.",
      "Training interventions are read as a table (OFO code, occupation, programme, learners, SETA, NQF level, provider, dates, cost). Each row becomes a row in the OFO register.",
      "WSP and ATR submission are Yes / No / Partial answers; the score gives credit for Yes only.",
      "NPAT must never be typed into the SDL levy cell. The original form mislabelled that cell; NPAT has its own cell now.",
    ],
    expert: [
      "Confirm the 40 training hours per employee target and the 80% grant recovery target.",
      "Should training spend be compared with the B-BBEE 6% of payroll target here as well (the B-BBEE bridge already does this)?",
      "Define which programme categories count (learnerships, skills programmes, bursaries, internships).",
    ],
  },
  COMMUNITY_CSI: {
    rules: [
      "Each CSI initiative becomes a row: name, month, beneficiary, spend, category. Total spend is summed by the system.",
      "The 1% of NPAT indicator divides by NPAT from the annual financial statements. Without NPAT the ratio cannot be computed and the row scores 0 rather than being defaulted.",
      "Beneficiary letters, NPO and PBO numbers and section 18A receipts are read as evidence to support each initiative; they do not score on their own.",
      "The Black-beneficiary percentage is read because the B-BBEE SED rules depend on it, but the ESG score does not use it today.",
    ],
    expert: [
      "Confirm the 1% of NPAT target and whether the denominator should be the prior year's NPAT (as B-BBEE does) or the current year's.",
      "Define what counts as an initiative for the \"six per year\" indicator (a donation, an event, a programme).",
      "Should in-kind contributions be valued and included?",
    ],
  },
  SUPPLIER_ESG: {
    rules: [
      "One questionnaire is one supplier, so the values are read at document level and assembled into one row of the supplier register. Without a supplier name there is no row; the system never invents one.",
      "Each criterion score must be a whole number from 1 to 5 or N/A. \"4/5\" and \"4 out of 5\" are read as 4.",
      "The register's overall percentage per supplier = sum of scores ÷ (number of scored criteria × 5) × 100; N/A criteria are excluded.",
      "The two supplier indicators (H&S ≥ 80%, food safety) are not yet scored because the column averages are not yet calculated.",
    ],
    expert: [
      "Approve the proposed rule: average H&S score ÷ 5 against 80%, pro-rata to the stance floor.",
      "Define the minimum number of suppliers that must be assessed before the indicator can score.",
      "Should supplier B-BBEE level and ISO certifications feed any score?",
    ],
  },
  BOARD_GOVERNANCE: {
    rules: [
      "Board composition is read as a table of directors (name, role, independence, gender, race, appointment date, committees). Counts and percentages for the Governance data sheet are read from the schedule totals; percentages are converted to fractions before storage because the sheet scores them against 0.6 and 0.5 targets (45% becomes 0.45).",
      "The King V register is read as a table of 17 principles with status Applied, Explained, Partially applied or Not applied. \"Apply\" and \"applied\" are accepted; anything else goes to review. The per-principle weight on the sheet is never changed by a document.",
      "The King V total is calculated by the system from the 17 statuses; a total printed on the register is shown for comparison only.",
      "Committee terms of reference, chairs, members and meeting dates are read as evidence; the only committee facts that score are the risk, social-and-ethics, audit and remuneration flags and meeting counts.",
      "The Governance data sheet has one publication row and it asks about the integrated report. A separate sustainability report is read as evidence but has no row of its own.",
    ],
    expert: [
      "Confirm the King V points (Applied 10, Explained 7, Partially 5) and whether \"Explained\" should score less when the explanation is weak.",
      "Confirm the board targets: 50% independent non-executives, executives no more than 40%, 60% Black, 50% female, four board and four audit-committee meetings.",
      "Should a lead independent director or a separate chair and CEO be scored?",
    ],
  },
  ETHICS_COMPLIANCE: {
    rules: [
      "Code of ethics, hotline, POPIA officer, impact assessment and anti-corruption training are Yes / No / Partial answers on the Governance data sheet. Partial is kept.",
      "The penalties indicator needs an explicit declaration. A penalties register with no rows, or a disclosure stating a nil return, is read as a count of 0 and earns the points. A blank is \"not declared\" and earns nothing.",
      "Each penalty is read as a row (date, authority, reference, legislation, description, amount, status, remediation) for the assurance provider.",
      "Hotline incidents reported and resolved, and the training percentage, are read as evidence; they do not score today.",
    ],
    expert: [
      "Define \"material\" for penalties (a Rand threshold, or any penalty from a listed authority).",
      "Should anti-corruption training coverage (percentage of staff) score instead of a Yes / No answer?",
    ],
  },
  RISK_ASSURANCE: {
    rules: [
      "The risk register is read as a table (ID, description, category, likelihood, impact, control status, residual rating, owner, mitigation). Control status uses the GARP sheet's own wording: Effective, Partially Effective, Ineffective, Not Assessed.",
      "The count of material risks feeds the risk-register indicator on the Governance data sheet (target 10). Climate risk present in the register is a Yes / No / Partial answer.",
      "IFRS S1/S2 requirements are read as a table with status Disclosed, Partially Disclosed, Not Disclosed or N/A. The tracker total is calculated by the system.",
      "An external assurance statement supplies the assurance provider, standard (for example ISAE 3000), level, scope and conclusion, and verified Scope 1, 2 and 3 tonnes. The verified tonnes are compared with the workbook's own inventory and any difference is flagged; they never overwrite it.",
    ],
    expert: [
      "Confirm the material-risk threshold of 10 and whether it should scale with company size.",
      "Should limited versus reasonable assurance score differently?",
      "Confirm the IFRS points (Disclosed 5, Partially 3, N/A 5). Scoring N/A as fully disclosed is a workbook choice worth revisiting.",
    ],
  },
  FINANCIAL: {
    rules: [
      "Revenue, profit before tax, NPAT, employee costs and total assets are read from the annual financial statements, with the financial year end, auditor and audit opinion. NPAT is filed into its own cell on the Social data sheet as the CSI denominator.",
      "The B-BBEE certificate or sworn affidavit supplies the level, enterprise type, Black ownership percentages, issue and expiry dates and the verification agency. These are read for the B-BBEE bridge sheet and for checks; a sworn affidavit is recognised as such.",
      "The company's sector must be one of the workbook's 14 sector options. An unrecognised sector is held for review; it is never defaulted to Generic.",
      "Amounts stated in thousands are read with their unit so they can be scaled correctly.",
    ],
    expert: [
      "Confirm which NPAT (current or prior year) each ratio should use.",
      "Confirm the public interest score calculation inputs and the 500 threshold.",
      "Should the sector choice change any threshold? Today only the FMCG / Distribution sector is calibrated; all others inherit its thresholds and pillar weights.",
    ],
  },
};

const ROUTING_WORDS = {
  WATER: "water bill, water account, water invoice, water and sanitation, sanitation, sewerage, kilolitre, kL, water meter, water consumption, borehole, Rand Water, Umgeni Water, Johannesburg Water",
  WASTE: "waste, recycling, landfill, disposal certificate, waste manifest, diversion, skip collection, Oricol",
  FLEET: "fleet, vehicle register, vehicle asset, fuel card, fuel statement, telematics, driver debrief, odometer, licence disc, horse and trailer",
  GHG_ENERGY: "electricity, Eskom, City Power, kWh, kilowatt, utility statement, municipal account, solar, photovoltaic, PV, inverter, generator, diesel bowser, LPG, carbon tax, SBTi, science-based target, net zero, Scope 1 / 2 / 3, GHG, emission",
  HEALTH_SAFETY: "ISO 45001, health and safety, OHS, LTIFR, TRIFR, injury, incident statistic, safety committee, induction register, HIRA, occupational health",
  ISO_ENVIRONMENTAL: "ISO 14001, environmental policy, environmental management system, aspects and impacts, legal register, NEMA, NEMWA, EMS",
  EMPLOYMENT_EQUITY: "employment equity, EEA1 / EEA2 / EEA4, EE plan, EE forum, occupational level, workforce profile, EE scorecard",
  TRAINING: "WSP, ATR, skills development, SETA, SDL, OFO, learnership, training register, training intervention, leviable",
  COMMUNITY_CSI: "CSI, socio-economic, community investment, social investment, beneficiary, NPO, PBO, section 18A, donation",
  SUPPLIER_ESG: "supplier self-assessment, SAQ, supplier questionnaire, supplier scorecard, code of conduct, supplier ESG",
  BOARD_GOVERNANCE: "board charter, board composition, directors register, committee, terms of reference, King IV / King V, integrated annual report, company secretary, governance register",
  ETHICS_COMPLIANCE: "ethics, whistleblowing, anti-corruption, POPIA, PAIA, information officer, penalty, sanction, conflict of interest, gift register",
  RISK_ASSURANCE: "risk register, IFRS S1 / S2, ISSB, TCFD, assurance statement, external assurance, scenario analysis, GARP",
  FINANCIAL: "annual financial statements, AFS, income statement, statement of comprehensive income, management accounts, B-BBEE certificate, sworn affidavit, trial balance",
};
const CONTENT_SIGNALS = {
  GHG_ENERGY: "kWh consumed, units consumed, notified maximum demand, electricity charge, kilowatt-hour, carbon tax, Scope 2",
  WATER: "kilolitre, sanitation charge, sewerage charge, water meter reading, water consumption charge",
  FLEET: "vehicle registration, licence disc, odometer, fuel card, telematics, litres per 100km",
  WASTE: "waste manifest, safe disposal certificate, landfill, diversion rate, waste stream",
  ISO_ENVIRONMENTAL: "ISO 14001, aspects and impacts, environmental management system",
  EMPLOYMENT_EQUITY: "EEA2, EEA4, Employment Equity Act, occupational level",
  HEALTH_SAFETY: "LTIFR, TRIFR, lost time injury, ISO 45001, disabling injury",
  TRAINING: "workplace skills plan, annual training report, skills development levies, OFO code",
  COMMUNITY_CSI: "socio-economic development, public benefit organisation, section 18A, NPO registration",
  SUPPLIER_ESG: "supplier self-assessment, supplier questionnaire, code of conduct acknowledgement",
  BOARD_GOVERNANCE: "King IV, King V, apply and explain, board charter, lead independent director",
  ETHICS_COMPLIANCE: "whistleblowing, information officer, POPIA, anti-corruption",
  RISK_ASSURANCE: "IFRS S1, IFRS S2, risk register, external assurance, ISSB",
  FINANCIAL: "annual financial statements, statement of comprehensive income, profit after tax",
};

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */
const body = [];

// Title page
body.push(new Paragraph({ spacing: { before: 2400 } }));
body.push(new Paragraph({ children: [run("Okiru ESG Toolkit", { bold: true, size: 56, color: COL.head })], alignment: AlignmentType.LEFT, spacing: { after: 200 } }));
body.push(new Paragraph({ children: [run("Documents, values and calculations", { size: 40, color: COL.head })], spacing: { after: 100 } }));
body.push(new Paragraph({ children: [run("A plain-English specification of what the system reads, what it calculates and where the experts are asked to fill in the gaps", { size: 26, italic: true })], spacing: { after: 600 } }));
body.push(p([run("Prepared for: ", { bold: true }), run("B-BBEE and ESG professionals reviewing the Okiru ESG toolkit methodology")]));
body.push(p([run("State of the system described: ", { bold: true }), run("live code as at 3 September 2026, workbook template v1.7 (SG Consumer / FMCG-Distribution calibration)")]));
body.push(p([run("How to use it: ", { bold: true }), run("everything in grey tables is what the system does today. Everything in yellow tables is for you to complete, correct or approve. Excel-style cell references (for example E_Data!L46) are given so you can find the number in the workbook; you do not need them to follow the text.")]));
body.push(spacer());
body.push(box("What we are asking you to do", [
  "1. Check that each document type we expect is the right one, and add the ones we are missing.",
  "2. Check the values we read from each document, and add the ones we should also be reading.",
  "3. Confirm or correct every calculation and threshold, especially the rows marked \"decision needed\".",
  "4. Write down the edge cases and special rules you apply in practice, so we can build them in.",
  "The yellow tables at the end of every section, and the master worksheet in Part 10, are the places to write.",
], COL.yellow));

body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(new Paragraph({ children: [run("Contents", { bold: true, size: 32, color: COL.head })], spacing: { after: 200 } }));
body.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));

/* ---------------- Part 1: the system in one page ---------------- */
body.push(h1("Part 1. How the system works, in plain terms"));
body.push(p("The toolkit turns a folder of company documents into an ESG score. It does this in six steps, and each step has one rule that protects the score from being wrong without anyone noticing."));
body.push(table(["Step", "What happens", "The protecting rule"], [
  ["1. Sort", "Each uploaded file is matched to one of 40 known document types in 14 evidence families (a municipal electricity bill, an EEA2 return, a King V register, and so on). Spreadsheets are matched tab by tab.", "A file the system cannot place with confidence is not guessed at. It is shown to the consultant as unplaced, with the reason."],
  ["2. Read", "The document is read against a written instruction for that document type, which names every value to look for (the \"expected values\" tables in Parts 3 to 6). Registers and schedules are read row by row.", "A table with 134 rows produces 134 rows. The system never summarises, samples or re-types a table."],
  ["3. Name", "Each value read is given its standard name from a fixed list of 382 permitted values (for example \"Grid electricity consumed, kWh\").", "A value that is not on the permitted list is dropped and recorded as rejected. Nothing can invent a new place in the score."],
  ["4. Check", "The value is checked for shape: a number, a date, a Rand amount, a percentage, Yes / No / Partial, or one of a dropdown's own options.", "\"Partial\" is kept as its own answer. A wording that is not one of a dropdown's options is sent to review; the nearest option is never chosen."],
  ["5. File", "The value is written into its one declared workbook cell, register row or monthly block, by site and month where the workbook needs that.", "Cells the workbook calculates for itself (totals, rates, scores) are never written to. Two documents that disagree produce a review item, not a number."],
  ["6. Score", "The workbook's derivation layer calculates the totals and rates; the three scorecards apply the indicator rules in Part 2; the dashboard combines them.", "A workbook with nothing in it scores exactly 0 on all 53 indicators. No indicator awards points by default."],
], [14, 56, 30]));
body.push(spacer());
body.push(h2("1.1 The fourteen evidence families"));
body.push(p("ESG has no statutory list of elements the way B-BBEE has five. The system splits the evidence into fourteen families for one reason: so that each document is routed to the right reading instruction and then to the right block of the workbook. The split follows where the data lands, not the tidy E / S / G triple."));
body.push(table(["Family", "Pillar", "Documents expected", "What it feeds in the workbook"], ELEMENTS.map((e) => [
  e.title, e.pillar === "X" ? "Cross-cutting" : e.pillar === "E" ? "Environmental" : e.pillar === "S" ? "Social" : "Governance",
  String(MATRIX.filter((d) => d.element === e.id).length), e.feeds,
]), [26, 13, 12, 49]));
body.push(spacer());
body.push(h2("1.2 The workbook the values land in"));
body.push(p("The score is calculated from an Excel-style workbook (template v1.7). The consultant sees it as sixteen input sections. Everything the documents supply lands in one of these."));
body.push(table(["Input section", "Sheet", "What it holds", "How it is entered"], [
  ["Company and reporting setup", "Cover", "Entity, reporting period, baseline year, sector, net-zero target year", "Single values"],
  ["Assumptions", "Assumptions", "Scoring stance, sector, standards, currency, and every threshold the indicators test against", "Single values (consultant-controlled)"],
  ["Environmental data", "E_Data", "Monthly blocks by site for fleet diesel, generator diesel, LPG, business-car petrol, grid electricity, solar and water; the net-zero baseline; contractor waste totals", "Monthly grids (nine columns, one per reporting month)"],
  ["Social data", "S_Data", "Employment equity headcount grid; quarterly health and safety block; WSP / ATR, payroll and training block; NPAT", "Grids and single values"],
  ["Training OFO register", "S_Data", "Training interventions by OFO occupation code", "Register (one row per intervention)"],
  ["CSI / community register", "S_Data", "Community and social investment initiatives", "Register (one row per initiative)"],
  ["Governance data", "G_Data", "Board counts and percentages, committee flags, ethics, POPIA, risk and reporting answers", "Numbers and Yes / No / Partial answers, each with a system-calculated score out of 5"],
  ["EE Scorecard", "EE_Scorecard", "Employment equity maturity answers and the calculated Black, Black-female and disability shares", "Yes / No / Partial answers; shares calculated"],
  ["Fleet register", "Fleet_Register", "One row per vehicle: registration, depot, model, weights, km, litres, L/100km, EV flag", "Register"],
  ["Waste register", "Waste_Register", "One row per site, month and waste stream: total, recycled and landfill kg", "Register"],
  ["Driver debrief", "Driver_Debrief", "Route completion and customer-hit percentage per driver and route", "Register"],
  ["ISO tracker", "ISO_Tracker", "Clause-by-clause status for ISO 14001, 45001, 27001, 26000 and 22000", "Register with a fixed status dropdown"],
  ["King V scorecard", "King5_Scorecard", "The 17 King V principles with status and evidence", "Register (17 rows)"],
  ["IFRS S1/S2 tracker", "IFRS_S1_S2", "22 disclosure requirements with status", "Register"],
  ["GARP / GRAP risk register", "GARP_GRAP", "Risks and compliance requirements with severity, control status and likelihood", "Register"],
  ["Supplier self-assessment", "SAQ_Supplier", "One row per supplier, scored 1–5 on seven criteria", "Register"],
], [24, 16, 40, 20]));

/* ---------------- Part 2: scoring model ---------------- */
body.push(h1("Part 2. How the ESG score is calculated"));
body.push(h2("2.1 The headline number"));
body.push(p("There are three scorecards. Environmental is marked out of 108 points, Social out of 100 and Governance out of 100. Each scorecard is a list of indicators; each indicator has a maximum number of points and a rule."));
body.push(p("The overall ESG percentage is the simple average of the three pillar scores, each divided by 100:"));
body.push(formula("Overall ESG % = (Environmental points ÷ 100 + Social points ÷ 100 + Governance points ÷ 100) ÷ 3"));
body.push(p("Two things about this are deliberate in the source workbook and worth knowing. First, Environmental is divided by 100 even though it is marked out of 108, so a perfect environmental score contributes slightly more than a third. Second, the pillar weights on the Assumptions sheet (40% / 30% / 30%) are not used by this formula at all; they exist for display. Both are recorded as decisions for you in Part 9."));
body.push(p("Worked example (the reference company, SG Consumer, FY 2025/26 as the workbook stood): Environmental 36 of 108, Social 33 of 100, Governance 64.85 of 100 gives (0.36 + 0.33 + 0.6485) ÷ 3 = 44.6%. The corrected calculation the system now runs gives 36 / 25 / 59.85 = 40.3%, because 13 points the workbook awarded without evidence were removed (section 2.5)."));
body.push(h2("2.2 The scoring stance and the banding floor"));
body.push(p("Most quantitative indicators compare an actual figure with a target. The scoring stance decides how generous partial credit is. It is one setting on the Assumptions sheet and it sets a single number, the banding floor:"));
body.push(table(["Stance", "Banding floor", "What it means"], [
  ["Lean", "0.30", "Partial credit starts once the actual reaches 30% of the target"],
  ["Standard (default)", "0.50", "Partial credit starts at 50% of the target"],
  ["Strict", "0.70", "Audit-grade: partial credit starts at 70% of the target"],
], [22, 18, 60]));
body.push(spacer());
body.push(h2("2.3 The five scoring patterns"));
body.push(p("Every indicator uses one of five patterns. Once you know them, every row in Parts 3 to 5 reads the same way."));
body.push(table(["Pattern", "Rule in words", "Example"], [
  ["Pro-rata band", "If actual ÷ target is 1 or more: full points. If it is at least the banding floor: full points × actual ÷ target. Otherwise 0.", "Waste diversion 60% against a 75% target on Standard: 60 ÷ 75 = 0.8, which is above 0.5, so 5 × 0.8 = 4 points."],
  ["Inverse band (lower is better)", "Used for LTIFR only. At or below the limit: full points. Up to limit ÷ floor: points fall on a straight line. Above that: 0.", "LTIFR 3.0 against a limit of 2.0 on Standard: 8 × (1 + 0.5 − 3.0 ÷ 2.0) = 8 × 0 = 0. LTIFR 2.5 gives 8 × 0.25 = 2."],
  ["Yes / Partial / No", "Yes: full points. Partial: half. No or blank: 0.", "EE plan submitted: Yes 5, Partial 2.5."],
  ["Maturity (out of 5)", "The Governance data sheet converts each answer into a score out of 5; the Governance scorecard reads that score directly or scales it.", "Integrated report Yes → 5 → scaled to 8 points."],
  ["Presence check", "Full points if the figure is above zero, otherwise 0.", "Water tracked monthly: any kilolitres captured → 4."],
], [20, 45, 35]));
body.push(spacer());
body.push(p("Every indicator's final score is capped at its maximum, and each row shows a status: Met (full points), Partial (at least half) or Gap (less than half)."));
body.push(h2("2.4 Rating bands"));
body.push(p("Each pillar percentage is also labelled: Excellent at 85% or more, Good at 70%, Adequate at 50%, and Attention below that. The pillar target for planning purposes is 75%. These bands do not change the score."));
body.push(h2("2.5 Two calculations: the workbook as it was, and the corrected one"));
body.push(p("The source workbook contains real defects: formulas pointing at cells that do not exist, a threshold ladder with blank rungs, and three indicators that award points to a company that has entered nothing. The product decision was to run the corrected calculation as the live score, keep the original reproducible as an audit reference, and write down every number that moved. On the reference company the two differ on exactly two indicators:"));
body.push(table(["Indicator", "Points", "As the workbook was", "Corrected", "Why"], [
  ["Social: zero fatalities", "8", "8", "0", "The workbook gave 8 when the fatalities cell was blank or held a dash. The corrected rule needs a reported zero."],
  ["Governance: no material penalties", "5", "5", "0", "The workbook read a row that does not exist, so everyone got 5. The corrected rule needs an explicit nil declaration."],
  ["Environmental: net-zero target set", "5", "5 for everyone", "0 unless a year is entered", "The code substituted the year 2050 when the company had entered nothing."],
], [26, 9, 15, 15, 35]));
body.push(spacer());
body.push(p("After the corrections a completely blank workbook scores 0 on all 53 indicators. Before them it scored 18 points."));
body.push(h2("2.6 Points that cannot be earned yet"));
body.push(p("Of the 308 points across the three scorecards, 30 still cannot be earned by any company because the roll-ups they depend on are not yet calculated. They are marked \"dead points\" in the indicator tables and listed with a proposed rule for your approval in Part 9. Nothing is defaulted: those rows score 0, not a guess."));

/* ---------------- indicator tables ---------------- */
function indicatorTable(pillarKey, pillarDefs) {
  const rows = pillarDefs.map((d) => {
    const r = RULES[pillarKey][d.key] || {};
    return [String(d.row), d.indicator, String(d.maxPoints), r.rule || "", r.inputs || "", r.evidence || "", r.status || ""];
  });
  return table(["Row", "Indicator", "Max", "How it is scored", "Figures used (cells)", "Documents that supply them", "Status"], rows,
    [6, 20, 6, 32, 16, 13, 9], { rowFill: (ri, ci, r) => /dead/i.test(r[6]) ? COL.rose : undefined });
}
function derivedTable(rows) {
  return table(["Calculated cell", "How the system calculates it", "Note"], rows, [22, 50, 28]);
}

/* ---------------- Part 3: Environmental ---------------- */
body.push(h1("Part 3. Environmental pillar (108 points)"));
body.push(h2("3.1 The twenty environmental indicators"));
body.push(p("Rows shaded pink cannot score today (see Part 9). \"Floor\" means the banding floor from section 2.2."));
body.push(indicatorTable("E", SCORE.environmental));
body.push(spacer());
body.push(h2("3.2 Figures the system calculates on the environmental sheets"));
body.push(p("These cells are never typed in and never written to from a document. They are recalculated from the monthly blocks and registers every time something changes."));
body.push(derivedTable([
  ["Fleet diesel total (E_Data!L19)", "Sum of every site and month in the fleet-diesel block.", "Litres"],
  ["Generator diesel total (L28)", "Sum of the generator-diesel block.", "Litres"],
  ["LPG total (L32)", "Sum of the LPG block (one company-wide row).", "Kilograms"],
  ["Business-car petrol total (L37)", "Sum of the business-car block.", "Litres"],
  ["Grid electricity total (L46)", "Sum of the electricity block.", "kWh"],
  ["Solar totals (L50:L54)", "One total per site from the solar block.", "kWh"],
  ["Water total (L63)", "Sum of the water block.", "Kilolitres"],
  ["GHG summary block (L75:L86)", "Copies of the activity totals arranged as Scope 1A–1D, Scope 1 total (L79), Scope 2 gross (L80), solar offset (L81), Scope 2 net (L82), Scope 3 water (L83), total (L84) and the Scope 1 and Scope 2 shares.", "See the warning in 3.4: these rows are labelled tCO₂e but hold litres, kWh and kL."],
  ["Current-year Scope 1+2 (F90)", "L79 + L82.", "Same mixed-unit caveat"],
  ["Waste diversion rate (Waste_Register!B16)", "Recycled kg ÷ total kg across the register rows (rows that are themselves totals are excluded). Falls back to the contractor's reported diversion percentage when the register is empty.", "A fraction, 0.911 = 91.1%"],
  ["Cority monthly recycling average (B17)", "Average of the contractor's monthly % recycled row.", ""],
  ["Landfill emissions (B18)", "Landfill kg (rows above zero) × 0.58 ÷ 1000.", "tCO₂e"],
  ["Per-vehicle L/100km, tCO₂e, service status (Fleet register columns K, M, N)", "Litres ÷ km × 100; litres × 2.68 ÷ 1000; Good / Alert / High at 5% and 15% over the norm.", "Per row"],
  ["Vehicle totals (Fleet_Register!B28, H28)", "Count of register rows; count of rows flagged as electric.", "The workbook stored these as text; the system counts them."],
]));
body.push(spacer());
body.push(h2("3.3 The greenhouse-gas inventory in tonnes"));
body.push(p("The one number every tender, bank and customer questionnaire asks for first is the company's emissions in tonnes of CO₂e. The toolkit calculates it from the same monthly blocks, the way an inventory is actually built: activity × emission factor."));
body.push(table(["Line", "Scope", "Activity read", "Factor", "Calculation"], [
  ["Road-freight fleet diesel", "1A", "Litres", "2.68 kgCO₂e per litre (DEFRA 2024 HGV diesel)", "litres × 2.68 ÷ 1000"],
  ["Generator diesel", "1B", "Litres", "2.68 kgCO₂e per litre", "litres × 2.68 ÷ 1000"],
  ["LPG forklifts", "1C", "Kilograms", "1.51 kgCO₂e per kg (DEFRA 2024)", "kg × 1.51 ÷ 1000"],
  ["Business road travel (petrol)", "1D", "Litres", "2.31 kgCO₂e per litre (DEFRA 2024 passenger petrol)", "litres × 2.31 ÷ 1000"],
  ["Purchased grid electricity", "2", "kWh", "0.82 kgCO₂e per kWh (Eskom, NERSA 2024)", "kWh × 0.82 ÷ 1000"],
  ["On-site solar generation (credit)", "2", "kWh", "Grid factor minus solar's own lifecycle factor: 0.82 − 0.025", "− kWh × 0.795 ÷ 1000 (solar is never credited as emission-free)"],
  ["Municipal water", "3 (partial)", "Kilolitres", "0.000344 tCO₂e per kL (GHG Protocol)", "kL × 0.000344"],
  ["Waste to landfill", "3 (register only)", "Kilograms", "0.58 tCO₂e per tonne (DEFRA 2024)", "kg × 0.58 ÷ 1000, shown on the waste register"],
], [24, 9, 12, 30, 25]));
body.push(spacer());
body.push(p("Scope 1 + Scope 2 is the figure normally asked for. Scope 3 is explicitly partial: only water (and landfill on the register) is captured. Upstream fuel, purchased goods and subcontracted freight are not, and the toolkit labels the Scope 3 figure as partial wherever it is shown. For the reference company the verified Scope 1 + 2 figure is 3,714.94 tCO₂e for the nine months to March 2026."));
body.push(h2("3.4 A warning about the workbook's own GHG summary"));
body.push(box("Do not quote the workbook's \"Total GHG\" cell as tonnes", [
  "Rows 75 to 84 of the Environmental data sheet are labelled tCO₂e, but the formulas copy the raw activity rows: 589,465 litres of diesel is shown as \"589,465 tCO₂e\" and 2,589,578 kWh as \"2,589,578 tCO₂e\". The \"total\" of 3,188,915 is a sum of litres, kWh and kilolitres and is roughly a thousand times the real figure.",
  "The system reproduces those cells exactly, on purpose, so the scores can be checked against the client's spreadsheet. The Scope 1 reduction indicator (row 6) and the Carbon Tax and Net-Zero sheets read from them, so those results inherit the problem.",
  "The corrected inventory in 3.3 is the figure to use in any external statement. Fixing the summary block is a decision for the methodology owner (Part 9).",
], COL.rose));
body.push(spacer());
body.push(h2("3.5 Carbon tax"));
body.push(p("The carbon tax sheet estimates the liability under the Carbon Tax Act:"));
body.push(formula("Liability = taxable tCO₂e × annualisation × (1 − basic allowance 60%) × rate per tonne"));
body.push(...bullets([
  "Tier 1 rate R236 per tonne; Tier 2 (escalated) R640 per tonne. The Assumptions sheet chooses whether to show current, escalated or both.",
  "Annualisation = 12 ÷ months of data captured (nine months for the reference company gives 1.333). With no months stated the factor is 1, not another company's period.",
  "The taxable tonnes come from the workbook's Scope 1 + 2 summary, so the mixed-unit warning applies; the corrected inventory is the safer input.",
  "A carbon tax return read from a document supplies the licence number, period, taxable tonnes, allowances, rate and liability for comparison; it does not replace the calculation.",
]));
body.push(h2("3.6 Net-zero trajectory"));
body.push(p("The roadmap sheet publishes a Scope 1 + 2 reduction path from the baseline. Each milestone has its own target and gap; the final year comes from the company's stated net-zero year, and years between the published columns are interpolated on a straight line."));
body.push(table(["Year", "2025", "2026", "2027", "2028", "2029", "2030", "2035", "2040", "2045", "2050"], [
  ["Reduction from baseline", "0%", "5%", "12%", "20%", "35%", "50%", "65%", "78%", "90%", "95%"],
], [22, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8]));
body.push(spacer());
body.push(p("One conflict in the workbook is passed through unresolved: the 2028 milestone's wording says \"−50% from baseline\" while the numeric path says −20% at 2028 and −50% at 2030. The number is used; the wording is displayed. This needs a decision (Part 9)."));

/* ---------------- document family sections ---------------- */
function familySection(elementId, numberPrefix) {
  const e = ELEMENT_BY_ID[elementId];
  const docs = MATRIX.filter((d) => d.element === elementId);
  const notes = ELEMENT_NOTES[elementId];
  const out = [];
  out.push(h2(`${numberPrefix} ${e.title}`));
  out.push(p(e.intro));
  out.push(p([run("Where the values land: ", { bold: true }), run(e.feeds)]));
  out.push(p([run("Words that route a document here: ", { bold: true }), run(ROUTING_WORDS[elementId] + ".")]));
  out.push(p([run("Phrases inside an unnamed scan that identify this family: ", { bold: true }), run(CONTENT_SIGNALS[elementId] + ". A scan is only assigned on a clear winner (two or more of these and nothing from another family); anything murkier is matched on its full text.")]));
  docs.forEach((d, i) => {
    out.push(h3(`${numberPrefix}.${i + 1} ${d.name}`));
    out.push(p([run("How we recognise it: ", { bold: true }), run(d.aliases.join(", ") + ".")]));
    out.push(p([run("What the assurance provider checks: ", { bold: true }), run(d.auditorTests)]));
    out.push(p([run("What good data looks like: ", { bold: true }), run(d.exampleData, { italic: true })]));
    const shape = GRID_SHAPES[d.id];
    if (shape) {
      out.push(p([run("This document is read as a table. ", { bold: true }), run(`Each ${shape.container.replace(/s$/, "")} row supplies: ${shape.rowFields.map(human).join(", ")}. Every row is kept.`)]));
    }
    const rows = d.expectedFields.filter((f) => f !== "exceptions").map((f) => {
      const m = mappingFor(f, d.element);
      const spec = m ? ALLOW_BY_KEY[m.key] : null;
      const meaning = spec ? spec.description : human(f);
      const shape_ = m ? TYPE_TEXT[m.coerce] : "Read for evidence only";
      return [human(f), meaning, shape_, destinationFor(m ? m.key : null)];
    });
    rows.push(["Exceptions", "Anything on the document that contradicts the other values, is illegible or is unusual", "Free text", "Shown to the consultant as a review note"]);
    out.push(table(["Value we read", "What it means", "How it must look", "Where it goes in the workbook"], rows, [20, 30, 20, 30], { size: 17 }));
    out.push(spacer());
  });
  out.push(h3(`${numberPrefix}.${docs.length + 1} Rules and edge cases we apply today`));
  out.push(...bullets(notes.rules));
  out.push(h3(`${numberPrefix}.${docs.length + 2} For the experts to complete`));
  out.push(p("Questions we need answered for this family:"));
  out.push(...numbered(notes.expert));
  out.push(spacer());
  out.push(expertTable(["Document we should also expect", "Values to read from it", "Where it should land / what it should score", "Your name"], blankRows(3, 4), [28, 30, 30, 12]));
  out.push(spacer());
  out.push(expertTable(["Value we already read", "Correction or extra rule", "Edge case to handle", "Your name"], blankRows(3, 4), [28, 30, 30, 12]));
  out.push(spacer());
  return out;
}

body.push(h2("3.7 Environmental evidence, family by family"));
body.push(p("Each family below lists the documents we expect, how we recognise them, every value we read from them and where it goes. Yellow tables are yours."));
body.push(...familySection("GHG_ENERGY", "3.8"));
body.push(...familySection("FLEET", "3.9"));
body.push(...familySection("WASTE", "3.10"));
body.push(...familySection("WATER", "3.11"));
body.push(...familySection("ISO_ENVIRONMENTAL", "3.12"));

/* ---------------- Part 4: Social ---------------- */
body.push(h1("Part 4. Social pillar (100 points)"));
body.push(h2("4.1 The nineteen social indicators"));
body.push(indicatorTable("S", SCORE.social));
body.push(spacer());
body.push(h2("4.2 Figures the system calculates on the social sheets"));
body.push(derivedTable([
  ["Headcount level totals and workforce total (S_Data!L5:L11, L12)", "Sum of the ten race-and-gender columns per occupational level, and of all levels.", "The EEA2 grid is entered as cells; totals are never typed."],
  ["Black employee share (EE_Scorecard!B5)", "African + Coloured + Indian, male and female ÷ level total. The workbook formula uses the top-management row only (decision needed).", "A fraction"],
  ["Black share at top and senior management (B7)", "(Row 5 + row 6 Black headcount) ÷ workforce total.", ""],
  ["Disability share (B8)", "Employees with disabilities (S_Data!B88) ÷ workforce total (L12).", "The workbook held a constant 0 here."],
  ["EE maturity scores (E5:E14) and total (E15)", "Black share ÷ 60% × 20 (max 20); Black female management ÷ 30% × 15; Black senior share ÷ 50% × 20; disability ÷ 2% × 10; EE plan Yes 10 / Partial 5; the other five answers Yes 5 / Partial 2. E15 is the sum, out of 100.", "E15 ÷ 100 × 19 is the Management Control estimate on the B-BBEE bridge."],
  ["SDL levy (S_Data!B44)", "Leviable payroll (B43) × 1%.", "Never typed; NPAT has its own cell (B84)."],
  ["Quarter totals for hours, injuries and incidents (G27:G34)", "Sum of the four quarter columns per row.", ""],
  ["LTIFR (G35)", "Lost-time injuries × 1,000,000 ÷ hours worked. Shows \"Awaiting hours worked\" when hours are missing.", "Per million hours"],
  ["TRIFR (G36)", "(Lost-time + medical-treatment injuries) × 1,000,000 ÷ hours worked.", ""],
  ["Total CSI spend (D82) and initiative count", "Sum of the CSI register spend column; count of register rows.", ""],
]));
body.push(spacer());
body.push(...familySection("EMPLOYMENT_EQUITY", "4.3"));
body.push(...familySection("HEALTH_SAFETY", "4.4"));
body.push(...familySection("TRAINING", "4.5"));
body.push(...familySection("COMMUNITY_CSI", "4.6"));
body.push(...familySection("SUPPLIER_ESG", "4.7"));

/* ---------------- Part 5: Governance ---------------- */
body.push(h1("Part 5. Governance pillar (100 points)"));
body.push(h2("5.1 The fourteen governance indicators"));
body.push(indicatorTable("G", SCORE.governance));
body.push(spacer());
body.push(h2("5.2 Figures the system calculates on the governance sheets"));
body.push(p("Every answer on the Governance data sheet is converted into a score out of 5 in column F. The scorecard reads those scores."));
body.push(derivedTable([
  ["Board members (F5)", "5 if the board has at least one member, else 0.", ""],
  ["Independent non-executives (F6)", "Independent NEDs ÷ board members against 50%, pro-rata to the floor.", ""],
  ["Executive directors (F7)", "5 if executives are 40% or less of the board; above that the score falls by 2 points for every 10% over.", ""],
  ["Black board members (F8)", "Black share against 60%, pro-rata to the floor.", "Stored as a fraction"],
  ["Female board members (F9)", "Female share against 50%, pro-rata to the floor.", "Stored as a fraction"],
  ["Board meetings (F10) and audit committee meetings (F11)", "Meetings held against 4 per year, pro-rata to the floor.", ""],
  ["Yes / No / Partial answers (F12:F21, F23, F24, F27)", "Yes 5, Partial 2.5, No 0.", ""],
  ["Material risks in the register (F22)", "Risk count against 10, pro-rata to the floor.", ""],
  ["Governance total (F26)", "Sum of the F column, out of 100.", "Display only"],
  ["King V principle scores (King5_Scorecard!E4:E20) and total (E21)", "Applied 10, Explained 7, Partially applied 5, Not applied 0; the total is out of 170.", "The weighted column F uses the sheet's own per-principle weights."],
  ["IFRS S1/S2 requirement scores (IFRS_S1_S2!E5:E28) and total (E29)", "Disclosed 5, Partially disclosed 3, N/A 5, Not disclosed 0; the total is out of 110.", ""],
  ["ISO tracker clause scores (column E) and block totals", "Fully Compliant 5, Partially Compliant 3, Not Applicable 5, Gap 0; totals per standard.", "Block totals are not yet calculated in the app (dead points)."],
  ["GARP / GRAP weighted score (column J)", "Severity weight (High 5, Medium 3, Low 1, Requirement 4) × likelihood.", "Reporting only"],
  ["Supplier overall % (SAQ column I)", "Sum of the seven criterion scores ÷ (criteria scored × 5) × 100, ignoring N/A.", "Column averages are not yet calculated (dead points)."],
]));
body.push(spacer());
body.push(...familySection("BOARD_GOVERNANCE", "5.3"));
body.push(...familySection("ETHICS_COMPLIANCE", "5.4"));
body.push(...familySection("RISK_ASSURANCE", "5.5"));

/* ---------------- Part 6: Financial + B-BBEE bridge ---------------- */
body.push(h1("Part 6. Company financials and the B-BBEE bridge"));
body.push(...familySection("FINANCIAL", "6.1"));
body.push(h2("6.2 The B-BBEE bridge sheet"));
body.push(p("The workbook carries a read-only cross-reference from ESG data to the five B-BBEE elements of the Generic scorecard. It does not write to the B-BBEE toolkit. The formulas on the sheet are:"));
body.push(table(["Element", "Weight", "How it is estimated", "Available today?"], [
  ["Ownership", "25", "Black ownership ÷ 25.1%; full points at or above 25.1%, pro-rata to the floor.", "No: the ownership percentage is hand-entered on the sheet and the app has no editor for it. Reported as \"not available\", never as 0."],
  ["Management control", "19", "EE Scorecard total ÷ 100 × 19.", "Yes (6.65 on the reference company)."],
  ["Skills development", "25", "Training spend ÷ leviable payroll against 6%, pro-rata to the floor.", "Yes, when both are entered."],
  ["Enterprise and supplier development", "40", "Hand-entered ratio × 40.", "No (not available)."],
  ["Socio-economic development", "5", "CSI spend ÷ NPAT against 1%, pro-rata to the floor.", "Yes, once NPAT is entered."],
  ["Bonus", "5", "Hand-entered, capped at 5.", "No."],
], [22, 8, 40, 30]));
body.push(spacer());
body.push(p("The status level cannot be reported: two rungs of the level ladder on the Assumptions sheet (Level 4 and Level 6) are blank in the source workbook, so the sheet reported \"Level 4\" for any score at all. The system returns \"Not determined\" and names the blank rungs rather than inventing thresholds. Whether to back-fill them with the Generic Codes' values (80 and 65) is a decision for you (Part 9)."));

/* ---------------- Part 7: recognition rules ---------------- */
body.push(h1("Part 7. How documents and values are recognised"));
body.push(h2("7.1 Sorting a file into a family and a document type"));
body.push(...bullets([
  "The file name and any spreadsheet tab name are checked first against the routing words for each family (listed at the top of every family section). The families are tested in a fixed order so that the narrow ones win: water before energy (so a water bill is not claimed by the much larger energy vocabulary), fleet before energy (so a fuel card statement is fleet evidence), and health and safety before environmental management (so an ISO 45001 certificate lands beside the injury statistics). A spreadsheet tab called Fleet_Register, Vehicle register or Fleet list goes straight to the fleet register reader; Driver debrief, Waste register, CSI register, SED register, Risk register, Aspects register, Legal register and OFO codes are recognised the same way.",
  "If the name says nothing (a scanner file name such as 0862_251204095622_001.pdf), the text of the document is checked for the identifying phrases listed per family. A family is only assigned on a clear winner.",
  "The document type inside the family is chosen by matching the phrases in \"How we recognise it\" against the document. Matching phrases must be at least five characters long, so that short words cannot route a document on their own.",
  "The system then asks the model to confirm the type with a confidence score. Below the confidence floor the document is still read, but only values that are explicitly labelled on the page are accepted, and at least two such values must be found; otherwise the document is reported as \"nothing read\" rather than half-read.",
  "A combined municipal account that bills both electricity and water is deliberately read as both document types.",
]));
body.push(h2("7.2 Reading a spreadsheet register"));
body.push(...bullets([
  "For a spreadsheet tab, the model is asked one small question only: which column means which value (which column is the registration, which is the monthly litres). That answer is remembered per template layout so the same template is read the same way next time.",
  "The code then applies the column mapping to every row. N rows in, N rows out; a dropped row is impossible by construction.",
  "A tab whose columns match no known register is left to the normal document reader.",
  "Blank cells under a repeated label (a depot name written once for ten rows) inherit the value above them, but only where the row has real content; template rows holding formulas that evaluate to 0 are ignored.",
]));
body.push(h2("7.3 Dropdown answers and accepted synonyms"));
body.push(p("A cell with a dropdown is governed by the dropdown. The value read is accepted only if it is one of the options exactly, the same option in different capitalisation, or one of the documented synonyms below. The nearest option is never chosen; anything else goes to review with the list of permitted options."));
body.push(table(["Dropdown", "Options", "Wordings accepted as equivalent"], [
  ["Maturity answers (Governance data, EE Scorecard, training flags)", "Yes / No / Partial (some cells also N/A)", "Y, true → Yes; N, false, none, not in place → No; partial, partially, in part → Partial. A genuine true/false is widened to Yes/No, never the reverse."],
  ["King V status", "Applied / Explained / Partially Applied / Not Applied", "apply → Applied; explain → Explained; partly applied → Partially Applied"],
  ["IFRS S1/S2 status", "Disclosed / Partially Disclosed / Not Disclosed / N/A", "fully disclosed → Disclosed; partly disclosed → Partially Disclosed; undisclosed → Not Disclosed"],
  ["ISO tracker status", "Fully Compliant / Partially Compliant / Gap / Not Applicable", "compliant, conforming → Fully Compliant; partly compliant → Partially Compliant; non-compliant, not compliant → Gap. \"In progress\" is not accepted."],
  ["GARP control status", "Effective / Partially Effective / Ineffective / Not Assessed", "not effective → Ineffective; unassessed → Not Assessed"],
  ["Supplier criterion scores", "5 / 4 / 3 / 2 / 1 / N/A", "\"4/5\" and \"4 out of 5\" → 4; na → N/A"],
  ["Sector", "Generic, FMCG / Distribution, Transport / Logistics, Manufacturing, Financial Services, ICT / Technology, Agriculture, Mining, Construction, Retail, Hospitality, Healthcare, Education, Public Sector", "No synonyms; an unrecognised sector goes to review and is never defaulted to Generic"],
  ["Scoring stance", "Lean / Standard / Strict", "None"],
], [26, 30, 44]));
body.push(spacer());
body.push(p("On the B-BBEE side of the platform a wording outside a dropdown is now put to a model with the dropdown's own options and a confidence floor, and the decision is remembered per wording. That resolver is not yet connected to the ESG dropdowns; today an ESG wording outside the lists above goes to review."));
body.push(h2("7.4 Units, percentages, dates, months, sites and quarters"));
body.push(table(["Thing", "Rule"], [
  ["Units", "Every measured value carries its unit in its name (kWh, kL, litres, kg, tCO₂e, Rand). A figure is stored in the unit the sheet uses; waste tonnes are converted to kilograms, nothing else is converted."],
  ["Percentages", "Read as printed (45 means 45%). A sub-1 figure is not rescaled, because 0.4% is a real ownership figure. Two governance cells (Black and female board share) are converted to fractions because the sheet scores them against 0.6 and 0.5."],
  ["Rand amounts", "Excluding VAT unless the document states otherwise; currency symbols, spaces and thousands separators are stripped. Amounts \"in thousands\" are read with that note."],
  ["Dates", "Stored as year-month-day. A value that is not a real date is rejected."],
  ["Months", "The reporting window is nine columns (Jul-25 … Mar-26 on the reference company). A bill is filed by the month of its period end date. A month outside the window is not filed; the reading is listed for review."],
  ["Sites", "The site name on a document must match a depot on the company's own site list; case and punctuation are ignored, nothing else is. An unknown site is held for review, never filed under the first row."],
  ["Quarters (health and safety)", "Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun on the July-to-June year. A report that spans two quarters is held for review."],
  ["Occupational levels", "Must be one of the EEA2 wordings (Top management, Senior management, Professionally qualified, Skilled technical, Semi-skilled, Unskilled, Temporary) or an L1–L6 label. Anything else is held for review."],
  ["Yes / No versus Partial", "Answers typed as Yes / No / Partial keep all three states. Values typed as true/false (a policy clause is present or not) accept Yes or No only; \"Partial\" there is sent to review rather than rounded."],
], [22, 78]));
body.push(spacer());
body.push(h2("7.5 What is held back for review, and why"));
body.push(table(["Reason shown to the consultant", "What it means"], [
  ["Unknown value", "The document supplied something that is not on the permitted list of 382 values."],
  ["Not a number / not a date", "The value could not be read as the shape its cell needs."],
  ["No matching option", "A dropdown cell, and the wording is not one of the options or a documented synonym."],
  ["Failed validation", "The value is outside the range the cell allows (a year before 1900, a negative count)."],
  ["Empty", "The document was read but the value was blank."],
  ["Calculated cell", "The only cell for this value is one the workbook calculates (a total, a rate, a score). The reading is shown for comparison instead."],
  ["No workbook home", "The value is real evidence but no cell in the workbook uses it yet. These are the best candidates for you to place."],
  ["Needs context", "The cell depends on a site, month or quarter the document did not state clearly."],
  ["Conflict", "Two documents disagree on the same cell. Neither value is filed; the consultant chooses."],
  ["Duplicate", "The same document (by checksum) was uploaded twice; the second copy is ignored."],
], [26, 74]));
body.push(spacer());
body.push(p("Every one of these is shown with the document it came from, so a value can always be traced back to the page that produced it."));

/* ---------------- Part 8: validation ---------------- */
body.push(h1("Part 8. Checks run before a workbook is submitted"));
body.push(p("These checks do not change the score. Errors block submission; warnings are shown and the consultant may proceed."));
body.push(table(["Check", "Severity", "What triggers it"], [
  ["Entity name required", "Warning", "Cover sheet entity blank"],
  ["Reporting period required", "Warning", "Cover sheet period blank"],
  ["Baseline year valid", "Warning", "Baseline year outside the allowed range"],
  ["Pick a sector before submit", "Warning", "Assumptions sector blank"],
  ["Scoring stance must be Lean, Standard or Strict", "Warning", "Any other stance value"],
  ["Fleet diesel monthly litres incomplete", "Warning", "Fewer than the reporting window's months captured"],
  ["Electricity monthly kWh incomplete", "Warning", "As above"],
  ["Water monthly kL incomplete", "Warning", "As above"],
  ["Net-zero baseline not set", "Warning", "Baseline tCO₂e blank"],
  ["EE total headcount must be above 0", "Warning", "Headcount grid empty"],
  ["Hours worked not captured", "Warning", "LTIFR cannot be computed"],
  ["LTIFR exceeds the Assumptions threshold", "Warning", "LTIFR above 2.0"],
  ["WSP submission status unknown", "Warning", "WSP flag blank"],
  ["Code of ethics flag not set / POPIA officer flag not set", "Warning", "Governance answers blank"],
  ["Governance total is 0", "Warning", "Nothing captured on the governance sheet"],
  ["EE plan status not set", "Warning", "EE Scorecard row blank"],
  ["Fleet register is empty", "Warning", "No vehicle rows"],
  ["No IFRS disclosures marked Disclosed", "Warning", "IFRS tracker untouched"],
  ["King V requires all 17 principle statuses", "Error", "Fewer than 17 statuses on the King V scorecard"],
  ["Capture environmental data", "Error", "Environmental score is 0"],
  ["Capture social data", "Error", "Social score is 0"],
  ["Capture governance data", "Error", "Governance score is 0"],
], [40, 14, 46]));

/* ---------------- Part 9: decisions ---------------- */
body.push(h1("Part 9. Known gaps, dead points and decisions needed"));
body.push(p("Everything in this part is a place where the system deliberately does not guess. Each row needs an owner and a decision."));
body.push(h2("9.1 Indicators that cannot score yet (30 points)"));
body.push(table(["Indicator", "Points", "Proposed rule (awaiting approval)", "What is missing", "Decision"], [
  ["E row 26: ISO 14001 certification", "8", "Half for the certification row, half for the ISO 14001 block maturity (out of 60), capped at 8", "ISO tracker block totals are not yet calculated", ""],
  ["E row 27: aspects register maintained", "4", "4 × clause 6.1.2 score ÷ 5", "Same", ""],
  ["E row 28: environmental policy board-approved", "4", "The stricter of the board-approval answer and the ISO policy clause, × 4 ÷ 5", "The policy row's score is not yet derived", ""],
  ["E row 29: NEMA / NWA / NEMWA compliance", "4", "4 × clause 6.1.3 score ÷ 5, only if a legal register is maintained", "ISO tracker block totals", ""],
  ["S row 26: supplier H&S compliance ≥ 80%", "5", "Average supplier H&S score ÷ 5 against 80%, pro-rata to the floor", "Supplier column averages", ""],
  ["S row 27: supplier food safety", "5", "Same rule on the food safety column", "Same", ""],
], [26, 8, 32, 22, 12], { rowFill: () => COL.rose }));
body.push(spacer());
body.push(h2("9.2 Methodology decisions"));
body.push(expertTable(["Question", "What the workbook does today", "Options", "Decision and owner"], [
  ["Overall score: should Environmental be divided by 108 or 100?", "Divided by 100 (a perfect E counts 1.08)", "Keep, or divide by 108", ""],
  ["Should the 40 / 30 / 30 pillar weights be used in the overall score?", "Not used; simple average", "Keep the average, or apply weights", ""],
  ["Black employee share (S row 5): all levels or top management only?", "Top management row only, despite the label", "All levels (as labelled) or keep", ""],
  ["Black female management (S row 6): levels 1–3 or 1–2?", "Levels 1 and 2 only, despite the label", "Add level 3 or keep", ""],
  ["LTIFR basis", "Per 1,000,000 hours; help text says 200,000", "Confirm 1,000,000 and fix the text", ""],
  ["Fatalities: any fatality in the year scores 0?", "Corrected rule needs a reported zero for all four quarters", "Confirm", ""],
  ["IFRS scoring: N/A scores 5, same as Disclosed", "Yes", "Keep or score N/A as neutral", ""],
  ["GHG summary block (E_Data rows 75–84) holds litres and kWh labelled as tonnes", "Reproduced as-is for audit parity; corrected inventory shown separately", "Fix the block, or keep both", ""],
  ["Scope 1 reduction (E row 6) reads the mixed-unit block", "Yes", "Point it at the corrected inventory", ""],
  ["Net-zero 2028 milestone: −50% (wording) or −20% (numbers)?", "Numbers used, wording displayed", "Choose one", ""],
  ["B-BBEE level ladder: back-fill Level 4 (80) and Level 6 (65)?", "Blank; level reported as \"Not determined\"", "Back-fill per the Generic Codes, or leave", ""],
  ["Thresholds for sectors other than FMCG / Distribution", "All 13 other sectors inherit the FMCG thresholds and pillar weights, visibly flagged as inherited", "Calibrate per sector (Part 10)", ""],
  ["Fuel card statements → fleet diesel monthly block", "Not filed automatically; typed by the consultant", "Define the depot and month rule", ""],
  ["Fatality count field on the health-and-safety form", "Not present; readings are reported, not filed", "Add the quarterly row", ""],
  ["Local procurement (S row 24): which document supplies local and total spend?", "Cells exist; no document type reads them", "Name the document (creditors ledger by supplier address?)", ""],
  ["Prior-year kWh (E row 12) and prior-year baseline (E row 6): which document?", "Cells exist; no document type reads them", "Prior-year bills, prior-year inventory, or SBTi letter", ""],
], [30, 25, 25, 20]));
body.push(spacer());
body.push(h2("9.3 Reference values used to test the calculation"));
body.push(p("The reference dataset is SG Consumer, FY 2025/26, nine months July 2025 to March 2026. Any change to a calculation must leave these values unchanged unless the change is a deliberate, documented methodology change."));
body.push(table(["Value", "As the workbook was", "Corrected (live)"], [
  ["Environmental points", "36 of 108", "36 of 108"],
  ["Social points", "33 of 100", "25 of 100"],
  ["Governance points", "64.85 of 100", "59.85 of 100"],
  ["Overall ESG", "44.6%", "40.3%"],
  ["Fleet diesel, litres (E_Data!L19)", "589,465.53", "same"],
  ["Grid electricity, kWh (L46)", "2,589,578.44", "same"],
  ["Water, kL (L63)", "4,356.41", "same"],
  ["Waste diversion rate (Waste_Register!B16)", "0.911", "same"],
  ["Leviable payroll (S_Data!B43) and SDL levy (B44)", "10,331,940.87 and 103,319.41", "same"],
  ["King V total (E21)", "135 of 170", "same"],
  ["IFRS total (E29)", "18 of 110", "same"],
  ["Management control estimate (B-BBEE bridge)", "6.65 of 19", "same"],
  ["Corrected Scope 1 + 2 inventory", "not on the workbook", "3,714.94 tCO₂e"],
], [40, 30, 30]));

/* ---------------- Part 10: master worksheet ---------------- */
body.push(h1("Part 10. Master worksheet for the experts"));
body.push(p("Use these tables to record anything that does not fit a family section. Add rows freely."));
body.push(h2("10.1 Documents the system should expect that it does not today"));
body.push(expertTable(["Document type (as a practitioner names it)", "Family", "Words that identify it", "Values to read", "What each value feeds or scores"], blankRows(8, 5), [24, 12, 20, 22, 22]));
body.push(spacer());
body.push(h2("10.2 New or corrected calculations"));
body.push(expertTable(["Indicator or figure", "Rule in words", "Threshold / target", "Source of the threshold", "Edge cases"], blankRows(8, 5), [20, 30, 14, 16, 20]));
body.push(spacer());
body.push(h2("10.3 Threshold sign-off"));
body.push(expertTable(["Threshold", "Value today", "Source", "Keep / change to", "Sector-specific?"], [
  ["Scope 1 reduction year on year", "10%", "Workbook v1.7", "", ""],
  ["Renewable share of electricity", "20%", "Workbook v1.7", "", ""],
  ["Fuel efficiency tolerance over norm", "5%", "Workbook v1.7", "", ""],
  ["EV share of fleet (minimum / 2030)", "5% / 20%", "Workbook v1.7", "", ""],
  ["Waste diversion (target / excellence)", "75% / 90%", "Workbook v1.7", "", ""],
  ["Black employees", "60%", "Workbook v1.7", "", ""],
  ["Black female management", "30%", "Workbook v1.7", "", ""],
  ["Persons with disabilities", "2%", "Workbook v1.7", "", ""],
  ["Training hours per employee", "40", "Workbook v1.7", "", ""],
  ["Mandatory grant recovery", "80%", "Workbook v1.7", "", ""],
  ["LTIFR limit", "2.0 per million hours", "Workbook v1.7", "", ""],
  ["CSI spend of NPAT", "1%", "Workbook v1.7", "", ""],
  ["CSI initiatives per year", "6", "Hard-coded in the scorecard", "", ""],
  ["Local procurement", "40%", "Workbook v1.7", "", ""],
  ["Supplier H&S compliance", "80%", "Workbook v1.7", "", ""],
  ["King V apply-and-explain minimum", "70%", "Workbook v1.7", "", ""],
  ["Public interest score", "500", "Companies Act", "", ""],
  ["Material risks in the register", "10", "Workbook v1.7", "", ""],
  ["Board: independent NEDs / executives cap / Black / female / meetings", "50% / 40% / 60% / 50% / 4", "Workbook v1.7", "", ""],
  ["Rating bands: Excellent / Good / Adequate; pillar target", "85% / 70% / 50%; 75%", "Workbook v1.7", "", ""],
  ["Emission factors: diesel / petrol / LPG / grid / solar / water / landfill", "2.68 / 2.31 / 1.51 / 0.82 / 0.025 kgCO₂e per unit; 0.000344 tCO₂e per kL; 0.58 tCO₂e per tonne", "DEFRA 2024, Eskom NERSA 2024, GHG Protocol", "", ""],
  ["Carbon tax: Tier 1 / Tier 2 / basic allowance", "R236 / R640 / 60%", "Carbon Tax Act", "", ""],
], [30, 22, 18, 15, 15]));
body.push(spacer());
body.push(h2("10.4 Sector calibration"));
body.push(p("Only FMCG / Distribution is calibrated from a real workbook. The other thirteen sectors inherit its thresholds, pillar weights and the fuel-intensive 40% environmental weighting, and the system flags every inherited value. Record here what should differ per sector."));
body.push(expertTable(["Sector", "Threshold or weight that should differ", "Value", "Reason / source"], [
  ["Transport / Logistics", "", "", ""], ["Manufacturing", "", "", ""], ["Financial Services", "", "", ""], ["ICT / Technology", "", "", ""],
  ["Agriculture", "", "", ""], ["Mining", "", "", ""], ["Construction", "", "", ""], ["Retail", "", "", ""],
  ["Hospitality", "", "", ""], ["Healthcare", "", "", ""], ["Education", "", "", ""], ["Public Sector", "", "", ""],
], [22, 34, 14, 30]));

/* ---------------- Appendix A: input cell catalogue ---------------- */
body.push(h1("Appendix A. Every input cell in the workbook"));
body.push(p("The cells a consultant can type into, with their dropdown options where they have one. Calculated cells are not listed."));
const GROUP_TITLES = {
  COVER_FIELDS: "Cover sheet", ASSUMPTIONS_FIELDS: "Assumptions sheet", E_DATA_SCOPE_FIELDS: "Environmental data: scope",
  E_DATA_ENERGY_BASELINE_FIELDS: "Environmental data: energy baseline", E_DATA_WATER_INITIATIVE_FIELDS: "Environmental data: water initiative",
  E_DATA_NZ_FIELDS: "Environmental data: net-zero baseline", E_DATA_GHG_SUMMARY_FIELDS: "Environmental data: GHG summary overrides (normally calculated)",
  WASTE_SCALAR_FIELDS: "Environmental data: contractor waste totals", S_DATA_HS_FIELDS: "Social data: health and safety (quarterly)",
  S_DATA_TRAINING_FIELDS: "Social data: WSP / ATR and training", S_DATA_PAYROLL_FIELDS: "Social data: payroll and NPAT",
  S_DATA_HEADCOUNT_FIELDS: "Social data: disability headcount", G_DATA_MATURITY_ROWS: "Governance data", EE_MATURITY_ROWS: "EE Scorecard",
};
for (const [group, title] of Object.entries(GROUP_TITLES)) {
  const fields = CFG[group];
  if (!fields) continue;
  body.push(h2(title));
  body.push(table(["Cell", "Label", "Kind", "Dropdown options / unit"], fields.map((f) => [
    f.cell, f.label, f.type || f.kind || "", f.options ? f.options.join(" / ") : (f.unit || ""),
  ]), [10, 44, 14, 32]));
  body.push(spacer());
}
body.push(h2("Register grids"));
for (const [sid, g] of Object.entries(GRIDS)) {
  body.push(h3(`${SECTION_NAMES[sid] || sid} (${g.sheet}) — ${g.description}`));
  body.push(table(["Column", "Kind", "Required", "Dropdown options"], g.columns.map((c) => [
    c.label, c.type, c.required ? "Yes" : "", c.options ? c.options.join(" / ") : "",
  ]), [30, 14, 12, 44]));
  body.push(spacer());
}

/* ---------------- Appendix B: permitted values ---------------- */
body.push(h1("Appendix B. The permitted list of values (382)"));
body.push(p("Every value the reader may name, grouped by where it lands. A value not on this list is rejected. This is the list to extend when you add a document or a value in Part 10."));
const NS_TITLES = { energy: "Energy", emissions: "Emissions and carbon tax", climate: "Climate targets and strategy", fleet: "Fleet", waste: "Waste", water: "Water", iso: "ISO and environmental management", ee: "Employment equity", hs: "Health and safety", training: "Training and skills", csi: "Community investment", supplier: "Suppliers", board: "Board and governance", ethics: "Ethics and compliance", risk: "Risk and assurance", entity: "Company and financials" };
const byNs = {};
for (const a of ALLOW) { const ns = a.key.split(".")[0]; (byNs[ns] = byNs[ns] || []).push(a); }
for (const [ns, list] of Object.entries(byNs)) {
  body.push(h2(`${NS_TITLES[ns] || ns} (${list.length})`));
  body.push(table(["Value", "Meaning", "Kind"], list.map((a) => [human(a.key), a.description, a.type === "iso_date" ? "date" : a.type === "boolean" ? "yes / no" : a.type]), [30, 55, 15], { size: 16 }));
  body.push(spacer());
}

/* ---------------- Appendix C: glossary ---------------- */
body.push(h1("Appendix C. Glossary"));
body.push(table(["Term", "Meaning"], [
  ["Scope 1", "Direct emissions from sources the company owns or controls: fleet and generator diesel, LPG, business-car petrol."],
  ["Scope 2", "Indirect emissions from purchased electricity, net of on-site solar."],
  ["Scope 3", "All other indirect emissions. In this toolkit only municipal water (and landfill on the register) is captured, so the figure is partial."],
  ["tCO₂e", "Tonnes of carbon-dioxide equivalent: all greenhouse gases expressed as the equivalent amount of CO₂."],
  ["Emission factor", "The multiplier that converts an activity (litres, kWh, kL) into kgCO₂e or tCO₂e."],
  ["Banding floor", "The share of a target below which an indicator scores nothing; set by the scoring stance (0.3 / 0.5 / 0.7)."],
  ["Pro-rata", "Partial credit in proportion to how close the actual figure is to the target."],
  ["EEA2 / EEA4", "The annual Employment Equity return: headcount by race, gender and occupational level."],
  ["LTIFR / TRIFR", "Lost-time (and total recordable) injury frequency rates per million hours worked."],
  ["WSP / ATR", "Workplace Skills Plan and Annual Training Report submitted to the SETA."],
  ["SDL", "Skills Development Levy: 1% of leviable payroll."],
  ["OFO code", "The national occupation classification used on the WSP / ATR."],
  ["NPAT", "Net profit after tax, the base for the 1% CSI / SED target."],
  ["CSI / SED", "Corporate social investment / socio-economic development."],
  ["King V", "The South African corporate governance code; 17 principles applied on an apply-and-explain basis."],
  ["IFRS S1 / S2", "The ISSB sustainability and climate disclosure standards."],
  ["POPIA", "Protection of Personal Information Act; the information officer is its accountable role."],
  ["SAQ", "Supplier self-assessment questionnaire."],
  ["SBTi", "Science Based Targets initiative; the net-zero target framework."],
  ["Derived (calculated) cell", "A workbook cell the system computes from inputs; never typed and never written to from a document."],
  ["Review item", "A value the system read but did not file, shown to the consultant with the reason."],
], [22, 78]));

/* ------------------------------------------------------------------ */
/* Document                                                             */
/* ------------------------------------------------------------------ */
const doc = new Document({
  creator: "Okiru",
  title: "Okiru ESG Toolkit: documents, values and calculations",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 34, bold: true, color: COL.head, font: FONT }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 27, bold: true, color: COL.head, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, color: "2E5395", font: FONT }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 2, keepNext: true } },
      { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 21, bold: true, italics: true, font: FONT }, paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 3, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [run("Okiru ESG Toolkit — documents, values and calculations (for expert completion)", { size: 16, color: "808080" })], alignment: AlignmentType.RIGHT })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Page ", { size: 16, color: "808080" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "808080", font: FONT })] })] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const file = path.join(OUT, "Okiru_ESG_Specification_for_Experts.docx");
  fs.writeFileSync(file, buf);
  console.log("wrote", file, buf.length, "bytes; paragraphs+tables:", body.length);
});
