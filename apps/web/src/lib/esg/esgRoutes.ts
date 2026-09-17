/**
 * Canonical ESG paths — start → inputs → summary → toolkit.
 *
 * `/esg` is the START of a new scorecard: the three ways in (documents, Excel,
 * manual), with no company required. It used to redirect to `/esg/clients`,
 * which forced everyone to name a company before they had told us anything —
 * including the people whose documents were about to tell us the name.
 *
 * `/esg/clients` is still here and still reachable: it is how an EXISTING ESG
 * scorecard is reopened. It is no longer the front door.
 */

export const ESG_ACTIVE_COMPANY_KEY = "okiru-esg-active-company";

/** Start a new ESG scorecard — no company needed. */
export const ESG_HOME_PATH = "/esg";

export const ESG_CLIENTS_PATH = "/esg/clients";

export function esgHomeHref(): string {
  return ESG_HOME_PATH;
}

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

/**
 * Has this company already been through an entry choice in this tab?
 *
 * The in-workbook chooser appears for an EMPTY workbook, which is exactly the
 * state a user is in one second after choosing "enter details manually" — and
 * also the state a brand-new company is in when the parser could place nothing.
 * Without this flag both land straight back on the chooser they just finished.
 *
 * Session scoped on purpose: a new tab tomorrow on a still-empty workbook is a
 * fair time to offer the routes in again. Lives here rather than on the page so
 * the `/esg` create flow can set it before it hands the user to the workbook.
 */
const startChoiceKey = (companyId: string) => `okiru-esg-start-chosen-${companyId}`;

export function hasChosenEsgStart(companyId: string): boolean {
  try {
    return sessionStorage.getItem(startChoiceKey(companyId)) === "1";
  } catch {
    return false;
  }
}

export function rememberEsgStartChosen(companyId: string): void {
  try {
    sessionStorage.setItem(startChoiceKey(companyId), "1");
  } catch {
    // private mode / quota — the chooser simply reappears, which is harmless
  }
}
