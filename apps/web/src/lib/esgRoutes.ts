/** Canonical ESG paths — clients → toolkit (no stepper flow). */

export const ESG_ACTIVE_COMPANY_KEY = "okiru-esg-active-company";

export function esgToolkitHref(companyId?: string): string {
  if (companyId) {
    return `/esg/toolkit/${encodeURIComponent(companyId)}`;
  }
  const stored = getEsgActiveCompany();
  return stored ? `/esg/toolkit/${encodeURIComponent(stored)}` : "/esg/toolkit";
}

/** Legacy create/summary URLs → toolkit section. */
export function esgLegacyCreateRedirect(companyId: string, wasSummary?: boolean): string {
  void wasSummary;
  return esgToolkitHref(companyId);
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
