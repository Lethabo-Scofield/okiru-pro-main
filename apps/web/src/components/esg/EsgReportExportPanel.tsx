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
 * WHAT THE BUTTONS CURRENTLY HAND OVER
 *
 * The two downloads are the Okiru report templates themselves — the Word
 * specification and the PowerPoint deck in `docs/Report`, shipped as static
 * assets under `/reports/`. This is deliberate and it is a DEMO SETTING: it
 * guarantees the client sees the exact documents that were signed off, in the
 * exact format, with no risk of a generated layout surprising anyone live.
 *
 * The generator is built, tested and still in the tree
 * (`@/lib/esg/report/*`) — it renders the client's own data into that same
 * format. Switching the buttons back to it is a one-line change per handler,
 * marked below. Until then, be precise with clients about which of the two
 * they are being shown: these files are the template, not their data.
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

type Props = {
  workbook: EsgWorkbookData | null;
  companyName: string;
  companyId: string;
};

/**
 * The shipped templates. Served from `apps/web/public/reports/`, which Vite
 * copies into `dist/public` at build time, so these resolve in dev and in the
 * container identically.
 */
const TEMPLATE_DOWNLOADS = [
  {
    key: "docx" as const,
    label: "Word (.docx)",
    href: "/reports/Okiru-ESG-Report-Template-Specification.docx",
    icon: FileText,
    primary: true,
  },
  {
    key: "pptx" as const,
    label: "PowerPoint (.pptx)",
    href: "/reports/Okiru-ESG-Report-Template-Specification.pptx",
    icon: Presentation,
    primary: false,
  },
];

/**
 * Fetch, VERIFY, then save — rather than a bare `<a download>`. A plain link to
 * a static asset can be hijacked by the SPA router or opened inline by the
 * browser's own Office viewer, and fetching to a Blob makes it deterministic.
 *
 * The verification is not defensive padding. This app's server answers every
 * unrecognised path with `200 text/html` — the SPA index — so a missing or
 * misdeployed asset does NOT 404. Checking `res.ok` alone would hand the
 * client an HTML page named `.docx`, the button would look like it worked, and
 * the failure would surface as Word refusing to open the file in front of
 * them. So the response is checked for the ZIP magic number that opens every
 * OOXML file, and a mismatch is reported here instead.
 */
async function downloadTemplate(href: string, filename: string): Promise<void> {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${filename} could not be fetched (${res.status}).`);
  const buf = await res.arrayBuffer();
  const sig = new Uint8Array(buf.slice(0, 2));
  // "PK" — every .docx and .pptx is a zip archive.
  if (sig[0] !== 0x50 || sig[1] !== 0x4b) {
    throw new Error(
      `${filename} is not on this server — the request returned a web page instead of the document. The report assets were not included in this build.`,
    );
  }
  const blob = new Blob([buf], { type: res.headers.get("content-type") ?? "application/octet-stream" });
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
  const [busy, setBusy] = useState<string | null>(null);
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

  const handleDownload = async (key: string, href: string) => {
    setBusy(key);
    setError(null);
    try {
      // ── To ship the CLIENT'S OWN generated pack instead of the template,
      //    replace this call with `renderEsgReportDocx(model)` (or the PDF
      //    renderer) from `@/lib/esg/report/`. Everything else stays. ──
      await downloadTemplate(href, href.split("/").pop() as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download could not be completed.");
    } finally {
      setBusy(null);
    }
  };

  const downloads = (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      {TEMPLATE_DOWNLOADS.map((d) => {
        const Icon = d.icon;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => handleDownload(d.key, d.href)}
            disabled={busy != null}
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
          Capture workbook data to see how it translates into the report. The report format is
          available below.
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
