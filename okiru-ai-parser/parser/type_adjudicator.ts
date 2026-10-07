/**
 * The seam between the deterministic classifier and a model that can READ.
 *
 * `classify_document.ts` scores document types lexically — filename tokens,
 * aliases, field-name overlap in the first 1200 characters. That is fast,
 * free and deterministic, and it is also why a SETA registration certificate
 * scored 0.19 as its own (correct) type, why an EEA1 declaration scored 0.11,
 * and why a Memorandum of Incorporation and an Ownership Confirmation looked
 * "too close to call": they share WORDS, not meaning. Under the old gate every
 * one of those documents was thrown away unread.
 *
 * An adjudicator is asked when the lexical classifier cannot decide (low
 * confidence or a close call), or when its pick rests only on a label (an
 * alias or the filename). It receives a SHORTLIST (the lexical top 5 plus the
 * specs content retrieval ranks highest): a closed set, never a free-text
 * guess, with what each candidate type is FOR. It answers with one name and a
 * calibrated confidence. Code
 * still decides what is extracted and what scores; the model only decides
 * what the document IS, which is the one question it is better at.
 *
 * The parser layer defines the contract; `src/services` implements it with the
 * configured model. Absent (tests, no model configured) the lexical decision
 * stands and extraction proceeds under it anyway — doubt is a review flag,
 * never a reason to discard evidence.
 */

/**
 * The longest candidate menu an adjudicator is shown: the lexical top 5 plus
 * what content retrieval adds behind them (ParserService builds it). Long
 * enough that the right type is on it when keyword overlap ranked it low;
 * short enough that each candidate's purpose text still fits the prompt.
 */
export const ADJUDICATION_MENU = 10;

/**
 * Below this many characters of text there is nothing for a reader to read:
 * the adjudicator declines, and the lexical classifier lets the filename carry
 * full weight because it is the only evidence there is.
 */
export const MIN_READABLE_CHARS = 20;

export interface AdjudicationCandidate {
  /** The ontology document-type name, verbatim. */
  name: string;
  pillar: string;
  /** The lexical classifier's score — a prior, shown to the model as such. */
  lexicalConfidence: number;
  /** What this document type is for — the auditor's test, or the ontology description. */
  description: string;
  /** Fields the type is expected to carry; the layout a reader would recognise. */
  expectedFields: string[];
}

export interface AdjudicationInput {
  filename: string;
  raw_text: string;
  markdown?: string;
}

export interface TypeAdjudication {
  /** One of the candidate names, verbatim. */
  documentType: string;
  /** 0..1, the model's own calibrated confidence. */
  confidence: number;
  /** One sentence naming the deciding feature, shown in the audit trail. */
  reason: string;
}

/** Returns null when it cannot say (no model, call failed, "none of these", not confident). */
export type DocumentTypeAdjudicator = (
  input: AdjudicationInput,
  candidates: AdjudicationCandidate[],
) => Promise<TypeAdjudication | null>;
