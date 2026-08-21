/**
 * Upload by ESG element, not by workbook sheet.
 *
 * This is the ESG sibling of `scorecard/PillarDocumentBatches` and follows the
 * same argument: people do not gather evidence one document at a time, they
 * gather it a subject at a time — the utility bills on Monday, the fleet pack
 * on Tuesday, whatever SHEQ sends back on Thursday — usually as a folder per
 * subject. So the unit is the BATCH.
 *
 * WHY THIS IS A FORK RATHER THAN A REUSE
 *
 * `PillarDocumentBatches` is B-BBEE by construction in three ways that cannot
 * be parameterised away honestly: it hard-codes the five Codes elements, it
 * fetches `/api/parser/required-documents` (the B-BBEE verification matrix),
 * and its copy explains a verification. ESG has fourteen elements, a different
 * endpoint, and a different reason for asking. Generalising one component over
 * both would have meant a prop for the element list, a prop for the endpoint, a
 * prop for every string — a "shared" component with nothing shared but its
 * markup, and a change to it risking the flagship B-BBEE flow. The batch card
 * layout is duplicated; the behaviour that matters (classification, placement,
 * pricing) is not — that all lives upstream and is shared.
 *
 * NOTHING ABOUT PROCESSING CHANGES. The classifier still decides what every
 * document actually is. The batch a file was filed under is presentation: it
 * tells the user where their work went, shown alongside — never instead of —
 * what we actually read.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  FileQuestion,
  FilePlus2,
  FolderOpen,
  Info,
  Layers,
  Leaf,
} from "lucide-react";

export interface EsgUploadOrigin {
  batchId: string;
  batchLabel: string;
  documentTypeId?: string;
  documentTypeName?: string;
  fromFolder?: boolean;
}

/**
 * The fourteen ESG evidence elements, in reporting order (E, then S, then G,
 * then the entity-level figures every ratio divides by).
 *
 * Codes and their meaning come from `okiru-ai-parser/schemas/esg_document_matrix.ts`
 * — the labels and blurbs here are this UI's wording for those codes. If the
 * matrix gains an element, the server will return it and it still renders (see
 * `unknownElementLabel`); it just will not be sorted into this order.
 */
const ELEMENT_ORDER: Array<{ element: string; label: string; blurb: string }> = [
  {
    element: "GHG_ENERGY",
    label: "Energy & emissions",
    blurb: "Electricity and fuel bought or generated, and anything that converts to tCO2e.",
  },
  {
    element: "FLEET",
    label: "Fleet",
    blurb: "Fuel card statements, the vehicle register, telematics and driver debriefs.",
  },
  {
    element: "WASTE",
    label: "Waste",
    blurb: "Contractor reports, manifests and safe disposal certificates.",
  },
  {
    element: "WATER",
    label: "Water",
    blurb: "Municipal water and sanitation accounts, boreholes and alternative sources.",
  },
  {
    element: "ISO_ENVIRONMENTAL",
    label: "Environmental management",
    blurb: "ISO 14001, the environmental policy, aspects and impacts, the legal register.",
  },
  {
    element: "EMPLOYMENT_EQUITY",
    label: "Employment equity",
    blurb: "EEA2 / EEA4 returns, the EE plan and consultative forum minutes.",
  },
  {
    element: "HEALTH_SAFETY",
    label: "Health & safety",
    blurb: "ISO 45001, incident and LTIFR reporting, OHS committee records.",
  },
  {
    element: "TRAINING",
    label: "Skills & training",
    blurb: "WSP/ATR, SDL returns and training by OFO occupation code.",
  },
  {
    element: "COMMUNITY_CSI",
    label: "Community & CSI",
    blurb: "Social investment spend and the evidence of who benefited.",
  },
  {
    element: "SUPPLIER_ESG",
    label: "Supplier ESG",
    blurb: "Supplier self-assessment questionnaires and third-party ESG returns.",
  },
  {
    element: "BOARD_GOVERNANCE",
    label: "Board & governance",
    blurb: "Board composition, committees, King application, the integrated report.",
  },
  {
    element: "ETHICS_COMPLIANCE",
    label: "Ethics & compliance",
    blurb: "Ethics and whistleblowing policies, POPIA, penalties and incident registers.",
  },
  {
    element: "RISK_ASSURANCE",
    label: "Risk & assurance",
    blurb: "Risk register, IFRS S1/S2 readiness, external assurance statements.",
  },
  {
    element: "FINANCIAL",
    label: "Financials",
    blurb: "The entity-level denominators every ESG ratio divides by — NPAT, revenue, payroll.",
  },
];

const ELEMENT_INDEX = new Map(ELEMENT_ORDER.map((e, i) => [e.element, i]));

/** A code the matrix has that this UI has no wording for. Show it, readably. */
function unknownElementLabel(element: string): string {
  return element
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * The extra batch. These are not matrix documents — they are the whole-file
 * uploads that answer several elements at once, which is how most clients
 * actually send ESG evidence. Keeping them in their own batch stops people
 * hunting for the right element to put a 20-tab sustainability pack in.
 */
const HOLISTIC_BATCH = {
  id: "HOLISTIC",
  label: "Packs & whole folders",
  blurb: "Whole files that cover several elements at once. Drop them here and we sort out what goes where.",
  items: [
    {
      id: "esg_holistic__esg_data_pack",
      name: "ESG data pack or sustainability workbook",
      hint: "The filled-in data collection workbook — every tab, in one upload.",
    },
    {
      id: "esg_holistic__integrated_report",
      name: "Integrated or sustainability report",
      hint: "Last year's published report. Names the entity, the period and the reporting boundary.",
    },
    {
      id: "esg_holistic__annual_financial_statements",
      name: "Annual financial statements",
      hint: "Signed AFS for the reporting year. Sets revenue, NPAT and payroll — the ESG ratio denominators.",
    },
    {
      id: "esg_holistic__policy_bundle",
      name: "Policy and certificate bundle",
      hint: "Policies, ISO certificates and licences in one go.",
    },
    {
      id: "esg_holistic__whole_folder",
      name: "Your whole evidence folder",
      hint: "Everything, unsorted. We read what we can and tell you what is missing.",
    },
  ],
};

const READABLE_ACCEPT =
  ".pdf,.txt,.csv,.doc,.docx,.xlsx,.xlsm,.xls,.pptx,.png,.jpg,.jpeg,.tiff,.tif,.webp";

/** Batch id → display name, for anywhere outside this component. */
export function esgBatchLabel(batchId: string): string {
  if (batchId === HOLISTIC_BATCH.id) return HOLISTIC_BATCH.label;
  const known = ELEMENT_ORDER.find((e) => e.element === batchId);
  return known?.label ?? unknownElementLabel(batchId);
}

interface NormalisedDocument {
  id: string;
  name: string;
  hint?: string;
}

interface NormalisedElement {
  element: string;
  documents: NormalisedDocument[];
}

/**
 * Read the ESG document catalogue out of whatever shape the parser returns.
 *
 * The ESG parser endpoints are being built alongside this screen, and the
 * B-BBEE side already speaks two different shapes for the same idea
 * (`/document-types` returns `{document_types}`, `/required-documents` returns
 * `{data:{elements}}`). Rather than couple to a guess, accept every shape that
 * carries the same information and ignore anything that does not. Returning an
 * empty list is fine — the batches still take uploads, they just cannot list
 * the documents inside them.
 */
export function normaliseEsgDocumentCatalog(body: unknown): NormalisedElement[] {
  const root = (body as { data?: unknown })?.data ?? body;
  if (!root || typeof root !== "object") return [];
  const record = root as Record<string, unknown>;

  // Shape A — already grouped: { elements: [{ element, documents: [...] }] }
  const grouped = record.elements;
  if (Array.isArray(grouped)) {
    return grouped
      .map((entry) => {
        const e = entry as { element?: unknown; documents?: unknown[] };
        return {
          element: String(e?.element ?? "").toUpperCase(),
          documents: (e?.documents ?? []).map(toNormalisedDocument).filter((d) => d.id && d.name),
        };
      })
      .filter((e) => e.element);
  }

  // Shape B — a flat list under any of the names the parser uses for it.
  const flat =
    (Array.isArray(record.document_types) && record.document_types) ||
    (Array.isArray(record.documents) && record.documents) ||
    (Array.isArray(record.matrix) && record.matrix) ||
    (Array.isArray(root) ? (root as unknown[]) : null);
  if (!flat) return [];

  const byElement = new Map<string, NormalisedDocument[]>();
  for (const entry of flat) {
    const raw = entry as Record<string, unknown>;
    const element = String(raw?.element ?? raw?.element_code ?? raw?.pillar_code ?? "").toUpperCase();
    if (!element) continue;
    const doc = toNormalisedDocument(entry);
    if (!doc.id || !doc.name) continue;
    const list = byElement.get(element) ?? [];
    list.push(doc);
    byElement.set(element, list);
  }
  return Array.from(byElement.entries()).map(([element, documents]) => ({ element, documents }));
}

function toNormalisedDocument(entry: unknown): NormalisedDocument {
  const raw = (entry ?? {}) as Record<string, unknown>;
  const name = String(raw.name ?? raw.document_name ?? "").trim();
  // Ids are what "covered" is tracked by, so fall back to the name rather than
  // dropping the row — a document with no stable id still deserves a slot.
  const id = String(raw.id ?? raw.document_id ?? name).trim();
  const hint = String(
    raw.whatTheAuditorTests ?? raw.auditorTests ?? raw.description ?? "",
  ).trim();
  return { id, name, hint: hint || undefined };
}

export interface EsgElementDocumentBatchesProps {
  /** Matrix document ids the parser has already read values out of. */
  satisfiedDocumentIds?: string[];
  /** filename → the batch it was filed under, so each card shows its own pile. */
  filedBatchByFile?: Record<string, string>;
  /** Names of every file currently staged, for the "not yet filed" count. */
  stagedFileNames?: string[];
  /** Hand files up to the page. The page confirms, then adds and quotes them. */
  onPick: (files: File[], origin: EsgUploadOrigin) => void;
  disabled?: boolean;
}

export function EsgElementDocumentBatches({
  satisfiedDocumentIds = [],
  filedBatchByFile = {},
  stagedFileNames = [],
  onPick,
  disabled = false,
}: EsgElementDocumentBatchesProps) {
  const [elements, setElements] = useState<NormalisedElement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [dragBatch, setDragBatch] = useState<string | null>(null);

  // One pair of inputs for the whole component; the pending origin says which
  // batch (and optionally which document type) the pick belongs to. Rendering a
  // hidden input per document would be the obvious alternative and a bad one.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const pendingOrigin = useRef<EsgUploadOrigin | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/parser/esg/document-types", { credentials: "include" });
        if (!res.ok) throw new Error(`Could not load the ESG document list (${res.status})`);
        const body = await res.json();
        if (!cancelled) setElements(normaliseEsgDocumentCatalog(body));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the ESG document list");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const satisfied = useMemo(() => new Set(satisfiedDocumentIds), [satisfiedDocumentIds]);

  const filedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const batchId of Object.values(filedBatchByFile)) {
      counts[batchId] = (counts[batchId] ?? 0) + 1;
    }
    return counts;
  }, [filedBatchByFile]);

  const unfiledCount = stagedFileNames.filter((name) => !filedBatchByFile[name]).length;

  const openPicker = (origin: EsgUploadOrigin, kind: "files" | "folder") => {
    if (disabled) return;
    pendingOrigin.current = { ...origin, fromFolder: kind === "folder" };
    (kind === "folder" ? folderInputRef : fileInputRef).current?.click();
  };

  const handlePicked = (list: FileList | null) => {
    const origin = pendingOrigin.current;
    pendingOrigin.current = null;
    if (!origin || !list?.length) return;
    onPick(Array.from(list), origin);
  };

  const handleDrop = (event: React.DragEvent, origin: EsgUploadOrigin) => {
    event.preventDefault();
    event.stopPropagation();
    setDragBatch(null);
    if (disabled || !event.dataTransfer.files?.length) return;
    onPick(Array.from(event.dataTransfer.files), origin);
  };

  /**
   * Batch cards.
   *
   * Every element the catalogue knows about gets a card, ordered by
   * ELEMENT_ORDER and with anything unrecognised appended rather than dropped.
   * Before the catalogue loads (or if it fails) the element cards still render
   * from ELEMENT_ORDER with no document list — an upload surface that depends
   * on a catalogue request is an upload surface that breaks when it fails.
   */
  const batches = useMemo(() => {
    const byElement = new Map((elements ?? []).map((e) => [e.element, e]));
    const codes = new Set<string>([
      ...ELEMENT_ORDER.map((e) => e.element),
      ...Array.from(byElement.keys()),
    ]);

    const elementBatches = Array.from(codes)
      .sort((a, b) => (ELEMENT_INDEX.get(a) ?? 999) - (ELEMENT_INDEX.get(b) ?? 999))
      .map((code) => {
        const known = ELEMENT_ORDER.find((e) => e.element === code);
        const documents = byElement.get(code)?.documents ?? [];
        return {
          id: code,
          label: known?.label ?? unknownElementLabel(code),
          blurb: known?.blurb ?? "",
          documentCount: documents.length,
          covered: documents.filter((doc) => satisfied.has(doc.id)).length,
          items: documents,
          holistic: false,
        };
      });

    return [
      ...elementBatches,
      {
        id: HOLISTIC_BATCH.id,
        label: HOLISTIC_BATCH.label,
        blurb: HOLISTIC_BATCH.blurb,
        documentCount: HOLISTIC_BATCH.items.length,
        covered: 0,
        items: HOLISTIC_BATCH.items,
        holistic: true,
      },
    ];
  }, [elements, satisfied]);

  const totalTypes = batches.reduce(
    (sum, batch) => sum + (batch.holistic ? 0 : batch.documentCount),
    0,
  );
  const totalCovered = batches.reduce((sum, batch) => sum + batch.covered, 0);

  return (
    <div
      className="rounded-[22px] border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-input-bg,#0e0e10)] p-5"
      data-testid="esg-upload-batches"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={READABLE_ACCEPT}
        onChange={(e) => {
          handlePicked(e.target.files);
          e.currentTarget.value = "";
        }}
        data-testid="esg-batch-file-input"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          handlePicked(e.target.files);
          e.currentTarget.value = "";
        }}
        data-testid="esg-batch-folder-input"
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--esg-text3,#636366)]">
            Upload by element
          </p>
          <h4
            className="mt-2 text-[22px] font-semibold leading-none text-[var(--esg-text,#fff)]"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {satisfiedDocumentIds.length > 0 && totalTypes > 0
              ? `${totalCovered} of ${totalTypes} document types covered`
              : `${batches.length} batches, one at a time`}
          </h4>
          <p className="mt-2 max-w-lg text-[13px] leading-5 text-[var(--esg-text2,#8e8e93)]">
            Send what you have for each element — files or a whole folder. You do not need all
            {totalTypes > 0 ? ` ${totalTypes}` : ""} document types, and it does not matter if
            something lands in the wrong batch: we read every document and file it where it
            actually belongs.
          </p>
          {/* Guidance, not a gate: a failed catalogue must never block uploading. */}
          {error && (
            <p className="mt-2 text-[12px] text-[var(--esg-text3,#636366)]" data-testid="esg-batches-catalog-error">
              {error}. You can still upload — we will tell you what is missing after reading your
              documents.
            </p>
          )}
        </div>
        {unfiledCount > 0 && (
          <p className="rounded-xl border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-section-bg,#141416)] px-3 py-2 text-[11.5px] text-[var(--esg-text2,#8e8e93)]">
            {unfiledCount} file{unfiledCount === 1 ? "" : "s"} added outside a batch
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {batches.map((batch) => {
          const isOpen = openBatch === batch.id;
          const filed = filedCounts[batch.id] ?? 0;
          const isDragTarget = dragBatch === batch.id;
          const origin: EsgUploadOrigin = { batchId: batch.id, batchLabel: batch.label };

          return (
            <div
              key={batch.id}
              className={`overflow-hidden rounded-2xl border transition-colors ${
                isDragTarget
                  ? "border-white/[0.35] bg-white/[0.04]"
                  : "border-[var(--esg-glass-border,#2c2c2e)]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setDragBatch(batch.id);
              }}
              onDragLeave={() => setDragBatch((current) => (current === batch.id ? null : current))}
              onDrop={(e) => handleDrop(e, origin)}
              data-testid={`esg-batch-${batch.id}`}
            >
              <div className="flex flex-col gap-3 bg-white/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={() => setOpenBatch(isOpen ? null : batch.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                  data-testid={`esg-batch-toggle-${batch.id}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                    {batch.holistic ? (
                      <Layers className="h-4 w-4 text-[var(--esg-text2,#8e8e93)]" />
                    ) : (
                      <Leaf className="h-4 w-4 text-[var(--esg-acc-e,#1de9a0)]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-[var(--esg-text,#fff)]">
                      <span className="truncate">{batch.label}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-[var(--esg-text2,#8e8e93)] transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                    {batch.blurb && (
                      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--esg-text2,#8e8e93)]">
                        {batch.blurb}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-[var(--esg-text3,#636366)]">
                      {batch.holistic
                        ? `${batch.documentCount} kinds of upload`
                        : batch.documentCount === 0
                          ? "Document list unavailable — uploads still work"
                          : satisfiedDocumentIds.length > 0
                            ? `${batch.covered} of ${batch.documentCount} document types covered`
                            : `${batch.documentCount} document types`}
                      {filed > 0 && ` · ${filed} file${filed === 1 ? "" : "s"} added`}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPicker(origin, "files")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] disabled:opacity-40"
                    data-testid={`esg-batch-upload-files-${batch.id}`}
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    Files
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPicker(origin, "folder")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-[var(--esg-text2,#8e8e93)] transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                    data-testid={`esg-batch-upload-folder-${batch.id}`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Folder
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ul className="divide-y divide-white/[0.05]">
                      {batch.items.map((item) => {
                        const have = satisfied.has(item.id);
                        return (
                          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                            <span className="mt-0.5 shrink-0" aria-hidden>
                              {have ? (
                                <Check className="h-3.5 w-3.5 text-[#30d158]" />
                              ) : (
                                <FileQuestion className="h-3.5 w-3.5 text-[var(--esg-text3,#636366)]" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] leading-5 text-[#d1d1d6]">
                                {item.name}
                                {/* Never colour alone — state is spelled out. */}
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--esg-text3,#636366)]">
                                  {have ? "supplied" : "not yet"}
                                </span>
                              </span>
                              {item.hint && (
                                <span className="mt-1 block text-[11.5px] leading-[1.45] text-[var(--esg-text2,#8e8e93)]">
                                  <Info className="mr-1 inline h-3 w-3 align-[-1px] text-[var(--esg-text3,#636366)]" />
                                  {item.hint}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                openPicker(
                                  { ...origin, documentTypeId: item.id, documentTypeName: item.name },
                                  "files",
                                )
                              }
                              className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.10] px-2.5 py-1 text-[11px] font-medium text-[var(--esg-text2,#8e8e93)] transition-colors hover:bg-white/[0.06] hover:text-[#e5e5ea] disabled:opacity-40"
                              aria-label={`Upload ${item.name}`}
                              data-testid={`esg-upload-doc-${item.id}`}
                            >
                              <FilePlus2 className="h-3 w-3" />
                              Upload
                            </button>
                          </li>
                        );
                      })}
                      {batch.items.length === 0 && (
                        <li className="px-4 py-3 text-[12px] text-[var(--esg-text3,#636366)]">
                          {elements === null && !error
                            ? "Loading the document list…"
                            : "No document list for this element — you can still upload to it."}
                        </li>
                      )}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EsgElementDocumentBatches;
