/**
 * The only links a previewed document may carry: web pages and e-mail
 * addresses. `javascript:`, `data:`, `vbscript:`, `file:` and relative links
 * (which would resolve against this app) are dropped, and the link text stays
 * as plain text.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // Browsers ignore tabs, newlines and leading control characters inside a
  // scheme ("java\tscript:"), so strip them before deciding.
  // eslint-disable-next-line no-control-regex
  const href = raw.replace(/[\u0000- \u007f-\u009f]+/g, "");
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return undefined;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
