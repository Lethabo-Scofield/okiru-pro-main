/**
 * What a verification actually requires, asked BEFORE the user uploads.
 *
 * A B-BBEE score is only as good as the evidence behind it, and the commonest
 * cause of a bad first score is not poor performance — it is missing documents.
 * The user then blames the tool. Asking well up front is the cheapest fix there
 * is, and it is why the expert's 109-document matrix exists.
 *
 * Every line here is the expert's own wording, served from
 * /api/parser/required-documents. Nothing is invented in the frontend: if the
 * matrix changes, this changes with it.
 *
 * Colour is never the only signal (dataviz rule): supplied vs outstanding is
 * carried by an icon and a label as well as a tint.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, FileQuestion, Info } from "lucide-react";

interface RequiredDocument {
  id: string;
  name: string;
  whatTheAuditorTests: string;
  exampleOfGoodData: string;
  expectedFields: string[];
}

interface RequiredElement {
  element: string;
  documentCount: number;
  documents: RequiredDocument[];
}

/** Scorecard element codes → the names people actually use. */
const ELEMENT_LABELS: Record<string, string> = {
  OWNERSHIP: "Ownership",
  MANAGEMENT_CONTROL: "Management control",
  SKILLS_DEVELOPMENT: "Skills development",
  ESD: "Enterprise & supplier development",
  SED: "Socio-economic development",
};

interface Props {
  /** Matrix document ids we have already read out of the uploaded files. */
  satisfiedDocumentIds?: string[];
  /** Collapsed by default on the upload screen; open on the review screen. */
  defaultOpenElement?: string;
}

export function RequiredDocumentsChecklist({ satisfiedDocumentIds = [], defaultOpenElement }: Props) {
  const [elements, setElements] = useState<RequiredElement[] | null>(null);
  const [openElement, setOpenElement] = useState<string | null>(defaultOpenElement ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/parser/required-documents", { credentials: "include" });
        if (!res.ok) throw new Error(`Could not load the document list (${res.status})`);
        const body = await res.json();
        if (!cancelled) setElements((body?.data?.elements ?? []) as RequiredElement[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the document list");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const satisfied = useMemo(() => new Set(satisfiedDocumentIds), [satisfiedDocumentIds]);

  if (error) {
    // Non-fatal: the checklist is guidance, so its failure must not block uploading.
    return (
      <p className="text-[12px] text-[#636366]">
        {error}. You can still upload — we will tell you what is missing after reading your documents.
      </p>
    );
  }

  const list = elements ?? [];
  if (list.length === 0) return null;

  const totalDocuments = list.reduce((sum, element) => sum + element.documentCount, 0);
  const totalSatisfied = list.reduce(
    (sum, element) => sum + element.documents.filter((doc) => satisfied.has(doc.id)).length,
    0,
  );

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-[#0e0e10] p-5" data-testid="required-documents">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#636366]">
            What a verification needs
          </p>
          <h4
            className="mt-2 text-[22px] font-semibold leading-none text-white"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {satisfiedDocumentIds.length > 0
              ? `${totalSatisfied} of ${totalDocuments} covered`
              : `${totalDocuments} documents`}
          </h4>
          <p className="mt-2 max-w-md text-[13px] leading-5 text-[#a1a1a6]">
            You do not need all of them. Upload what applies to you — we score on what we can read
            and flag the rest. A low score is usually missing evidence, not poor performance.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {list.map((element) => {
          const label = ELEMENT_LABELS[element.element] ?? element.element;
          const covered = element.documents.filter((doc) => satisfied.has(doc.id)).length;
          const isOpen = openElement === element.element;

          return (
            <div key={element.element} className="overflow-hidden rounded-2xl border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setOpenElement(isOpen ? null : element.element)}
                className="flex w-full items-center justify-between gap-3 bg-white/[0.035] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                aria-expanded={isOpen}
                data-testid={`element-${element.element}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-white">{label}</span>
                  <span className="block text-[11px] text-[#636366]">
                    {satisfiedDocumentIds.length > 0
                      ? `${covered} of ${element.documentCount} covered`
                      : `${element.documentCount} documents an auditor may ask for`}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#8e8e93] transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ul className="divide-y divide-white/[0.05]">
                      {element.documents.map((doc) => {
                        const have = satisfied.has(doc.id);
                        return (
                          <li key={doc.id} className="flex gap-3 px-4 py-3">
                            <span className="mt-0.5 shrink-0" aria-hidden>
                              {have
                                ? <Check className="h-3.5 w-3.5 text-[#30d158]" />
                                : <FileQuestion className="h-3.5 w-3.5 text-[#636366]" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13px] leading-5 text-[#d1d1d6]">
                                {doc.name}
                                {/* Never colour alone — state is spelled out. */}
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-[#636366]">
                                  {have ? "supplied" : "not yet"}
                                </span>
                              </span>
                              {doc.whatTheAuditorTests && (
                                <span className="mt-1 block text-[11.5px] leading-[1.45] text-[#8e8e93]">
                                  <Info className="mr-1 inline h-3 w-3 align-[-1px] text-[#636366]" />
                                  {doc.whatTheAuditorTests}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
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

export default RequiredDocumentsChecklist;
