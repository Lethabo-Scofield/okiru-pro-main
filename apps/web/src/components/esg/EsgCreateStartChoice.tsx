/**
 * "How would you like to begin?" — the ESG entry choice.
 *
 * Flow parity with `/create-scorecard`: the B-BBEE side offers three ways in
 * (upload documents / import Excel / enter manually) and lands all three on the
 * same workbook through the same import + submit path. ESG previously offered
 * one — an `.xlsx` file input tucked into the workbook toolbar — so the
 * document route had nowhere to be discovered.
 *
 * The three options are deliberately the same three, in the same order, with
 * the same cost signals, because a user who has done this once on B-BBEE
 * already knows this screen.
 *
 * Nothing is decided here: choosing a path commits nothing, and switching
 * between them costs nothing. The Excel and manual paths are the EXACT paths
 * that already existed — this screen only routes to them.
 */
import { useRef } from "react";
import { Building2, ChevronRight, FileSpreadsheet, FolderOpen, Loader2, Upload } from "lucide-react";
import EsgFlowSteps from "./EsgFlowSteps";

export interface EsgCreateStartChoiceProps {
  companyName?: string;
  /** Start the document-upload flow. */
  onChooseUpload: () => void;
  /**
   * Hand an `.xlsx` up to the host, which runs the SAME preview + confirm the
   * workbook toolbar's "Import / bulk upload" runs. No second import path.
   */
  onChooseExcel: (file: File) => void;
  /** Go straight to the workbook and type it in. */
  onChooseManual: () => void;
  /** True while the host is parsing the chosen workbook. */
  importing?: boolean;
  /**
   * Reopen a scorecard that already exists.
   *
   * Only the `/esg` front door passes this: inside a workbook the company is
   * already chosen, so "open an existing one" there would be an invitation to
   * abandon what you are looking at.
   */
  onOpenExisting?: () => void;
}

export function EsgCreateStartChoice({
  companyName,
  onChooseUpload,
  onChooseExcel,
  onChooseManual,
  importing = false,
  onOpenExisting,
}: EsgCreateStartChoiceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const options = [
    {
      key: "upload",
      title: "Upload documents",
      description:
        "Utility bills, fuel statements, waste manifests, certificates and registers. Token cost shown before anything is read.",
      icon: Upload,
      badge: "Uses tokens",
      testId: "esg-start-upload",
      onSelect: onChooseUpload,
      // The main route, and the only one that can fill a workbook in from an
      // evidence pack. It reads as the default rather than as one of three
      // equals — being first was not enough when it used to live in a toolbar.
      primary: true,
    },
    {
      key: "manual",
      title: "Enter details manually",
      description: "Open the workbook and complete each section yourself.",
      icon: Building2,
      badge: "Free",
      testId: "esg-start-manual",
      onSelect: onChooseManual,
    },
    {
      key: "excel",
      title: "Import Excel workbook",
      description:
        "Continue from an existing ESG data-collection workbook. Sheets are matched to sections and previewed before anything is saved.",
      icon: FileSpreadsheet,
      badge: "Free",
      testId: "esg-start-excel",
      onSelect: () => fileInputRef.current?.click(),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="esg-create-start-choice">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onChooseExcel(file);
        }}
        data-testid="esg-start-excel-input"
      />

      <EsgFlowSteps current={1} className="mb-6" />

      <div className="mb-6 text-center">
        <h2
          className="mt-2 text-[30px] font-semibold leading-tight tracking-tight text-[var(--esg-text,#fff)]"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
        >
          Start the ESG workbook
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[var(--esg-text2,#8e8e93)]">
          {companyName ? `For ${companyName}. ` : ""}Choose how you would like to begin — every route
          ends in the same workbook and the same score.
        </p>
      </div>

      <div className="space-y-2.5">
        {options.map(({ key, title, description, icon: Icon, badge, testId, onSelect, primary }) => (
          <button
            key={key}
            type="button"
            onClick={onSelect}
            disabled={importing}
            className={`group flex w-full items-center gap-4 rounded-[20px] border px-4 py-4 text-left transition-colors disabled:opacity-50 ${
              primary
                ? "border-[var(--esg-acc-e,#1de9a0)]/35 bg-[#12191a] hover:border-[var(--esg-acc-e,#1de9a0)]/60 hover:bg-[#16201f]"
                : "border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-section-bg,#141416)] hover:border-white/[0.16] hover:bg-[#1c1c1e]"
            }`}
            data-testid={testId}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                primary
                  ? "bg-[var(--esg-acc-e,#1de9a0)]/15 text-[var(--esg-acc-e,#1de9a0)]"
                  : "bg-white/[0.06] text-[#d1d1d6]"
              }`}
            >
              {importing && key === "excel" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-[var(--esg-text,#fff)]">
                {title}
                {primary ? (
                  <span className="rounded-full bg-[var(--esg-acc-e,#1de9a0)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--esg-acc-e,#1de9a0)]">
                    Start here
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-[var(--esg-text2,#8e8e93)]">
                {description}
              </span>
            </span>
            <span className="hidden shrink-0 rounded-full border border-white/[0.10] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-[var(--esg-text2,#8e8e93)] sm:inline-flex">
              {badge}
            </span>
            <ChevronRight className="h-5 w-5 text-[var(--esg-text3,#636366)] transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
          </button>
        ))}
      </div>

      <p className="mt-6 text-center text-[12px] text-[var(--esg-text3,#636366)]">
        You can switch between these at any time — nothing is committed until you save.
      </p>

      {/* The other reason someone opens ESG: they are coming back to a scorecard
          they already started. It is a second door, not the front one. */}
      {onOpenExisting ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4 text-center">
          <button
            type="button"
            onClick={onOpenExisting}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--esg-text2,#8e8e93)] transition-colors hover:text-white"
            data-testid="esg-open-existing"
          >
            <FolderOpen className="h-4 w-4" />
            Open an existing ESG scorecard
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default EsgCreateStartChoice;
