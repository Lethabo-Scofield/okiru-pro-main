/**
 * Step 3 — what we read, what it will be called, and the one button that
 * creates anything.
 *
 * This is the step the old flow did not have. Naming came FIRST (before there
 * was anything to name it after) and creation happened silently on the way in,
 * so the first thing anyone saw of their evidence pack was an empty workbook
 * with an "Add documents" button in the toolbar. Here the order is the honest
 * one: read → show → confirm → create.
 *
 * HARD RULE: the name is either something the user typed or something a
 * document actually said. There is no placeholder, no "Untitled", no name
 * derived from a filename — an empty field the user must fill is the correct
 * outcome when nothing named the entity.
 */
import { AlertTriangle, ArrowRight, ChevronLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { ESG_INPUT_SECTIONS } from "@/lib/esgSections";
import type { EsgImportPreview } from "@/lib/esg/esgWorkbookImport";
import EsgExtractionSummary from "./EsgExtractionSummary";
import EsgFlowSteps from "./EsgFlowSteps";
import type { EsgInjectionResult, EsgParserCaseLike } from "./esgParserInjection";

/** Which way in produced what is being reviewed. */
export type EsgCreateRoute = "documents" | "excel" | "manual";

/**
 * Where the proposed name came from. Shown so a wrong one is easy to spot —
 * and so "you typed this" is never dressed up as "we read this".
 */
export type EsgNameSource = "documents" | "workbook" | "you" | "none";

export interface EsgCreateReviewProps {
  route: EsgCreateRoute;
  entityName: string;
  onEntityNameChange: (name: string) => void;
  nameSource: EsgNameSource;
  /** Documents route — the mapping result and the case it came from. */
  injection?: EsgInjectionResult | null;
  parserCase?: EsgParserCaseLike | null;
  /** Excel route — the preview produced by the SAME parser the server uses. */
  excel?: { fileName: string; preview: EsgImportPreview } | null;
  creating?: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

const SECTION_TITLES: Record<string, string> = Object.fromEntries(
  ESG_INPUT_SECTIONS.map((section) => [section.id, section.title]),
);

function cellCount(cells: Record<string, unknown> | undefined): number {
  return Object.keys(cells ?? {}).length;
}

const NAME_SOURCE_NOTE: Record<EsgNameSource, string> = {
  documents: "Read from your documents. Correct it if it is not exactly how the entity is registered.",
  workbook: "Read from the workbook you imported. Correct it if it is wrong.",
  you: "The name you gave. This is what the company will be created as.",
  none: "Nothing we read named the entity, so this one is yours to give.",
};

export function EsgCreateReview({
  route,
  entityName,
  onEntityNameChange,
  nameSource,
  injection,
  parserCase,
  excel,
  creating = false,
  onBack,
  onConfirm,
}: EsgCreateReviewProps) {
  const trimmed = entityName.trim();
  const excelSections = Object.entries(excel?.preview.sections ?? {});
  const excelCells = excelSections.reduce((sum, [, section]) => sum + cellCount(section.cells), 0);

  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="esg-create-review">
      <EsgFlowSteps current={3} className="mb-6" />

      <div className="mb-6 text-center">
        <h2
          className="text-[30px] font-semibold leading-tight tracking-tight text-[var(--esg-text,#fff)]"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
        >
          Check this before we create it
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[var(--esg-text2,#8e8e93)]">
          {route === "manual"
            ? "Nothing has been read yet — you will complete the workbook yourself."
            : "This is what we read. Nothing has been created and nothing has been scored yet."}
        </p>
      </div>

      <div className="rounded-[20px] border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-section-bg,#141416)] p-5">
        <label
          htmlFor="esg-review-entity-name"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3,#636366)]"
        >
          Company name
        </label>
        <input
          id="esg-review-entity-name"
          value={entityName}
          onChange={(event) => onEntityNameChange(event.target.value)}
          placeholder="Type the registered name"
          autoComplete="organization"
          className="mt-2 w-full rounded-xl border border-[var(--esg-glass-border,#2c2c2e)] bg-black/30 px-4 py-2.5 text-[15px] text-[var(--esg-text,#fff)] placeholder-[var(--esg-text3,#636366)] outline-none focus:border-[var(--esg-acc-e,#1de9a0)]/40"
          data-testid="esg-review-entity-name"
        />
        <p className="mt-2 text-[12px] leading-5 text-[var(--esg-text2,#8e8e93)]">
          {NAME_SOURCE_NOTE[nameSource]}
        </p>
        {!trimmed ? (
          <p
            className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-300"
            data-testid="esg-review-name-required"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            A name is needed before the workbook can be created.
          </p>
        ) : null}
      </div>

      {route === "documents" && injection ? (
        <div className="mt-4">
          <EsgExtractionSummary injection={injection} parserCase={parserCase ?? null} />
        </div>
      ) : null}

      {route === "excel" && excel ? (
        <div
          className="mt-4 overflow-hidden rounded-[20px] border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-input-bg,#0e0e10)]"
          data-testid="esg-review-excel-summary"
        >
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--esg-text3,#636366)]" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[#e5e5ea]">{excel.fileName}</p>
              <p className="text-[11px] text-[var(--esg-text3,#636366)]">
                {excelSections.length} section{excelSections.length === 1 ? "" : "s"} matched ·{" "}
                {excelCells} value{excelCells === 1 ? "" : "s"} ready to import
              </p>
            </div>
          </div>
          {excelSections.map(([sectionId, section]) => (
            <div
              key={sectionId}
              className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0"
            >
              <span className="truncate text-[13px] text-[#d1d1d6]">
                {SECTION_TITLES[sectionId] ?? sectionId}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-[var(--esg-text2,#8e8e93)]">
                {cellCount(section.cells)}
              </span>
            </div>
          ))}
          {excel.preview.unmatchedSheets.length > 0 ? (
            <p className="border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 text-[var(--esg-text2,#8e8e93)]">
              Left out because they do not match a workbook section:{" "}
              {excel.preview.unmatchedSheets.join(", ")}
            </p>
          ) : null}
          {excel.preview.warnings.length > 0 ? (
            <p className="border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 text-amber-300">
              {excel.preview.warnings.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {route === "manual" ? (
        <p
          className="mt-4 rounded-[20px] border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-input-bg,#0e0e10)] px-4 py-3.5 text-[13px] leading-6 text-[var(--esg-text2,#8e8e93)]"
          data-testid="esg-review-manual-note"
        >
          You will start with an empty workbook and complete each section yourself. If an evidence
          pack turns up later, “Add documents” in the workbook reads it into the same sections.
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!trimmed || creating}
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[15px] font-semibold transition-colors disabled:opacity-50"
          style={{ background: "var(--esg-acc-e, #1de9a0)", color: "#080e14" }}
          data-testid="esg-review-create"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-[18px] w-[18px]" />
          )}
          {creating ? "Creating the workbook…" : "Create the ESG workbook"}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={creating}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.10] px-5 text-[13.5px] font-semibold text-[#d1d1d6] transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          data-testid="esg-review-back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
}

export default EsgCreateReview;
