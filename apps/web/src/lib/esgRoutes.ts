/** Canonical ESG paths — clients → inputs → summary → toolkit. */

export const ESG_ACTIVE_COMPANY_KEY = "okiru-esg-active-company";

export function esgCreateHref(companyId: string): string {
  return `/esg/create/${encodeURIComponent(companyId)}`;
}

export function esgSummaryHref(companyId: string): string {
  return `/esg/create/${encodeURIComponent(companyId)}/summary`;
}

export function esgToolkitHref(companyId?: string): string {
  if (companyId) {
    return `/esg/toolkit/${encodeURIComponent(companyId)}`;
  }
  const stored = getEsgActiveCompany();
  return stored ? `/esg/toolkit/${encodeURIComponent(stored)}` : "/esg/toolkit";
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
