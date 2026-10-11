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
 * THE CLASSIFIER STILL DECIDES. The batch a file was filed under travels to the
 * reader as a hint (C1, `esgFocusElements`): used where the classifier is
 * unsure, never over a confident classification. It also tells the user where
 * their work went, shown alongside — never instead of — what we actually read.
 */
import { useEffect, useMemo, useState } from "react";
import { Checklist, type ChecklistOrigin } from "@/components/upload/flow/Checklist";

export type EsgUploadOrigin = ChecklistOrigin;

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
  label: "Whole packs and workbooks",
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

/**
 * The element each file was filed under, for the reader (C1).
 *
 * The batch used to be presentation only. It now travels with the upload as a
 * hint the parser uses where its own classifier is unsure. Only real element
 * batches count: "Whole packs and workbooks" says the opposite of a single element.
 */
export function esgFocusElements(
  fileNames: readonly string[],
  filedBatchByFile: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of fileNames) {
    const batch = filedBatchByFile[name];
    if (batch && batch !== HOLISTIC_BATCH.id && ELEMENT_INDEX.has(batch)) out[name] = batch;
  }
  return out;
}

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
  const unfiledCount = stagedFileNames.filter((name) => !filedBatchByFile[name]).length;

  /**
   * Groups.
   *
   * Every element the catalogue knows about gets a group, ordered by
   * ELEMENT_ORDER and with anything unrecognised appended rather than dropped.
   * Before the catalogue loads (or if it fails) the element groups still render
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

  return (
    <Checklist
      testIdPrefix="esg-"
      testId="esg-upload-batches"
      groups={batches}
      satisfied={satisfied}
      anyRead={satisfiedDocumentIds.length > 0}
      filedBatchByFile={filedBatchByFile}
      unfiledCount={unfiledCount}
      onPick={onPick}
      disabled={disabled}
      catalogueLoaded={elements !== null}
      emptyGroupText={(loaded) =>
        !loaded && !error ? "Loading the document list…" : "No document list for this element — you can still add files to it."
      }
      // Guidance, not a gate: a failed catalogue must never block uploading.
      notice={
        error ? (
          <p className="mt-1 text-[12px] text-[color:var(--muted)]" data-testid="esg-batches-catalog-error">
            {error}. You can still upload — we will tell you what is missing after reading your documents.
          </p>
        ) : null
      }
    />
  );
}

export default EsgElementDocumentBatches;
