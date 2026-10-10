/**
 * TICK BOXES, DECIDED BY THE MARK BESIDE EACH OPTION.
 *
 * A form question answered with boxes ("Foreign national [ ]", "Person with a
 * disability [X]", "Yes [ ] No [X]") has its answer in the marks, and Document
 * Intelligence reports each mark (":selected:" / ":unselected:", or a ☒ / ☐ in
 * the text). The model reading the page sees "☒" and too easily says yes. The
 * EEA1 trap is the commonest: a person writes "N/A" inside the box, the scan
 * reads the box as marked, and the model declares the owner a foreign national
 * with a disability — which removes them from every employment equity count.
 *
 * So the code decides, from the text right after the question's label:
 *
 *  - "Yes ☐ No ☒" (or "☒ Yes ☐ No"): the ticked option, when exactly one is.
 *  - A single box right after the label: ticked is yes, empty is no.
 *  - A box that holds "N/A" (written in it or right beside it) is "not
 *    applicable": no. It never reads as a tick.
 *  - Anything else (no box right after the label, both or neither option
 *    ticked) is undecided, and the model's own reading stands.
 *
 * Only a field with printed labels is a question on the form: a field the
 * skill gives no label (a judgement such as "the Act's definition is met") is
 * never decided from a box.
 *
 * Pure. caseExtraction applies it to every yes/no field a document's skill
 * types, after the reads, and says so whenever it overrules the model.
 */
import type { DocumentExtraction } from './aiExtraction.js';
import type { Skill, SkillField } from './skills.js';

const CHECKED = /[☒☑✓✔✅]/;
const ANY_BOX = '[☒☑✓✔✅☐]';
const ANSWERS: Record<string, boolean> = { yes: true, true: true, no: false, false: false };

/** "N/A", "NA", "n.a.", "not applicable" at the start of a text. */
const NOT_APPLICABLE = /^\s*(?:n\s*\/\s*a|n\.\s*a\.?|na|not\s+applicable)(?![a-z])/i;

/** Does the text right after a ticked box say the box holds "N/A"? */
export function boxHoldsNotApplicable(textAfterMark: string): boolean {
  return NOT_APPLICABLE.test(textAfterMark);
}

/** Document Intelligence's selection marks as box characters; whitespace and markdown folded. */
export function normaliseMarks(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/:unselected:/g, ' ☐ ')
    .replace(/:selected:/g, ' ☒ ')
    .replace(/[|*#`\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface BoxAnswer {
  value: boolean;
  /** What the boxes showed, in words. */
  why: string;
}

/**
 * The answer the boxes right after a label give, or undefined when they do not
 * decide it. `segment` is the (normalised) text that follows the label.
 */
export function boxAnswer(segment: string): BoxAnswer | undefined {
  const text = segment.slice(0, 80);
  // Options with a box each: the ticked one decides, when exactly one is.
  for (const [pattern, wordAt, boxAt] of [
    [new RegExp(String.raw`\b(yes|no|true|false)\b\s*:?\s*(${ANY_BOX})`, 'gi'), 1, 2],
    [new RegExp(String.raw`(${ANY_BOX})\s*(yes|no|true|false)\b`, 'gi'), 2, 1],
  ] as const) {
    const options = [...text.matchAll(pattern)].map((m) => ({
      answer: ANSWERS[m[wordAt].toLowerCase()],
      checked: CHECKED.test(m[boxAt]),
    }));
    if (new Set(options.map((o) => o.answer)).size < 2) continue;
    const ticked = new Set(options.filter((o) => o.checked).map((o) => o.answer));
    if (ticked.size !== 1) return undefined;
    const value = [...ticked][0];
    return { value, why: `the ${value ? 'Yes' : 'No'} box is the one ticked` };
  }
  // A single box right after the label (a footnote star or a colon between).
  const single = text.match(new RegExp(String.raw`^[\s:*?.-]*(${ANY_BOX})(.*)$`));
  if (!single) return undefined;
  if (!CHECKED.test(single[1])) return { value: false, why: 'its box is empty' };
  if (boxHoldsNotApplicable(single[2])) return { value: false, why: 'its box holds "N/A", which is not a tick' };
  return { value: true, why: 'its box is ticked' };
}

/** Words of a field name too generic to find its question by. */
const GENERIC_WORDS = new Set(['number', 'total', 'value', 'amount', 'percentage', 'count', 'status', 'declared', 'signed', 'present']);

/** Where a field's labels end in the text: its printed labels (a plural counts), or else a distinctive word of its name. */
function labelEnds(field: Pick<SkillField, 'name' | 'labels'>, text: string, useNameWords: boolean): Array<{ end: number; label: string }> {
  const labels = useNameWords
    ? field.name.split('_').filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w)).map((w) => [w.replace(/s$/, '')])
    : field.labels.map((label) => label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)).filter((w) => w.length > 0);
  const out: Array<{ end: number; label: string }> = [];
  for (const words of labels) {
    const pattern = new RegExp(String.raw`\b${words.join('[^a-z0-9]+')}(?:s|es)?\b`, 'gi');
    for (const m of text.matchAll(pattern)) out.push({ end: (m.index ?? 0) + m[0].length, label: m[0] });
  }
  return out;
}

export interface BoxDecision {
  value: boolean;
  /** Why, in a sentence a reviewer reads: the label as printed and what its box showed. */
  reason: string;
}

/**
 * A yes/no field decided by the boxes beside its label in a document's text.
 * Its printed labels are looked for first, then a distinctive word of its name
 * (a form words the question its own way: "Foreign Nationals", "Person with a
 * disability"). Every place the label is printed with a box after it must
 * agree; undefined when none decides, they disagree, or the field has no
 * printed label at all.
 */
export function decideFromBoxes(field: Pick<SkillField, 'name' | 'labels'>, documentText: string): BoxDecision | undefined {
  if (field.labels.length === 0) return undefined;
  const text = normaliseMarks(documentText);
  for (const useNameWords of [false, true]) {
    const decisions = labelEnds(field, text, useNameWords)
      .map(({ end, label }) => ({ label, answer: boxAnswer(text.slice(end)) }))
      .filter((d): d is { label: string; answer: BoxAnswer } => d.answer !== undefined);
    if (decisions.length === 0) continue;
    if (new Set(decisions.map((d) => d.answer.value)).size !== 1) return undefined;
    const [first] = decisions;
    return { value: first.answer.value, reason: `beside "${first.label}" ${first.answer.why}` };
  }
  return undefined;
}

function asFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const word = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y'].includes(word)) return true;
  if (['false', 'no', 'n'].includes(word)) return false;
  return undefined;
}

/**
 * Decide every skill-typed yes/no field of every skill-read document from the
 * boxes in its text. A field the model left empty is filled; a field the model
 * read the other way is overruled, with an exception that says what each read.
 * `textOf` returns a source file's text (markdown preferred).
 */
export function applyTickBoxes(
  extractions: DocumentExtraction[],
  textOf: (sourceFile: string) => string | undefined,
  skillFor: (documentId: string) => Skill | null,
): void {
  for (const extraction of extractions) {
    if (extraction.error) continue;
    const skill = skillFor(extraction.documentId);
    const text = textOf(extraction.sourceFile);
    if (!skill || !text) continue;
    for (const field of skill.fields) {
      if (field.type !== 'bool' || field.rowLevel) continue;
      const decision = decideFromBoxes(field, text);
      if (!decision) continue;
      const existing = extraction.values.find((v) => v.field === field.name);
      if (!existing) {
        extraction.values.push({
          field: field.name,
          value: decision.value,
          sourceFile: extraction.sourceFile,
          sourceDocumentId: extraction.documentId,
        });
        extraction.missingFields = extraction.missingFields.filter((name) => name !== field.name);
        continue;
      }
      if (asFlag(existing.value) === decision.value) continue;
      extraction.exceptions.push(
        `${field.name}: read as ${JSON.stringify(existing.value)}, but ${decision.reason}, so it is ${decision.value ? 'yes' : 'no'}.`,
      );
      existing.value = decision.value;
    }
  }
}
