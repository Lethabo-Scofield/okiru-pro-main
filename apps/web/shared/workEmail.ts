const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.co.za",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me",
  "zoho.com", "gmx.com", "gmx.net", "mail.com",
  "fastmail.com", "hey.com", "tutanota.com", "tuta.com",
  "yandex.com", "qq.com", "163.com",
]);

const COUNTRY_SECOND_LEVEL_SUFFIXES = new Set([
  "co.za", "org.za", "net.za", "web.za",
  "co.uk", "org.uk", "me.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "com.br", "com.ng", "co.ke", "co.in", "co.jp",
]);

function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain) ||
    /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|icloud|aol|protonmail|gmx|yandex)\./.test(domain);
}

export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized.slice(normalized.lastIndexOf("@") + 1);
}

export function isWorkEmail(email: string): boolean {
  const domain = emailDomain(email);
  return Boolean(domain && !isPublicEmailDomain(domain));
}

export function companyNameFromWorkEmail(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain || isPublicEmailDomain(domain)) return null;

  const labels = domain.split(".");
  const suffix = labels.slice(-2).join(".");
  const companyLabel = COUNTRY_SECOND_LEVEL_SUFFIXES.has(suffix)
    ? labels.at(-3)
    : labels.at(-2);
  if (!companyLabel) return null;

  return companyLabel
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function usernameFromWorkEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const base = normalized
    .replace("@", ".")
    .replace(/[^a-z0-9_.-]+/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "");

  if (base.length <= 50) return base;

  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  return `${base.slice(0, 49 - suffix.length)}-${suffix}`;
}

export const WORK_EMAIL_REQUIRED_MESSAGE =
  "Use your company email address. Gmail, Outlook, and other public email providers are not accepted.";
