import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Building2, ChevronRight, Download, Leaf, Loader2 } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { EsgValidationPanel } from "@/components/esg/EsgValidationPanel";
import { EsgSectionEditor } from "../../EsgToolkit/src/components/EsgSectionEditor";
import { useEsgStore } from "../../EsgToolkit/src/lib/esgStore";
import { API_BASE } from "@toolkit/lib/config";
import { esgSummaryHref, setEsgActiveCompany } from "@/lib/esgRoutes";
import { ESG_INPUT_SECTIONS } from "@/lib/esgSections";
import { buildSgConsumerGoldenWorkbook } from "../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import "@/styles/esg-glass.css";

const DEFAULT_SECTION = ESG_INPUT_SECTIONS[0]?.id ?? "assumptions";

function sectionFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("section");
  return q && ESG_INPUT_SECTIONS.some((s) => s.id === q) ? q : null;
}

export default function EsgInformationRequest() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId ?? "";
  const [, navigate] = useLocation();
  const load = useEsgStore((s) => s.load);
  const setCompanyName = useEsgStore((s) => s.setCompanyName);
  const companyName = useEsgStore((s) => s.companyName);
  const workbook = useEsgStore((s) => s.workbook);
  const loading = useEsgStore((s) => s.loading);
  const saving = useEsgStore((s) => s.saving);
  const updateSectionCells = useEsgStore((s) => s.updateSectionCells);
  const submittedAt = useEsgStore((s) => s.submittedAt);

  const [activeSectionId, setActiveSectionId] = useState(DEFAULT_SECTION);

  useEffect(() => {
    if (!companyId) {
      navigate("/esg/clients", { replace: true });
      return;
    }
    setEsgActiveCompany(companyId);
    const fromQuery = sectionFromQuery();
    if (fromQuery) setActiveSectionId(fromQuery);

    let cancelled = false;
    (async () => {
      let name = "";
      try {
        const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(companyId)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          name = data.name || "";
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        await load(companyId, name);
        if (name) setCompanyName(name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, load, navigate, setCompanyName]);

  const activeSection = useMemo(
    () => ESG_INPUT_SECTIONS.find((s) => s.id === activeSectionId) ?? ESG_INPUT_SECTIONS[0],
    [activeSectionId],
  );

  const cellCount = useCallback(
    (sectionId: string) => Object.keys(workbook?.sections?.[sectionId]?.cells ?? {}).length,
    [workbook],
  );

  const sectionStatus = (sectionId: string) => (cellCount(sectionId) > 0 ? "filled" : "empty");

  const loadGoldenDemo = async () => {
    const golden = buildSgConsumerGoldenWorkbook();
    golden.companyId = companyId;
    for (const [sectionId, { cells }] of Object.entries(golden.sections)) {
      await updateSectionCells(sectionId, cells);
    }
    await load(companyId, companyName);
  };

  const goSummary = () => navigate(esgSummaryHref(companyId));

  if (!companyId) return null;

  return (
    <div className="esg-theme min-h-screen flex flex-col bg-[#080e14]">
      <header className="h-14 shrink-0 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.85)] backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <AppNavBack href="/esg/clients" eyebrow="ESG" label="Companies" variant="dark" size="compact" />
          <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg hidden sm:block" />
          <span className="text-[15px] font-semibold text-[var(--esg-text)] truncate flex items-center gap-2">
            <Leaf className="h-4 w-4 text-[var(--esg-acc-e)] shrink-0" />
            ESG Workbook
          </span>
        </div>
        <UserAccountMenu variant="hub" />
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6" data-testid="esg-information-request">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="h-4 w-4 text-[var(--esg-text3)] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold text-[var(--esg-text)] truncate">
                {loading && !companyName ? "Loading…" : companyName || "Company"}
              </h1>
              <p className="text-[12px] text-[var(--esg-text3)] font-mono truncate">{companyId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {saving ? (
              <span className="text-[11px] text-[var(--esg-text3)] flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void loadGoldenDemo()}
              disabled={Boolean(submittedAt) || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
              data-testid="button-esg-load-demo"
            >
              Load demo data
            </button>
            <a
              href={`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/export`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
              data-testid="button-esg-export"
            >
              <Download className="h-3.5 w-3.5" /> Export XLSX
            </a>
            <button
              type="button"
              onClick={goSummary}
              disabled={loading || !workbook}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px] disabled:opacity-50"
              data-testid="button-esg-continue-summary"
            >
              Continue to Summary
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="text-[13px] text-[var(--esg-text2)] mb-6 -mt-2">
          Complete each section — scores update as you save. Open the toolkit from Summary when ready.
        </p>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="lg:hidden w-full space-y-3">
            <EsgValidationPanel workbook={workbook} />
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="flex gap-1.5 min-w-max pb-1" data-testid="esg-workbook-mobile-tabs">
                {ESG_INPUT_SECTIONS.map((section) => {
                  const active = activeSectionId === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSectionId(section.id)}
                      className={`shrink-0 px-3 py-2 rounded-lg text-[12px] whitespace-nowrap ${
                        active
                          ? "bg-white/[0.08] text-[var(--esg-text)]"
                          : "text-[var(--esg-text2)] hover:bg-white/[0.04]"
                      }`}
                      data-testid={`tab-${section.id}`}
                    >
                      {section.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="hidden lg:block w-full lg:w-64 shrink-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto space-y-3">
            <EsgValidationPanel workbook={workbook} />
            <div className="rounded-xl border border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.5)] p-2" data-testid="esg-workbook-tabs">
              {ESG_INPUT_SECTIONS.map((section) => {
                const active = activeSectionId === section.id;
                const status = sectionStatus(section.id);
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSectionId(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between ${
                      active
                        ? "bg-white/[0.08] text-[var(--esg-text)]"
                        : "text-[var(--esg-text2)] hover:bg-white/[0.04] hover:text-[var(--esg-text)]"
                    }`}
                    data-testid={`tab-${section.id}`}
                  >
                    <span className="truncate">{section.title}</span>
                    <span
                      className={`text-[10px] tabular-nums ${
                        status === "filled" ? "text-[var(--esg-acc-e)]" : "text-[var(--esg-text3)]"
                      }`}
                    >
                      {status === "filled" ? cellCount(section.id) : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section
            className="flex-1 min-w-0"
            data-testid={`section-panel-${activeSection?.id ?? "unknown"}`}
          >
            {loading ? (
              <div className="esg-glass p-12 flex items-center justify-center gap-2 text-[var(--esg-text2)] text-[13px]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workbook…
              </div>
            ) : activeSection ? (
              <div className="esg-glass p-5 sm:p-6">
                <EsgSectionEditor sectionId={activeSection.id} title={activeSection.title} />
                {submittedAt ? (
                  <p className="mt-4 text-[12px] text-[var(--esg-acc-s)]">
                    Workbook submitted — inputs are locked. Unlock via admin if needed.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
