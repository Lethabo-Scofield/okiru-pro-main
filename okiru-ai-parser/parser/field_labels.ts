/**
 * How a field is LABELLED on a page, and what a value read beside a label may
 * look like.
 *
 * WHY: the deterministic extractor reads "the text after the label". On a
 * register or a certificate that text is often not the value: it is the next
 * header cell ("AND SURNAME"), a stray table tag (`</td>`), the next label
 * ("Registration Number"), or the rest of a 300-character line. Every reader
 * that captures text after a label puts the capture through
 * {@link cleanCapture} and {@link isUnusableCapture} before it becomes a field.
 */

/** Longest value a label read may produce. Real labelled values are short. */
export const MAX_CAPTURE_CHARS = 160;

/**
 * Other ways documents print a field's label, keyed by field name. The field
 * name itself ("shareholder_name" → "shareholder name") is always tried first;
 * these are the common printed variants. Generic B-BBEE / CIPC vocabulary only.
 */
const LABEL_SYNONYMS: Record<string, string[]> = {
  entity_name: ['company name', 'enterprise name', 'entity name', 'measured entity name', 'name of company', 'name of entity', 'registered name'],
  supplier_name: ['enterprise name', 'entity name', 'measured entity name', 'supplier name', 'company name', 'registered name'],
  registration_number: ['company registration number', 'registration number', 'registration no', 'reg number', 'reg no', 'company number', 'enterprise number'],
  incorporation_date: ['registration date', 'incorporation date', 'date of incorporation', 'date of registration'],
  registration_date: ['registration date', 'date of registration', 'incorporation date', 'date of incorporation'],
  entity_type: ['entity type', 'enterprise type', 'company type', 'type of entity'],
  registered_address: ['registered address', 'address of registered office', 'registered office', 'registered office address'],
  shareholder_name: ['shareholder name', 'name of shareholder', 'name and surname', 'shareholder', 'full name', 'member name'],
  holder_name: ['holder name', 'registered holder', 'shareholder name', 'name of holder', 'name and surname'],
  number_of_shares: ['number of shares', 'no of shares', 'no of shares issued', 'number of shares issued', 'shares issued', 'shares held'],
  share_class: ['share class', 'class of shares', 'class share', 'class of share', 'class'],
  certificate_number: ['certificate number', 'certificate no', 'cert no', 'share certificate number'],
  percentage: ['percentage', '% shares', '% of shares', 'shareholding %', 'percentage held', 'beneficial interest', '% held'],
  issue_date: ['issue date', 'date issued', 'date of issue'],
  expiry_date: ['expiry date', 'date of expiry', 'valid until', 'expiration date'],
};

/** Normalised label text: lower case, words only ('%' kept, it is a header word). */
export function normalizeLabel(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/b-bbee|bbbee/g, 'bee')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** The labels a field is printed under, most specific first, de-duplicated. */
export function labelsForField(fieldName: string): string[] {
  const own = normalizeLabel(fieldName.replace(/_/g, ' '));
  const all = [own, ...(LABEL_SYNONYMS[fieldName] ?? []).map(normalizeLabel)];
  return Array.from(new Set(all.filter(Boolean)));
}

/** Escape a string for use inside a RegExp source. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A label as a regex source: its words separated by any run of spaces or
 * punctuation ("ID / Reg number" and "ID Reg Number" are the same label), and
 * never part of a longer word ("author" is not inside "Authorised").
 */
export function labelRegexSource(label: string): string {
  const words = normalizeLabel(label).split(' ').filter(Boolean).map(escapeRegex);
  return `(?<![A-Za-z0-9])${words.join('[\\s_/\\-.]+')}(?![A-Za-z0-9])`;
}

/**
 * Words labels are made of. A capture made ONLY of these (with at least one
 * label noun) is the next label, not a value: "Registration Number" read as a
 * company name, "AND SURNAME" read as a shareholder.
 */
const LABEL_NOUNS = new Set([
  'name', 'names', 'surname', 'number', 'id', 'registration', 'date', 'class', 'type', 'status',
  'level', 'address', 'certificate', 'shares', 'share', 'holder', 'shareholder', 'percentage',
  'interest', 'vat', 'tax', 'email', 'contact', 'telephone', 'phone', 'signature', 'expiry',
]);
const LABEL_FILLERS = new Set([
  'and', 'of', 'or', 'the', 'no', 'nr', 'num', 'reg', 'first', 'full', 'company', 'enterprise',
  'entity', 'issue', 'issued', 'cert', 'member', 'members', 'street', 'postal', 'physical',
  'registered', 'beneficial', 'signed', 'by', 'bee', 'b', 'bbbee', 'status', '%', 'cell', 'mobile',
]);

/** Does this text read as a label (or a run of labels) rather than a value? */
export function looksLikeLabel(value: string): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (/:\s*$/.test(text)) return true;
  const tokens = text.toLowerCase().match(/[a-z%]+|\d+/g) ?? [];
  if (tokens.length === 0 || tokens.some((t) => /\d/.test(t))) return false;
  return tokens.every((t) => LABEL_NOUNS.has(t) || LABEL_FILLERS.has(t))
    && tokens.some((t) => LABEL_NOUNS.has(t));
}

/** A table tag or a fragment of one: what an HTML-table text layer leaks. */
function isTagFragment(value: string): boolean {
  return /^<\/?t[hdr]\b/i.test(value) || /<\/t[hdr]>\s*$/i.test(value) || /^<\/?(table|tbody|thead)\b/i.test(value);
}

/**
 * The value part of a capture: cut at the first cell boundary (a pipe between
 * table cells, a tab, an HTML tag, or a workbook row's next "Header: value"
 * pair), without leading separators or a unit note such as "(%):".
 */
export function cleanCapture(raw: string): string {
  let value = String(raw ?? '');
  value = value.split(/\||\t|<[^>]*>/)[0];
  value = value.split(/,\s+(?=[^,:\n]{1,60}:\s)/)[0];
  value = value.replace(/^[\s,:;\-]+/, '');
  value = value.replace(/^\([^)]{0,15}\)\s*:\s*/, '');
  return value.replace(/\s+/g, ' ').trim();
}

/** A capture no field may take: empty, a tag, too long, or another label. */
export function isUnusableCapture(value: string): boolean {
  const text = String(value ?? '').trim();
  return !text
    || isTagFragment(text)
    || text.length > MAX_CAPTURE_CHARS
    || looksLikeLabel(text);
}
