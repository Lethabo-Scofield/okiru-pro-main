/**
 * How the agent loop runs (Step 3, second round), from the comparison's
 * findings on a real pack:
 *
 *  1. The target comes from the classifier's FINAL type, not the first spec
 *     the first pass happened to read (a proof of payment read as an ESD
 *     invoice, a share register and a share certificate read as each other, a
 *     beneficial-interest register read as a share register).
 *  2. Long scans: a page index before the first turn, more turns for more
 *     pages, and a forced submit_values turn (last turn, token cap, or two idle
 *     turns) so values already found are kept.
 *  3. Value checks: a count is a bare number; tick boxes read as yes/no.
 *  4. Rows: cited rows of a skill's rows field, capped, merged only when the
 *     first pass read none.
 *
 * Stub models only; every name, number and amount here is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentCasePass,
  agentPassForDocument,
  agentTargetFor,
  checkValue,
  chooseAgentTarget,
  firstPassHasRows,
  flagFromMarks,
  inferType,
  isBareMark,
  mergeAgentValues,
  pageIndex,
  agentDocumentFrom,
  PAGE_INDEX_CALL_ID,
  runAgentExtraction,
  turnBudget,
  typeTargetAliases,
  validateRow,
  validateSubmission,
  valueBesideLabel,
  DEFAULT_AGENT_LIMITS,
  type AgentRunResult,
  type AgentTarget,
} from '../../src/services/agentExtraction.js';
import type { AgentCallOptions, AgentMessage, AgentTool, AgentToolCall, AgentTurn } from '../../src/services/agentModel.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import { validateSaId } from '../../parser/checksums.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => resetExtractionCache());

const ESD_INVOICE = 'esd__invoice_and_proof_of_payment_showing_payment_within_15_days_';
const SED_PROOF = 'sed__proof_of_payment_cash_grants_donations_or_monetary_contribut';
const SHARE_REGISTER = 'ownership__securities_share_register';
const SHARE_CERTIFICATE = 'ownership__share_certificates_security_certificates_held_by_each_bee_pa';
const AFS_ESD = 'esd__audited_financial_statements_or_signed_management_accounts_w';
const PAYROLL = 'management_control__payroll_as_at_measurement_date';
const EEA1 = 'management_control__eea1_declaration_by_employee_disabled_employees';
const CIPC = 'ownership__cipc_registration_documents_cor14_1_cor14_3';

const VALID_ID = '8001015009087';
const OTHER_VALID_ID = '8506155001082';

function input(over: Partial<RawExtractionInput> & { filename: string }): RawExtractionInput {
  return { file_id: over.filename, mime_type: 'application/pdf', raw_text: '', tables: [], metadata: {}, ...over };
}

function extraction(documentId: string, sourceFile: string, values: Array<[string, unknown]> = []): DocumentExtraction {
  return {
    documentId,
    documentName: documentId,
    sourceFile,
    values: values.map(([field, value]) => ({ field, value, sourceFile, sourceDocumentId: documentId })),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

function target(id: string): AgentTarget {
  const t = agentTargetFor(id);
  if (!t) throw new Error(`no target for ${id}`);
  return t;
}

let ids = 0;
const call = (name: string, args: Record<string, unknown>): AgentToolCall => ({
  id: `c${++ids}`, type: 'function', function: { name, arguments: JSON.stringify(args) },
});

interface Seen { messages: AgentMessage[]; tools: AgentTool[]; options?: AgentCallOptions }

/** A stub that answers each turn from a function of the turn number and the options it was called with. */
function stub(
  play: (n: number, options: AgentCallOptions | undefined, messages: AgentMessage[]) => AgentToolCall[],
  usage?: number,
): ExtractionModel & { seen: Seen[] } {
  const seen: Seen[] = [];
  let n = 0;
  return {
    name: 'stub',
    seen,
    async complete() { return '{}'; },
    async completeWithTools(messages, tools, options): Promise<AgentTurn> {
      seen.push({ messages: structuredClone(messages), tools: structuredClone(tools), options });
      const calls = play(n, options, messages);
      n += 1;
      return {
        message: { role: 'assistant', content: null, tool_calls: calls },
        ...(usage ? { usage: { prompt_tokens: usage - 100, completion_tokens: 100, total_tokens: usage } } : {}),
      };
    },
  };
}

const isForced = (options?: AgentCallOptions) => typeof options?.toolChoice === 'object' && options.toolChoice.function.name === 'submit_values';

// ─── 1. The target comes from the classifier's final type ───────────────────

describe('target from the final type', () => {
  const proof = input({
    filename: 'donation-proof.pdf',
    markdown: '## Page 1\n\nPROOF OF PAYMENT\nPaid by: Acme Trading (Pty) Ltd\nBeneficiary: Depot A Learning Trust\nAmount: R12 500,00\nDate: 3 March 2025',
  });

  it('a proof of payment typed by the classifier is read as that type, not as the ESD invoice the first pass tried first', () => {
    const results = [extraction(ESD_INVOICE, proof.filename)];
    const choice = chooseAgentTarget(results, {
      filename: proof.filename,
      document_type: 'Proof of payment — cash grants, donations, or monetary contributions',
    }, proof);
    expect(choice).toMatchObject({ source: 'classifier', overrode: ESD_INVOICE });
    expect(choice!.target.specId).toBe(SED_PROOF);
  });

  it('a share register and a share certificate are read as what the classifier says, not as each other', () => {
    const register = chooseAgentTarget([extraction(SHARE_CERTIFICATE, 'register.pdf')], { filename: 'register.pdf', document_type: 'Securities / share register' });
    expect(register!.target.skillId).toBe('share_register');
    expect(register!.overrode).toBe(SHARE_CERTIFICATE);

    const certificate = chooseAgentTarget([extraction(SHARE_REGISTER, 'cert.pdf')], {
      filename: 'cert.pdf',
      document_type: 'Share certificates / security certificates held by each BEE participant',
    });
    expect(certificate!.target.skillId).toBe('share_certificate');
  });

  it('a register of beneficial interests typed "Ownership Confirmation" is read with the beneficial-interest skill', () => {
    const bi = input({
      filename: 'acme bi register.pdf',
      markdown: '## Page 1\n\nRegister of Beneficial Interests\nAcme Trading (Pty) Ltd\n| Beneficial Owner | ID Number | % beneficial interest | Nature of interest |\n| J Doe | 8001015009087 | 100% | Direct |',
    });
    const choice = chooseAgentTarget([extraction(SHARE_REGISTER, bi.filename)], { filename: bi.filename, document_type: 'Ownership Confirmation' }, bi);
    expect(choice).toMatchObject({ source: 'classifier_alias', type: 'Ownership Confirmation', overrode: SHARE_REGISTER });
    expect(choice!.target.skillId).toBe('beneficial_interest_register');
  });

  it('an ownership letter typed "Ownership Confirmation" is read with the letter skill that claims the type', () => {
    const letter = input({
      filename: 'acme ownership letter.pdf',
      markdown: '## Page 1\n\nTo whom it may concern\nWe hereby confirm the shareholding of Acme Trading (Pty) Ltd: J Doe holds 100%.\nManagement and control vests in the directors.\nYours faithfully',
    });
    const choice = chooseAgentTarget([extraction(SHARE_REGISTER, letter.filename)], { filename: letter.filename, document_type: 'Ownership Confirmation' }, letter);
    expect(choice).toMatchObject({ source: 'classifier', type: 'Ownership Confirmation', overrode: SHARE_REGISTER });
    expect(choice!.target.skillId).toBe('ownership_representation_letter');
  });

  it('the same type read by another spec of the same skill keeps the first-pass spec, so the agent fills that extraction', () => {
    const choice = chooseAgentTarget([extraction(AFS_ESD, 'afs.pdf')], {
      filename: 'afs.pdf',
      document_type: 'Audited / reviewed annual financial statements (AFS)',
    });
    expect(choice).toMatchObject({ source: 'classifier' });
    expect(choice!.target.specId).toBe(AFS_ESD);
    expect(choice!.overrode).toBeUndefined();

    // A first pass that read the file as two types: the one matching the
    // classifier is filled, and the one the old rule picked is reported.
    const both = chooseAgentTarget(
      [extraction(SHARE_CERTIFICATE, 'register.pdf'), extraction(SHARE_REGISTER, 'register.pdf')],
      { filename: 'register.pdf', document_type: 'Securities / share register' },
    );
    expect(both).toMatchObject({ source: 'classifier', overrode: SHARE_CERTIFICATE });
    expect(both!.target.specId).toBe(SHARE_REGISTER);
  });

  it('a typed document without a target is not re-typed by its words; an untyped one is', () => {
    const affidavit = input({
      filename: 'affidavit.pdf',
      markdown: '## Page 1\n\nB-BBEE Status Level: Level 1\nBlack Ownership 100%\nBlack Women Ownership 51%\nCodes of Good Practice\nContributor',
    });
    const typed = chooseAgentTarget([extraction(CIPC, affidavit.filename)], { filename: affidavit.filename, document_type: 'B-BBEE Sworn Affidavit' }, affidavit);
    expect(typed).toMatchObject({ source: 'first_pass' });
    expect(typed!.target.specId).toBe(CIPC);

    const certificateWords = input({
      filename: 'bee certificate.pdf',
      markdown: '## Page 1\n\nB-BBEE Verification Certificate\nB-BBEE Status Level: Level 2\nProcurement Recognition Level 125%\nSANAS\nDate of Issue: 1 March 2025\nExpiry Date: 28 February 2026',
    });
    const untyped = chooseAgentTarget([extraction(CIPC, certificateWords.filename)], { filename: certificateWords.filename, document_type: 'Unsupported' }, certificateWords);
    expect(untyped).toMatchObject({ source: 'skill_signals', overrode: CIPC });
    expect(untyped!.target.skillId).toBe('bbbee_verification_certificate');
  });

  it('every alias of a canonical type resolves to a target', () => {
    for (const [type, ids] of Object.entries(typeTargetAliases())) {
      for (const id of ids) expect(agentTargetFor(id), `${type} → ${id}`).not.toBeNull();
    }
  });

  it('the plug-in runs the classifier\'s type and records the choice in the agent report', async () => {
    const model = stub(() => [call('submit_values', {
      values: [{ field: 'payer_name', value: 'Acme Trading (Pty) Ltd', page: 1, quote: 'Paid by: Acme Trading (Pty) Ltd' }],
    })]);
    const pass = agentCasePass(model, {
      mode: 'all',
      deterministic: [{ filename: proof.filename, document_type: 'Proof of payment — cash grants, donations, or monetary contributions', status: 'review_required' }],
    })!;
    const out = await agentPassForDocument(model, proof, [extraction(ESD_INVOICE, proof.filename, [['supplier_name', 'Depot A Learning Trust']])], pass);
    const system = String(model.seen[0].messages[0].content);
    expect(system).toContain(target(SED_PROOF).specName);
    const report = out.find((e) => e.agent)?.agent;
    expect(report?.target).toMatchObject({ specId: SED_PROOF, source: 'classifier', overrode: ESD_INVOICE });
    expect(report?.filled).toEqual(['payer_name']);
  });
});

// ─── 2. Long scans ──────────────────────────────────────────────────────────

function longScan(pages: number): RawExtractionInput {
  const body = Array.from({ length: pages }, (_, i) => {
    const lines = [`Page heading ${i + 1}`, 'Notes to the financial statements continue.'];
    if (i === pages - 2) lines.push('Revenue R 1 234 567,89');
    return `## Page ${i + 1}\n\n${lines.join('\n')}`;
  });
  return input({ filename: 'afs-scan.pdf', markdown: body.join('\n\n'), metadata: { scanned: true, text_source: 'document_intelligence' } });
}

/** The AFS target's field printed as "Revenue". */
function revenueFieldName(): string {
  const field = target(AFS_ESD).fields.find((f) => f.labels.some((l) => /^revenue$/i.test(l)));
  if (!field) throw new Error('the AFS target has no field labelled Revenue');
  return field.name;
}

const revenueSubmit = () => call('submit_values', {
  values: [{ field: revenueFieldName(), value: 'R 1 234 567,89', page: 14, quote: 'Revenue R 1 234 567,89' }],
});

describe('long scans', () => {
  it('gives longer documents more turns, within the ceiling', () => {
    const limits = DEFAULT_AGENT_LIMITS;
    expect(turnBudget(1, limits)).toBe(8);
    expect(turnBudget(6, limits)).toBe(8);
    expect(turnBudget(9, limits)).toBe(9);
    expect(turnBudget(12, limits)).toBe(10);
    expect(turnBudget(15, limits)).toBe(11);
    expect(turnBudget(40, limits)).toBe(16);
    expect(turnBudget(40, { maxTurns: 20, maxTurnsCeiling: 16 })).toBe(20);
  });

  it('starts with the page index as a list_pages result: page count, opening lines and where the labels are', async () => {
    const doc = longScan(12);
    const afs = target(AFS_ESD);
    const index = pageIndex(agentDocumentFrom(doc), afs) as { page_count: number; pages: Array<{ opening: string }>; labels_on_pages: Record<string, number[]> };
    expect(index.page_count).toBe(12);
    expect(index.pages[3].opening).toBe('Page heading 4');
    const revenueField = afs.fields.find((f) => f.labels.some((l) => /^revenue$/i.test(l)));
    expect(revenueField).toBeDefined();
    expect(index.labels_on_pages[revenueField!.name]).toEqual([11]);

    const model = stub(() => [call('submit_values', { values: [] })]);
    await runAgentExtraction(model, doc, afs);
    const [system, user, assistant, tool] = model.seen[0].messages;
    expect(system.role).toBe('system');
    expect(user.role).toBe('user');
    expect(assistant).toMatchObject({ role: 'assistant', tool_calls: [{ id: PAGE_INDEX_CALL_ID, function: { name: 'list_pages' } }] });
    expect(tool).toMatchObject({ role: 'tool', tool_call_id: PAGE_INDEX_CALL_ID });
    // Document words reach the model only as a tool result, never in the prompts.
    expect(String(tool.content)).toContain('Page heading 4');
    expect(String(system.content)).not.toContain('Page heading');
    expect(String(user.content)).not.toContain('Page heading');
    expect(String(system.content)).toContain('at most 10 turns');
  });

  it('forces a submit on the last turn, keeping a value the model had found', async () => {
    const doc = longScan(15);
    const model = stub((n, options) => (isForced(options) ? [revenueSubmit()] : [call('get_page_text', { page: (n % 15) + 1 })]));
    const run = await runAgentExtraction(model, doc, target(AFS_ESD));
    expect(run.turnBudget).toBe(11);
    expect(run.turns).toBe(11);
    expect(run.forcedSubmit).toBe('last_turn');
    expect(run.stopReason).toBe('submitted');
    expect(run.values.map((v) => v.field)).toEqual([revenueFieldName()]);
    // Only the last turn was forced.
    expect(model.seen.slice(0, -1).every((s) => s.options?.toolChoice === 'required')).toBe(true);
    expect(model.seen[model.seen.length - 1].options?.toolChoice).toEqual({ type: 'function', function: { name: 'submit_values' } });
    expect(JSON.stringify(model.seen[model.seen.length - 1].messages.at(-1))).toMatch(/LAST turn/);
  });

  it('forces the submit a turn early when the next turn would pass the token cap', async () => {
    const doc = longScan(15);
    const model = stub((n, options) => (isForced(options) ? [revenueSubmit()] : [call('get_page_text', { page: n + 1 })]), 20_000);
    const run = await runAgentExtraction(model, doc, target(AFS_ESD), { limits: { maxTokensPerDoc: 80_000 } });
    expect(run.forcedSubmit).toBe('token_cap');
    expect(run.turns).toBe(3);
    expect(run.tokens).toBeLessThanOrEqual(80_000);
    expect(run.values).toHaveLength(1);
  });

  it('stops early after two turns that read nothing new, with a forced submit', async () => {
    const model = stub((_n, options) => (isForced(options)
      ? [call('submit_values', { values: [] })]
      : [call('get_page_text', { page: 1 })]));
    const run = await runAgentExtraction(model, longScan(12), target(AFS_ESD));
    // Turn 1 reads page 1 (new); turns 2 and 3 read it again; turn 4 must submit.
    expect(run.turns).toBe(4);
    expect(run.forcedSubmit).toBe('no_progress');
    expect(run.stopReason).toBe('submitted');
  });

  it('a forced turn that does not submit ends the run, running nothing else', async () => {
    const model = stub(() => [call('get_page_text', { page: 2 }), call('search_text', { query: 'revenue' })]);
    const run = await runAgentExtraction(model, longScan(3), target(AFS_ESD), { limits: { maxTurns: 2 } });
    expect(run.turns).toBe(2);
    expect(run.stopReason).toBe('max_turns');
    expect(run.forcedSubmit).toBe('last_turn');
    expect(run.toolCalls).toBe(2);
  });

  it('the agent report carries the turn budget and the forced submit', async () => {
    const doc = longScan(9);
    const model = stub((n, options) => (isForced(options) ? [call('submit_values', { values: [] })] : [call('get_page_text', { page: n + 1 })]));
    const pass = agentCasePass(model, { mode: 'all', deterministic: [{ filename: doc.filename, document_type: 'Audited / reviewed annual financial statements (AFS)', status: 'review_required' }] })!;
    const out = await agentPassForDocument(model, doc, [extraction(AFS_ESD, doc.filename, [['entity_name', 'Acme Trading (Pty) Ltd']])], pass);
    expect(out.find((e) => e.agent)?.agent).toMatchObject({ turnBudget: 9, forcedSubmit: 'last_turn' });
  });
});

// ─── 3. Value checks ────────────────────────────────────────────────────────

describe('value checks', () => {
  const payrollDoc = agentDocumentFrom(input({
    filename: 'payroll.pdf',
    markdown: '## Page 1\n\nPAYROLL REPORT\nNumber of employees: 13\nTotal: R 98 765,43',
  }));

  it('a count is a bare number: the labelled line is refused with what to submit', () => {
    const payroll = target(PAYROLL);
    const labelled = validateSubmission({ field: 'employee_count', value: 'Number of employees: 13', page: 1, quote: 'Number of employees: 13' }, payroll, payrollDoc);
    expect(labelled).toMatchObject({ ok: false });
    expect(labelled.ok ? '' : labelled.rejection.reason).toMatch(/bare number.*"13"/);
    expect(validateSubmission({ field: 'employee_count', value: '13', page: 1, quote: 'Number of employees: 13' }, payroll, payrollDoc))
      .toMatchObject({ ok: true, value: { value: '13' } });
    expect(checkValue(payroll, 'employee_count', '1 234').ok).toBe(true);
    expect(checkValue(payroll, 'employee_count', '13 employees').ok).toBe(false);
  });

  it('an amount or percentage keeps its currency and sign, not its label', () => {
    const payroll = target(PAYROLL);
    expect(checkValue(payroll, 'total_gross_pay', 'R 98 765,43').ok).toBe(true);
    expect(checkValue(payroll, 'total_gross_pay', 'ZAR 98,765.43').ok).toBe(true);
    expect(checkValue(payroll, 'total_gross_pay', 'Total: R 98 765,43').ok).toBe(false);
  });

  it('names a spec\'s yes/no fields as flags', () => {
    expect(inferType('eea1_signed')).toBe('bool');
    expect(inferType('ee_act_disability_definition_met')).toBe('bool');
    expect(inferType('date_signed')).toBe('date');
    expect(inferType('cipc_stamp_present')).toBe('bool');
  });

  it('reads a tick box beside an option as yes or no', () => {
    const field = { name: 'disability', labels: ['Disabled'] };
    expect(flagFromMarks(field, '☒', 'Disabled: Yes ☐ No ☒')).toBe(false);
    expect(flagFromMarks(field, '☑', 'Disabled: ☑ Yes ☐ No')).toBe(true);
    expect(flagFromMarks(field, 'X', 'Disabled: Yes X No')).toBe(true);
    expect(flagFromMarks(field, 'X', 'Disabled: Yes No X')).toBe(false);
    expect(flagFromMarks(field, 'Yes ☒', 'anything')).toBe(true);
    expect(flagFromMarks(field, '☒ No', 'anything')).toBe(false);
    expect(flagFromMarks(field, 'Yes ☐ No ☒', 'anything')).toBe(false);
    // A single box ticked right after its label answers yes; a mark with no
    // answer beside the label in its quote cannot be read.
    expect(flagFromMarks(field, '☒', 'Disabled ☒')).toBe(true);
    expect(flagFromMarks(field, '☒', 'Disabled: see the attached report')).toBeUndefined();
    expect(isBareMark('☒')).toBe(true);
    expect(isBareMark('[x]')).toBe(true);
    expect(isBareMark('Yes')).toBe(false);
    expect(valueBesideLabel({ ...field, type: 'bool' }, true, 'Disabled: Yes X No')).toBe(true);
    expect(valueBesideLabel({ ...field, type: 'bool' }, false, 'Disabled: Yes No X')).toBe(true);
  });

  it('a tick mark submitted for a yes/no field becomes the answer it ticks, or is refused with how to fix it', () => {
    const eea1 = target(EEA1);
    const doc = agentDocumentFrom(input({
      filename: 'eea1.pdf',
      markdown: '## Page 1\n\nEEA1 Declaration\nDisability definition met: Yes ☒ No ☐\nSigned: Yes ☒',
    }));
    const ticked = validateSubmission({ field: 'ee_act_disability_definition_met', value: '☒', page: 1, quote: 'Disability definition met: Yes ☒ No ☐' }, eea1, doc);
    expect(ticked).toMatchObject({ ok: true, value: { value: true } });
    const unreadable = validateSubmission({ field: 'ee_act_disability_definition_met', value: '☒', page: 1, quote: 'EEA1 Declaration' }, eea1, doc);
    expect(unreadable.ok ? '' : unreadable.rejection.reason).toMatch(/yes\/no field: submit true or false/);
  });

  it('a first-pass tick mark is replaced by the agent\'s cited answer', () => {
    const eea1 = target(EEA1);
    const first = extraction(EEA1, 'eea1.pdf', [['employee_name', 'J Doe'], ['ee_act_disability_definition_met', '☒']]);
    const run: AgentRunResult = {
      values: [{ field: 'ee_act_disability_definition_met', value: true, page: 1, quote: 'Disability definition met: Yes ☒ No ☐' }],
      rejected: [], turns: 2, tokens: 100, toolCalls: 2, stopReason: 'submitted',
    };
    const merged = mergeAgentValues([first], eea1, 'eea1.pdf', run);
    expect(merged.filled).toEqual(['ee_act_disability_definition_met']);
    const values = merged.extractions[0].values.filter((v) => v.field === 'ee_act_disability_definition_met');
    expect(values.map((v) => v.value)).toEqual([true]);
    expect(merged.extractions[0].exceptions.join('\n')).toMatch(/only a tick mark/);
    expect(first.values[1].value).toBe('☒');
  });
});

// ─── 4. Rows ────────────────────────────────────────────────────────────────

const PAYROLL_TEXT = [
  '## Page 1',
  '',
  'PAYROLL REPORT Acme Trading (Pty) Ltd',
  '| Emp No | Employee | ID Number | Basic Salary |',
  `| E001 | Doe, J | ${VALID_ID} | 12 345,00 |`,
  `| E002 | Roe, A | ${OTHER_VALID_ID} | 9 876,50 |`,
  '| E003 | Moe, B | 8001015009088 | 5 000,00 |',
  'Number of employees: 3',
].join('\n');

const payrollInput = input({ filename: 'payroll.pdf', markdown: PAYROLL_TEXT });

const row = (name: string, id: string | undefined, salary: string, line: string) => ({
  page: 1,
  quote: line,
  cells: { employee_name: name, ...(id ? { id_number: id } : {}), basic_salary: salary },
});

describe('rows', () => {
  it('the payroll target offers its employee rows, without yes/no columns', () => {
    const payroll = target(PAYROLL);
    expect(payroll.rows?.field).toBe('employee_rows');
    expect(payroll.rows?.columns.map((c) => c.name)).toEqual(expect.arrayContaining(['employee_name', 'id_number', 'basic_salary']));
    expect(payroll.rows?.columns.some((c) => c.type === 'bool')).toBe(false);
  });

  it('accepts a cited row and checks every cell like a value', () => {
    expect(validateSaId(VALID_ID).valid).toBe(true);
    expect(validateSaId(OTHER_VALID_ID).valid).toBe(true);
    const payroll = target(PAYROLL);
    const doc = agentDocumentFrom(payrollInput);
    expect(validateRow(row('Doe, J', VALID_ID, '12 345,00', `E001 | Doe, J | ${VALID_ID} | 12 345,00`), payroll, doc))
      .toMatchObject({ ok: true, row: { page: 1, cells: { employee_name: 'Doe, J', id_number: VALID_ID, basic_salary: '12 345,00' } } });

    const reason = (raw: unknown) => {
      const r = validateRow(raw, payroll, doc);
      return r.ok ? 'accepted' : r.rejection.reason;
    };
    // A cell not in the row's quote.
    expect(reason(row('Doe, J', VALID_ID, '99 999,00', `E001 | Doe, J | ${VALID_ID} | 12 345,00`))).toMatch(/does not appear in the row quote/);
    // An ID that fails its check digit.
    expect(reason(row('Moe, B', '8001015009088', '5 000,00', 'E003 | Moe, B | 8001015009088 | 5 000,00'))).toMatch(/id_number fails its check/);
    // A column the rows do not have, a missing required column, a quote not on the page, no citation.
    expect(reason({ page: 1, quote: 'E001 | Doe, J', cells: { employee_name: 'Doe, J', bank_account: '123' } })).toMatch(/not a column/);
    expect(reason({ page: 1, quote: '12 345,00', cells: { basic_salary: '12 345,00' } })).toMatch(/needs employee_name/);
    expect(reason(row('Doe, J', undefined, '12 345,00', 'Doe, J earns 12 345,00'))).toMatch(/does not occur on page 1/);
    expect(reason({ quote: 'E001 | Doe, J', cells: { employee_name: 'Doe, J' } })).toMatch(/no citation/);
  });

  it('a run collects cited rows, once each, up to the per-document cap', async () => {
    const lines = [
      row('Doe, J', VALID_ID, '12 345,00', `E001 | Doe, J | ${VALID_ID} | 12 345,00`),
      row('Roe, A', OTHER_VALID_ID, '9 876,50', `E002 | Roe, A | ${OTHER_VALID_ID} | 9 876,50`),
    ];
    const model = stub(() => [call('submit_values', { values: [], rows: [...lines, lines[0]] })]);
    const run = await runAgentExtraction(model, payrollInput, target(PAYROLL));
    expect(run.stopReason).toBe('submitted');
    expect(run.rows?.map((r) => r.cells.employee_name)).toEqual(['Doe, J', 'Roe, A']);
    // The submit tool offers rows for this target.
    const submit = model.seen[0].tools.find((t) => t.function.name === 'submit_values')!;
    expect(JSON.stringify(submit.function.parameters)).toContain('"rows"');

    const capped = stub(() => [call('submit_values', { values: [], rows: lines })]);
    const short = await runAgentExtraction(capped, payrollInput, target(PAYROLL), { limits: { maxRowsPerDoc: 1 } });
    expect(short.rows).toHaveLength(1);
    expect(short.stopReason).toBe('submitted');
  });

  it('merges rows, each with its citation, only when the first pass read none', () => {
    const payroll = target(PAYROLL);
    const run: AgentRunResult = {
      values: [],
      rows: [
        { cells: { employee_name: 'Doe, J', basic_salary: '12 345,00' }, page: 1, quote: 'E001 | Doe, J | 12 345,00' },
        { cells: { employee_name: 'Roe, A', basic_salary: '9 876,50' }, page: 1, quote: 'E002 | Roe, A | 9 876,50' },
      ],
      rejected: [], turns: 1, tokens: 100, toolCalls: 1, stopReason: 'submitted',
    };
    const merged = mergeAgentValues([extraction(PAYROLL, 'payroll.pdf', [['entity_name', 'Acme Trading (Pty) Ltd']])], payroll, 'payroll.pdf', run);
    expect(merged.rowsFilled).toBe(2);
    const rowsValue = merged.extractions[0].values.find((v) => v.field === 'employee_rows');
    expect(rowsValue?.value).toEqual([
      { employee_name: 'Doe, J', basic_salary: '12 345,00' },
      { employee_name: 'Roe, A', basic_salary: '9 876,50' },
    ]);
    expect(rowsValue?.source?.rows).toEqual([
      { page: 1, quote: 'E001 | Doe, J | 12 345,00' },
      { page: 1, quote: 'E002 | Roe, A | 9 876,50' },
    ]);

    // The first pass's own table, under the rows field or an older name, wins.
    const own = extraction(PAYROLL, 'payroll.pdf', [['employee_rows', [{ employee_name: 'Doe, J' }]]]);
    expect(mergeAgentValues([own], payroll, 'payroll.pdf', run).rowsFilled).toBe(0);
    const older = extraction(PAYROLL, 'payroll.pdf', [['employees', [{ employee_name: 'Doe, J', basic_salary: '1' }]]]);
    expect(firstPassHasRows([older], payroll)).toBe(true);
    expect(mergeAgentValues([older], payroll, 'payroll.pdf', run).rowsFilled).toBe(0);
  });

  it('does not ask for rows the first pass already read, and reports the rows it filled', async () => {
    const hasRows = stub(() => [call('submit_values', { values: [] })]);
    const pass = agentCasePass(hasRows, { mode: 'all' })!;
    await agentPassForDocument(hasRows, payrollInput, [extraction(PAYROLL, payrollInput.filename, [['employee_rows', [{ employee_name: 'Doe, J' }]]])], pass);
    const offered = hasRows.seen[0].tools.find((t) => t.function.name === 'submit_values')!;
    expect(JSON.stringify(offered.function.parameters)).not.toContain('"rows"');

    const line = `E001 | Doe, J | ${VALID_ID} | 12 345,00`;
    const fills = stub(() => [call('submit_values', { values: [], rows: [row('Doe, J', VALID_ID, '12 345,00', line)] })]);
    const out = await agentPassForDocument(fills, payrollInput, [extraction(PAYROLL, payrollInput.filename, [['entity_name', 'Acme Trading (Pty) Ltd']])], agentCasePass(fills, { mode: 'all' })!);
    const home = out.find((e) => e.agent);
    expect(home?.agent).toMatchObject({ rowsFilled: 1, filled: ['employee_rows'] });
    expect(home?.values.find((v) => v.field === 'employee_rows')?.source).toMatchObject({ method: 'agent', page: 1, quote: line });
  });
});
