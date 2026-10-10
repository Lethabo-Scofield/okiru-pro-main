/**
 * THE LEARNERS ON A TRAINING REGISTER, ONCE EACH.
 *
 * A training register has one row per learner per course: a person trained on
 * four courses is four rows. The spend is per course, but Skills Development
 * also counts PEOPLE (black people trained, disabled and unemployed learners),
 * and a reviewer checks a register by its people. Read only as rows, a
 * register of 28 course entries looked like 28 learners.
 *
 * Rows are one person when they share an ID number, or when their names are
 * the same (ignoring case, spacing, punctuation and word order, so "Mokoena,
 * Thabo" is "Thabo Mokoena") and their ID numbers do not clearly differ: one
 * row has none, or the two are within two keystrokes of each other (a digit
 * dropped or mistyped). Two people with one name and two different ID numbers
 * stay two people.
 *
 * Pure: no I/O. caseExtraction.addDistinctLearners places the result beside
 * the rows as `derived_learner_names`, labelled derived and never scored.
 */

type Row = Record<string, unknown>;

export interface DistinctLearners {
  /** Each learner once, as first written (spacing tidied), in register order. */
  names: string[];
  /** Rows that name or identify a learner. */
  entries: number;
  /** One learner written with two or more ID numbers: read as one person. */
  idVariants: Array<{ name: string; ids: string[] }>;
}

/** An ID or passport number as a comparable key: letters and digits only, upper case. */
function idKeyOf(value: unknown): string {
  const key = String(value ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();
  return key.length >= 6 ? key : '';
}

/** A name as a comparable key: lower case, letters and digits only, words in sorted order. */
function nameKeyOf(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function displayName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Levenshtein distance, stopping early once it exceeds `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Two ID numbers written for one name: the same person unless they clearly differ. */
function idsCompatible(a: string, b: string): boolean {
  return !a || !b || a === b || editDistance(a, b, 2) <= 2;
}

export function distinctLearners(rows: unknown): DistinctLearners {
  const people = (Array.isArray(rows) ? rows : [])
    .filter((row): row is Row => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({ name: displayName(row.learner_name), nameKey: nameKeyOf(row.learner_name), id: idKeyOf(row.id_number) }))
    .filter((p) => p.nameKey || p.id);

  const parent = people.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(b)] = find(a); };

  // The same ID number is the same person, whatever the name says.
  const byId = new Map<string, number>();
  people.forEach((p, i) => {
    if (!p.id) return;
    const seen = byId.get(p.id);
    if (seen === undefined) byId.set(p.id, i);
    else join(seen, i);
  });

  // The same name is the same person when the ID numbers allow it. Rows with
  // an ID number join first; a row without one joins only when the name
  // belongs to one person, never guessing between two.
  const byName = new Map<string, number[]>();
  people.forEach((p, i) => {
    if (!p.nameKey) return;
    byName.set(p.nameKey, [...(byName.get(p.nameKey) ?? []), i]);
  });
  for (const members of byName.values()) {
    const withId = members.filter((i) => people[i].id);
    for (let x = 0; x < withId.length; x += 1) {
      for (let y = x + 1; y < withId.length; y += 1) {
        if (idsCompatible(people[withId[x]].id, people[withId[y]].id)) join(withId[x], withId[y]);
      }
    }
    const groups = new Set(withId.map(find));
    const without = members.filter((i) => !people[i].id);
    const anchor = withId[0] ?? members[0];
    if (groups.size <= 1) for (const i of without) join(anchor, i);
  }

  const order: number[] = [];
  const ids = new Map<number, Set<string>>();
  people.forEach((p, i) => {
    const root = find(i);
    if (!ids.has(root)) { ids.set(root, new Set()); order.push(i); }
    if (p.id) ids.get(root)!.add(p.id);
  });

  return {
    names: order.map((i) => people[i].name || people[i].id),
    entries: people.length,
    idVariants: order
      .map((i) => ({ name: people[i].name || people[i].id, ids: [...ids.get(find(i))!] }))
      .filter((v) => v.ids.length > 1),
  };
}
