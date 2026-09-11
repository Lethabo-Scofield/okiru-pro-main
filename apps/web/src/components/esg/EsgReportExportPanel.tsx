/**
 * The export section of the ESG dashboard and the ESG toolkit.
 *
 * The ESG product used to end at a score: a workbook was scored, a percentage
 * appeared, and nothing left the building. This panel is the other half.
 *
 * It shows the translation before it offers the download, because the first
 * honest question a client asks is "where does this figure come from?" The
 * traceability strip answers it from the live spine — what was captured, what
 * it scored, what the report will disclose, and what it will have to declare
 * as an omission. Those numbers are real: they are read from the same
 * `buildEsgReportModel` output that drives the generated pack, so a user who
 * can see that 41 of 60 metrics are populated is not surprised by a document
 * that says so.
 *
 * WHAT THE BUTTONS HAND OVER
 *
 * The client's own data, rendered into the Okiru format — two of the four
 * renderings the specification describes at 4.1:
 *
 *   Word        Rendering A, the Disclosure Pack. The full record: front
 *               matter, regulatory horizon, performance by pillar, the KPI
 *               table, the gap register, the roadmap, appendices.
 *   PowerPoint  Rendering B, the Board Strategy Pack. Twelve to eighteen
 *               slides a board reads in five minutes, ending on the decisions
 *               it is being asked to make.
 *
 * Both are built from one `buildEsgReportModel` call, so the deck and the
 * document cannot quote different numbers, and the figures in the traceability
 * strip above the buttons are the same figures that land in the files.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Presentation,
} from "lucide-react";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { buildEsgReportModel, type EsgReportModel } from "@/lib/esg/report/esgReportModel";
import { esgReportFilename } from "@/lib/esg/report/esgReportDocument";
import { renderEsgReportDocx } from "@/lib/esg/report/esgReportDocx";
import { renderEsgReportPptx } from "@/lib/esg/report/esgReportPptx";

type Props = {
  workbook: EsgWorkbookData | null;
  companyName: string;
  companyId: string;
};

type ExportKind = "docx" | "pptx";

const EXPORTS: {
  key: ExportKind;
  label: string;
  rendering: string;
  icon: typeof FileText;
  primary: boolean;
  render: (model: EsgReportModel) => Promise<Blob>;
}[] = [
  {
    key: "docx",
    label: "Word (.docx)",
    rendering: "Disclosure Pack",
    icon: FileText,
    primary: true,
    render: renderEsgReportDocx,
  },
  {
    key: "pptx",
    label: "PowerPoint (.pptx)",
    rendering: "Board Strategy Pack",
    icon: Presentation,
    primary: false,
    render: renderEsgReportPptx,
  },
];

/**
 * Save a generated Blob. Verifying the bytes before handing them over is not
 * defensive padding: a renderer that throws mid-way, or a zip that came back
 * empty, would otherwise produce a file the client cannot open, and the failure
 * would surface as Word or PowerPoint refusing it in front of them rather than
 * as a message here. Every OOXML package is a zip, so the "PK" header is a
 * cheap, exact check that we produced a real document.
 */
async function saveGenerated(blob: Blob, filename: string): Promise<void> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new Error(`${filename} did not render as a valid Office document. Nothing was downloaded.`);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously races the download in Safari and the file lands empty.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function EsgReportExportPanel({ workbook, companyName, companyId }: Props) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rebuilt whenever the workbook changes — the same spine the generator uses,
  // so what this panel counts is what the pack would contain.
  const model = useMemo<EsgReportModel | null>(() => {
    if (!workbook) return null;
    try {
      return buildEsgReportModel({ workbook, companyName, companyId, now: new Date() });
    } catch {
      return null;
    }
  }, [workbook, companyName, companyId]);

  const handleExport = async (spec: (typeof EXPORTS)[number]) => {
    if (!model) return;
    setBusy(spec.key);
    setError(null);
    try {
      const blob = await spec.render(model);
      await saveGenerated(blob, esgReportFilename(model, spec.key));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The export could not be generated.");
    } finally {
      setBusy(null);
    }
  };

  const downloads = (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      {EXPORTS.map((d) => {
        const Icon = d.icon;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => void handleExport(d)}
            disabled={busy != null || !model}
            title={`${d.rendering} — generated from this workbook`}
            className={
              d.primary
                ? "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[14px] disabled:opacity-60"
                : "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--esg-glass-border)] text-[13px] text-[var(--esg-text)] hover:bg-white/[0.04] disabled:opacity-60"
            }
            data-testid={`button-esg-export-${d.key}`}
          >
            {busy === d.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            {d.label}
          </button>
        );
      })}
    </div>
  );

  if (!model) {
    return (
      <div className="esg-glass p-6 space-y-4" data-testid="esg-report-export-empty">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-[var(--esg-text3)]" />
          <span className="text-[11px] uppercase tracking-wider text-[var(--esg-text3)]">
            Export — ESG Disclosure Pack
          </span>
        </div>
        <p className="text-[13px] text-[var(--esg-text2)] max-w-[60ch]">
          Capture workbook data first. Both packs are generated from the metric register — with
          nothing captured there is nothing to trace, and the export would be a document of
          omissions.
        </p>
        {downloads}
      </div>
    );
  }

  const { coverage, gaps, dataQualityIndex, meta, assuranceReadiness, evidence, claims } = model;
  const populatedPct = coverage.total ? coverage.populated / coverage.total : 0;
  const assurable = assuranceReadiness.filter((r) => r.rating === "Ready for limited assurance").length;

  /** input → dashboard → report, as three columns of one story. */
  const translation = [
    {
      stage: "What you captured",
      lines: [
        `${evidence.length} evidence blocks across the workbook`,
        `${evidence.reduce((a, e) => a + e.cellsPopulated, 0).toLocaleString("en-ZA")} populated cells`,
        meta.dataMonths ? `${meta.dataMonths} monthly periods` : "Monthly period count not stated",
      ],
    },
    {
      stage: "What the dashboard scores",
      lines: [
        `Overall ${fmtPct(model.scores.overallPercent)}`,
        `E ${model.scores.environmental.score.toFixed(1)}/${model.scores.environmental.max} · S ${model.scores.social.score.toFixed(1)}/${model.scores.social.max} · G ${model.scores.governance.score.toFixed(1)}/${model.scores.governance.max}`,
        model.ghg.hasData
          ? `Scope 1+2 ${model.ghg.scope1And2.toFixed(2)} tCO₂e`
          : "No emissions inventory yet",
      ],
    },
    {
      stage: "What the report discloses",
      lines: [
        `${coverage.populated} of ${coverage.total} metrics reported`,
        `${coverage.omitted} reasoned omissions, each with a gap and an action`,
        `${claims.length} evidence-bound claims · ${gaps.length} gaps · ${model.roadmap.length} roadmap actions`,
      ],
    },
  ];

  return (
    <div className="esg-glass p-6 space-y-5" data-testid="esg-report-export">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--esg-acc-e)]" />
            <span className="text-[11px] uppercase tracking-wider text-[var(--esg-text3)]">
              Export — ESG Disclosure Pack
            </span>
          </div>
          <p className="text-[13px] text-[var(--esg-text2)] mt-1.5 max-w-[54ch]">
            The full disclosure record: front matter, the regulatory horizon, performance by pillar,
            the consolidated KPI table, the gap register and the roadmap — every figure carrying its
            source, method, owner and data quality.
          </p>
        </div>
        <div
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
            meta.isDraft
              ? "bg-[rgba(176,58,46,0.14)] text-[#e08d80]"
              : "bg-[rgba(29,233,160,0.12)] text-[var(--esg-acc-e)]"
          }`}
          data-testid="esg-report-state"
        >
          {meta.isDraft ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {meta.isDraft ? "DRAFT — unsigned" : "FINAL — signed off"}
        </div>
      </div>

      {/* input → dashboard → report */}
      <div className="grid md:grid-cols-3 gap-3" data-testid="esg-report-translation">
        {translation.map((col, i) => (
          <div key={col.stage} className="esg-glass-sm p-4 relative">
            <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)] mb-2">
              {col.stage}
            </div>
            <ul className="space-y-1">
              {col.lines.map((l) => (
                <li key={l} className="text-[12px] text-[var(--esg-text2)] leading-snug">
                  {l}
                </li>
              ))}
            </ul>
            {i < translation.length - 1 ? (
              <ArrowRight className="hidden md:block h-4 w-4 text-[var(--esg-text3)] absolute -right-[14px] top-1/2 -translate-y-1/2" />
            ) : null}
          </div>
        ))}
      </div>

      {/* the figures the pack states on its own dashboard */}
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="esg-glass-sm p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)]">Coverage</div>
          <div className="text-[20px] font-bold text-[var(--esg-text)] mt-1">
            {coverage.populated}
            <span className="text-[13px] text-[var(--esg-text3)]"> / {coverage.total}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--esg-acc-e)]"
              style={{ width: `${Math.round(populatedPct * 100)}%` }}
            />
          </div>
        </div>
        <div className="esg-glass-sm p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)]">
            Data quality index
          </div>
          <div className="text-[20px] font-bold text-[var(--esg-text)] mt-1">
            {dataQualityIndex != null ? dataQualityIndex : "—"}
            <span className="text-[13px] text-[var(--esg-text3)]"> / 5</span>
          </div>
          <div className="text-[10px] text-[var(--esg-text3)] mt-1">Weighted across rated metrics</div>
        </div>
        <div className="esg-glass-sm p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)]">Gap register</div>
          <div className="text-[20px] font-bold text-[var(--esg-acc-s)] mt-1">{gaps.length}</div>
          <div className="text-[10px] text-[var(--esg-text3)] mt-1">Each costed, owned and dated</div>
        </div>
        <div className="esg-glass-sm p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)]">
            Assurance-ready topics
          </div>
          <div className="text-[20px] font-bold text-[var(--esg-text)] mt-1">
            {assurable}
            <span className="text-[13px] text-[var(--esg-text3)]"> / {assuranceReadiness.length}</span>
          </div>
          <div className="text-[10px] text-[var(--esg-text3)] mt-1">At data quality 4 or better</div>
        </div>
      </div>

      {meta.isDraft ? (
        <div
          className="rounded-lg border border-[rgba(176,58,46,0.3)] bg-[rgba(176,58,46,0.08)] px-4 py-3"
          data-testid="esg-report-signoff-gate"
        >
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-[#e08d80] mt-0.5 shrink-0" />
            <div className="text-[12px] leading-5 text-[var(--esg-text2)]">
              <strong className="text-[var(--esg-text)]">Sign-off gate — the pack issues as DRAFT.</strong>{" "}
              It asserts disclosure facts on Okiru letterhead from data Okiru has not verified, so it
              renders Final only once a named officer of {meta.entityName} is recorded against the
              approval field. There is no override in the client-facing build.
            </div>
          </div>
        </div>
      ) : null}

      {downloads}

      <p className="text-[11px] text-[var(--esg-text3)] leading-5">
        {meta.generationReference} · {meta.toolkitVersion} · {meta.crossWalkVersion}
      </p>

      {error ? (
        <p className="text-[12px] text-[#e08d80]" data-testid="esg-report-export-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default EsgReportExportPanel;
