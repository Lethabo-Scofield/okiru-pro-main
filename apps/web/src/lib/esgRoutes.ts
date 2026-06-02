/** Canonical ESG flow paths (mirror B-BBEE create-scorecard pattern). */

export const ESG_ACTIVE_COMPANY_KEY = "okiru-esg-active-company";

export const ESG_FLOW_STEPS = [
  { id: "company", label: "Company" },
  { id: "inputs", label: "Inputs" },
  { id: "summary", label: "Summary" },
] as const;

export type EsgFlowStepId = (typeof ESG_FLOW_STEPS)[number]["id"];

export function esgFlowStepHref(step: EsgFlowStepId, companyId?: string): string {
  switch (step) {
    case "company":
      return "/esg/clients";
    case "inputs":
      return `/esg/create/${encodeURIComponent(companyId ?? "")}`;
    case "summary":
      return `/esg/create/${encodeURIComponent(companyId ?? "")}/summary`;
  }
}

export function setEsgActiveCompany(companyId: string): void {
  try {
    localStorage.setItem(ESG_ACTIVE_COMPANY_KEY, companyId);
  } catch {
    // ignore quota / private mode
  }
}

export function getEsgActiveCompany(): string {
  try {
    return localStorage.getItem(ESG_ACTIVE_COMPANY_KEY) || "";
  } catch {
    return "";
  }
}
