import fs from "node:fs";
import path from "node:path";

function extract(file) {
  const j = JSON.parse(
    fs.readFileSync(path.join("docs/esg/extracted", file), "utf8"),
  );
  return j.rows
    .filter((r) => {
      const l = r.cells?.["1"]?.value;
      const m = r.cells?.["2"]?.value;
      return (
        typeof l === "string" &&
        !l.startsWith("──") &&
        l !== "Indicator" &&
        Number(m) > 0
      );
    })
    .map((r) => ({
      row: r.row,
      key: `d${r.row}`,
      indicator: r.cells["1"].value,
      maxPoints: Number(r.cells["2"].value),
    }));
}

const e = extract("E_Scorecard.json");
const s = extract("S_Scorecard.json");
const g = extract("G_Scorecard.json");

const out = `/** Auto-aligned to docs/esg/extracted/*_Scorecard.json (v1.7) */
export type EsgScorecardIndicator = {
  row: number;
  key: string;
  indicator: string;
  maxPoints: number;
};

export const E_SCORECARD_INDICATORS = ${JSON.stringify(e, null, 2)} as EsgScorecardIndicator[];

export const S_SCORECARD_INDICATORS = ${JSON.stringify(s, null, 2)} as EsgScorecardIndicator[];

export const G_SCORECARD_INDICATORS = ${JSON.stringify(g, null, 2)} as EsgScorecardIndicator[];

export const SCORECARD_INDICATORS = {
  environmental: E_SCORECARD_INDICATORS,
  social: S_SCORECARD_INDICATORS,
  governance: G_SCORECARD_INDICATORS,
} as const;
`;

fs.writeFileSync("apps/web/src/lib/esg/esgScorecardDefinitions.ts", out);
console.log(`E=${e.length} S=${s.length} G=${g.length}`);
