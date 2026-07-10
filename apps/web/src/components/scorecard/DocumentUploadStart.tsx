/**
 * Document-upload start option for /create-scorecard.
 *
 * EMS-style preset-documents flow: show the expected-documents checklist,
 * accept the raw evidence (PDF / Word / Excel / CSV / images), classify +
 * extract deterministically via okiru-ai-parser (/api/parser/resolve-case-files),
 * normalise the extracted values into workbook sections
 * (mapParserCaseToWorkbookSections), and hand the sections to the SAME
 * create → /api/workbook/:id/import → submit path Excel import uses — so the
 * score is computed by the one canonical calculator chain.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CloudUpload, FileText, Loader2, Minus, X } from "lucide-react";
import {
  mapParserCaseToWorkbookSections,
  type ParserCaseLike,
  type ParserWorkbookMapResult,
} from "@/lib/parserWorkbookMap";

interface ExpectedDocsCatalog {
  document_types: Array<{ name: string; description: string; required: boolean; pillar_code: string }>;
  required_groups: Array<{ key: string; label: string; types: string[] }>;
}

const CANONICAL_PILLARS: Record<string, string> = {
  ESD: "Enterprise & Supplier Development",
  OWN: "Ownership",
  MAC: "Management Control",
  SKL: "Skills Development",
  SED: "Socio-Economic Development",
};

export interface DocumentUploadStartProps {
  /** Create the client + import the mapped sections + open the workbook. */
  onCreate: (companyName: string, sections: Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }>) => Promise<void>;
  creating: boolean;
}

export function DocumentUploadStart({ onCreate, creating }: DocumentUploadStartProps) {
  const [catalog, setCatalog] = useState<ExpectedDocsCatalog | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parserCase, setParserCase] = useState<ParserCaseLike | null>(null);
  const [companyName, setCompanyName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/parser/document-types", { credentials: "include" });
        if (res.ok) setCatalog(await res.json());
      } catch {
        // checklist is progressive enhancement — uploads still work without it
      }
    })();
  }, []);

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
    if (next.length === 0) {
      setParserCase(null);
    } else {
      void parseFiles(next);
    }
  };

  const groupSatisfied = (g: { types: string[] }) => g.types.some((t) => docTypeSatisfied(t));
  const canCreate = Boolean(companyName.trim()) && (mapped?.mappedRowCount ?? 0) > 0 && !parsing && !creating;

  return (
    <div data-testid="document-upload-start">
      {/* Expected documents checklist */}
      {catalog && (
        <div className="rounded-xl bg-[#0e0e10] border border-[#2c2c2e] px-4 py-3 mb-4">
          <p className="text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-2">
            Documents we expect
          </p>
          <div className="space-y-1.5 mb-3">
            {catalog.required_groups.map((g) => {
              const ok = groupSatisfied(g);
              return (
                <div key={g.key} className="flex items-center gap-2 text-[13px]" data-testid={`docslot-${g.key}`}>
                  {ok ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${files.length ? "text-amber-400" : "text-[#636366]"}`} />
                  )}
                  <span className={ok ? "text-[#d1d1d6]" : "text-[#8e8e93]"}>{g.label}</span>
                  <span className="text-[10px] text-red-400 font-semibold">*</span>
                  {!ok && files.length > 0 && (
                    <span className="text-[11px] text-amber-300/70 ml-auto">Please attach — not found in your uploads</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {catalog.document_types
              .filter((t) => CANONICAL_PILLARS[t.pillar_code])
              .map((t) => {
                const ok = docTypeSatisfied(t.name);
                return (
                  <span
                    key={t.name}
                    title={`${CANONICAL_PILLARS[t.pillar_code]} — ${t.description}`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${
                      ok ? "text-emerald-400 border-emerald-900" : "text-[#8e8e93] border-[#2c2c2e]"
                    } bg-[#1c1c1e]`}
                  >
                    {ok && <Check className="w-3 h-3" />}
                    {t.name}
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        className="rounded-xl border border-dashed border-[#2c2c2e] hover:border-[#48484a] bg-[#0e0e10] px-4 py-5 text-center cursor-pointer transition-colors mb-3"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
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
        <CloudUpload className="w-5 h-5 text-[#636366] mx-auto mb-1.5" />
        <p className="text-[13px] text-[#d1d1d6] font-medium">
          {files.length ? "Add more documents" : "Drop your documents here"}
        </p>
        <p className="text-[11px] text-[#636366] mt-0.5">PDF, Word, Excel, CSV or scans</p>
      </div>

      {/* Uploaded files */}
      {files.length > 0 && (
        <div className="space-y-1 mb-3">
          {files.map((f) => {
            const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === f.name);
            return (
              <div key={f.name} className="flex items-center gap-2 rounded-lg bg-[#0e0e10] border border-[#1c1c1e] px-3 py-2 text-[12px]">
                <FileText className="w-3.5 h-3.5 text-[#636366] shrink-0" />
                <span className="text-[#d1d1d6] truncate">{f.name}</span>
                {parsing ? (
                  <Loader2 className="w-3 h-3 animate-spin text-[#636366] ml-auto shrink-0" />
                ) : detected ? (
                  <span className="text-[#8e8e93] ml-auto shrink-0">→ {detected.document_type}</span>
                ) : null}
                <button
                  onClick={() => removeFile(f.name)}
                  className="p-0.5 text-[#48484a] hover:text-[#8e8e93] shrink-0"
                  data-testid={`remove-${f.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {parseError && (
        <p className="text-[12px] text-red-400 mb-3">{parseError}</p>
      )}

      {/* Mapped coverage preview */}
      {mapped && !parsing && (
        <div className="rounded-xl bg-[#0e0e10] border border-[#2c2c2e] px-4 py-3 mb-4" data-testid="coverage-preview">
          <p className="text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-2">
            What we&apos;ll fill into your workbook
          </p>
          <div className="space-y-1.5">
            {mapped.coverage.map((c) => (
              <div key={c.pillar} className="flex items-start gap-2 text-[12px]">
                {c.status === "mapped" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : c.status === "needs-detail" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-[#48484a] shrink-0 mt-0.5" />
                )}
                <div>
                  <span className={c.status === "mapped" ? "text-[#d1d1d6] font-medium" : "text-[#8e8e93] font-medium"}>
                    {c.pillar}
                  </span>
                  <span className="text-[#636366]"> — {c.detail}</span>
                  {c.extractedValue && (
                    <span className="text-amber-300/80"> Extracted: {c.extractedValue}.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company name + create */}
      {mapped && mapped.mappedRowCount > 0 && !parsing && (
        <>
          <label className="block text-[12px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-2">
            Company name
          </label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Holdings (Pty) Ltd"
            className="w-full bg-[#0e0e10] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-[15px] text-white placeholder-[#636366] outline-none focus:border-[#48484a] mb-3"
            data-testid="docs-company-name"
          />
          <button
            onClick={() => void onCreate(companyName.trim(), mapped.sections)}
            disabled={!canCreate}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-[14px] font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors"
            data-testid="button-create-from-documents"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>Create scorecard from {mapped.mappedRowCount} extracted value{mapped.mappedRowCount !== 1 ? "s" : ""}</>
            )}
          </button>
          <p className="text-[11px] text-[#636366] mt-2 text-center">
            You&apos;ll land in the workbook to review and complete anything the documents didn&apos;t cover — the score is calculated the same way as manual entry.
          </p>
        </>
      )}
    </div>
  );
}
