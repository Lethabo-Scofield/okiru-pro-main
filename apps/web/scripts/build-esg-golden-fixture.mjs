/**
 * Regenerate SG Consumer golden cells from docs/esg/extracted/*.json
 * Run: node apps/web/scripts/build-esg-golden-fixture.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const extracted = path.join(repoRoot, "docs/esg/extracted");

function loadSheet(name) {
  return JSON.parse(fs.readFileSync(path.join(extracted, `${name}.json`), "utf8"));
}

function cellMap(sheet, filter) {
  const out = {};
  for (const row of sheet.rows || []) {
    for (const c of Object.values(row.cells || {})) {
      if (!c.coord || c.value === "" || c.value == null) continue;
      if (typeof c.value === "object") continue;
      if (filter && !filter(c, row)) continue;
      out[c.coord] = c.value;
    }
  }
  return out;
}

function pick(map, keys) {
  const out = {};
  for (const k of keys) {
    if (map[k] !== undefined) out[k] = map[k];
  }
  return out;
}

const coverSheet = loadSheet("Cover");
const coverAll = cellMap(coverSheet);
const assumptionsAll = cellMap(loadSheet("Assumptions"));
const eDataAll = cellMap(loadSheet("E_Data"));
const sDataAll = cellMap(loadSheet("S_Data"));
const gDataAll = cellMap(loadSheet("G_Data"));
const eeAll = cellMap(loadSheet("EE_Scorecard"));

const ESG_DEPOTS = ["BLOEM", "CPT", "DBN", "ISANDO", "PE"];
const MONTH_COLS = ["C", "D", "E", "F", "G", "H", "I", "J", "K"];
const DEPOT_ROWS = { s1a: 14, s2: 41 };

function monthlyPrefixCells(prefix, startRow, count = 5) {
  const out = {};
  for (let ri = 0; ri < count; ri++) {
    const row = startRow + ri;
    out[`${prefix}_depot_${ri}`] = eDataAll[`A${row}`] ?? ESG_DEPOTS[ri];
    MONTH_COLS.forEach((col, mi) => {
      const ref = `${col}${row}`;
      if (eDataAll[ref] !== undefined) out[`${prefix}_${col}${row}`] = eDataAll[ref];
    });
    if (eDataAll[`L${row}`] !== undefined) out[`${prefix}_ytd_${ri}`] = eDataAll[`L${row}`];
    if (eDataAll[`M${row}`] !== undefined) out[`${prefix}_tco2_${ri}`] = eDataAll[`M${row}`];
  }
  return out;
}

function headcountCells() {
  const out = {};
  for (let ri = 0; ri < 7; ri++) {
    const row = 5 + ri;
    for (let ci = 0; ci < 10; ci++) {
      const col = String.fromCharCode(66 + ci);
      const ref = `${col}${row}`;
      if (sDataAll[ref] !== undefined) out[`hc_${ri}_${ci}`] = sDataAll[ref];
    }
    if (sDataAll[`L${row}`] !== undefined) out[`L${row}`] = sDataAll[`L${row}`];
  }
  if (sDataAll.L12 !== undefined) out.L12 = sDataAll.L12;
  return out;
}

const SG_CONSUMER_GOLDEN_CELLS = {
  "company-reporting-setup": {
    entity: coverAll.C5 ?? "SG Consumer",
    period: coverAll.C6 ?? "FY 2025/26",
    baselineYear: coverAll.C10 ?? 2025,
    netZeroTargetYear: coverAll.C11 ?? 2050,
    sector: coverAll.C12 ?? "FMCG / Distribution",
  },
  assumptions: pick(assumptionsAll, [
    "B3",
    "B6",
    "B8",
    "B9",
    "B10",
    "B11",
    "B13",
    "B37",
    "B38",
    "B39",
    "B43",
    "B44",
    "B46",
    "B48",
    "B50",
    "B51",
    "B52",
    "B53",
    "B54",
    "B55",
    "B107",
    "B112",
  ]),
  "e-data": {
    ...pick(eDataAll, ["B4", "B5", "B6", "B7", "B8", "B9", "L19", "L46", "L63", "L75", "L76", "L77", "L78", "L82", "B90", "F90"]),
    ...monthlyPrefixCells("s1a", DEPOT_ROWS.s1a),
    ...monthlyPrefixCells("s2", DEPOT_ROWS.s2),
    _months_C_K: 9,
  },
  "s-data": {
    ...headcountCells(),
    ...pick(sDataAll, ["G28", "G29", "G35", "B45", "B46", "B44", "B49", "B50", "B70", "B71", "C59"]),
    _initiatives_count: 6,
  },
  "g-data": {
    ...Object.fromEntries(
      Object.entries(gDataAll).filter(([k]) => /^B\d+$/.test(k) || /^F\d+$/.test(k)),
    ),
    F26: gDataAll.F26 ?? 66.0714285714,
  },
  ee: pick(eeAll, ["B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13", "B14"]),
  king5: { E21: 135 },
  waste: pick(cellMap(loadSheet("Waste_Register")), ["B16", "B17", "B18", "B19"]),
  "driver-debrief": { _active: 1 },
  ifrs: { _yes_count: 0, _total: 10 },
};

// Legacy alias for in-flight workbooks
SG_CONSUMER_GOLDEN_CELLS.cover = SG_CONSUMER_GOLDEN_CELLS["company-reporting-setup"];

const outPath = path.join(repoRoot, "apps/web/EsgToolkit/src/lib/fixtures/esg-consumer-golden.generated.json");
fs.writeFileSync(outPath, JSON.stringify(SG_CONSUMER_GOLDEN_CELLS, null, 2));
let cellCount = 0;
for (const sec of Object.values(SG_CONSUMER_GOLDEN_CELLS)) {
  cellCount += Object.keys(sec).length;
}
console.log(`Wrote ${outPath} (${Object.keys(SG_CONSUMER_GOLDEN_CELLS).length} sections, ${cellCount} cells)`);
