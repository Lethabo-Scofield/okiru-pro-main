/**
 * The fourteen claim-vs-evidence checks. Each reads the claims (workbook
 * sections) and the evidence (document reads), and returns checks with the
 * overlay operations their rule decides — see ./types.ts for the rules.
 * Pure: no I/O, no clock, no randomness.
 */
import {
  amountOf, bandRank, blank, cite, dateOf, daysApart, docKind, genderOf, inPeriod, isBlack,
  percentOf, rankOf, rowsOf, saId, sameIdNumber, sameName, str, valueOf, yes,
  type DocKind,
} from './evidence.js';
import type {
  CheckKind, CheckRule, CheckStatus, EvidenceCitation, EvidenceRead, MeasurementPeriod,
  NeedsYouChoice, OverlayOp, VerificationCheck, VerificationRow, VerificationSections,
} from './types.js';

export interface CheckContext {
  sections: VerificationSections;
  evidence: EvidenceRead[];
  period: MeasurementPeriod | null;
  byKind: Map<DocKind, EvidenceRead[]>;
}

export function buildContext(sections: VerificationSections, evidence: EvidenceRead[], period: MeasurementPeriod | null): CheckContext {
  const byKind = new Map<DocKind, EvidenceRead[]>();
  for (const read of evidence) {
    const kind = docKind(read);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(read);
  }
  return { sections, evidence, period, byKind };
}

const reads = (ctx: CheckContext, ...kinds: DocKind[]): EvidenceRead[] => kinds.flatMap((k) => ctx.byKind.get(k) ?? []);
const rowsIn = (ctx: CheckContext, section: string): VerificationRow[] => ctx.sections[section]?.rows ?? [];
const idOf = (row: VerificationRow): string => str(row._id);
const docsOf = (row: VerificationRow): string[] => (Array.isArray(row._sourceFiles) ? row._sourceFiles.map(String) : []);
const money = (n: number): string => `R${Math.round(n).toLocaleString('en-ZA')}`;

function check(
  kind: CheckKind,
  key: string,
  fields: {
    section: string;
    rowId?: string;
    subject: string;
    status: CheckStatus;
    rule: CheckRule;
    claim: VerificationCheck['claim'];
    evidence?: EvidenceCitation[];
    tolerance?: string;
    statement: string;
    ops?: OverlayOp[];
    choices?: NeedsYouChoice[];
  },
): VerificationCheck {
  return { id: `${kind}:${key}`, kind, evidence: [], ops: [], ...fields };
}

const exclude = (section: string, rowId: string): OverlayOp => ({ kind: 'exclude', basis: 'evidenced', section, rowId });
const notBlack = (section: string, rowId: string): OverlayOp => ({ kind: 'notBlack', basis: 'evidenced', section, rowId });
const setCell = (basis: OverlayOp['basis'], section: string, rowId: string, column: string, value: unknown): OverlayOp =>
  ({ kind: 'set', basis, section, rowId, column, value });
const setMeta = (basis: OverlayOp['basis'], section: string, metaKey: string, value: unknown): OverlayOp =>
  ({ kind: 'set', basis, section, metaKey, value });

function personName(row: VerificationRow): string {
  return [str(row.name ?? row.shareholderName ?? row.learnerName), str(row.surname)].filter(Boolean).join(' ');
}

/** The rows a person-keyed table states for this row: same ID number, else same name. */
function findPerson<T extends Record<string, unknown>>(
  row: VerificationRow, rows: T[], nameField: string, idField = 'id_number',
): T | undefined {
  const id = row.idNumber;
  if (!blank(id)) {
    const byId = rows.find((r) => sameIdNumber(r[idField], id));
    if (byId) return byId;
  }
  const name = personName(row);
  return rows.find((r) => sameName(r[nameField], name));
}

// ── 1. Holdings vs share register / certificates / CIPC / BI register ──────
export function checkHoldings(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  type Source = { read: EvidenceRead; field: string; name: string; id?: unknown; pct: number | null; shares: number | null };
  const sources: Source[] = [];
  for (const read of reads(ctx, 'shareRegister')) {
    for (const r of rowsOf(read, 'holdings_table')) {
      sources.push({ read, field: 'holdings_table', name: str(r.shareholder_name), id: r.id_number, pct: percentOf(r.percentage), shares: amountOf(r.number_of_shares) });
    }
  }
  for (const read of reads(ctx, 'shareCertificate')) {
    sources.push({ read, field: 'percentage', name: str(valueOf(read, 'holder_name')), id: valueOf(read, 'id_number'), pct: percentOf(valueOf(read, 'percentage')), shares: amountOf(valueOf(read, 'number_of_shares')) });
  }
  for (const read of reads(ctx, 'cipc')) {
    for (const r of rowsOf(read, 'director_rows')) {
      const pct = percentOf(r.member_interest_percentage);
      if (pct !== null) sources.push({ read, field: 'director_rows.member_interest_percentage', name: str(r.full_name), id: r.id_number, pct, shares: null });
    }
  }
  for (const read of reads(ctx, 'biRegister')) {
    for (const r of rowsOf(read, 'beneficial_owner_rows')) {
      sources.push({ read, field: 'beneficial_owner_rows.beneficial_interest_percentage', name: str(r.beneficial_owner_name), id: r.id_number, pct: percentOf(r.beneficial_interest_percentage), shares: null });
    }
  }
  for (const read of reads(ctx, 'representationLetter')) {
    for (const r of rowsOf(read, 'stated_owner_rows')) {
      sources.push({ read, field: 'stated_owner_rows.stated_percentage', name: str(r.stated_owner_name), id: r.id_number, pct: percentOf(r.stated_percentage), shares: null });
    }
  }

  for (const row of rowsIn(ctx, 'ownership')) {
    const rowId = idOf(row);
    if (!rowId) continue;
    const subject = personName(row) || 'shareholder';
    const column = ['shareholding', 'economicInterest', 'votingRights'].find((c) => percentOf(row[c]) !== null);
    const claimed = column ? percentOf(row[column]) : null;
    const mine = sources.filter((s) => (!blank(row.idNumber) && sameIdNumber(s.id, row.idNumber)) || sameName(s.name, subject));
    const evidence = mine.map((s) => cite(s.read, s.field, s.pct ?? s.shares));
    if (mine.length === 0) {
      const removable = earnsByPresence(row);
      out.push(check('ownership.holding', rowId, {
        section: 'ownership', rowId, subject, status: removable ? 'unproven' : 'flag', rule: removable ? 'excluded-from-evidenced' : 'flag-only',
        claim: { column, value: row[column ?? 'shareholding'], documents: docsOf(row) },
        statement: `No share register, share certificate, CIPC record or beneficial-interest register states ${subject}'s holding.`,
        ops: removable ? [notBlack('ownership', rowId)] : [],
      }));
      continue;
    }
    const disagreeing = mine.filter((s) => claimed !== null && s.pct !== null && Math.abs(s.pct - claimed) > 0.5);
    const sharesClaimed = amountOf(row.numberOfShares);
    const sharesWrong = mine.filter((s) => sharesClaimed !== null && s.shares !== null && s.shares !== sharesClaimed);
    if (disagreeing.length === 0 && sharesWrong.length === 0) {
      out.push(check('ownership.holding', rowId, {
        section: 'ownership', rowId, subject, status: 'pass', rule: 'none', tolerance: '0.5 percentage point; share counts exact',
        claim: { column, value: claimed, documents: docsOf(row) }, evidence,
        statement: `${subject}'s holding agrees with ${mine.length} record${mine.length === 1 ? '' : 's'}.`,
      }));
      continue;
    }
    const top = [...disagreeing, ...sharesWrong].sort((a, b) => rankOf(docKind(b.read)) - rankOf(docKind(a.read)))[0];
    const topRank = rankOf(docKind(top.read));
    const ops: OverlayOp[] = [];
    let rule: CheckRule = 'flag-only';
    if (topRank >= 3) {
      rule = topRank === 4 ? 'replaced-statutory' : 'replaced-certificate';
      if (column && top.pct !== null && disagreeing.includes(top)) ops.push(setCell('both', 'ownership', rowId, column, top.pct));
      if (top.shares !== null && sharesWrong.includes(top)) ops.push(setCell('both', 'ownership', rowId, 'numberOfShares', top.shares));
    }
    out.push(check('ownership.holding', rowId, {
      section: 'ownership', rowId, subject, status: 'flag', rule, tolerance: '0.5 percentage point; share counts exact',
      claim: { column, value: claimed, documents: docsOf(row) }, evidence,
      statement: rule === 'flag-only'
        ? `${subject}'s holding (${claimed ?? '?'}%) disagrees with a signed declaration (${top.pct ?? top.shares}). Check it against the share register.`
        : `${subject}'s holding was ${claimed ?? '?'}%${sharesClaimed !== null ? ` (${sharesClaimed} shares)` : ''}; the ${docKind(top.read) === 'shareCertificate' ? 'share certificate' : 'statutory record'} states ${top.pct ?? '?'}%${top.shares !== null ? ` (${top.shares} shares)` : ''}. Its figure is used.`,
      ops,
    }));
  }
  return out;
}

// ── 2. Race and gender vs EEA1 / affidavit, and gender vs the SA ID number ──
export function checkDemographics(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const eea1 = reads(ctx, 'eea1');
  for (const section of ['ownership', 'management-control', 'employees']) {
    for (const row of rowsIn(ctx, section)) {
      const rowId = idOf(row);
      if (!rowId) continue;
      const subject = personName(row) || 'person';
      const claimedGender = genderOf(row.gender);
      const id = saId(row.idNumber);
      const ops: OverlayOp[] = [];
      const evidence: EvidenceCitation[] = [];
      const problems: string[] = [];
      let rule: CheckRule = 'none';
      let status: CheckStatus = 'pass';

      if (id && claimedGender && id.gender !== claimedGender) {
        problems.push(`the ID number is a ${id.gender.toLowerCase()} number but the register says ${claimedGender.toLowerCase()}`);
        ops.push(setCell('both', section, rowId, 'gender', id.gender));
        evidence.push({ document: 'SA ID number on the register', reader: 'id-number', field: 'idNumber', value: `${id.gender} (digits 7-10)`, rank: 4 });
        rule = 'replaced-statutory';
        status = 'flag';
      }

      const declaration = eea1.find((read) => sameName(valueOf(read, 'employee_name'), subject));
      let choices: NeedsYouChoice[] | undefined;
      if (declaration) {
        const declaredBlack = isBlack(valueOf(declaration, 'race'));
        const declaredGender = genderOf(valueOf(declaration, 'gender'));
        const claimedBlack = isBlack(row.race);
        evidence.push(cite(declaration, 'race', valueOf(declaration, 'race')), cite(declaration, 'gender', valueOf(declaration, 'gender')));
        // Only a disagreement that moves points: black or not, and gender.
        const raceDiffers = declaredBlack !== null && claimedBlack !== null && declaredBlack !== claimedBlack;
        const genderDiffers = rule !== 'replaced-statutory' && declaredGender !== null && claimedGender !== null && declaredGender !== claimedGender;
        if (raceDiffers || genderDiffers) {
          // Two client documents disagree: the one that claims less is held.
          const column = raceDiffers ? 'race' : 'gender';
          const declared = raceDiffers ? valueOf(declaration, 'race') : declaredGender;
          const claimedLess = raceDiffers ? (claimedBlack ? declared : row.race) : (claimedGender === 'Female' ? declared : row.gender);
          const other = claimedLess === row[column] ? declared : row[column];
          choices = [
            { value: claimedLess, sources: claimedLess === row[column] ? docsOf(row) : [declaration.sourceFile], held: true, ops: [setCell('alternative', section, rowId, column, claimedLess)] },
            { value: other, sources: other === row[column] ? docsOf(row) : [declaration.sourceFile], held: false, ops: [setCell('alternative', section, rowId, column, other)] },
          ];
          if (claimedLess !== row[column]) ops.push(setCell('both', section, rowId, column, claimedLess));
          problems.push(`the register says ${str(row[column])} but the EEA1 declaration says ${str(declared)}`);
          rule = 'lower-until-answered';
          status = 'needs-you';
        }
      }
      if (!id && !declaration) continue; // nothing to check this person against
      out.push(check('people.demographics', `${section}:${rowId}`, {
        section, rowId, subject, status, rule, tolerance: 'exact',
        claim: { column: 'race/gender', value: `${str(row.race)} ${str(row.gender)}`.trim(), documents: docsOf(row) },
        evidence,
        statement: problems.length === 0
          ? `${subject}'s race and gender agree with ${declaration ? 'the EEA1 declaration' : 'the ID number'}.`
          : `${subject}: ${problems.join('; ')}.`,
        ops, choices,
      }));
    }
  }
  return out;
}

// ── 3. Outstanding acquisition debt vs the AFS ─────────────────────────────
const AFS_LOAN_FIELDS = ['shareholder_loans', 'loans_from_shareholders', 'acquisition_debt', 'black_participant_acquisition_debt', 'vendor_finance'];
export function checkAcquisitionDebt(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const afs = reads(ctx, 'afs');
  const loan = afs
    .flatMap((read) => AFS_LOAN_FIELDS.map((f) => ({ read, field: f, amount: amountOf(valueOf(read, f)) })))
    .find((l) => l.amount !== null);
  for (const row of rowsIn(ctx, 'ownership')) {
    const rowId = idOf(row);
    if (!rowId || blank(row.rowOutstandingDebt)) continue;
    const stated = amountOf(row.rowOutstandingDebt);
    if (stated === null) continue;
    const subject = personName(row) || 'shareholder';
    if (!loan) {
      out.push(check('ownership.acquisitionDebt', rowId, {
        section: 'ownership', rowId, subject, status: 'unproven', rule: 'excluded-from-evidenced', tolerance: 'R0',
        claim: { column: 'rowOutstandingDebt', value: stated, documents: docsOf(row) },
        statement: `The register states ${subject}'s outstanding acquisition debt as ${money(stated)}, but no financial statements we read state the loans. Ownership fulfilment and net value rest on it.`,
        ops: [setCell('evidenced', 'ownership', rowId, 'rowOutstandingDebt', null)],
      }));
      continue;
    }
    const agrees = loan.amount === stated;
    out.push(check('ownership.acquisitionDebt', rowId, {
      section: 'ownership', rowId, subject, status: agrees ? 'pass' : 'flag', rule: agrees ? 'none' : 'replaced-statutory', tolerance: 'R0',
      claim: { column: 'rowOutstandingDebt', value: stated, documents: docsOf(row) },
      evidence: [cite(loan.read, loan.field, loan.amount)],
      statement: agrees
        ? `${subject}'s outstanding acquisition debt agrees with the financial statements.`
        : `The register states ${money(stated)} of acquisition debt; the financial statements state ${money(loan.amount!)}. The financial statements are used.`,
      ops: agrees ? [] : [setCell('both', 'ownership', rowId, 'rowOutstandingDebt', loan.amount)],
    }));
  }
  return out;
}

// ── 4. Management band across documents ────────────────────────────────────
export function checkManagementBand(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const contracts = reads(ctx, 'contract', 'jobDescription', 'saId', 'payroll');
  for (const section of ['management-control', 'employees']) {
    for (const row of rowsIn(ctx, section)) {
      const rowId = idOf(row);
      if (!rowId) continue;
      const subject = personName(row) || 'employee';
      const conflicts = (row._conflicts ?? {}) as Record<string, Array<{ value: unknown; sources: string[] }>>;
      for (const column of ['occupationalLevel', 'designation']) {
        const candidates = (conflicts[column] ?? []).filter((c) => !blank(c.value));
        if (candidates.length < 2) continue;
        const held = row[column];
        const choices: NeedsYouChoice[] = candidates.map((c) => ({
          value: c.value,
          sources: c.sources,
          held: str(c.value) === str(held),
          ops: [setCell('alternative', section, rowId, column, c.value)],
        }));
        out.push(check('management.band', `${section}:${rowId}:${column}`, {
          section, rowId, subject, status: 'needs-you', rule: 'lower-until-answered',
          claim: { column, value: held, documents: docsOf(row) },
          evidence: candidates.flatMap((c) => c.sources.map((s) => ({ document: s, reader: 'workbook', field: column, value: c.value, rank: 1 as const }))),
          statement: `The documents disagree on ${subject}'s management band (${candidates.map((c) => str(c.value)).join(' / ')}). The lower one is scored until you choose.`,
          choices,
        }));
      }
      // A signed contract, job description or ID copy that names a band.
      const claimedRank = Math.max(bandRank(row.occupationalLevel), bandRank(row.designation));
      if (claimedRank === 0) continue;
      const stated = contracts
        .filter((read) => sameName(valueOf(read, 'employee_name') ?? valueOf(read, 'role_holder') ?? '', subject)
          || (!blank(row.idNumber) && sameIdNumber(valueOf(read, 'id_number'), row.idNumber)))
        .flatMap((read) => ['level_per_contract', 'level_claimed', 'level_claimed_on_scorecard']
          .map((f) => ({ read, field: f, value: valueOf(read, f) }))
          .filter((x) => !blank(x.value)));
      if (stated.length === 0) continue;
      const differing = stated.filter((s) => bandRank(s.value) !== 0 && bandRank(s.value) !== claimedRank);
      out.push(check('management.band', `${section}:${rowId}:documents`, {
        section, rowId, subject, status: differing.length ? 'flag' : 'pass', rule: differing.length ? 'flag-only' : 'none', tolerance: 'same band',
        claim: { column: 'occupationalLevel', value: row.occupationalLevel ?? row.designation, documents: docsOf(row) },
        evidence: stated.map((s) => cite(s.read, s.field, s.value)),
        statement: differing.length
          ? `${subject}'s band on the register differs from ${differing.map((d) => `"${str(d.value)}"`).join(', ')} in a signed document. A band guessed from a job title never outranks a stated level — check which is right.`
          : `${subject}'s band agrees with the signed documents.`,
      }));
    }
  }
  return out;
}

// ── 5. Foreign-national flag vs the ID number's shape ──────────────────────
export function checkForeignNational(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const eea1 = reads(ctx, 'eea1');
  for (const section of ['management-control', 'employees']) {
    for (const row of rowsIn(ctx, section)) {
      const rowId = idOf(row);
      if (!rowId) continue;
      if (isBlack(row.race) !== true) continue; // only a black person's eligibility turns on it
      const subject = personName(row) || 'employee';
      const flaggedForeign = yes(row.isForeign) === true;
      const id = saId(row.idNumber);
      const declaration = eea1.find((read) => sameName(valueOf(read, 'employee_name'), subject));
      const declaredForeign = declaration ? yes(valueOf(declaration, 'is_foreign')) : null;
      const evidence: EvidenceCitation[] = [];
      if (!blank(row.idNumber)) evidence.push({ document: 'ID number on the register', reader: 'id-number', field: 'idNumber', value: id ? (id.citizen ? 'SA citizen ID' : id.permanentResident ? 'permanent-resident ID' : 'SA ID') : 'not an SA ID number', rank: 4 });
      if (declaration) evidence.push(cite(declaration, 'is_foreign', valueOf(declaration, 'is_foreign')));
      let status: CheckStatus = 'pass';
      let rule: CheckRule = 'none';
      let statement = `${subject} is scored as a South African citizen, and the ID number agrees.`;
      const ops: OverlayOp[] = [];
      if (flaggedForeign) {
        if (id?.citizen) {
          status = 'flag'; rule = 'flag-only';
          statement = `${subject} is marked foreign, but the ID number is a South African citizen's. A citizen by naturalisation after 27 April 1994 is still not a black person under the Codes — confirm the citizenship date.`;
        } else continue;
      } else if (declaredForeign === true) {
        status = 'unproven'; rule = 'excluded-from-evidenced';
        statement = `${subject} is scored as a South African citizen, but the EEA1 declaration says foreign national.`;
        ops.push(notBlack(section, rowId));
      } else if (blank(row.idNumber)) {
        status = 'unproven'; rule = 'excluded-from-evidenced';
        statement = `${subject} is scored as a black South African, but no ID number was read to show citizenship.`;
        ops.push(notBlack(section, rowId));
      } else if (!id) {
        status = 'unproven'; rule = 'excluded-from-evidenced';
        statement = `${subject} is scored as a black South African, but the identity number is not a South African ID number (a passport?).`;
        ops.push(notBlack(section, rowId));
      } else if (id.permanentResident) {
        status = 'flag'; rule = 'excluded-from-evidenced';
        statement = `${subject}'s ID number is a permanent resident's. Only citizenship (or residence) acquired before 27 April 1994 counts — confirm the date.`;
        ops.push(notBlack(section, rowId));
      }
      out.push(check('people.foreignNational', `${section}:${rowId}`, {
        section, rowId, subject, status, rule, tolerance: 'exact',
        claim: { column: 'isForeign', value: row.isForeign ?? 'No', documents: docsOf(row) },
        evidence, statement, ops,
      }));
    }
  }
  return out;
}

/**
 * Whether a person's presence on a register earns points: only a black
 * person's does. Removing anyone else from EVIDENCED would RAISE the black
 * share of the rest, so an unproven non-black person is reported, not removed.
 */
function earnsByPresence(row: VerificationRow): boolean {
  return isBlack(row.race) === true || (typeof row.blackOwnership === 'number' && row.blackOwnership > 0);
}

// ── 6. Employee register vs payroll ────────────────────────────────────────
export function checkPayroll(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const payroll = reads(ctx, 'payroll');
  const people = payroll.flatMap((read) => rowsOf(read, 'employee_rows').map((r) => ({ read, row: r })));
  const section = rowsIn(ctx, 'management-control').length ? 'management-control' : 'employees';
  const register = rowsIn(ctx, section);
  if (register.length === 0) return out;
  if (payroll.length === 0) {
    for (const row of register) {
      const rowId = idOf(row);
      if (!rowId) continue;
      const removable = earnsByPresence(row);
      out.push(check('people.payroll', `${section}:${rowId}`, {
        section, rowId, subject: personName(row) || 'employee', status: removable ? 'unproven' : 'flag', rule: removable ? 'excluded-from-evidenced' : 'flag-only', tolerance: 'names exact',
        claim: { value: personName(row), documents: docsOf(row) },
        statement: `No payroll was read, so ${personName(row) || 'this person'}'s employment in the period is unproven.`,
        ops: removable ? [notBlack(section, rowId)] : [],
      }));
    }
    return out;
  }
  for (const read of payroll) {
    const start = dateOf(valueOf(read, 'period_start'));
    const end = dateOf(valueOf(read, 'period_end'));
    const inside = [inPeriod(start, ctx.period), inPeriod(end, ctx.period)];
    if (inside.includes(false)) {
      out.push(check('people.payroll', `period:${read.documentId}:${read.sourceFile}`, {
        section, subject: 'payroll period', status: 'out-of-period', rule: 'flag-only', tolerance: 'inside the measurement period',
        claim: { value: ctx.period ? `${ctx.period.start} to ${ctx.period.end}` : null },
        evidence: [cite(read, 'period_start', start), cite(read, 'period_end', end)],
        statement: `The payroll covers ${start ?? '?'} to ${end ?? '?'}, outside the measurement period.`,
      }));
    }
  }
  const stated = payroll.map((read) => amountOf(valueOf(read, 'employee_count'))).find((n) => n !== null);
  const payrollCount = people.length || stated || 0;
  if (payrollCount && payrollCount !== register.length) {
    out.push(check('people.payroll', 'headcount', {
      section, subject: 'headcount', status: 'flag', rule: 'flag-only', tolerance: 'exact',
      claim: { value: register.length },
      evidence: payroll.map((read) => cite(read, people.length ? 'employee_rows' : 'employee_count', payrollCount)),
      statement: `The register lists ${register.length} people; the payroll lists ${payrollCount}.`,
    }));
  }
  for (const row of register) {
    const rowId = idOf(row);
    if (!rowId) continue;
    const subject = personName(row) || 'employee';
    const hit = people.find((p) => (!blank(row.idNumber) && sameIdNumber(p.row.id_number, row.idNumber)) || sameName(p.row.employee_name, subject));
    const removable = !hit && earnsByPresence(row);
    out.push(check('people.payroll', `${section}:${rowId}`, {
      section, rowId, subject, status: hit ? 'pass' : removable ? 'unproven' : 'flag', rule: hit ? 'none' : removable ? 'excluded-from-evidenced' : 'flag-only', tolerance: 'names exact',
      claim: { value: subject, documents: docsOf(row) },
      evidence: hit ? [cite(hit.read, 'employee_rows.employee_name', hit.row.employee_name)] : [],
      statement: hit ? `${subject} is on the payroll.` : `${subject} is on the register but not on the payroll we read.`,
      ops: removable ? [notBlack(section, rowId)] : [],
    }));
  }
  return out;
}

// ── 7. Leviable amount vs SDL x 100 over the EMP201 months in the period ───
export function checkLeviable(ctx: CheckContext): VerificationCheck[] {
  const meta = ctx.sections['financial-information']?.meta ?? {};
  const skillsMeta = ctx.sections['skills-development']?.meta ?? {};
  const claimedKey = !blank(meta.payroll) ? 'payroll' : !blank(meta.leviable) ? 'leviable' : null;
  const claimed = claimedKey ? amountOf(meta[claimedKey]) : amountOf(skillsMeta.leviableAmount);
  const emp = reads(ctx, 'emp201');
  if (claimed === null || emp.length === 0) return [];
  let sdl = 0;
  let months = 0;
  const evidence: EvidenceCitation[] = [];
  for (const read of emp) {
    for (const r of rowsOf(read, 'emp201_rows')) {
      const amount = amountOf(r.sdl_amount);
      const period = str(r.tax_period).match(/(\d{4})\D?(\d{1,2})/);
      const date = period ? `${period[1]}-${period[2].padStart(2, '0')}-15` : dateOf(r.tax_period);
      if (amount === null || inPeriod(date, ctx.period) === false) continue;
      sdl += amount;
      months += 1;
    }
    if (months) evidence.push(cite(read, 'emp201_rows.sdl_amount', Math.round(sdl * 100) / 100));
  }
  if (months === 0) return [];
  const leviable = sdl * 100;
  const tolerance = Math.max(0.01 * leviable, 1000);
  const agrees = Math.abs(claimed - leviable) <= tolerance;
  return [check('skills.leviableAmount', 'leviable', {
    section: 'financial-information', subject: 'leviable amount', status: agrees ? 'pass' : 'flag', rule: agrees ? 'none' : 'replaced-statutory',
    tolerance: '1% or R1,000',
    claim: { column: claimedKey ?? 'leviableAmount', value: claimed },
    evidence,
    statement: agrees
      ? `The leviable amount agrees with the SDL paid over ${months} EMP201 month${months === 1 ? '' : 's'} (x100).`
      : `The leviable amount is ${money(claimed)}; the SDL paid over ${months} EMP201 months in the period implies ${money(leviable)}. The EMP201 figure is used.`,
    ops: agrees ? [] : [claimedKey
      ? setMeta('both', 'financial-information', claimedKey, Math.round(leviable * 100) / 100)
      : setMeta('both', 'skills-development', 'leviableAmount', Math.round(leviable * 100) / 100)],
  })];
}

// ── 8. Training spend vs invoices or attendance registers ──────────────────
export function checkTraining(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const proof = reads(ctx, 'trainingEvidence');
  const lines = proof.flatMap((read) => {
    const rows = [...rowsOf(read, 'invoice_rows'), ...rowsOf(read, 'attendance_rows'), ...rowsOf(read, 'learner_rows')];
    if (rows.length) return rows.map((r) => ({ read, learner: r.learner_name ?? r.attendee_name, amount: amountOf(r.amount ?? r.total_cost ?? r.amount_ex_vat), date: dateOf(r.date ?? r.invoice_date ?? r.start_date) }));
    return [{ read, learner: valueOf(read, 'learner_name'), amount: amountOf(valueOf(read, 'amount_ex_vat') ?? valueOf(read, 'total_cost')), date: dateOf(valueOf(read, 'invoice_date')) }];
  });
  for (const row of rowsIn(ctx, 'skills-development')) {
    const rowId = idOf(row);
    if (!rowId) continue;
    const subject = [str(row.learnerName), str(row.programName)].filter(Boolean).join(' — ') || 'training entry';
    const date = dateOf(row.startDate ?? row.endDate);
    if (inPeriod(date, ctx.period) === false) {
      out.push(check('skills.trainingSpend', rowId, {
        section: 'skills-development', rowId, subject, status: 'out-of-period', rule: 'excluded-from-evidenced', tolerance: 'date in period',
        claim: { column: 'startDate', value: date, documents: docsOf(row) },
        statement: `${subject} is dated ${date}, outside the measurement period.`,
        ops: [exclude('skills-development', rowId)],
      }));
      continue;
    }
    const cost = amountOf(row.totalCost ?? row.cost);
    const hit = lines.find((l) => (blank(l.learner) || sameName(l.learner, row.learnerName))
      && cost !== null && l.amount !== null && Math.abs(l.amount - cost) <= 1
      && inPeriod(l.date, ctx.period) !== false);
    out.push(check('skills.trainingSpend', rowId, {
      section: 'skills-development', rowId, subject, status: hit ? 'pass' : 'unproven', rule: hit ? 'none' : 'excluded-from-evidenced', tolerance: 'within R1, date in period',
      claim: { column: 'totalCost', value: cost, documents: docsOf(row) },
      evidence: hit ? [cite(hit.read, 'amount', hit.amount)] : [],
      statement: hit ? `${subject}: the invoice agrees.` : `${subject}: no training invoice or attendance register was read for it.`,
      ops: hit ? [] : [exclude('skills-development', rowId)],
    }));
  }
  return out;
}

// ── 9. Supplier level and ownership vs the supplier's certificate ─────────
export function checkSupplierCertificates(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const certs = reads(ctx, 'supplierCertificate');
  for (const row of rowsIn(ctx, 'procurement')) {
    const rowId = idOf(row);
    if (!rowId) continue;
    const subject = str(row.supplierName) || 'supplier';
    const mine = certs.filter((read) => sameName(valueOf(read, 'supplier_name'), subject)
      || (!blank(row.registrationNumber) && str(valueOf(read, 'registration_number')).replace(/\s/g, '') === str(row.registrationNumber).replace(/\s/g, '')));
    type Cert = { level: number | null; black: number | null; issue: string | null; expiry: string | null; cite: EvidenceCitation[] };
    const found: Cert[] = mine.map((read) => ({
      level: amountOf(valueOf(read, 'bee_level')),
      black: percentOf(valueOf(read, 'supplier_black_ownership_percentage')),
      issue: dateOf(valueOf(read, 'certificate_issue_date')),
      expiry: dateOf(valueOf(read, 'certificate_expiry_date')),
      cite: [cite(read, 'bee_level', valueOf(read, 'bee_level')), cite(read, 'certificate_expiry_date', valueOf(read, 'certificate_expiry_date'))],
    }));
    // The certificate registry match the create flow stamps on the row.
    const registry = row._certificate as { certificateNumber?: string | null; expiryDate?: string | null; agency?: string | null; companyName?: string } | undefined;
    if (registry && (registry.expiryDate || registry.certificateNumber)) {
      found.push({
        level: null, black: null, issue: null, expiry: dateOf(registry.expiryDate),
        cite: [{ document: `certificate registry${registry.agency ? ` (${registry.agency})` : ''}`, reader: 'certificate-registry', field: 'certificateNumber', value: registry.certificateNumber ?? registry.companyName ?? '', rank: 3 }],
      });
    }
    const claimedLevel = amountOf(row.bbbeeLevel);
    if (found.length === 0) {
      if (claimedLevel === null || claimedLevel === 0) continue; // no recognition claimed
      out.push(check('procurement.supplierCertificate', rowId, {
        section: 'procurement', rowId, subject, status: 'unproven', rule: 'excluded-from-evidenced', tolerance: 'level exact; ownership 0.5 pp; valid in period',
        claim: { column: 'bbbeeLevel', value: claimedLevel, documents: docsOf(row) },
        statement: `${subject} is claimed at Level ${claimedLevel}, but no certificate or affidavit for it was read.`,
        ops: [setCell('evidenced', 'procurement', rowId, 'bbbeeLevel', null)],
      }));
      continue;
    }
    const evidence = found.flatMap((c) => c.cite);
    const valid = found.filter((c) => {
      if (!ctx.period) return true;
      if (c.expiry && c.expiry < ctx.period.start) return false;
      if (c.issue && c.issue > ctx.period.end) return false;
      return true;
    });
    if (valid.length === 0) {
      out.push(check('procurement.supplierCertificate', rowId, {
        section: 'procurement', rowId, subject, status: 'out-of-period', rule: 'excluded-from-evidenced', tolerance: 'valid in the period',
        claim: { column: 'bbbeeLevel', value: claimedLevel, documents: docsOf(row) }, evidence,
        statement: `${subject}'s certificate was not valid in the measurement period (expired ${found.map((c) => c.expiry).filter(Boolean).join(', ') || '?'}).`,
        ops: [setCell('evidenced', 'procurement', rowId, 'bbbeeLevel', null)],
      }));
      continue;
    }
    // Certificates that disagree: the lower recognition (the higher level number).
    const levels = valid.map((c) => c.level).filter((l): l is number => l !== null);
    const certLevel = levels.length ? Math.max(...levels) : null;
    const blacks = valid.map((c) => c.black).filter((b): b is number => b !== null);
    const certBlack = blacks.length ? Math.min(...blacks) : null;
    const claimedBlack = percentOf(row.currentBlackOwnership);
    const ops: OverlayOp[] = [];
    const notes: string[] = [];
    if (certLevel !== null && claimedLevel !== null && certLevel !== claimedLevel) {
      ops.push(setCell('both', 'procurement', rowId, 'bbbeeLevel', certLevel));
      notes.push(`level ${claimedLevel} claimed, the certificate states Level ${certLevel}`);
    }
    if (certBlack !== null && claimedBlack !== null && Math.abs(certBlack - claimedBlack) > 0.5) {
      ops.push(setCell('both', 'procurement', rowId, 'currentBlackOwnership', certBlack));
      notes.push(`black ownership ${claimedBlack}% claimed, the certificate states ${certBlack}%`);
    }
    out.push(check('procurement.supplierCertificate', rowId, {
      section: 'procurement', rowId, subject, status: ops.length ? 'flag' : 'pass', rule: ops.length ? 'replaced-certificate' : 'none',
      tolerance: 'level exact; ownership 0.5 pp; valid in period',
      claim: { column: 'bbbeeLevel', value: claimedLevel, documents: docsOf(row) }, evidence,
      statement: ops.length ? `${subject}: ${notes.join('; ')}. The certificate is used.` : `${subject}'s level agrees with a certificate valid in the period.`,
      ops,
    }));
  }
  return out;
}

// ── 10. Supplier spend vs the ledger; one row per supplier per document ────
export function checkSupplierSpend(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const ledgers = reads(ctx, 'ledger');
  const rows = rowsIn(ctx, 'procurement');
  const seen = new Map<string, VerificationRow[]>();
  for (const row of rows) {
    for (const doc of docsOf(row)) {
      const key = `${doc}\u0000${str(row.supplierName).toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(row);
    }
  }
  for (const [key, dupes] of Array.from(seen.entries())) {
    if (dupes.length < 2 || !str(dupes[0].supplierName)) continue;
    const doc = key.split('\u0000')[0];
    out.push(check('procurement.supplierSpend', `duplicate:${dupes.map(idOf).join(',')}`, {
      section: 'procurement', rowId: idOf(dupes[1]), subject: str(dupes[0].supplierName), status: 'flag', rule: 'flag-only', tolerance: 'one row per supplier per document',
      claim: { column: 'spend', value: dupes.map((d) => amountOf(d.spend)), documents: [doc] },
      statement: `${str(dupes[0].supplierName)} appears ${dupes.length} times from one document. If it is one supplier counted twice, remove the copy.`,
    }));
  }
  for (const read of ledgers) {
    const name = valueOf(read, 'supplier_name');
    const total = amountOf(valueOf(read, 'ap_subledger_total'));
    if (blank(name) || total === null) continue;
    const row = rows.find((r) => sameName(r.supplierName, name));
    if (!row) continue;
    const rowId = idOf(row);
    const spend = amountOf(row.spend);
    const agrees = spend !== null && Math.abs(spend - total) <= 1;
    out.push(check('procurement.supplierSpend', `ledger:${rowId}`, {
      section: 'procurement', rowId, subject: str(row.supplierName), status: agrees ? 'pass' : 'flag', rule: agrees ? 'none' : 'replaced-statutory', tolerance: 'within R1',
      claim: { column: 'spend', value: spend, documents: docsOf(row) },
      evidence: [cite(read, 'ap_subledger_total', total)],
      statement: agrees
        ? `${str(row.supplierName)}'s spend agrees with the supplier ledger.`
        : `${str(row.supplierName)}'s spend is ${spend === null ? 'blank' : money(spend)}; the supplier ledger states ${money(total)}. The ledger is used.`,
      ops: agrees ? [] : [setCell('both', 'procurement', rowId, 'spend', total)],
    }));
  }
  return out;
}

// ── 11. TMPS between the schedule sum and the AFS cost base ────────────────
export function checkTmps(ctx: CheckContext): VerificationCheck[] {
  const meta = ctx.sections['financial-information']?.meta ?? {};
  const tmps = amountOf(meta.tmps);
  if (tmps === null) return [];
  const floor = rowsIn(ctx, 'procurement').reduce((s, r) => s + (amountOf(r.spend) ?? 0), 0);
  const afs = reads(ctx, 'afs');
  let ceiling: number | null = null;
  const evidence: EvidenceCitation[] = [];
  for (const read of afs) {
    const pre = amountOf(valueOf(read, 'total_pre_exclusions_tmps'));
    if (pre !== null) { ceiling = pre; evidence.push(cite(read, 'total_pre_exclusions_tmps', pre)); break; }
    const parts = ['cost_of_sales', 'operating_expenditure', 'capital_expenditure'].map((f) => amountOf(valueOf(read, f)));
    if (parts.some((p) => p !== null)) {
      ceiling = parts.reduce<number>((s, p) => s + (p ?? 0), 0);
      evidence.push(cite(read, 'cost_of_sales + operating_expenditure + capital_expenditure', ceiling));
      break;
    }
  }
  const belowFloor = floor > 0 && tmps < floor - 1;
  const aboveCeiling = ceiling !== null && tmps > ceiling + 1;
  const statement = belowFloor
    ? `TMPS (${money(tmps)}) is smaller than the suppliers listed (${money(floor)}); one of them is wrong.`
    : aboveCeiling
      ? `TMPS (${money(tmps)}) is more than the financial statements' cost base (${money(ceiling!)}).`
      : `TMPS (${money(tmps)}) sits between the supplier schedule (${money(floor)})${ceiling !== null ? ` and the financial statements' cost base (${money(ceiling)})` : ''}.`;
  return [check('procurement.tmps', 'tmps', {
    section: 'financial-information', subject: 'TMPS', status: belowFloor || aboveCeiling ? 'flag' : 'pass', rule: belowFloor || aboveCeiling ? 'flag-only' : 'none',
    tolerance: 'schedule sum <= TMPS <= AFS cost base less exclusions',
    claim: { column: 'tmps', value: tmps }, evidence, statement,
  })];
}

// ── 12. NPAT and revenue vs the AFS ────────────────────────────────────────
export function checkFinancials(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const meta = ctx.sections['financial-information']?.meta ?? {};
  const afs = reads(ctx, 'afs');
  for (const [key, field, label] of [['npat', 'current_year_npat', 'NPAT'], ['revenue', 'current_year_revenue', 'Revenue']] as const) {
    const claimed = amountOf(meta[key]);
    const stated = afs.map((read) => ({ read, value: amountOf(valueOf(read, field)) })).find((x) => x.value !== null);
    if (claimed === null && !stated) continue;
    if (!stated) {
      out.push(check('financials.npatRevenue', key, {
        section: 'financial-information', subject: label, status: 'unproven', rule: 'flag-only', tolerance: 'within R1',
        claim: { column: key, value: claimed },
        statement: `${label} (${money(claimed!)}) is not stated in any financial statements we read.`,
      }));
      continue;
    }
    const agrees = claimed !== null && Math.abs(claimed - stated.value!) <= 1;
    out.push(check('financials.npatRevenue', key, {
      section: 'financial-information', subject: label, status: agrees ? 'pass' : 'flag', rule: agrees ? 'none' : 'replaced-statutory', tolerance: 'within R1',
      claim: { column: key, value: claimed },
      evidence: [cite(stated.read, field, stated.value)],
      statement: agrees
        ? `${label} agrees with the financial statements.`
        : `${label} is ${claimed === null ? 'blank' : money(claimed)}; the financial statements state ${money(stated.value!)}. The financial statements are used.`,
      ops: agrees ? [] : [setMeta('both', 'financial-information', key, stated.value)],
    }));
  }
  const npat = amountOf(meta.npat);
  if (npat !== null && npat <= 0) {
    out.push(check('financials.npatRevenue', 'deemed', {
      section: 'financial-information', subject: 'NPAT', status: 'flag', rule: 'flag-only',
      claim: { column: 'npat', value: npat },
      statement: 'NPAT is nil or a loss, so the ESD and SED targets use the deemed NPAT (the sector\'s industry norm x revenue). Check the norm applied.',
    }));
  }
  return out;
}

// ── 13. SED contributions vs proof of payment ──────────────────────────────
export function checkSedPayments(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const payments = reads(ctx, 'proofOfPayment').flatMap((read) => rowsOf(read, 'beneficiary_rows')
    .filter((r) => yes(r.marked_not_proof_of_payment) !== true)
    .map((r) => ({ read, name: r.beneficiary_name, amount: amountOf(r.amount_paid ?? r.invoice_amount), date: dateOf(r.payment_date ?? r.invoice_date) })));
  const used = new Set<number>();
  for (const row of rowsIn(ctx, 'sed')) {
    const rowId = idOf(row);
    if (!rowId) continue;
    const subject = str(row.beneficiaryName) || 'SED contribution';
    const amount = amountOf(row.amount);
    const date = dateOf(row.dateOfTransaction);
    if (inPeriod(date, ctx.period) === false) {
      out.push(check('sed.proofOfPayment', rowId, {
        section: 'sed', rowId, subject, status: 'out-of-period', rule: 'excluded-from-evidenced', tolerance: 'date inside the period',
        claim: { column: 'dateOfTransaction', value: date, documents: docsOf(row) },
        statement: `${subject}: dated ${date}, outside the measurement period.`,
        ops: [exclude('sed', rowId)],
      }));
      continue;
    }
    const at = payments.findIndex((p, i) => !used.has(i)
      && (blank(p.name) || sameName(p.name, subject))
      && amount !== null && p.amount !== null && Math.abs(p.amount - amount) <= 1
      && (!date || !p.date || daysApart(date, p.date) <= 7)
      && inPeriod(p.date, ctx.period) !== false);
    if (at >= 0) used.add(at);
    const hit = at >= 0 ? payments[at] : null;
    out.push(check('sed.proofOfPayment', rowId, {
      section: 'sed', rowId, subject, status: hit ? 'pass' : 'unproven', rule: hit ? 'none' : 'excluded-from-evidenced',
      tolerance: 'amount within R1; date within 7 days and inside the period',
      claim: { column: 'amount', value: amount, documents: docsOf(row) },
      evidence: hit ? [cite(hit.read, 'beneficiary_rows.amount_paid', hit.amount)] : [],
      statement: hit ? `${subject}: paid, and the proof of payment agrees.` : `${subject}${amount !== null ? ` (${money(amount)})` : ''}: no proof of payment matches it.`,
      ops: hit ? [] : [exclude('sed', rowId)],
    }));
  }
  return out;
}

// ── 14. Entity identity across every document ──────────────────────────────
const ABOUT_THE_ENTITY: DocKind[] = ['cipc', 'shareRegister', 'shareCertificate', 'biRegister', 'emp201', 'afs', 'representationLetter', 'schedule', 'payroll'];
export function checkIdentity(ctx: CheckContext): VerificationCheck[] {
  const out: VerificationCheck[] = [];
  const docs = reads(ctx, ...ABOUT_THE_ENTITY);
  const fields: Array<[string, string, (v: unknown) => string]> = [
    ['registration_number', 'registration number', (v) => str(v).replace(/[^0-9]/g, '')],
    ['financial_year_end', 'financial year end', (v) => {
      const d = dateOf(v);
      if (d) return d.slice(5, 7);
      const m = str(v).toLowerCase().match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/);
      return m ? m[0] : str(v).toLowerCase();
    }],
    ['entity_name', 'registered name', (v) => str(v).toLowerCase().replace(/\b(pty|ltd|cc|limited|proprietary|the)\b/g, '').replace(/[^a-z0-9]+/g, '')],
  ];
  for (const [field, label, norm] of fields) {
    const stated = docs
      .map((read) => ({ read, value: valueOf(read, field) ?? (field === 'entity_name' ? valueOf(read, 'measured_entity_name') : undefined) }))
      .filter((x) => !blank(x.value) && norm(x.value) !== '');
    if (stated.length < 2) continue;
    const distinct = new Set(stated.map((x) => norm(x.value)));
    out.push(check('entity.identity', field, {
      section: 'company-information', subject: label, status: distinct.size > 1 ? 'flag' : 'pass', rule: distinct.size > 1 ? 'flag-only' : 'none', tolerance: 'exact',
      claim: { value: stated[0].value },
      evidence: stated.map((x) => cite(x.read, field, x.value)),
      statement: distinct.size > 1
        ? `The documents state ${distinct.size} different ${label}s. Make sure every document is for the measured entity and the same year.`
        : `Every document states the same ${label}.`,
    }));
  }
  return out;
}

export const ALL_CHECKS: Array<(ctx: CheckContext) => VerificationCheck[]> = [
  checkHoldings, checkDemographics, checkAcquisitionDebt, checkManagementBand, checkForeignNational,
  checkPayroll, checkLeviable, checkTraining, checkSupplierCertificates, checkSupplierSpend,
  checkTmps, checkFinancials, checkSedPayments, checkIdentity,
];
