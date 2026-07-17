/**
 * Document-upload start for /create-scorecard — the flagship entry.
 *
 * Three acts:
 *  1. The stage — an inviting drop surface + the expected-documents checklist.
 *  2. Scanning theatre — files slide in, a shimmer sweeps while the parser
 *     reads, then each file is stamped with its classification.
 *  3. The reveal — the pillar rack lights up, stat tiles count up, and the
 *     scorecard is created from the extracted values.
 *
 * Data flow is unchanged: okiru-ai-parser (/api/parser/resolve-case-files) →
 * mapParserCaseToWorkbookSections → the SAME create → workbook import → submit
 * path manual entry and Excel import use (one canonical calculator).
 *
 * Status visuals follow the dataviz rules: state = icon + label, never color
 * alone; numbers/labels wear ink tokens, colored marks carry the state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CloudUpload,
  FileText,
  Loader2,
  Minus,
  Sparkles,
  X,
} from "lucide-react";
import {
  mapParserCaseToWorkbookSections,
  type ParserCaseLike,
  type ParserWorkbookMapResult,
} from "@/lib/parserWorkbookMap";
import { assessDocuments, type VerdictReport } from "@/lib/documentVerdicts";

interface RequiredGroup {
  key: string;
  label: string;
  types: string[];
  pillar?: string;
  required?: boolean;
  autoExtract?: boolean;
  note?: string;
}

interface SectorOption {
  code: string;
  label: string;
  subSectors?: Array<{ value: string; label: string }>;
}

interface ExpectedDocsCatalog {
  document_types: Array<{ name: string; description: string; required: boolean; pillar_code: string }>;
  required_groups: RequiredGroup[];
  sector_options?: SectorOption[];
}

/** workbook company-information meta value for each parser sector code. */
const SECTOR_TO_WORKBOOK: Record<string, string> = {
  Generic: "Generic",
  CONSTRUCTION: "CONSTRUCTION",
  FSC: "FSC",
  TRANSPORT: "TRANSPORT",
  ICT: "ICT",
  AGRI: "AGRI",
};

const CANONICAL_PILLARS: Record<string, string> = {
  ESD: "Enterprise & Supplier Development",
  OWN: "Ownership",
  MAC: "Management Control",
  SKL: "Skills Development",
  SED: "Socio-Economic Development",
};

/** Pillar rack tiles — coverage pillar name → short label. */
const PILLAR_TILES: Array<{ pillar: string; short: string }> = [
  { pillar: "Ownership", short: "Ownership" },
  { pillar: "Management Control", short: "Management" },
  { pillar: "Skills Development", short: "Skills" },
  { pillar: "Preferential Procurement", short: "Procurement" },
  { pillar: "Socio-Economic Development", short: "SED" },
  { pillar: "Financials", short: "Financials" },
];

/** rAF count-up for hero numbers. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export interface DocumentUploadStartProps {
  /**
   * Create the client + import the mapped sections + land on the provisional
   * score page. `verdicts` rides along so that page can show the honest
   * per-document ledger (found / confused / none) the requote is argued from.
   */
  onCreate: (
    companyName: string,
    sections: Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }>,
    extras?: { verdicts?: VerdictReport },
  ) => Promise<void>;
  creating: boolean;
}

export function DocumentUploadStart({ onCreate, creating }: DocumentUploadStartProps) {
  const [catalog, setCatalog] = useState<ExpectedDocsCatalog | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parserCase, setParserCase] = useState<ParserCaseLike | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sector, setSector] = useState("Generic");
  const [subSector, setSubSector] = useState("");
  const [size, setSize] = useState("Generic"); // Generic | QSE | EME
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-fetch the expected-documents checklist whenever the sector context
  // changes — the required documents differ by sector code and entity size.
  useEffect(() => {
    void (async () => {
      try {
        const params = new URLSearchParams({ sector, size });
        if (subSector) params.set("subSector", subSector);
        const res = await fetch(`/api/parser/document-types?${params.toString()}`, { credentials: "include" });
        if (res.ok) setCatalog(await res.json());
      } catch {
        // checklist is progressive enhancement — uploads still work without it
      }
    })();
  }, [sector, subSector, size]);

  const sectorOptions = catalog?.sector_options ?? [];
  const activeSector = sectorOptions.find((s) => s.code === sector);

  const mapped: ParserWorkbookMapResult | null = useMemo(
    () => (parserCase ? mapParserCaseToWorkbookSections(parserCase) : null),
    [parserCase],
  );

  const docTypeSatisfied = (typeName: string): boolean =>
    Boolean(
      (parserCase?.documents_detected ?? []).some(
        (d) => d.document_type === typeName && d.status !== "failed",
      ),
    );

  const humanizeField = (f: string): string =>
    f.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

  /**
   * Content the parser could NOT read inside a specific uploaded document, split
   * into `fields` (named data points it expected but couldn't extract) and
   * `notes` (validation messages, e.g. low confidence). Surfaced during the flow
   * so the user knows exactly what to complete rather than finding gaps later.
   */
  const docMissingContent = (filename: string): { fields: string[]; notes: string[] } => {
    const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === filename);
    const review = (parserCase?.documents_needing_review ?? []).find((r) => r.filename === filename);
    const fields = new Set<string>();
    const notes = new Set<string>();
    for (const f of detected?.validation?.missing_fields ?? []) fields.add(humanizeField(f));
    const rawNotes = [
      ...(detected?.validation?.errors ?? []),
      ...(detected?.validation?.warnings ?? []),
      ...(review?.reasons ?? []),
    ];
    for (const n of rawNotes) {
      const trimmed = (n ?? "").trim();
      if (!trimmed) continue;
      const m = /^(.*)\smissing$/i.exec(trimmed);
      if (m) fields.add(humanizeField(m[1]));
      else notes.add(trimmed);
    }
    return { fields: Array.from(fields), notes: Array.from(notes) };
  };

  const parseFiles = async (list: File[]) => {
    if (list.length === 0) return;
    setParsing(true);
    setParseError(null);
    try {
      const form = new FormData();
      for (const f of list.slice(0, 25)) form.append("files", f, f.name);
      form.append("case_id", `create_scorecard_${Date.now()}`);
      const res = await fetch("/api/parser/resolve-case-files", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok && res.status !== 422) throw new Error(`Parser returned ${res.status}`);
      const data = (await res.json()) as ParserCaseLike & { calculator_payload?: Record<string, unknown> };
      setParserCase(data);
      const entity = String(data.calculator_payload?.["ownership.entity_name"] ?? "").trim();
      if (entity) setCompanyName((prev) => prev || entity);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not analyse the documents");
      setParserCase(null);
    } finally {
      setParsing(false);
    }
  };

  const addFiles = (incoming: File[]) => {
    const next = [...files];
    for (const f of incoming) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    void parseFiles(next);
  };

  const removeFile = (name: string) => {
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    if (next.length === 0) setParserCase(null);
    else void parseFiles(next);
  };

  const groupSatisfied = (g: { types: string[] }) => g.types.some((t) => docTypeSatisfied(t));

  // Reveal stats
  const supplierCount = parserCase?.supplier_rows?.length ?? 0;
  const spendCaptured = (parserCase?.supplier_rows ?? []).reduce(
    (s, r) => s + (Number(String(r.spend_amount ?? 0).replace(/[^0-9.]/g, "")) || 0),
    0,
  );
  const valuesUp = useCountUp(mapped?.mappedRowCount ?? 0);
  const suppliersUp = useCountUp(supplierCount);
  const spendUp = useCountUp(spendCaptured, 1100);

  const revealed = Boolean(mapped && !parsing && files.length > 0);
  // Missing documents never block: the user can always proceed and the workbook
  // scores on whatever was extracted (even nothing — they complete it manually).
  const canCreate = Boolean(companyName.trim()) && !parsing && !creating;

  // Create the scorecard, stamping the chosen sector into company-information
  // meta so the workbook scores under the correct sector calculator (Generic /
  // Construction / FSC / Transport …) rather than always defaulting to Generic.
  const handleCreate = () => {
    if (!mapped) return;
    const sections: Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }> = { ...mapped.sections };
    const companyMeta: Record<string, unknown> = {
      companyName: companyName.trim(),
      industrySector: SECTOR_TO_WORKBOOK[sector] ?? "Generic",
      scorecardType: size,
    };
    if (sector === "CONSTRUCTION" && subSector) companyMeta.constructionSubSector = subSector;
    if (sector === "FSC" && subSector) companyMeta.fscSubSector = subSector;
    sections["company-information"] = {
      ...(sections["company-information"] ?? {}),
      meta: { ...(sections["company-information"]?.meta ?? {}), ...companyMeta },
    };
    // Carry the per-document verdicts to the provisional score page.
    const verdicts = parserCase ? assessDocuments(parserCase) : undefined;
    void onCreate(companyName.trim(), sections, { verdicts });
  };

  const coverageByPillar = useMemo(
    () => Object.fromEntries((mapped?.coverage ?? []).map((c) => [c.pillar, c])),
    [mapped],
  );

  return (
    <div data-testid="document-upload-start">
      {/* Scoped animation keyframes */}
      <style>{`
        @keyframes dusFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dusShimmer { from { transform: translateX(-100%); } to { transform: translateX(220%); } }
        @keyframes dusPulseRing { 0% { box-shadow: 0 0 0 0 rgba(167,139,250,0.28); } 70% { box-shadow: 0 0 0 14px rgba(167,139,250,0); } 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); } }
        @keyframes dusStamp { 0% { opacity: 0; transform: scale(0.85); } 60% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
        .dus-fade-up { animation: dusFadeUp 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .dus-stamp { animation: dusStamp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>

      {/* Sector selector — drives the sector-aware document checklist and the
          scorecard's calculator. B-BBEE evidence differs by sector + size. */}
      {sectorOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="sector-selector">
          <span className="text-[11px] text-[#8e8e93] uppercase tracking-wider">Sector</span>
          <select
            value={sector}
            onChange={(e) => { setSector(e.target.value); setSubSector(""); }}
            className="bg-[#0e0e10] border border-[#2c2c2e] rounded-lg px-2.5 py-1.5 text-[13px] text-[#e5e5ea] outline-none focus:border-violet-500/50"
            data-testid="sector-select"
          >
            {sectorOptions.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
          {activeSector?.subSectors && (
            <select
              value={subSector}
              onChange={(e) => setSubSector(e.target.value)}
              className="bg-[#0e0e10] border border-[#2c2c2e] rounded-lg px-2.5 py-1.5 text-[13px] text-[#e5e5ea] outline-none focus:border-violet-500/50"
              data-testid="subsector-select"
            >
              <option value="">Select…</option>
              {activeSector.subSectors.map((ss) => (
                <option key={ss.value} value={ss.value}>{ss.label}</option>
              ))}
            </select>
          )}
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="bg-[#0e0e10] border border-[#2c2c2e] rounded-lg px-2.5 py-1.5 text-[13px] text-[#e5e5ea] outline-none focus:border-violet-500/50"
            data-testid="size-select"
            title="Entity size by turnover"
          >
            <option value="Generic">Large (Generic)</option>
            <option value="QSE">QSE (R10m–R50m)</option>
            <option value="EME">EME (&lt; R10m)</option>
          </select>
        </div>
      )}

      {/* ACT 1 — the stage */}
      <div
        className="relative rounded-2xl text-center cursor-pointer transition-all duration-300 overflow-hidden"
        style={{
          background: dragActive
            ? "radial-gradient(120% 140% at 50% 0%, rgba(167,139,250,0.14), rgba(14,14,16,0.9) 60%)"
            : "radial-gradient(120% 140% at 50% 0%, rgba(167,139,250,0.07), #0e0e10 62%)",
          border: `1px dashed ${dragActive ? "#a78bfa" : "#3a3a3c"}`,
          padding: files.length > 0 ? "18px 20px" : "40px 24px 34px",
          transform: dragActive ? "scale(1.008)" : "scale(1)",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
        }}
        data-testid="docs-drop-zone"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.txt,.csv,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(Array.from(e.target.files));
            e.currentTarget.value = "";
          }}
          data-testid="docs-file-input"
        />

        {files.length === 0 ? (
          <>
            <div
              className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-transform duration-300"
              style={{
                background: "linear-gradient(140deg, rgba(167,139,250,0.16), rgba(167,139,250,0.05))",
                border: "1px solid rgba(167,139,250,0.3)",
                animation: "dusPulseRing 2.6s ease-out infinite",
                transform: dragActive ? "scale(1.1)" : "scale(1)",
              }}
            >
              <CloudUpload className="w-6 h-6 text-violet-300" />
            </div>
            <h3
              className="text-[19px] text-white mb-1"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
            >
              Drop your B-BBEE evidence
            </h3>
            <p className="text-[13px] text-[#8e8e93] mb-4 max-w-md mx-auto">
              Certificates, affidavits, spend schedules, EE reports — PDF, Word, Excel or scans.
              We read them, extract the real values, and build your scorecard.
            </p>
            <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-md mx-auto">
              {["PDF", "DOCX", "XLSX", "CSV", "SCANS"].map((ext) => (
                <span key={ext} className="px-2 py-0.5 rounded text-[10px] tracking-wide text-[#636366]" style={{ background: "#1c1c1e" }}>
                  {ext}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-[#8e8e93] hover:text-violet-300 transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[13px] font-medium">Add more documents</span>
          </div>
        )}
      </div>

      {/* Expected documents — sector-aware checklist (below the stage) */}
      {catalog && files.length === 0 && (
        <div className="mt-3 px-1">
          <p className="text-[11px] text-[#636366] text-center mb-2">
            Documents for <span className="text-[#8e8e93]">{activeSector?.label ?? sector}</span>
            {size !== "Generic" ? ` · ${size}` : ""} — <span className="text-emerald-400/70">◆ we auto-extract</span>,{" "}
            <span className="text-[#8e8e93]">◇ attach for your verifier</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {catalog.required_groups.map((g) => (
              <div
                key={g.key}
                className="flex items-center gap-1.5 text-[12px] text-[#8e8e93]"
                data-testid={`docslot-${g.key}`}
                title={g.note ?? ""}
              >
                <span className={g.autoExtract ? "text-emerald-400/80 text-[9px]" : "text-[#48484a] text-[9px]"}>
                  {g.autoExtract ? "◆" : "◇"}
                </span>
                <span className="truncate">{g.label}</span>
                {g.required !== false && <span className="text-[10px] text-red-400/70 font-semibold -ml-0.5">*</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACT 2 — scanning theatre */}
      {files.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {files.map((f, i) => {
            const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === f.name);
            const missing = parsing ? { fields: [], notes: [] } : docMissingContent(f.name);
            const hasGaps = missing.fields.length > 0 || missing.notes.length > 0;
            return (
              <div
                key={f.name}
                className="dus-fade-up relative overflow-hidden rounded-xl px-3.5 py-2.5"
                style={{ background: "#111113", border: "1px solid #1f1f21", animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-center gap-3">
                  {/* shimmer sweep while parsing */}
                  {parsing && (
                    <div className="absolute inset-y-0 left-0 w-1/3 pointer-events-none" style={{
                      background: "linear-gradient(100deg, transparent, rgba(167,139,250,0.09), transparent)",
                      animation: "dusShimmer 1.4s ease-in-out infinite",
                    }} />
                  )}
                  <FileText className="w-4 h-4 text-[#636366] shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] text-[#e5e5ea] truncate font-medium">{f.name}</div>
                    <div className="text-[11px] mt-0.5">
                      {parsing ? (
                        <span className="text-[#636366] inline-flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Reading document…
                        </span>
                      ) : detected ? (
                        <span className="dus-stamp inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${detected.status === "passed" ? "bg-emerald-400" : detected.status === "review_required" ? "bg-amber-400" : "bg-red-400"}`} />
                          <span className="text-[#a1a1a6]">{detected.document_type}</span>
                          {detected.status === "passed" && !hasGaps && (
                            <span className="text-emerald-400/70">· all read</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#636366]">Unrecognised — will be skipped</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                    className="p-1 text-[#48484a] hover:text-[#8e8e93] shrink-0 transition-colors self-start"
                    data-testid={`remove-${f.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Missing content WITHIN this document — flagged during the flow
                    so the user knows exactly what to complete in the workbook. */}
                {hasGaps && (
                  <div
                    className="mt-2 ml-7 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5"
                    style={{ background: "rgba(255,214,10,0.05)", border: "1px solid rgba(255,214,10,0.15)" }}
                    data-testid={`missing-content-${f.name}`}
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-amber-200/80 leading-relaxed">
                      {missing.fields.length > 0 && (
                        <>Couldn&apos;t read {missing.fields.slice(0, 4).join(", ")}
                          {missing.fields.length > 4 ? ` +${missing.fields.length - 4} more` : ""}. </>
                      )}
                      {missing.notes.length > 0 && <>{missing.notes.slice(0, 2).join("; ")}. </>}
                      You can still continue and fill the gaps in the workbook.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {parseError && <p className="text-[12px] text-red-400 mt-3">{parseError}</p>}

      {/* Missing required docs nudge — only for docs the parser can detect
          (auto-extractable). Evidence-only docs are guidance, not detectable. */}
      {(() => {
        if (!revealed || !catalog) return null;
        const detectableMissing = catalog.required_groups.filter(
          (g) => g.required !== false && g.autoExtract && !groupSatisfied(g),
        );
        const evidenceOnly = catalog.required_groups.filter((g) => g.required !== false && !g.autoExtract);
        if (detectableMissing.length === 0 && evidenceOnly.length === 0) return null;
        return (
          <div className="dus-fade-up mt-3 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5" style={{ background: "rgba(255,214,10,0.05)", border: "1px solid rgba(255,214,10,0.18)" }}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-200/80 text-left">
              {detectableMissing.length > 0 && (
                <>Still missing: {detectableMissing.map((g) => g.label).join("; ")}. </>
              )}
              {evidenceOnly.length > 0 && (
                <>Have ready for your verifier: {evidenceOnly.map((g) => g.label).join("; ")}. </>
              )}
              You can add these now or in the workbook.
            </p>
          </div>
        );
      })()}

      {/* ACT 3 — the reveal */}
      {revealed && mapped && (
        <div className="mt-4">
          {/* Pillar rack — status tiles light up */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3" data-testid="coverage-preview">
            {PILLAR_TILES.map((tile, i) => {
              const c = coverageByPillar[tile.pillar];
              const status = c?.status ?? "no-document";
              const lit = status === "mapped";
              const partial = status === "needs-detail";
              return (
                <div
                  key={tile.pillar}
                  className="dus-fade-up rounded-lg px-2 py-2 text-center transition-all duration-500"
                  style={{
                    animationDelay: `${120 + i * 90}ms`,
                    background: lit ? "rgba(48,209,88,0.07)" : partial ? "rgba(255,214,10,0.05)" : "#111113",
                    border: `1px solid ${lit ? "rgba(48,209,88,0.35)" : partial ? "rgba(255,214,10,0.25)" : "#1f1f21"}`,
                  }}
                  title={c ? `${tile.pillar}: ${c.detail}${c.extractedValue ? ` (extracted: ${c.extractedValue})` : ""}` : tile.pillar}
                >
                  <div className="flex items-center justify-center mb-1">
                    {lit ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : partial ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-[#3a3a3c]" />
                    )}
                  </div>
                  <div className={`text-[10px] font-medium leading-tight ${lit ? "text-emerald-200/90" : partial ? "text-amber-200/80" : "text-[#636366]"}`}>
                    {tile.short}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stat tiles — hero numbers count up */}
          <div className="dus-fade-up grid grid-cols-3 gap-1.5 mb-4" style={{ animationDelay: "620ms" }}>
            <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: "#111113", border: "1px solid #1f1f21" }}>
              <div className="text-[22px] font-semibold text-white leading-none tabular-nums" data-testid="stat-values">{valuesUp}</div>
              <div className="text-[10px] text-[#636366] mt-1 uppercase tracking-wider">Values extracted</div>
            </div>
            <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: "#111113", border: "1px solid #1f1f21" }}>
              <div className="text-[22px] font-semibold text-white leading-none tabular-nums">{suppliersUp}</div>
              <div className="text-[10px] text-[#636366] mt-1 uppercase tracking-wider">Suppliers found</div>
            </div>
            <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: "#111113", border: "1px solid #1f1f21" }}>
              <div className="text-[22px] font-semibold text-white leading-none tabular-nums">
                {spendUp >= 1_000_000 ? `R${(spendUp / 1_000_000).toFixed(1)}M` : spendUp >= 1_000 ? `R${Math.round(spendUp / 1_000)}k` : `R${spendUp}`}
              </div>
              <div className="text-[10px] text-[#636366] mt-1 uppercase tracking-wider">Spend captured</div>
            </div>
          </div>

          {/* Detail lines for the amber tiles (extracted-but-needs-detail) */}
          {mapped.coverage.some((c) => c.status === "needs-detail" && c.extractedValue) && (
            <div className="dus-fade-up mb-4 space-y-1" style={{ animationDelay: "700ms" }}>
              {mapped.coverage
                .filter((c) => c.status === "needs-detail" && c.extractedValue)
                .map((c) => (
                  <p key={c.pillar} className="text-[11px] text-[#8e8e93] text-left">
                    <span className="text-amber-300/80">{c.pillar}:</span> we extracted {c.extractedValue} — it needs
                    per-person rows in the workbook to score.
                  </p>
                ))}
            </div>
          )}

          {/* Company name + create — always available once documents are
              processed, even with partial or zero extraction. Missing docs or
              missing content never block: the workbook scores on what we have. */}
          <div className="dus-fade-up" style={{ animationDelay: "760ms" }}>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name — e.g. Acme Holdings (Pty) Ltd"
              className="w-full bg-[#0e0e10] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-[15px] text-white placeholder-[#48484a] outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 mb-2.5 transition-colors"
              data-testid="docs-company-name"
            />
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold transition-all duration-200 disabled:opacity-40"
              style={{
                background: canCreate ? "linear-gradient(135deg, #ffffff, #e7e2ff)" : "#1c1c1e",
                color: canCreate ? "#000" : "#636366",
                boxShadow: canCreate ? "0 0 24px rgba(167,139,250,0.15)" : "none",
              }}
              data-testid="button-create-from-documents"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mapped.mappedRowCount > 0 ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Build my scorecard from {mapped.mappedRowCount} extracted value{mapped.mappedRowCount !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Continue to workbook &amp; complete it there
                </>
              )}
            </button>
            <p className="text-[11px] text-[#48484a] mt-2 text-center">
              {mapped.mappedRowCount > 0
                ? "You’ll land in a pre-filled workbook — review, complete anything missing, and the score computes the same way as manual entry."
                : "We couldn’t extract scorable values yet — you’ll land in the workbook to fill them in. You can also add more documents above."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
