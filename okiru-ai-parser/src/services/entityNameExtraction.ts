/**
 * Fallback: find the MEASURED ENTITY's name on ANY document.
 *
 * The matrix specs only extract entity_name from registration-type documents
 * (CIPC, SETA, share register). A client who uploads only a company profile, a
 * letterhead, or a gathering workbook was left with no name at all. This runs
 * ONLY when the normal resolution produced no entity_name — a pure fallback, so
 * it can never override an authoritative registration name — and reads the name
 * off whatever documents are present, conservatively.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';

const logger = createLogger('EntityNameExtraction');

const SYSTEM_PROMPT = [
  'You identify the MEASURED ENTITY on a B-BBEE document — the company whose own',
  'B-BBEE scorecard is being prepared (the subject of the document).',
  'Return ONLY JSON: {"entity_name": "<legal name>"} or {} if it is not clear.',
  'Rules:',
  '- The measured entity is the SUBJECT: the letterhead / title / "Measured Entity:" line / company-profile header.',
  '- NEVER return a supplier, customer, bank, SETA, auditor, verification agency or any third party named on the page.',
  '- If more than one company appears and the measured one is ambiguous, return {}.',
  '- Copy the legal name verbatim, including (Pty) Ltd / CC / Ltd if shown. No commentary.',
].join('\n');

function parseName(reply: string): string {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return '';
  try {
    const obj = JSON.parse(reply.slice(start, end + 1)) as { entity_name?: unknown };
    const name = String(obj.entity_name ?? '').trim();
    if (!name || /<\/?[a-z]/i.test(name) || name.length < 2) return '';
    return name.slice(0, 120);
  } catch {
    return '';
  }
}

/**
 * Read the measured entity's name from the first document that yields one.
 * Documents are tried in order (the caller passes them measured-entity-first
 * where possible). Returns the name and the file it came from, or null.
 */
export async function extractEntityNameFallback(
  model: ExtractionModel,
  inputs: Array<{ filename: string; markdown?: string; raw_text?: string }>,
): Promise<{ name: string; sourceFile: string } | null> {
  for (const input of inputs) {
    // A document's opening is where the entity names itself (letterhead, title,
    // profile header). Cap the content so this stays one cheap call per file.
    const content = String(input.markdown?.trim() || input.raw_text || '').slice(0, 4000);
    if (content.trim().length < 20) continue;
    let reply: string;
    try {
      reply = await model.complete(SYSTEM_PROMPT, `DOCUMENT: ${input.filename}\n\n${content}`);
    } catch (err) {
      logger.warn('Entity-name fallback call failed', { file: input.filename, reason: (err as Error).message });
      continue;
    }
    const name = parseName(reply);
    if (name) {
      logger.info('Entity name resolved by fallback', { file: input.filename, name });
      return { name, sourceFile: input.filename };
    }
  }
  return null;
}
