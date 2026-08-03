import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Award, ChevronRight, FileText, Loader2, ScanLine, Sparkles } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { API_BASE } from "@toolkit/lib/config";
import { ScorecardPillarList } from "@/components/scorecard/ScorecardPillarSummary";
import { ReconciliationReview } from "@/components/scorecard/ReconciliationReview";
import type { ReconcileResult } from "@/lib/reconciliation/types";
import type { VerdictReport, EntityVerdict } from "@/lib/documentVerdicts";
import { fscSubSectorDisplayLabel, normalizeFscSubSector } from "@toolkit/lib/sectors/fsc-utils";

const PILLAR_META: { key: string; label: string; color: string }[] = [
  { key: "ownership", label: "Ownership", color: "#5e9bff" },
  { key: "managementControl", label: "Management Control", color: "#34d399" },
  { key: "employmentEquity", label: "Employment Equity", color: "#2dd4bf" },
  { key: "skillsDevelopment", label: "Skills Development", color: "#f59e0b" },
  { key: "procurement", label: "Preferential Procurement", color: "#a78bfa" },
  { key: "supplierDevelopment", label: "Supplier Development", color: "#38bdf8" },
  { key: "enterpriseDevelopment", label: "Enterprise Development", color: "#22d3ee" },
  { key: "accessToFinancialServices", label: "Access to Financial Services", color: "#06b6d4" },
  { key: "socioEconomicDevelopment", label: "Socio-Economic Dev.", color: "#f472b6" },
  { key: "yesInitiative", label: "YES Initiative", color: "#fb923c" },
];

function formatLevel(level: number): string {
  return level >= 9 ? "Non-Compliant" : `Level ${level}`;
}

/**
 * Verdict encoding — colour AND shape, never colour alone, so the state reads
 * in greyscale and for colour-blind users. Semantic hues only; the violet
 * accent means "this costs money" elsewhere and must not leak in here.
 */
const VERDICT_COLOR: Record<EntityVerdict, string> = {
  found: "#30d158",
  confused: "#ffd60a",
  none: "#ff453a",
};
const VERDICT_GLYPH: Record<EntityVerdict, string> = {
  found: "◼",
  confused: "◆",
  none: "●",
};

interface WorkbookScoreSummaryProps {
  companyId: string;
  companyName: string;
  /**
   * Provisional mode is the destination of the document-upload flow: the score
   * is computed by the SAME calculator, but framed as an indicative estimate
   * from the uploaded documents, and the primary action pushes the user into
   * the workbook to review/complete rather than to the read-only scorecard.
   */
  provisional?: boolean;
}

export function WorkbookScoreSummary({ companyId, companyName, provisional = false }: WorkbookScoreSummaryProps) {
  const [, navigate] = useLocation();
  // The document flow stashes its per-document verdicts here before landing on
  // this page (same sessionStorage convention as the Excel import marker).
  const [verdictReport, setVerdictReport] = useState<VerdictReport | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  // The per-document ledger is long; collapsed by default so it can't bury the
  // Continue action. The reconciliation summary above already carries the gist.
  const [showVerdicts, setShowVerdicts] = useState(false);

  useEffect(() => {
    if (!provisional || !companyId) return;
    try {
      const raw = sessionStorage.getItem(`okiru-doc-verdicts-${companyId}`);
      if (raw) setVerdictReport(JSON.parse(raw) as VerdictReport);
    } catch {
      // The ledger is additive — the score still stands without it.
    }
    try {
      const rec = sessionStorage.getItem(`okiru-reconcile-${companyId}`);
      if (rec) setReconcile(JSON.parse(rec) as ReconcileResult);
    } catch {
      // Reconciliation review is additive too.
    }
  }, [provisional, companyId]);
  const { scorecard, client, calculatorConfig, isLoaded, loadClientData, activeClientId } = useBbeeStore();
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    localStorage.setItem("okiru-pro-active-client", companyId);
    let cancelled = false;
    (async () => {
      setRefreshing(true);
      try {
        await fetch(`${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/sync`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Best-effort sync — loadClientData still runs below.
      }
      if (!cancelled) {
        try {
          await loadClientData(companyId);
        } catch {
          // Error surfaced via loading state below.
        }
      }
      if (!cancelled) setRefreshing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, loadClientData]);

  const loading = Boolean(companyId) && (refreshing || !isLoaded || activeClientId !== companyId);

  const pillarRows = useMemo(() => {
    const transportQse =
      (client.sectorCode ?? "").toUpperCase().includes("TRANSPORT") &&
      (client.scorecardType ?? "").toUpperCase() === "QSE";

    return PILLAR_META.map((meta) => {
      const pillar = scorecard[meta.key as keyof typeof scorecard] as
        | { score?: number; weighting?: number; subMinimumMet?: boolean; isElectiveNotChosen?: boolean; isChosenElective?: boolean }
        | undefined;
      const score = typeof pillar?.score === "number" ? pillar.score : 0;
      let maxPoints = typeof pillar?.weighting === "number" ? pillar.weighting : 0;
      let label = meta.label;
      if (pillar?.isChosenElective) label = `${meta.label} (chosen elective)`;
      if (pillar?.isElectiveNotChosen) return null;
      if (maxPoints <= 0 && !transportQse) return null;
      if (maxPoints <= 0) return null;
      return {
        code: meta.key,
        label,
        score,
        maxPoints,
        color: meta.color,
        subMinimumMet: pillar?.subMinimumMet,
      };
    }).filter(Boolean) as Array<{
      code: string;
      label: string;
      score: number;
      maxPoints: number;
      color: string;
      subMinimumMet?: boolean;
    }>;
  }, [scorecard, client.sectorCode, client.scorecardType]);

  const goToScorecard = () => {
    localStorage.setItem("okiru-pro-active-client", companyId);
    // Record origin so the toolkit "Back" returns here (the summary), not the Hub.
    sessionStorage.setItem("okiru-toolkit-from", JSON.stringify({ kind: "summary", companyId }));
    navigate("/toolkit/scorecard");
  };

  const openWorkbook = () => {
    sessionStorage.setItem("okiru-workbook-from", "summary");
    navigate(`/create-scorecard/${encodeURIComponent(companyId)}`);
  };

  const sector = client.sectorCode || client.industry || "—";
  const displayLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;
  const isFsc = sector.toUpperCase() === "FSC";
  const fscSubLabel = isFsc && client.fscSubSector
    ? fscSubSectorDisplayLabel(normalizeFscSubSector(client.fscSubSector))
    : null;
  const level1Threshold = calculatorConfig?.levelThresholds?.find((t) => t.level === 1)?.minPoints;

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6" data-testid="workbook-score-summary">
      {/* Sticky action bar: the primary Continue is ALWAYS reachable, so the
          review panels below can never hide it however far the user scrolls. */}
      <div className="flex items-start justify-between gap-4 flex-wrap sticky top-0 z-20 -mx-4 px-4 py-3 border-b border-[#1e1e1e] bg-[#0a0a0a]/85 backdrop-blur-md">
        <div>
          <h2 className="text-[24px] font-bold text-white tracking-tight">
            {provisional ? "Your indicative B-BBEE score" : "Scorecard Summary"}
          </h2>
          <p className="text-[#8e8e93] text-[14px] mt-1">
            {provisional ? "Estimated from the documents you uploaded for " : "High-level results for "}
            <span className="text-white font-medium">{companyName}</span>
          </p>
          <p className="text-[13px] text-[#636366] mt-1">
            {sector}
            {client.scorecardType ? ` · ${client.scorecardType}` : ""}
            {fscSubLabel ? ` · ${fscSubLabel}` : ""}
            {client.fscReinsurer ? " · Reinsurer" : ""}
            {scorecard.chosenElectivePillar ? " · 82 compulsory + 1 elective (107 max)" : ""}
          </p>
          {level1Threshold != null && (
            <p className="text-[12px] text-[#636366] mt-0.5">
              Level 1 threshold: &gt; {level1Threshold.toFixed(2)} pts
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={provisional ? openWorkbook : goToScorecard}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-[#e5e5ea] text-black rounded-xl font-semibold text-[13px] transition-colors shrink-0 disabled:opacity-60"
          data-testid={provisional ? "button-open-workbook-top" : "button-continue-scorecard"}
        >
          {provisional ? <FileText className="w-4 h-4" /> : <ScanLine className="w-4 h-4" />}
          {provisional ? "Open workbook to refine" : "View Scorecard"}
        </button>
      </div>

      {/* Provisional framing — the score is real (same calculator) but not the
          final verified result; the documents may be incomplete. */}
      {provisional && (
        <div
          className="rounded-2xl px-4 py-3.5 flex items-start gap-3"
          style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.22)" }}
          data-testid="provisional-banner"
        >
          <Sparkles className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
          <div className="text-[13px] leading-relaxed">
            <span className="text-violet-200 font-semibold">This is an indicative score, not your final B-BBEE result.</span>
            <span className="text-[#a1a1a6]">
              {" "}It’s calculated the same way as a full assessment, but only from the documents you uploaded — anything
              they didn’t cover reads as zero. Open the workbook to review the extracted values, complete the gaps, and
              finalise your verified score.
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-[#8e8e93] text-sm" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
          <Loader2 className="h-6 w-6 animate-spin" />
          Calculating scorecard…
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
              <span className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest">Total Score</span>
              <span className="text-[28px] font-bold text-white leading-none tabular-nums">
                {scorecard.total.score.toFixed(2)}
              </span>
              <span className="text-[12px] text-[#636366]">of {scorecard.total.weighting} pts</span>
            </div>
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
              <span className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest">B-BBEE Level</span>
              <span className="text-[28px] font-bold text-white leading-none">{formatLevel(displayLevel)}</span>
              {scorecard.isDiscounted && (
                <span className="text-[11px] text-amber-400">Discounted from {formatLevel(scorecard.achievedLevel)}</span>
              )}
            </div>
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
              <span className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest">Recognition</span>
              <span className="text-[28px] font-bold text-white leading-none">{scorecard.recognitionLevel || "—"}</span>
              <span className="text-[12px] text-[#636366] flex items-center gap-1">
                <Award className="h-3 w-3" /> Procurement recognition
              </span>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #1e1e1e" }}>
              <p className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest">Pillar scores</p>
            </div>
            <ScorecardPillarList pillars={pillarRows} />
          </div>

          {/* Reconciliation review — what we did with the documents, triaged by
              severity (handled / needs you / missing). The output face of the
              entity model; keeps the page short by summarising the handled. */}
          {provisional && <ReconciliationReview reconcile={reconcile} />}

          {/* The honest ledger — what each document actually gave us. This is
              what a requote is argued from, so it names gaps rather than
              hiding them. Colour + shape, so the state survives greyscale. */}
          {provisional && verdictReport && verdictReport.verdicts.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }} data-testid="document-verdicts">
              <button
                type="button"
                onClick={() => setShowVerdicts((s) => !s)}
                className="w-full px-5 py-4 flex items-center justify-between gap-3 flex-wrap text-left"
                style={{ borderBottom: showVerdicts ? "1px solid #1e1e1e" : "none" }}
                data-testid="toggle-document-verdicts"
              >
                <p className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest flex items-center gap-2">
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showVerdicts ? "rotate-90" : ""}`} />
                  What each document gave us
                </p>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-[#30d158]">◼ {verdictReport.counts.found} found</span>
                  {verdictReport.counts.confused > 0 && <span className="text-[#ffd60a]">◆ {verdictReport.counts.confused} needs a look</span>}
                  {verdictReport.counts.none > 0 && <span className="text-[#ff453a]">● {verdictReport.counts.none} nothing</span>}
                </div>
              </button>
              {showVerdicts && <div className="divide-y" style={{ borderColor: "#1e1e1e" }}>
                {verdictReport.verdicts.map((v) => (
                  <div key={v.filename} className="px-5 py-3 flex items-start gap-3" style={{ borderTop: "1px solid #141414" }}>
                    <span className="mt-1 shrink-0" style={{ color: VERDICT_COLOR[v.verdict], fontSize: 10 }}>
                      {VERDICT_GLYPH[v.verdict]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[13px] text-[#e5e5ea] font-medium truncate">{v.filename}</span>
                        <span className="text-[11px] text-[#636366]">{v.documentType}</span>
                      </div>
                      <div className="text-[12px] mt-0.5" style={{ color: VERDICT_COLOR[v.verdict] }}>{v.summary}</div>
                      {v.gaps.length > 0 && (
                        <div className="text-[11px] text-[#8e8e93] mt-1">
                          Couldn’t read: {v.gaps.slice(0, 3).join(", ")}
                          {v.gaps.length > 3 ? ` +${v.gaps.length - 3} more` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>}
              {/* Requote — argued from the gaps above, priced only on new files. */}
              <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid #1e1e1e", background: "rgba(167,139,250,.05)" }}>
                <p className="text-[12px] text-[#a1a1a6] max-w-[46ch]">
                  Missing a pillar? Add the documents that cover it — you’re quoted for the new files only, never for
                  anything we’ve already read.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/create-scorecard")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-[#e5e5ea] text-black text-[13px] font-semibold shrink-0"
                  data-testid="button-add-documents-requote"
                >
                  Add documents &amp; requote
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {provisional ? (
            <div className="flex justify-end gap-3 flex-wrap">
              <button
                type="button"
                onClick={goToScorecard}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[13px] text-[#d1d1d6] smooth press-sm"
                data-testid="button-view-scorecard-provisional"
              >
                <ScanLine className="w-4 h-4" /> View full scorecard
              </button>
              <button
                type="button"
                onClick={openWorkbook}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-[#e5e5ea] text-black rounded-xl font-semibold text-[14px] transition-colors"
                data-testid="button-open-workbook-bottom"
              >
                Open workbook to refine
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-3 flex-wrap">
              <button
                type="button"
                onClick={openWorkbook}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[13px] text-[#d1d1d6] smooth press-sm"
                data-testid="button-back-workbook"
              >
                ← Edit Workbook
              </button>
              <button
                type="button"
                onClick={goToScorecard}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-[#e5e5ea] text-black rounded-xl font-semibold text-[14px] transition-colors"
                data-testid="button-continue-scorecard-bottom"
              >
                Continue to Scorecard
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
