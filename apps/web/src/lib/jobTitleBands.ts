/**
 * Job title → the Management Control bands the workbook scores.
 *
 * The EE register a client uploads lists PEOPLE with their JOB TITLES — "Code
 * 14 Driver", "Admin Manager", "General Worker / Driver's Assistant". The
 * workbook's Designation dropdown lists BANDS — "Middle Manager", "Semi-skilled",
 * "Unskilled". Feeding titles straight at the dropdown rejected 45 of the 63
 * values one real pack failed to place, and every one of them was a perfectly
 * good employee row.
 *
 * This is the same translation the EEA2 form makes every year, and it is
 * deterministic: the Codes and the EEA occupational levels define the bands by
 * the KIND of work — decision-making scope, qualification, supervision — and a
 * title carries that kind in its words. Nothing here is a nearest-match guess:
 * a title with no band-bearing word classifies to nothing and is reported.
 *
 * Two vocabularies come out, because the workbook has two columns:
 *   - Designation (scores): the six management bands + Semi-skilled + Unskilled.
 *     There is NO "Skilled" designation, so a skilled-technical title (artisan,
 *     technician, administrator, supervisor) gets no designation — it is not
 *     management and it is not semi/unskilled — and lives in Occupational Level.
 *   - Occupational Level (the EEA2 ladder): Top / Senior / Middle / Junior
 *     Management, Skilled, Semi-Skilled, Unskilled.
 */

export type DesignationBand =
  | "Executive Director"
  | "Non-executive Director"
  | "Other Executive Manager"
  | "Senior Manager"
  | "Middle Manager"
  | "Junior Manager"
  | "Semi-skilled"
  | "Unskilled";

export type OccupationalLevelBand =
  | "Top Management"
  | "Senior Management"
  | "Middle Management"
  | "Junior Management"
  | "Skilled"
  | "Semi-Skilled"
  | "Unskilled";

export interface JobTitleBands {
  designation: DesignationBand | null;
  occupationalLevel: OccupationalLevelBand | null;
  /** The word(s) that decided it — kept for the provenance trail. */
  matched: string;
}

const NONE: JobTitleBands = { designation: null, occupationalLevel: null, matched: "" };

interface Rule {
  /** Tested against the lower-cased title. Order matters: specific before general. */
  pattern: RegExp;
  designation: DesignationBand | null;
  occupationalLevel: OccupationalLevelBand;
}

/**
 * Specific to general. A title like "Operations Manager" must not be caught
 * by the "operator" rule, and "Non-executive Director" must be read before
 * "director". Each rule names the kind of work that defines the band.
 */
const RULES: Rule[] = [
  // Board and top management.
  { pattern: /\bnon[\s-]?exec(utive)?\b/, designation: "Non-executive Director", occupationalLevel: "Top Management" },
  { pattern: /\b(chair(man|person|woman)?|board member|trustee)\b/, designation: "Non-executive Director", occupationalLevel: "Top Management" },
  { pattern: /\b(ceo|cfo|coo|cio|cto|chief\s+\w+\s+officer|managing director|md|executive director|owner|proprietor|founder|partner)\b/, designation: "Executive Director", occupationalLevel: "Top Management" },
  // A close-corporation "Member" is an owner-manager — top management.
  { pattern: /\bmember\b/, designation: "Executive Director", occupationalLevel: "Top Management" },
  { pattern: /\bdirector\b/, designation: "Executive Director", occupationalLevel: "Top Management" },
  { pattern: /\b(general manager|gm|executive|exec)\b/, designation: "Other Executive Manager", occupationalLevel: "Top Management" },

  // Management tiers named as such.
  { pattern: /\b(senior|snr)\b.*\b(manager|management|mgr|mgmt|head)\b|\bhead of\b|\bdivisional\b/, designation: "Senior Manager", occupationalLevel: "Senior Management" },
  { pattern: /\b(junior|jnr|assistant)\b.*\b(manager|management|mgr|mgmt)\b|\bteam lead(er)?\b/, designation: "Junior Manager", occupationalLevel: "Junior Management" },
  { pattern: /\b(middle|mid)\b.*\b(manager|management|mgr|mgmt)\b/, designation: "Middle Manager", occupationalLevel: "Middle Management" },
  // "Operations Manager", "Admin Manager", "Administration Management", "Fleet Manager".
  { pattern: /\b(manager|management|mgr|mgmt)\b/, designation: "Middle Manager", occupationalLevel: "Middle Management" },

  // Skilled technical, supervisory and academically qualified — the EEA2
  // "Skilled" level. Junior management in the Codes' sense, but the workbook
  // keeps that band for people who actually manage; these are NOT designations.
  { pattern: /\b(supervisor|foreman|forewoman|controller|coordinator|co-ordinator)\b/, designation: null, occupationalLevel: "Skilled" },
  { pattern: /\b(admin(istrator|istration)?|clerk|bookkeeper|accountant|secretary|receptionist|officer|analyst|consultant|specialist|buyer|planner|estimator|dispatcher)\b/, designation: null, occupationalLevel: "Skilled" },
  { pattern: /\b(technician|artisan|mechanic|panel\s?beater|electrician|fitter|welder|boilermaker|diesel|auto ?electrician|spray ?painter|engineer|nurse|teacher|pharmacist|it support|developer|programmer)\b/, designation: null, occupationalLevel: "Skilled" },

  // Semi-skilled and discretionary decision making — operators and drivers.
  { pattern: /\b(driver|operator|machinist|forklift|code\s?(8|10|14)|crane|plant op|handyman|maintenance|cashier|sales (rep|assistant)|call centre|agent)\b/, designation: "Semi-skilled", occupationalLevel: "Semi-Skilled" },

  // Unskilled and defined decision making.
  { pattern: /\b(general worker|labou?rer|cleaner|assistant|helper|packer|picker|loader|porter|gardener|groundsman|security|guard|tea lady|messenger|car guard|washer|casual|intern|learner)\b/, designation: "Unskilled", occupationalLevel: "Unskilled" },
];

const MANAGEMENT_LEVELS = new Set<OccupationalLevelBand>([
  "Top Management", "Senior Management", "Middle Management", "Junior Management",
]);

/**
 * Classify a job title.
 *
 * Two tie-breaks, because titles carry several words:
 *  - A MANAGEMENT word wins over a functional one: "Admin Manager" is a
 *    manager (of admin), not an administrator. Among management rules the
 *    specific one wins ("Senior Operations Manager" is senior, not middle).
 *  - Otherwise the role the register lists FIRST wins: "Code 14 Driver /
 *    Panelbeater" is employed as a driver; "General Worker / Driver's
 *    Assistant" as a general worker.
 */
export function classifyJobTitle(raw: unknown): JobTitleBands {
  const title = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!title) return NONE;

  const hits: Array<{ rule: Rule; index: number; order: number; matched: string }> = [];
  RULES.forEach((rule, order) => {
    const m = title.match(rule.pattern);
    if (m && m.index !== undefined) hits.push({ rule, index: m.index, order, matched: m[0] });
  });
  if (hits.length === 0) return NONE;

  const management = hits.filter((h) => MANAGEMENT_LEVELS.has(h.rule.occupationalLevel));
  const pick = management.length > 0
    ? management.sort((a, b) => a.order - b.order)[0]
    : hits.sort((a, b) => a.index - b.index || a.order - b.order)[0];
  return { designation: pick.rule.designation, occupationalLevel: pick.rule.occupationalLevel, matched: pick.matched };
}
