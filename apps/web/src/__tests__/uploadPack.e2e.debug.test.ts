/**
 * Full web-side pipeline over a REAL parser case JSON (saved from a live
 * extraction run). Gated: set UPLOAD_PACK_JSON to the saved result path.
 *
 *   UPLOAD_PACK_JSON=path/to/extraction-result.json npx vitest run src/__tests__/uploadPack.e2e.debug.test.ts
 *
 * Verifies the launch invariants on real data:
 *  - per-document verdicts credit files whose yield is section rows (no
 *    "0 found" while the workbook scores);
 *  - no nameless person rows reach the grid (parked into rejected instead);
 *  - no verbatim same-document duplicate rows (SED double-counting);
 *  - every select-column value the pipeline emits is one of the dropdown's
 *    permitted options (nothing "not connected").
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { mapParserCaseToWorkbookSections, type ParserCaseLike } from "@/lib/parserWorkbookMap";
import {
  mergeWorkbookSections,
  parserExtractionsToWorkbook,
  toWorkbookSections,
} from "@/lib/parserToWorkbook";
import { assessDocuments } from "@/lib/documentVerdicts";
import { getSection } from "@/components/workbook/sections";

const JSON_PATH = process.env.UPLOAD_PACK_JSON ?? "";

describe.skipIf(!JSON_PATH)("upload-pack pipeline (real extraction)", () => {
  const parserCase = JSON_PATH
    ? (JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as ParserCaseLike & {
        ai_entities?: { extractions?: Array<{ documentId?: string; sourceFile?: string; element?: string; values?: Array<{ field: string; value: unknown }> }> };
      })
    : ({} as never);

  const mapped = JSON_PATH ? mapParserCaseToWorkbookSections(parserCase) : null;
  const extractions = (parserCase.ai_entities?.extractions ?? []).map((e) => ({
    documentId: String(e.documentId ?? ""),
    sourceFile: String(e.sourceFile ?? ""),
    element: e.element,
    values: e.values ?? [],
  }));
  const injected = extractions.length ? parserExtractionsToWorkbook(extractions) : null;
  const sections = mergeWorkbookSections(
    mapped?.sections ?? {},
    injected ? toWorkbookSections(injected) : {},
  ) as Record<string, { rows?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>;

  it("prints the pipeline report", () => {
    const verdicts = assessDocuments(parserCase, sections);
    const rows = (key: string) => sections[key]?.rows ?? [];
    const report = {
      verdictCounts: verdicts.counts,
      none: verdicts.verdicts.filter((v) => v.verdict === "none").map((v) => v.filename),
      confused: verdicts.verdicts.filter((v) => v.verdict === "confused").map((v) => `${v.filename} (${v.gaps.slice(0, 2).join("; ")})`),
      sectionRowCounts: Object.fromEntries(Object.entries(sections).map(([k, s]) => [k, s.rows?.length ?? 0])),
      ownershipRows: rows("ownership").map((r) => `${r.shareholderName} | ${r.ownershipType ?? ""} | vote ${r.votingRights ?? "-"} | ei ${r.economicInterest ?? "-"}`),
      sedRows: rows("sed").map((r) => `${r.beneficiaryName} | ${r.contributionType ?? "?"} | R${r.amount ?? "-"} | ${r.dateOfTransaction ?? ""}`),
      parked: injected?.rejected.filter((r) => r.reason === "failed_validation" && /parked for review/i.test(r.detail)).map((r) => r.detail) ?? [],
      reconciliation: injected?.reconciliation.map((f) => f.message) ?? [],
    };
    console.log("PIPELINE REPORT\n" + JSON.stringify(report, null, 2));
    expect(true).toBe(true);
  });

  it("credits section-row yield in the verdicts (no 0-found contradiction)", () => {
    const verdicts = assessDocuments(parserCase, sections);
    const totalRows = Object.values(sections).reduce((n, s) => n + (s.rows?.length ?? 0), 0);
    if (totalRows > 0) {
      expect(verdicts.counts.found + verdicts.counts.confused).toBeGreaterThan(0);
    }
  });

  it("never renders a nameless person row", () => {
    for (const r of sections.ownership?.rows ?? []) {
      expect(String(r.shareholderName ?? "").trim(), JSON.stringify(r)).not.toBe("");
    }
    for (const r of sections["management-control"]?.rows ?? []) {
      expect(String(r.name ?? "").trim(), JSON.stringify(r)).not.toBe("");
    }
  });

  it("has no verbatim same-document duplicate rows", () => {
    for (const [key, section] of Object.entries(sections)) {
      const seen = new Set<string>();
      for (const r of section.rows ?? []) {
        const sig = key + "::" + JSON.stringify(
          Object.entries(r)
            .filter(([k, v]) => !k.startsWith("_") && String(v ?? "").trim() !== "")
            .map(([k, v]) => [k, String(v).trim().toLowerCase()])
            .sort(),
        ) + "::" + JSON.stringify(((r._sourceFiles as string[]) ?? []).slice().sort());
        expect(seen.has(sig), `duplicate row in ${key}: ${JSON.stringify(r).slice(0, 160)}`).toBe(false);
        seen.add(sig);
      }
    }
  });

  it("every select-column value is one of the dropdown's options", () => {
    for (const [key, section] of Object.entries(sections)) {
      const def = getSection(key);
      if (!def?.columns) continue;
      for (const col of def.columns) {
        if (col.type !== "select" || !col.options?.length || col.yesNoBoolean) continue;
        for (const r of section.rows ?? []) {
          const v = r[col.key];
          if (v === undefined || v === null || String(v).trim() === "") continue;
          if (typeof v === "boolean") continue;
          expect(
            col.options.includes(String(v)),
            `${key}.${col.key} = "${String(v)}" is not in [${col.options.join(", ")}]`,
          ).toBe(true);
        }
      }
    }
  });
});
