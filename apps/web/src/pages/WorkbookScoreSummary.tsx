import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Award, ChevronRight, Loader2, ScanLine } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { ScorecardPillarList } from "@/components/scorecard/ScorecardPillarSummary";

const PILLAR_META: { key: string; label: string; color: string }[] = [
  { key: "ownership", label: "Ownership", color: "#5e9bff" },
  { key: "managementControl", label: "Management Control", color: "#34d399" },
  { key: "skillsDevelopment", label: "Skills Development", color: "#f59e0b" },
  { key: "procurement", label: "Preferential Procurement", color: "#a78bfa" },
  { key: "supplierDevelopment", label: "Supplier Development", color: "#38bdf8" },
  { key: "enterpriseDevelopment", label: "Enterprise Development", color: "#22d3ee" },
  { key: "socioEconomicDevelopment", label: "Socio-Economic Dev.", color: "#f472b6" },
  { key: "yesInitiative", label: "YES Initiative", color: "#fb923c" },
];

function formatLevel(level: number): string {
  return level >= 9 ? "Non-Compliant" : `Level ${level}`;
}

interface WorkbookScoreSummaryProps {
  companyId: string;
  companyName: string;
}

export function WorkbookScoreSummary({ companyId, companyName }: WorkbookScoreSummaryProps) {
  const [, navigate] = useLocation();
  const { scorecard, client, isLoaded, loadClientData, activeClientId } = useBbeeStore();
  const loading = Boolean(companyId) && (!isLoaded || activeClientId !== companyId);

  useEffect(() => {
    localStorage.setItem("okiru-pro-active-client", companyId);
    loadClientData(companyId).catch(() => {
      // Error surfaced via loading state below.
    });
  }, [companyId, loadClientData]);

  const pillarRows = useMemo(() => {
    return PILLAR_META.map((meta) => {
      const pillar = scorecard[meta.key as keyof typeof scorecard] as
        | { score?: number; weighting?: number; subMinimumMet?: boolean }
        | undefined;
      const score = typeof pillar?.score === "number" ? pillar.score : 0;
      const maxPoints = typeof pillar?.weighting === "number" ? pillar.weighting : 0;
      return {
        code: meta.key,
        label: meta.label,
        score,
        maxPoints,
        color: meta.color,
        subMinimumMet: pillar?.subMinimumMet,
      };
    }).filter((p) => p.maxPoints > 0);
  }, [scorecard]);

  const goToScorecard = () => {
    localStorage.setItem("okiru-pro-active-client", companyId);
    navigate("/toolkit/scorecard");
  };

  const sector = client.sectorCode || client.industry || "—";
  const displayLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6" data-testid="workbook-score-summary">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[24px] font-bold text-white tracking-tight">Scorecard Summary</h2>
          <p className="text-[#8e8e93] text-[14px] mt-1">
            High-level results for{" "}
            <span className="text-white font-medium">{companyName}</span>
          </p>
          <p className="text-[13px] text-[#636366] mt-1">
            {sector}
            {client.scorecardType ? ` · ${client.scorecardType}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={goToScorecard}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-[#e5e5ea] text-black rounded-xl font-semibold text-[13px] transition-colors shrink-0 disabled:opacity-60"
          data-testid="button-continue-scorecard"
        >
          <ScanLine className="w-4 h-4" />
          View Scorecard
        </button>
      </div>

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

          <div className="flex justify-end gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => navigate(`/create-scorecard/${encodeURIComponent(companyId)}`)}
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
        </>
      )}
    </div>
  );
}
