/**
 * One register, two doors.
 *
 * A company's shareholders, employees, training programmes, suppliers and
 * contributions live in one place: arrays on the client document. Scoring
 * reads them, and two surfaces write them — the toolkit's pillar pages, a row
 * at a time, and the Create Scorecard workbook, in one go when it is
 * submitted.
 *
 * Submit used to `$set` each array with whatever the workbook held, which
 * replaces it whole. So a consultant who bulk-uploaded three hundred suppliers
 * in the toolkit and then submitted a workbook lost all three hundred, without
 * being told. The workbook never showed them either, so nothing on screen
 * suggested they had been there.
 *
 * Replacing was wrong, but so is blind merging: delete a row in the workbook
 * and a merge would resurrect it on the next submit. What is needed is
 * ownership. A row carries `source: "workbook"` when a submit wrote it, and
 * then:
 *
 *   - rows the workbook owns are REPLACED by the current submit, so deleting a
 *     row in the workbook deletes it here too;
 *   - rows that arrived any other way are KEPT, because this submit knows
 *     nothing about them and silence is not permission to delete.
 *
 * Rows written before the tag existed carry no source. They are matched by
 * signature instead — same person, same supplier — so the first submit after
 * this change replaces them rather than duplicating them. That fallback only
 * ever removes a row that the incoming submit is also providing, so it cannot
 * lose anything.
 */

export type RegisterRow = Record<string, unknown>;

/** The client arrays a workbook submit writes. */
export const WORKBOOK_REGISTERS = [
  "shareholders",
  "employees",
  "trainingPrograms",
  "suppliers",
  "esdContributions",
  "sedContributions",
] as const;

export type RegisterName = (typeof WORKBOOK_REGISTERS)[number];

/** Marks a row as owned by the workbook, and therefore replaceable by it. */
export const WORKBOOK_SOURCE = "workbook";

/**
 * The fields that say "this is the same record", per register.
 *
 * Deliberately narrow. A signature built from everything would treat an edited
 * row as a new one and duplicate it; a signature built from a name alone would
 * merge two real people who share one.
 */
const IDENTITY: Record<RegisterName, string[][]> = {
  shareholders: [["idNumber"], ["name"]],
  employees: [["idNumber"], ["name", "surname"]],
  trainingPrograms: [["learnerIdNumber", "programName"], ["learnerName", "programName"]],
  suppliers: [["registrationNumber"], ["vatNumber"], ["name"]],
  esdContributions: [["beneficiary", "amount"]],
  sedContributions: [["beneficiary", "amount"]],
};

function clean(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * A row's identity, or null when it has none.
 *
 * A row with nothing identifying is never matched against anything — two blank
 * rows are not "the same blank row", and collapsing them would delete data on
 * the strength of both being empty.
 */
export function signatureFor(register: RegisterName, row: RegisterRow | null | undefined): string | null {
  if (!row || typeof row !== "object") return null;
  for (const fields of IDENTITY[register] ?? []) {
    const parts = fields.map((f) => clean(row[f]));
    if (parts.every((p) => p !== "")) return `${fields.join("+")}:${parts.join("|")}`;
  }
  return null;
}

export interface ReconcileResult {
  rows: RegisterRow[];
  /** Rows kept because another surface wrote them. The number that used to be lost. */
  kept: number;
  /** Rows this submit is writing. */
  written: number;
  /** Untagged rows the submit is superseding — matched by signature, not dropped. */
  superseded: number;
}

/**
 * Fold one workbook submit into one register.
 *
 * Pure: takes what is stored and what is being submitted, returns what should
 * be stored. Nothing here reads a database, so the rules are testable on their
 * own — which matters, because the failure mode is silent data loss.
 */
export function reconcileRegister(
  register: RegisterName,
  existing: unknown,
  incoming: RegisterRow[],
): ReconcileResult {
  const current = Array.isArray(existing) ? (existing as RegisterRow[]) : [];
  const written = incoming.map((row) => ({ ...row, source: WORKBOOK_SOURCE }));

  const incomingSignatures = new Set(
    written.map((row) => signatureFor(register, row)).filter((s): s is string => s !== null),
  );

  let superseded = 0;
  const kept = current.filter((row) => {
    // The workbook owns this row, and the submit in hand is its new state.
    if (row && typeof row === "object" && row.source === WORKBOOK_SOURCE) return false;

    // Written before the tag existed, and this submit carries it again.
    const signature = signatureFor(register, row);
    if (signature && incomingSignatures.has(signature)) {
      superseded += 1;
      return false;
    }

    // Arrived some other way. This submit says nothing about it, so it stays.
    return true;
  });

  return {
    rows: [...kept, ...written],
    kept: kept.length,
    written: written.length,
    superseded,
  };
}

export interface RegisterReconciliation {
  /** `{ suppliers: [...], employees: [...] }`, ready to $set. */
  rows: Record<string, RegisterRow[]>;
  /** Per register, what happened — for the response and the log. */
  summary: Record<string, { kept: number; written: number; superseded: number }>;
  /** Total rows preserved that a whole-array replace would have deleted. */
  preserved: number;
}

/**
 * Every register in one pass.
 *
 * `existingDoc` is the stored client; `projected` is what the workbook makes
 * of itself. Registers the projection does not mention are left untouched
 * rather than emptied.
 */
export function reconcileRegisters(
  existingDoc: Record<string, unknown> | null | undefined,
  projected: Record<string, RegisterRow[] | undefined>,
): RegisterReconciliation {
  const rows: Record<string, RegisterRow[]> = {};
  const summary: RegisterReconciliation["summary"] = {};
  let preserved = 0;

  for (const register of WORKBOOK_REGISTERS) {
    const incoming = projected[register];
    if (!Array.isArray(incoming)) continue;

    const result = reconcileRegister(register, existingDoc?.[register], incoming);
    rows[register] = result.rows;
    summary[register] = {
      kept: result.kept,
      written: result.written,
      superseded: result.superseded,
    };
    preserved += result.kept;
  }

  return { rows, summary, preserved };
}
