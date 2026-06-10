/** B-BBEE pillars / workbook areas for user feedback tagging. */
export const FEEDBACK_PILLAR_OPTIONS = [
  { value: "", label: "General / App-wide" },
  { value: "company", label: "Company Information" },
  { value: "financial", label: "Financial Information" },
  { value: "accessToFinancialServices", label: "AFS Additions" },
  { value: "ownership", label: "Ownership" },
  { value: "management", label: "Management Control" },
  { value: "employmentEquity", label: "Employment Equity" },
  { value: "skills", label: "Skills Development" },
  { value: "procurement", label: "Procurement" },
  { value: "supplierDevelopment", label: "Enterprise & Supplier Development" },
  { value: "sed", label: "Socio-Economic Development" },
] as const;

export type FeedbackPillar = (typeof FEEDBACK_PILLAR_OPTIONS)[number]["value"];

const VALID_PILLARS = new Set(FEEDBACK_PILLAR_OPTIONS.map((p) => p.value));

export function normalizeFeedbackPillar(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || !VALID_PILLARS.has(value as FeedbackPillar)) return null;
  return value;
}

/** Infer pillar from URL path and optional active workbook section (sessionStorage). */
export function inferFeedbackPillar(pathname: string): string {
  const section =
    typeof window !== "undefined"
      ? sessionStorage.getItem("okiru-workbook-active-section")
      : null;

  if (section) {
    switch (section) {
      case "company-information":
        return "company";
      case "financial-information":
        return "financial";
      case "afs-additions":
        return "accessToFinancialServices";
      case "ownership":
        return "ownership";
      case "management-control":
        return "management";
      case "employees":
        return "employmentEquity";
      case "skills-development":
        return "skills";
      case "procurement":
      case "suppliers":
        return "procurement";
      case "esd":
        return "supplierDevelopment";
      case "sed":
        return "sed";
      default:
        break;
    }
  }

  const path = pathname.toLowerCase();
  if (path.includes("/certificates")) return "procurement";
  if (path.includes("/create-scorecard") || path.includes("/information-request")) return "";
  return "";
}

export function feedbackPillarLabel(value: string | null | undefined): string {
  if (!value) return "General";
  return FEEDBACK_PILLAR_OPTIONS.find((p) => p.value === value)?.label ?? value;
}
