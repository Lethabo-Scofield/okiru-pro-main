export function slugify(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Canonical public slug — must match apps/api `buildCertSlug(companyName, id)`.
 */
export function makeCertificateSlug(
  companyName: string | null | undefined,
  certificateId: string | null | undefined,
): string {
  if (!certificateId) return "";
  const company = slugify(companyName) || "company";
  const idPart = slugify(certificateId) || "certificate";
  return `${company}-${idPart}`;
}

export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeXml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
