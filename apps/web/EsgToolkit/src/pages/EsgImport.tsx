import { Upload } from "lucide-react";
import { EsgAppLink } from "@/components/EsgAppLink";
import { esgClientsHref, esgCreateHref } from "@/lib/esgRoutes";
import { useEsgStore } from "../lib/esgStore";

export default function EsgImport() {
  const companyId = useEsgStore((s) => s.companyId);

  return (
    <div className="space-y-5" data-testid="esg-import">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          Data
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">
          Data Import
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          Bulk XLSX upload and workbook seeding live in the input layer. Use toolkit pages for
          targeted adjustments after import.
        </p>
      </header>

      <div className="esg-glass p-6 flex flex-col sm:flex-row items-start gap-4">
        <div className="p-3 rounded-xl bg-[rgba(74,168,255,0.08)] border border-[rgba(74,168,255,0.2)]">
          <Upload className="h-6 w-6 text-[var(--esg-acc-blue,#4aa8ff)]" />
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-[13px] text-[var(--esg-text2)]">
            Upload the Okiru ESG workbook (.xlsx) or continue in the guided input flow. Changes sync
            back to this toolkit automatically.
          </p>
          {companyId ? (
            <EsgAppLink
              href={esgCreateHref(companyId)}
              className="inline-flex text-[12px] px-4 py-2 rounded-lg bg-[var(--esg-acc-blue,#4aa8ff)] text-[#080e14] font-semibold"
              data-testid="esg-import-open-create"
            >
              Open input layer →
            </EsgAppLink>
          ) : (
            <EsgAppLink
              href={esgClientsHref()}
              className="inline-flex text-[12px] px-4 py-2 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)]"
            >
              Select a company
            </EsgAppLink>
          )}
        </div>
      </div>
    </div>
  );

}
