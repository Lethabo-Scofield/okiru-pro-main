#!/usr/bin/env node
/**
 * Typecheck the web server tree against a recorded baseline.
 *
 * `apps/web/tsconfig.json` only ever covered `src`, `shared` and `api`, so
 * everything under `apps/web/server` — the whole live request path — was never
 * typechecked. Switching it on surfaced 176 pre-existing errors, which is too
 * many to fix in the change that found them and far too many to ignore.
 *
 * So: the existing errors are recorded in a baseline and this script fails only
 * on errors that are not in it. New code is held to a clean bar, the backlog
 * stays visible, and the count can only go down — fixing an error that is in the
 * baseline without removing it from the baseline is also reported, so the file
 * cannot rot into a list of problems that no longer exist.
 *
 *   node scripts/typecheck-server.mjs            # check
 *   node scripts/typecheck-server.mjs --update   # re-record the baseline
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(root, "apps/web");
const baselineFile = resolve(root, "scripts/typecheck-server.baseline.txt");
const update = process.argv.includes("--update");

/**
 * A key without the line number. Line numbers shift whenever anything above
 * them changes, so keying on them would make the baseline useless after the
 * first unrelated edit.
 */
function keyOf(line) {
  const match = line.match(/^(.+?)\((\d+),(\d+)\): (error TS\d+): (.*)$/);
  if (!match) return null;
  const [, file, , , code, message] = match;
  return `${file.replace(/\\/g, "/")} | ${code} | ${normaliseMessage(message)}`;
}

/**
 * Drop the inline type from the message.
 *
 * TypeScript does not print the members of a union in a stable order, so
 * "Property 'x' does not exist on type 'A | B'" and "... on type 'B | A'" are
 * the same error printed two ways. Keying on the full text made the baseline
 * report six phantom new errors after an unrelated install.
 *
 * Everything up to and including the SECOND quoted run is kept — enough to say
 * which property or argument is at fault, without the type expression that
 * moves around.
 */
function normaliseMessage(message) {
  let quotes = 0;
  for (let i = 0; i < message.length; i += 1) {
    if (message[i] !== "'") continue;
    quotes += 1;
    // The opening quote of the second quoted run: cut here.
    if (quotes === 3) return message.slice(0, i).trimEnd().slice(0, 160);
  }
  return message.slice(0, 160);
}

// Run the compiler's own entry point rather than `npx tsc`. Node refuses to
// spawn a .cmd shim without a shell on Windows, and the failure surfaces as an
// empty result — which, before this was noticed, recorded a baseline of zero
// errors and made the whole gate pass vacuously.
const tscEntry = require.resolve("typescript/bin/tsc", { paths: [webDir, root] });

let output = "";
let ranCleanly = false;
try {
  output = execFileSync(process.execPath, [tscEntry, "--noEmit", "-p", "tsconfig.server.json"], {
    cwd: webDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  ranCleanly = true;
} catch (err) {
  if (typeof err.status !== "number") {
    console.error(`Could not run the TypeScript compiler: ${err.message}`);
    process.exit(2);
  }
  // tsc exits non-zero when it reports errors; that is the normal path here.
  output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}

const current = output
  .split(/\r?\n/)
  .map(keyOf)
  .filter(Boolean);

const counts = new Map();
for (const key of current) counts.set(key, (counts.get(key) ?? 0) + 1);

if (update) {
  const lines = Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${count}\t${key}`);
  writeFileSync(baselineFile, `${lines.join("\n")}\n`);
  console.log(`Recorded ${current.length} error(s) across ${counts.size} signature(s).`);
  process.exit(0);
}

if (!existsSync(baselineFile)) {
  console.error(`No baseline at ${baselineFile}. Run with --update to create one.`);
  process.exit(1);
}

const baseline = new Map();
for (const line of readFileSync(baselineFile, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [count, ...rest] = line.split("\t");
  baseline.set(rest.join("\t"), Number(count));
}

const added = [];
const fixed = [];
for (const [key, count] of counts) {
  const was = baseline.get(key) ?? 0;
  if (count > was) added.push(`${key}  (${was} -> ${count})`);
}
for (const [key, was] of baseline) {
  const now = counts.get(key) ?? 0;
  if (now < was) fixed.push(`${key}  (${was} -> ${now})`);
}

console.log(`Server typecheck: ${current.length} error(s), baseline ${[...baseline.values()].reduce((a, b) => a + b, 0)}.`);

if (fixed.length) {
  console.log(`\n${fixed.length} baselined error(s) no longer occur. Run with --update to record that:`);
  for (const line of fixed.slice(0, 20)) console.log(`  - ${line}`);
}

if (added.length) {
  console.error(`\n${added.length} NEW type error(s) not in the baseline:`);
  for (const line of added) console.error(`  + ${line}`);
  console.error("\nFix them, or if they are genuinely pre-existing, re-record with --update and say why in the commit.");
  process.exit(1);
}

console.log("No new type errors.");
