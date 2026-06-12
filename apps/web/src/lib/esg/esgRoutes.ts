/** Canonical ESG paths — clients → inputs → summary → toolkit. */

export const ESG_ACTIVE_COMPANY_KEY = "okiru-esg-active-company";

export const ESG_CLIENTS_PATH = "/esg/clients";

export function esgClientsHref(): string {
  return ESG_CLIENTS_PATH;
}

/** True when href targets the parent app router (outside nested /esg/toolkit/:id). */
export function isEsgAppPath(path: string): boolean {
  return path.startsWith("/esg/");
}

/** Full-page navigation — escapes nested wouter routers (e.g. toolkit nest). */
export function navigateToAppPath(path: string): void {
  const target = path.startsWith("/") ? path : `/${path}`;
  window.location.assign(target);
}

export function esgCreateHref(companyId: string, section?: string): string {
  const base = `/esg/create/${encodeURIComponent(companyId)}`;
  if (!section) return base;
  return `${base}?section=${encodeURIComponent(section)}`;
}

/** Deep-link to a workbook section in the input layer. */
export function esgCreateSectionHref(companyId: string, section: string): string {
  return esgCreateHref(companyId, section);
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
