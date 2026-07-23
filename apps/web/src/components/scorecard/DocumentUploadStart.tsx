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
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  FolderOpen,
  ArrowRight,
  Check,
  CloudUpload,
  CreditCard,
  FileText,
  Loader2,
  Minus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  mapParserCaseToWorkbookSections,
  type ParserCaseLike,
  type ParserWorkbookMapResult,
} from "@/lib/parserWorkbookMap";
import { parserExtractionsToWorkbook, toWorkbookSections } from "@/lib/parserToWorkbook";
import RequiredDocumentsChecklist from "./RequiredDocumentsChecklist";
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

/** The free, structure-only price scan (POST /api/parser/quote-files). */
interface ParserQuote {
  quoteId: string;
  currency: string;
  model: string;
  files: Array<{
    filename: string;
    detectedDocumentType: string;
    kind: string;
    requiresOcr: boolean;
    tokens: { basis: string; input: number; band: { lowerTokens: number; upperTokens: number } | null };
    structure: { pages: number | null; sheets: number | null; rows: number | null };
    pricing: { extractionCents: number; isUpperBound: boolean };
    reasons: string[];
  }>;
  lineItems: Array<{ key: string; label: string; detail: string; cents: number }>;
  totals: {
    predictedInputTokens: number;
    predictedOutputTokens: number;
    azureCents: number;
    totalCents: number;
    isUpperBound: boolean;
  };
  azureBreakdown: {
    model: string;
    inputTokens: number;
    inputCents: number;
    outputTokens: number;
    outputCents: number;
    ocrPages: number;
    ocrCents: number;
  };
  expiresAt: string;
  notes: string[];
  /**
   * Whether the server will actually charge for this run. When the payment
   * gate is off (no provider wired), we show the cost as information and let
   * the user carry on rather than offering a checkout that cannot settle.
   */
  paymentRequired?: boolean;
}

/** Rands, shown to 2dp unless the amount is genuinely sub-cent. */
function money(cents: number, currency = "ZAR"): string {
  const symbol = currency === "ZAR" ? "R" : `${currency} `;
  if (cents > 0 && cents < 1) return `${symbol}${(cents / 100).toFixed(4)}`;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/**
 * Fold a newly-read case into what we already had.
 *
 * A requote only ever pays for NEW documents, so the previously-extracted ones
 * must survive: their detections, fields, supplier rows and calculator payload
 * all carry forward. The new round wins on conflicts (it is the more recent
 * read of that filename), but it can never delete an earlier good document.
 */
function mergeCases(kept: ParserCaseLike | null, fresh: ParserCaseLike): ParserCaseLike {
  if (!kept) return fresh;
  const byName = <T extends { filename?: string }>(a: T[] = [], b: T[] = []): T[] => {
    const out = new Map<string, T>();
    for (const item of a) out.set(String(item.filename), item);
    for (const item of b) out.set(String(item.filename), item);
    return Array.from(out.values());
  };
  return {
    ...kept,
    ...fresh,
    documents_detected: byName(kept.documents_detected, fresh.documents_detected),
    documents_needing_review: byName(kept.documents_needing_review, fresh.documents_needing_review),
    fields_extracted: { ...(kept.fields_extracted ?? {}), ...(fresh.fields_extracted ?? {}) },
    calculator_payload: { ...(kept.calculator_payload ?? {}), ...(fresh.calculator_payload ?? {}) },
    supplier_rows: [
      // Keep earlier suppliers, drop any whose source file was re-read.
      ...(kept.supplier_rows ?? []).filter(
        (r) => !(fresh.documents_detected ?? []).some((d) => d.filename === r.source_file),
      ),
      ...(fresh.supplier_rows ?? []),
    ],
  };
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
  const [setupStep, setSetupStep] = useState<"profile" | "upload">("profile");
  // Quote + payment (flow steps 3–6). Nothing is read until the quote is paid.
  const [quote, setQuote] = useState<ParserQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  /**
   * Documents already extracted and paid for in a previous round. A requote
   * must never lose or re-charge these — they carry straight through.
   */
  const [keptCase, setKeptCase] = useState<ParserCaseLike | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  /** Files a folder upload could not read — shown as a warning, not an error. */
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
  /** Monotonic id so only the latest quote request writes state (race guard). */
  const quoteSeqRef = useRef(0);
  /** Aborts any in-flight quote when a newer one starts, so requests never pile up. */
  const quoteAbortRef = useRef<AbortController | null>(null);

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

  /**
   * The AI-entity path: full extractions (share registers become many rows,
   * TMPS lands in meta, dropdowns are matched, required gaps hunted). Runs
   * alongside the legacy `mapped` result — the parser returns both shapes during
   * the transition, and this one is preferred where it has data because it
   * carries provenance, rejections and coverage the legacy shape does not.
   */
  const injected = useMemo(() => {
    const extractions = (parserCase as {
      ai_entities?: { extractions?: Array<{ documentId?: string; sourceFile?: string; element?: string; values?: Array<{ field: string; value: unknown }> }> };
    } | null)?.ai_entities?.extractions;
    if (!extractions?.length) return null;

    return parserExtractionsToWorkbook(
      extractions.map((e) => ({
        documentId: String(e.documentId ?? ""),
        sourceFile: String(e.sourceFile ?? ""),
        element: e.element,
        values: e.values ?? [],
      })),
      { sectorCode: sector, scorecardType: size },
    );
  }, [parserCase, sector, size]);

  /**
   * Matrix document ids the parser actually read something out of, so the
   * checklist can show real coverage instead of a static wish list. Only
   * extractions that produced values count — a document we recognised but got
   * nothing from is not evidence.
   */
  const satisfiedDocumentIds = useMemo<string[]>(() => {
    const extractions = (parserCase as { ai_entities?: { extractions?: Array<{ documentId?: string; values?: unknown[] }> } } | null)
      ?.ai_entities?.extractions ?? [];
    return extractions
      .filter((extraction) => (extraction.values?.length ?? 0) > 0)
      .map((extraction) => String(extraction.documentId ?? ""))
      .filter(Boolean);
  }, [parserCase]);

  /** The quote's row for a file — what we know from the free structure scan. */
  const quoted = (filename: string) => quote?.files.find((f) => f.filename === filename);

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

  /**
   * Step 3–5: scan the documents for a PRICE only. This reads structure and
   * text layers locally — it never OCRs, never calls Azure, and never extracts
   * entities. It is free, and it is all we are allowed to do before payment.
   */
  const runQuote = async (list: File[]) => {
    if (list.length === 0) return;
    // Only the most recent quote request is allowed to write state. Without
    // this, two overlapping requests can race and leave `quoting` stuck true
    // (the earlier one resolves last), which hides the payment panel forever.
    const seq = ++quoteSeqRef.current;
    const isLatest = () => quoteSeqRef.current === seq;
    // Cancel any quote still in flight so two rapid uploads can't both run — a
    // stranded second request would leave `quoting` stuck true and hide the
    // payment panel forever.
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;
    setQuoting(true);
    setParseError(null);
    try {
      const form = new FormData();
      for (const f of list.slice(0, 25)) form.append("files", f, f.name);
      const res = await fetch("/api/parser/quote-files", {
        method: "POST",
        credentials: "include",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Could not price these documents (${res.status})`);
      const body = await res.json();
      if (isLatest()) setQuote((body.data ?? body) as ParserQuote);
    } catch (err) {
      // An aborted request is a superseded one, not a failure — stay quiet.
      if ((err as Error)?.name === "AbortError") return;
      if (isLatest()) {
        setParseError(err instanceof Error ? err.message : "Could not price the documents");
        setQuote(null);
      }
    } finally {
      if (isLatest()) setQuoting(false);
    }
  };

  /**
   * Step 7: the paid work. Only runs once the quote is paid, and sends the
   * quote id so the server can verify payment and that these are the exact
   * files that were paid for.
   */
  const runExtraction = async (list: File[], quoteId: string) => {
    setParsing(true);
    setParseError(null);
    try {
      const form = new FormData();
      for (const f of list.slice(0, 25)) form.append("files", f, f.name);
      form.append("case_id", `create_scorecard_${Date.now()}`);
      form.append("quote_id", quoteId);
      const res = await fetch("/api/parser/resolve-case-files", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (res.status === 402 || res.status === 409 || res.status === 410) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "Payment could not be verified for these documents");
      }
      if (!res.ok && res.status !== 422) throw new Error(`Parser returned ${res.status}`);
      const data = (await res.json()) as ParserCaseLike & { calculator_payload?: Record<string, unknown> };
      // Merge with anything already paid for and read in an earlier round, so a
      // requote never loses (or re-charges for) documents we already have.
      setParserCase(mergeCases(keptCase, data));
      const entity = String(data.calculator_payload?.["ownership.entity_name"] ?? "").trim();
      if (entity) setCompanyName((prev) => prev || entity);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read the documents");
    } finally {
      setParsing(false);
    }
  };

  /** Step 6: pay the quote, then read. */
  const payAndExtract = async () => {
    if (!quote) return;
    setPaying(true);
    setParseError(null);
    try {
      const res = await fetch(`/api/parser/quotes/${encodeURIComponent(quote.quoteId)}/checkout`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not start payment");

      const data = body.data ?? body;
      if (data?.simulated) {
        // Local development: no live Yoco keys, so settle the quote server-side
        // and carry on. This route does not exist in production.
        const sim = await fetch(`/api/parser/quotes/${encodeURIComponent(quote.quoteId)}/simulate-payment`, {
          method: "POST",
          credentials: "include",
        });
        if (!sim.ok) throw new Error("Simulated payment failed");
        await runExtraction(files, quote.quoteId);
        return;
      }

      // Live: hand off to Yoco's hosted page. We never touch card details.
      if (data?.redirectUrl) {
        sessionStorage.setItem("okiru-parser-quote", quote.quoteId);
        window.location.href = data.redirectUrl;
        return;
      }
      throw new Error("Payment provider did not return a checkout link");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  /** Extensions the parser can read. Anything else is filtered with a warning. */
  const READABLE = new Set([
    ".pdf", ".docx", ".doc", ".xlsx", ".xlsm", ".xls", ".pptx", ".ppt",
    ".csv", ".txt", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp",
  ]);

  /**
   * Whole-folder upload.
   *
   * A folder carries everything — including desktop.ini, thumbnails and
   * whatever else lives alongside the evidence. Silently dropping those would
   * be dishonest about what we read, and refusing the whole folder over one
   * stray file would be worse. So: take what we can read, say plainly what was
   * skipped, and let the user decide.
   */
  const addFolder = (incoming: File[]) => {
    const readable: File[] = [];
    const skipped: string[] = [];

    for (const file of incoming) {
      const dot = file.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
      // Hidden/system files a folder picker sweeps up.
      if (file.name.startsWith(".") || file.name === "Thumbs.db" || file.name === "desktop.ini") continue;
      if (READABLE.has(ext) && file.size > 0) readable.push(file);
      else skipped.push(file.name);
    }

    setSkippedFiles(skipped);
    if (readable.length > 0) addFiles(readable);
  };

  const addFiles = (incoming: File[]) => {
    const next = [...files];
    for (const f of incoming) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    void runQuote(next);
  };

  const removeFile = (name: string) => {
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    setQuote(null);
    if (next.length === 0) setParserCase(keptCase);
    else void runQuote(next);
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

  const revealed = Boolean((mapped || injected) && !parsing && files.length > 0);

  /** Rows the AI-entity path produced, added to the legacy mapper's count. */
  const injectedRowCount = useMemo(
    () => (injected ? Object.values(injected.rows).reduce((n, r) => n + (r?.length ?? 0), 0) : 0),
    [injected],
  );
  const totalMappedRows = (mapped?.mappedRowCount ?? 0) + injectedRowCount;
  const quoteReady = Boolean(quote && !parserCase && !quoting);
  // Missing documents never block: the user can always proceed and the workbook
  // scores on whatever was extracted (even nothing — they complete it manually).
  const canCreate = Boolean(companyName.trim()) && !parsing && !creating;

  // Create the scorecard, stamping the chosen sector into company-information
  // meta so the workbook scores under the correct sector calculator (Generic /
  // Construction / FSC / Transport …) rather than always defaulting to Generic.
  const handleCreate = () => {
    if (!mapped && !injected) return;
    const sections: Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }> = { ...(mapped?.sections ?? {}) };

    // Merge the AI-entity sections over the legacy ones. Grid rows are ADDITIVE
    // (a share register's rows join the legacy supplier rows, they do not replace
    // them); meta fills gaps the legacy shape left (TMPS, revenue). This is the
    // point where the full extraction chain finally reaches the workbook.
    if (injected) {
      const injectedSections = toWorkbookSections(injected);
      for (const [key, section] of Object.entries(injectedSections)) {
        const existing = sections[key] ?? {};
        sections[key] = {
          rows: [...((existing.rows as unknown[]) ?? []), ...section.rows],
          meta: { ...(section.meta ?? {}), ...(existing.meta ?? {}) },
        };
      }
    }
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

  const sizeOptions = [
    { value: "Generic", label: "Large / Generic", detail: "Annual turnover above R50m" },
    { value: "QSE", label: "QSE", detail: "Annual turnover R10m to R50m" },
    { value: "EME", label: "EME", detail: "Annual turnover below R10m" },
  ];

  if (false && setupStep === "profile") {
    return (
      <div className="mx-auto max-w-md" data-testid="document-profile-step">
        <div className="space-y-6">
          {sectorOptions.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-[#8e8e93]">Sector</p>
              <div className="space-y-2">
                {sectorOptions.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => {
                      setSector(s.code);
                      setSubSector("");
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                      sector === s.code
                        ? "border-white/[0.18] bg-white/[0.06]"
                        : "border-white/[0.08] bg-[#1c1c1e] hover:bg-[#222225]"
                    }`}
                    data-testid={`sector-option-${s.code}`}
                  >
                    <span className="text-[14px] font-medium text-white">{s.label}</span>
                    {sector === s.code && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSector?.subSectors && (
            <div>
              <label className="mb-2 block text-[12px] font-medium text-[#8e8e93]">Sub-sector</label>
              <select
                value={subSector}
                onChange={(e) => setSubSector(e.target.value)}
                className="h-12 w-full rounded-2xl border border-white/[0.10] bg-[#0e0e10] px-4 text-[14px] text-white outline-none focus:border-white/30 focus:ring-4 focus:ring-white/[0.06]"
                data-testid="subsector-select"
              >
                <option value="">Select</option>
                {activeSector?.subSectors?.map((ss) => (
                  <option key={ss.value} value={ss.value}>{ss.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="mb-2 text-[12px] font-medium text-[#8e8e93]">Organisation size</p>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0e0e10] p-1">
              {sizeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSize(option.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                    size === option.value ? "bg-[#1c1c1e] shadow-sm" : "hover:bg-white/[0.04]"
                  }`}
                  data-testid={`size-option-${option.value}`}
                >
                  <span>
                    <span className="block text-[14px] font-semibold text-white">{option.label}</span>
                    <span className="block text-[12px] text-[#8e8e93]">{option.detail}</span>
                  </span>
                  {size === option.value && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSetupStep("upload")}
            className="h-12 w-full rounded-full bg-white text-[15px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

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

      <div className="mb-5 text-center">
        <h3
          className="text-[34px] font-semibold leading-[1.05] tracking-tight text-white"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
        >
          {quote && !parserCase
            ? quote.paymentRequired === false
              ? "Review your documents"
              : "Review and pay"
            : "Add your documents"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-[#a1a1a6]">
          {quote && !parserCase
            ? "This is what it costs to process your documents. Nothing is read until you pay."
            : "Upload what you have. We will identify what is present, missing or needs review."}
        </p>
      </div>

      {/* Sector selector — drives the sector-aware document checklist and the
          scorecard's calculator. B-BBEE evidence differs by sector + size. */}
      {false && sectorOptions.length > 0 && (
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
              {activeSector?.subSectors?.map((ss) => (
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
      <motion.div
        layout
        className={quoteReady ? "grid gap-5" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"}
      >
        {!quoteReady && (
        <motion.aside layout className="rounded-[18px] border border-white/[0.07] bg-[#0e0e10] p-4 lg:order-2 lg:self-start">
          <AnimatePresence initial={false}>
          {quote && !parserCase && (
            <motion.div
              key="quoted-documents"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="mb-5 overflow-hidden border-b border-white/[0.06] pb-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#636366]">Documents</p>
                  <p className="mt-1 text-[13px] text-[#d1d1d6]">
                    {files.length} file{files.length === 1 ? "" : "s"} ready
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
                >
                  Change
                </button>
              </div>
              <div className="mt-3 max-h-44 space-y-1 overflow-auto pr-1">
                {files.map((file) => {
                  const quotedFile = quoted(file.name);
                  return (
                    <div key={file.name} className="flex items-center gap-2 rounded-xl bg-white/[0.035] px-2.5 py-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#636366]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-[#e5e5ea]">{file.name}</p>
                        <p className="mt-0.5 text-[10.5px] text-[#636366]">
                          {quotedFile?.requiresOcr ? "Scan" : quotedFile ? "Digital" : "Waiting"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(file.name)}
                        className="rounded-full p-1 text-[#48484a] transition-colors hover:bg-white/[0.06] hover:text-[#d1d1d6]"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
          </AnimatePresence>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#636366]">Company profile</p>
          <div className="mt-4 space-y-5">
            {sectorOptions.length > 0 && (
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[#8e8e93]">Sector</label>
                <select
                  value={sector}
                  onChange={(e) => {
                    setSector(e.target.value);
                    setSubSector("");
                  }}
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#141416] px-3 text-[13px] text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/[0.05]"
                  data-testid="sector-select-side"
                >
                  {sectorOptions.map((s) => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {activeSector?.subSectors && (
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[#8e8e93]">Sub-sector</label>
                <select
                  value={subSector}
                  onChange={(e) => setSubSector(e.target.value)}
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#141416] px-3 text-[13px] text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/[0.05]"
                  data-testid="subsector-select-side"
                >
                  <option value="">Select</option>
                  {activeSector.subSectors.map((ss) => (
                    <option key={ss.value} value={ss.value}>{ss.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="mb-2 text-[12px] font-medium text-[#8e8e93]">Organisation size</p>
              <div className="space-y-1.5">
                {sizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSize(option.value)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.04]"
                    data-testid={`size-option-side-${option.value}`}
                  >
                    <span>
                      <span className="block font-medium text-white">{option.label}</span>
                      <span className="block text-[11px] text-[#636366]">{option.detail}</span>
                    </span>
                    {size === option.value && <Check className="h-3.5 w-3.5 text-[#d1d1d6]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.aside>
        )}

        <motion.section layout className="min-w-0 lg:order-1">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.csv,.doc,.docx,.xlsx,.xlsm,.xls,.pptx,.png,.jpg,.jpeg"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(Array.from(e.target.files));
              e.currentTarget.value = "";
            }}
            data-testid="docs-file-input"
          />
          {/* Whole-folder upload. Clients keep their evidence in a folder, not
              as a hand-picked list, and making them select 26 files one by one
              is how documents get left out. Unsupported files are filtered with
              a warning rather than failing the whole drop. */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            // Non-standard but supported everywhere that matters; React needs
            // these lowercased via the DOM attribute spelling.
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(e) => {
              if (e.target.files?.length) addFolder(Array.from(e.target.files));
              e.currentTarget.value = "";
            }}
            data-testid="docs-folder-input"
          />
      <AnimatePresence mode="wait" initial={false}>
      {quote && !parserCase && !quoting && (
        (() => {
          const totalPages = quote.files.reduce((sum, file) => sum + (file.structure.pages ?? 0), 0);
          const spreadsheetCount = quote.files.filter((file) => (file.structure.sheets ?? 0) > 0).length;
          const totalInputTokens = quote.files.reduce((sum, file) => sum + file.tokens.input, 0);
          // The server decides whether money is involved. With the gate off this
          // is a review step, not a checkout — never show a price we won't take.
          const charging = quote.paymentRequired !== false;
          const expiry = new Date(quote.expiresAt);
          const expiryLabel = Number.isNaN(expiry.getTime())
            ? "Today"
            : expiry.toLocaleString("en-ZA", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
          return (
            <motion.div
              key="processing-quote"
              layout
              initial={{ opacity: 0, x: 28, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, scale: 0.985 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 rounded-[22px] border border-white/[0.08] bg-[#0e0e10] p-5"
              data-testid="payment-summary"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#636366]">
                    {charging ? "Processing quote" : "Ready to process"}
                  </p>
                  <h4
                    className="mt-2 text-[30px] font-semibold leading-none text-white"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
                  >
                    {charging
                      ? money(quote.totals.totalCents, quote.currency)
                      : `${quote.files.length} document${quote.files.length === 1 ? "" : "s"}`}
                  </h4>
                  <p className="mt-2 max-w-sm text-[13px] leading-5 text-[#a1a1a6]">
                    {charging
                      ? "Approve this quote before we extract and map your documents."
                      : "Check what we picked up before we extract and map your documents."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-[#141416] px-4 py-3 text-right">
                  <p className="text-[11px] text-[#636366]">Expires</p>
                  <p className="mt-1 text-[13px] font-medium text-[#d1d1d6]">{expiryLabel}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[11px] text-[#636366]">Documents</p>
                  <p className="mt-1 text-[20px] font-semibold text-white">{quote.files.length}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[11px] text-[#636366]">Pages</p>
                  <p className="mt-1 text-[20px] font-semibold text-white">{totalPages || "Auto"}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[11px] text-[#636366]">Workbooks</p>
                  <p className="mt-1 text-[20px] font-semibold text-white">{spreadsheetCount}</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07]">
                <div className="grid grid-cols-[minmax(0,1.4fr)_92px_92px_104px_92px] gap-3 border-b border-white/[0.06] bg-white/[0.035] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#636366] max-md:hidden">
                  <span>Document</span>
                  <span>Effort</span>
                  <span>Units</span>
                  <span>Tokens</span>
                  <span className="text-right">{charging ? "Charge" : "Est. cost"}</span>
                </div>
                {quote.files.map((file) => {
                  const units = file.structure.pages
                    ? `${file.structure.pages} page${file.structure.pages === 1 ? "" : "s"}`
                    : file.structure.sheets
                      ? `${file.structure.sheets} sheet${file.structure.sheets === 1 ? "" : "s"}`
                      : file.structure.rows
                        ? `${file.structure.rows.toLocaleString()} rows`
                        : "Structure scan";
                  return (
                    <div
                      key={file.filename}
                      className="grid gap-2 border-b border-white/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_92px_92px_104px_92px] md:items-center md:gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[#f2f2f7]">{file.filename}</p>
                        <p className="mt-0.5 text-[11px] text-[#636366] md:hidden">
                          {file.requiresOcr ? "High effort" : "Standard"} · {units} · {file.tokens.input.toLocaleString()} tokens
                        </p>
                      </div>
                      <span className="hidden text-[12px] text-[#a1a1a6] md:block">
                        {file.requiresOcr ? "High" : "Standard"}
                      </span>
                      <span className="hidden text-[12px] text-[#a1a1a6] md:block">{units}</span>
                      <span className="hidden font-mono text-[12px] text-[#a1a1a6] md:block">
                        {file.tokens.band ? "~" : ""}{file.tokens.input.toLocaleString()}
                      </span>
                      <span className="text-[13px] font-semibold text-white md:text-right">
                        {money(file.pricing.extractionCents, quote.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/[0.035] px-3 py-3">
                  <p className="text-[11px] text-[#636366]">Input tokens</p>
                  <p className="mt-1 font-mono text-[13px] text-[#d1d1d6]">{totalInputTokens.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.035] px-3 py-3">
                  <p className="text-[11px] text-[#636366]">OCR pages</p>
                  <p className="mt-1 font-mono text-[13px] text-[#d1d1d6]">{quote.azureBreakdown.ocrPages.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.035] px-3 py-3">
                  <p className="text-[11px] text-[#636366]">Model estimate</p>
                  <p className="mt-1 truncate text-[13px] text-[#d1d1d6]">{quote.azureBreakdown.model}</p>
                </div>
              </div>

              {!charging && (
                <p className="mt-3 text-[11px] text-[#636366]">
                  This is what the run costs us to process. You are not charged for it.
                </p>
              )}

              {charging && (
              <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4">
                {quote.lineItems.map((item) => (
                  <div key={item.key} className="flex items-baseline justify-between gap-4 text-[13px]">
                    <span className="min-w-0">
                      <span className="block text-[#d1d1d6]">{item.label}</span>
                      <span className="block truncate text-[11px] text-[#636366]">{item.detail}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[#f2f2f7]">{money(item.cents, quote.currency)}</span>
                  </div>
                ))}
              </div>
              )}

              <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#111113] p-4">
                <p className="text-[13px] font-semibold text-white">Included</p>
                <div className="mt-3 grid gap-2 text-[12px] text-[#a1a1a6] sm:grid-cols-2">
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#d1d1d6]" /> Document reading</span>
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#d1d1d6]" /> Field extraction</span>
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#d1d1d6]" /> Scorecard mapping</span>
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#d1d1d6]" /> Review flags where needed</span>
                </div>
              </div>

              {charging && quote.totals.isUpperBound && (
                <p className="mt-3 text-[11px] text-[#636366]">
                  Scanned documents are estimated conservatively. You will not be charged more than this quote.
                </p>
              )}

              <div className="mt-5 space-y-2">
                <button
                  onClick={() => void (charging ? payAndExtract() : runExtraction(files, quote.quoteId))}
                  disabled={paying || parsing}
                  className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[15px] font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "#0e6fff", color: "#ffffff" }}
                  data-testid={charging ? "button-pay" : "button-process"}
                >
                  {paying || parsing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : charging ? (
                    <CreditCard className="h-[18px] w-[18px]" />
                  ) : (
                    <ArrowRight className="h-[18px] w-[18px]" />
                  )}
                  {charging
                    ? `Pay ${money(quote.totals.totalCents, quote.currency)} with PayFast`
                    : "Read my documents"}
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/[0.10] px-5 text-[13.5px] font-semibold text-[#d1d1d6] transition-colors hover:bg-white/[0.04]"
                >
                  Change documents
                </button>
              </div>
            </motion.div>
          );
        })()
      )}
      {(!quote || parserCase || quoting) && (
      <motion.div
        key={quoting ? "pricing-documents" : parserCase ? "parsed-upload" : "upload-documents"}
        layout
        initial={{ opacity: 0, x: -22, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 24, scale: 0.985 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-[20px] text-center cursor-pointer transition-all duration-300 overflow-hidden"
        style={{
          background: dragActive
            ? "#111827"
            : "#0e0e10",
          border: `1px dashed ${dragActive ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"}`,
          padding: files.length > 0 ? "16px 18px" : "28px 20px 26px",
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
        {files.length === 0 ? (
          <>
            <div
              className="w-11 h-11 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-transform duration-300"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                transform: dragActive ? "scale(1.1)" : "scale(1)",
              }}
            >
              <CloudUpload className="w-5 h-5 text-[#d1d1d6]" />
            </div>
            <h3
              className="text-[18px] text-white mb-1"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
            >
              Upload documents
            </h3>
            <p className="hidden">
              Certificates, affidavits, spend schedules, EE reports — PDF, Word, Excel or scans.
              We read them, extract the real values, and build your scorecard.
            </p>
            <p className="text-[13px] text-[#a1a1a6] mb-4 max-w-sm mx-auto leading-5">
              Get a quote before AI extraction starts.
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] focus:outline-none focus:ring-4 focus:ring-white/[0.08]"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              data-testid="button-upload-documents"
            >
              <Upload className="h-4 w-4" />
              Upload documents
            </button>
            <button
              type="button"
              className="ml-2 inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] px-5 py-2.5 text-[14px] font-semibold text-[#d1d1d6] transition-colors hover:bg-white/[0.06]"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              data-testid="button-upload-folder"
            >
              <FolderOpen className="h-4 w-4" />
              Upload a folder
            </button>
            <p className="mt-3 text-[11px] text-[#86868b]">
              Quote shown before processing.
            </p>
            <div className="hidden">
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
      </motion.div>
      )}
      </AnimatePresence>

      {/* Folder upload skipped some files. A warning, not an error: the upload
          still went ahead with everything readable, and the user decides
          whether the skipped ones mattered. */}
      {skippedFiles.length > 0 && (
        <div
          className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
          data-testid="skipped-files-warning"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {skippedFiles.length} file{skippedFiles.length === 1 ? "" : "s"} in that folder could not be read
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[#a1a1a6]">
            We only read PDFs, Word, Excel, PowerPoint, CSV and images. Everything else was left out —
            if one of these was evidence, convert it and add it.
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-[#8e8e93]">
            {skippedFiles.slice(0, 6).join(", ")}
            {skippedFiles.length > 6 ? ` +${skippedFiles.length - 6} more` : ""}
          </p>
        </div>
      )}

      {/* What a verification actually requires, in the expert's own words.
          Shown before payment so the user can go and fetch what is missing
          rather than paying to be told their score is low. Once documents have
          been read it doubles as a coverage ledger. */}
      {!quote && (
        <div className="mt-3">
          <RequiredDocumentsChecklist satisfiedDocumentIds={satisfiedDocumentIds} />
        </div>
      )}

      {/* Expected documents — sector-aware checklist (below the stage) */}
      {false && catalog && files.length === 0 && (
        <div className="mt-3 rounded-[18px] border border-white/[0.07] bg-[#111113] p-3.5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#f2f2f7]">What to upload</p>
              <p className="mt-0.5 text-[11px] text-[#8e8e93]">
                Start with these documents. We read what we can and keep the rest ready for verification.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-medium text-[#d1d1d6]">
                {activeSector?.label ?? sector}
              </span>
              {size !== "Generic" && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-medium text-[#d1d1d6]">
                  {size}
                </span>
              )}
            </div>
          </div>
          <p className="hidden">
            Documents for <span className="text-[#8e8e93]">{activeSector?.label ?? sector}</span>
            {size !== "Generic" ? ` · ${size}` : ""} — <span className="text-emerald-400/70">◆ we auto-extract</span>,{" "}
            <span className="text-[#8e8e93]">◇ attach for your verifier</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {catalog?.required_groups.map((g) => (
              <div
                key={g.key}
                className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[12px] text-[#d1d1d6]"
                data-testid={`docslot-${g.key}`}
                title={g.note ?? ""}
              >
                <span className="hidden">
                  {g.autoExtract ? "◆" : "◇"}
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1c1c1e] text-[#a1a1a6]">
                  {g.autoExtract ? <Check className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 leading-4">{g.label}</span>
                {g.required !== false && (
                  <span className="shrink-0 rounded-full bg-[#2c2c2e] px-2 py-0.5 text-[10px] font-medium text-[#d1d1d6]">
                    Required
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACT 2 — scanning theatre */}
      {files.length > 0 && (!quote || parserCase || quoting) && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0e0e10]">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_120px_36px] gap-3 border-b border-white/[0.06] px-3.5 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#636366] sm:grid">
            <span>File</span>
            <span>Status</span>
            <span>Type</span>
            <span />
          </div>
          {files.map((f, i) => {
            const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === f.name);
            const missing = parsing ? { fields: [], notes: [] } : docMissingContent(f.name);
            const hasGaps = missing.fields.length > 0 || missing.notes.length > 0;
            const quotedFile = quoted(f.name);
            const fileType = quotedFile?.requiresOcr ? "Scan" : quotedFile ? "Digital" : f.name.split(".").pop()?.toUpperCase() ?? "File";
            const statusLabel = parsing
              ? "Reading"
              : detected
                ? detected.status === "passed" && !hasGaps
                  ? "Ready"
                  : detected.status === "review_required" || hasGaps
                    ? "Review"
                    : "Failed"
                : quotedFile
                  ? "Quoted"
                  : quoting
                    ? "Pricing"
                    : "Queued";
            return (
              <div
                key={f.name}
                className="dus-fade-up relative overflow-hidden border-b border-white/[0.05] px-3.5 py-3 last:border-b-0"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_110px_120px_36px] sm:items-center sm:gap-3">
                  {/* shimmer sweep while parsing */}
                  {parsing && (
                    <div className="absolute inset-y-0 left-0 w-1/3 pointer-events-none" style={{
                      background: "linear-gradient(100deg, transparent, rgba(167,139,250,0.09), transparent)",
                      animation: "dusShimmer 1.4s ease-in-out infinite",
                    }} />
                  )}
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <FileText className="w-4 h-4 text-[#636366] shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-[#e5e5ea]">{f.name}</div>
                      {quotedFile && (
                        <div className="mt-0.5 text-[11px] font-mono text-[#636366]">
                          {quotedFile.tokens.input.toLocaleString()} tokens
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-1 text-[11px] text-[#d1d1d6]">
                    {parsing && <Loader2 className="h-3 w-3 animate-spin" />}
                    {statusLabel}
                  </span>
                  <span className="text-[12px] text-[#8e8e93]">{fileType}</span>
                  <FileText className="hidden w-4 h-4 text-[#636366] shrink-0" />
                  <div className="hidden flex-1 min-w-0 text-left">
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
                      ) : quoted(f.name) ? (
                        // Priced, not read. Say only what we actually know from
                        // the structure scan — never claim a verdict yet.
                        <span className="inline-flex items-center gap-1.5 text-[#636366]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#48484a]" />
                          {quoted(f.name)!.requiresOcr ? "Scan — needs OCR" : "Digital"}
                          <span className="text-[#48484a]">·</span>
                          <span className="font-mono">{quoted(f.name)!.tokens.input.toLocaleString()} tok</span>
                          <span className="text-[#48484a]">· not read yet</span>
                        </span>
                      ) : quoting ? (
                        <span className="text-[#636366]">Sizing…</span>
                      ) : (
                        <span className="text-[#636366]">Queued</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                    className="justify-self-start p-1 text-[#48484a] transition-colors hover:text-[#8e8e93] sm:justify-self-end"
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

      {/* Pricing the documents — free, structure-only, nothing read yet. */}
      {quoting && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#8e8e93]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
          Checking size and format to price these documents — nothing is read yet.
        </div>
      )}

      {/* Reading — the paid work, after payment only. */}
      {parsing && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-violet-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
          Paid — reading your documents, normalising and mapping entities…
        </div>
      )}

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
              ) : totalMappedRows > 0 ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Build my scorecard from {totalMappedRows} extracted value{totalMappedRows !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Continue to workbook &amp; complete it there
                </>
              )}
            </button>
            <p className="text-[11px] text-[#48484a] mt-2 text-center">
              {totalMappedRows > 0
                ? "You’ll land in a pre-filled workbook — review, complete anything missing, and the score computes the same way as manual entry."
                : "We couldn’t extract scorable values yet — you’ll land in the workbook to fill them in. You can also add more documents above."}
            </p>
          </div>
        </div>
      )}
        </motion.section>
      </motion.div>
    </div>
  );
}
