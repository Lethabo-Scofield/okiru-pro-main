/**
 * The Calculation Review's "All notes": every reviewer's notes, on every
 * scorecard, in one list — each one named in words (which scorecard, and which
 * line, ruling or element it is about) so a reviewer can see everything that
 * is outstanding at once and go straight to any of it.
 *
 * Pure. What a note is about is read from three places, best first:
 *   - the registry, for rulings and for a scorecard as a whole;
 *   - a worked scorecard, once it is loaded, for its lines (the line a note is
 *     on is only known by its toolkit row until then);
 *   - the live sector configuration, for scorecards not checked against a
 *     toolkit yet and for notes written before a scorecard was checked.
 * Where none of them can name it, the note is still listed, in plain words.
 */
import { buildLedger, type SectorConfigView } from "./ledger";
import { decisionAnchor, reviewScorecardsFor, scorecardAnchor, type ReviewScorecard } from "./registry";
import type { WorkedScorecard } from "./workedScorecard";

/** A note as GET /api/calculation-review/notes returns it. */
export interface ReviewNoteSummary {
  id: string;
  sectorCode: string;
  scorecardType: string;
  pillarKey: string;
  anchor: string;
  body: string;
  verdict: string;
  authorUserId?: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  mine?: boolean;
}

/** What the page opens: a worked scorecard, or the description of one not checked yet. */
export type ReviewTarget =
  | { kind: "worked"; id: string }
  | { kind: "described"; sectorCode: string; scorecardType: string };

/** A worked line, in words: the element it sits under and its own label. */
export interface LineName {
  element: string;
  label: string;
}

/** What a note is attached to. */
export type NoteSubject = "line" | "ruling" | "scorecard" | "element" | "indicator" | "earlier";

export interface ResolvedNote {
  note: ReviewNoteSummary;
  groupKey: string;
  groupTitle: string;
  /** The scorecard "Go to" opens. */
  target: ReviewTarget;
  subject: NoteSubject;
  /** What the note is about: a line's or indicator's label, a ruling's title. */
  about: string;
  /** The element it sits under, where known. */
  element?: string;
  /** Where one ruling covers several scorecards: who it applies to. */
  appliesTo?: string;
  /** The anchor of the place on the page to scroll to; null where there is no single place. */
  revealAnchor: string | null;
  /** The anchor of the element to open first, where the place may be inside a closed element. */
  containerAnchor?: string;
}

export interface NoteGroup {
  key: string;
  title: string;
  target: ReviewTarget;
  notes: ResolvedNote[];
}

export interface ResolveContext {
  /** The lines of a worked scorecard, once it is loaded. */
  lineNames?: (scorecardId: string) => ReadonlyMap<string, LineName> | undefined;
  /** The live sector configurations (GET /api/sectors). */
  sectors?: readonly SectorConfigView[];
}

const LINE_ANCHOR = /^indicator:((?:[a-z]+\.)?)line-\d+(?:-\d+)*$/;
const DECISION_ANCHOR = /^indicator:decision-(.+)$/;

const FALLBACK = {
  line: "A line on this scorecard",
  ruling: "A ruling on this scorecard",
  element: "An element of this scorecard, as a whole",
  indicator: "An indicator on this scorecard",
  earlier: "An indicator in the earlier description",
  scorecard: "The scorecard as a whole",
} as const;

/** Every line of a worked scorecard by its note anchor, in words. */
export function lineNamesOf(worked: WorkedScorecard): Map<string, LineName> {
  const names = new Map<string, LineName>();
  for (const p of worked.pillars) for (const l of p.lines) names.set(l.anchor, { element: p.label, label: l.label });
  return names;
}

function configFor(ctx: ResolveContext, sectorCode: string, scorecardType: string): SectorConfigView | undefined {
  return ctx.sectors?.find((s) => s.code === sectorCode && s.type === scorecardType);
}

/** The sector's name as the page shows it, without the code in brackets. */
function sectorName(cfg: SectorConfigView): string {
  return (cfg.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

interface Described {
  about: string;
  element?: string;
  subject: NoteSubject;
}

/** Name an anchor from the written description of a scorecard (the live sector configuration). */
function describeFromConfig(anchor: string, cfg: SectorConfigView | undefined): Described | null {
  if (anchor === "pillar:scorecard") return { about: FALLBACK.scorecard, subject: "scorecard" };
  let ledger: ReturnType<typeof buildLedger> = [];
  try {
    ledger = cfg ? buildLedger(cfg) : [];
  } catch {
    ledger = [];
  }
  for (const p of ledger) {
    if (anchor === `pillar:${p.key}`) return { about: `${p.name} as a whole`, subject: "element" };
    for (const r of p.rows) {
      if (anchor === `indicator:${r.code}`) return { about: r.name, element: p.name, subject: "indicator" };
    }
  }
  return null;
}

const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The title of a group of rulings that several scorecards share. */
function sharedTitle(holders: ReviewScorecard[], all: ReviewScorecard[]): string {
  const sector = holders[0].sector;
  if (holders.length === all.length) {
    const n = NUMBER_WORDS[holders.length] ?? String(holders.length);
    return `${sector} rulings shared by all ${n} scorecards`;
  }
  return `${sector} rulings shared by ${listInWords(holders.map((h) => h.name))}`;
}

/** Which scorecard a note belongs to, and what it is about, in words. */
export function resolveNote(note: ReviewNoteSummary, ctx: ResolveContext = {}): ResolvedNote {
  const { sectorCode, scorecardType, anchor } = note;
  const candidates = reviewScorecardsFor(sectorCode, scorecardType);
  const cfg = configFor(ctx, sectorCode, scorecardType);

  // A scorecard not checked against a toolkit: its notes sit on the written description.
  if (candidates.length === 0) {
    const target: ReviewTarget = { kind: "described", sectorCode, scorecardType };
    const title = cfg ? `${sectorName(cfg) || "Scorecard"} · ${scorecardType}` : "A scorecard not checked against a toolkit yet";
    const d = describeFromConfig(anchor, cfg);
    const subject: NoteSubject = d?.subject ?? (anchor.startsWith("pillar:") ? "element" : "indicator");
    const about = d?.about ?? (subject === "element" ? FALLBACK.element : FALLBACK.indicator);
    return {
      note,
      groupKey: `described:${sectorCode}|${scorecardType}`,
      groupTitle: title,
      target,
      subject,
      about,
      ...(d?.element ? { element: d.element } : {}),
      revealAnchor: subject === "scorecard" ? null : anchor,
      ...(subject === "indicator" ? { containerAnchor: `pillar:${note.pillarKey}` } : {}),
    };
  }

  const inGroup = (entry: ReviewScorecard) => ({
    groupKey: `worked:${entry.id}`,
    groupTitle: entry.title,
    target: { kind: "worked", id: entry.id } as ReviewTarget,
  });

  // A ruling: one scorecard's own, or one that several share.
  const decision = DECISION_ANCHOR.exec(anchor);
  if (decision) {
    const holders = candidates.filter((e) => e.decisions.some((d) => decisionAnchor(d) === anchor));
    const ruling = holders[0]?.decisions.find((d) => decisionAnchor(d) === anchor);
    if (holders.length > 0 && ruling) {
      const group =
        holders.length === 1
          ? inGroup(holders[0])
          : {
              groupKey: `shared:${holders.map((h) => h.id).join(",")}`,
              groupTitle: sharedTitle(holders, candidates),
              target: { kind: "worked", id: holders[0].id } as ReviewTarget,
            };
      return {
        note,
        ...group,
        subject: "ruling",
        about: ruling.title,
        element: ruling.element,
        ...(holders.length > 1 && ruling.appliesTo ? { appliesTo: ruling.appliesTo } : {}),
        revealAnchor: anchor,
      };
    }
  }

  // The scorecard as a whole.
  const whole = candidates.find((e) => scorecardAnchor(e) === anchor);
  if (whole) {
    return { note, ...inGroup(whole), subject: "scorecard", about: FALLBACK.scorecard, revealAnchor: anchor };
  }

  // A line of a worked scorecard: named once that scorecard is loaded.
  const line = LINE_ANCHOR.exec(anchor);
  const owner = line ? candidates.find((e) => e.anchorPrefix === line[1]) : undefined;
  if (owner) {
    const name = ctx.lineNames?.(owner.id)?.get(anchor);
    return {
      note,
      ...inGroup(owner),
      subject: "line",
      about: name?.label ?? FALLBACK.line,
      ...(name ? { element: name.element } : {}),
      revealAnchor: anchor,
      containerAnchor: `pillar:${note.pillarKey}`,
    };
  }

  // Written before this scorecard was checked against its toolkit: the page keeps
  // these under "Earlier notes" on the first scorecard filed under its code and type.
  const first = candidates[0];
  const d = describeFromConfig(anchor, cfg);
  return {
    note,
    ...inGroup(first),
    subject: "earlier",
    about: d?.about ?? FALLBACK.earlier,
    ...(d?.element ? { element: d.element } : {}),
    revealAnchor: null,
  };
}

function when(n: ReviewNoteSummary): number {
  const t = Date.parse(n.updatedAt || n.createdAt);
  return Number.isNaN(t) ? 0 : t;
}

/** Every note, grouped by scorecard: the newest note first, in the group with the newest note first. */
export function groupNotes(notes: readonly ReviewNoteSummary[], ctx: ResolveContext = {}): NoteGroup[] {
  const sorted = [...notes].sort((a, b) => when(b) - when(a));
  const groups = new Map<string, NoteGroup>();
  for (const n of sorted) {
    const r = resolveNote(n, ctx);
    const g = groups.get(r.groupKey);
    if (g) g.notes.push(r);
    else groups.set(r.groupKey, { key: r.groupKey, title: r.groupTitle, target: r.target, notes: [r] });
  }
  return Array.from(groups.values());
}

/** The worked scorecards whose lines carry notes: what must be loaded to name every line. */
export function scorecardsWithLineNotes(notes: readonly ReviewNoteSummary[]): string[] {
  const ids = new Set<string>();
  for (const n of notes) {
    const r = resolveNote(n);
    if (r.subject === "line" && r.target.kind === "worked") ids.add(r.target.id);
  }
  return Array.from(ids);
}
