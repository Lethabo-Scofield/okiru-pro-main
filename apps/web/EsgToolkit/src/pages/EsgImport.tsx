import { Download, FileSpreadsheet, FileText, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { API_BASE } from "@toolkit/lib/config";
import { EsgAppLink } from "@/components/EsgAppLink";
import { EsgTemplateMenu } from "@/components/esg-workbook/EsgTemplateMenu";
import { esgClientsHref, esgCreateHref } from "@/lib/esgRoutes";
import { useEsgStore } from "../lib/esgStore";

/**
 * Data Import — the upload hub.
 *
 * Every way data gets into a company's ESG workbook, from one page: documents
 * the reader works through (bills, fuel reports, registers), the Okiru
 * workbook filled in as Excel, and the template to fill. It used to be a
 * paragraph pointing somewhere else and one link onward.
 */
function HubCard({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="esg-glass p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)]">{icon}</div>
        <h2 className="text-[14px] font-semibold text-[var(--esg-text)]">{title}</h2>
      </div>
      <p className="text-[12px] leading-5 text-[var(--esg-text2)] flex-1">{body}</p>
      <div>{action}</div>
    </div>
  );
}

const PRIMARY = "inline-flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-lg bg-[var(--esg-acc-blue,#22c55e)] text-[#080e14] font-semibold";
const SECONDARY = "inline-flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]";

export default function EsgImport() {
  const companyId = useEsgStore((s) => s.companyId);
  const start = companyId ? `${esgCreateHref(companyId)}/start` : "";

  return (
    <div className="space-y-5" data-testid="esg-import">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">Data</p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">Data Import</h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          Bring this company&apos;s data in: documents to be read, or the Okiru workbook filled in. What is already
          captured stays — an upload adds to it and shows you anything it would change first.
        </p>
      </header>

      {companyId ? (
        <div className="grid gap-4 md:grid-cols-3" data-testid="esg-import-hub">
          <HubCard
            icon={<FileText className="h-5 w-5 text-[var(--esg-acc-blue,#22c55e)]" />}
            title="Add documents"
            body="Utility bills, fuel reports, fleet lists, registers and policies. They are read and each figure goes to its place; you see the token cost before anything is read, and anything that needs your answer is asked."
            action={
              <EsgAppLink href={`${start}?with=documents`} className={PRIMARY} data-testid="esg-import-documents">
                <Upload className="h-3.5 w-3.5" /> Add documents
              </EsgAppLink>
            }
          />
          <HubCard
            icon={<FileSpreadsheet className="h-5 w-5 text-[var(--esg-acc-blue,#22c55e)]" />}
            title="Import a workbook"
            body="The Okiru ESG workbook filled in as Excel. You see what it adds, what it would change and, for each register, whether to update it or replace it — before anything is saved."
            action={
              <EsgAppLink href={start} className={SECONDARY} data-testid="esg-import-workbook">
                <Upload className="h-3.5 w-3.5" /> Import a workbook
              </EsgAppLink>
            }
          />
          <HubCard
            icon={<Download className="h-5 w-5 text-[var(--esg-acc-blue,#22c55e)]" />}
            title="Templates"
            body="A blank template to fill in — the whole workbook, one pillar, or just the sheet a colleague owns — or this company's workbook as it stands, to correct offline and import back."
            action={
              <div className="flex flex-wrap gap-2">
                <EsgTemplateMenu className={SECONDARY} label="Blank template" align="left" testId="esg-import-template" />
                <a
                  href={`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/export`}
                  className={SECONDARY}
                  data-testid="esg-import-export"
                >
                  <Download className="h-3.5 w-3.5" /> This workbook
                </a>
              </div>
            }
          />
        </div>
      ) : (
        <div className="esg-glass p-6">
          <p className="text-[13px] text-[var(--esg-text2)] mb-3">Choose the company to bring data in for.</p>
          <EsgAppLink href={esgClientsHref()} className={SECONDARY}>
            Select a company
          </EsgAppLink>
        </div>
      )}
    </div>
  );
}
