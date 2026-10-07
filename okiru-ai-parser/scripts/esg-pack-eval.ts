/**
 * Run an ESG evidence pack through the real extraction pipeline, repeatably.
 *
 *   npx tsx scripts/esg-pack-eval.ts --pack "<pack dir>" [--out <dir>] [--mode auto|replay|record]
 *
 * Kept so existing ESG commands work unchanged: this is pack-eval.ts with
 * `--domain esg`. Everything else — the cassette, the caches, case.json and
 * summary.json under <pack>/.eval — is described there. The web half
 * (apps/web/src/lib/esg/__eval__/esgPackEval.test.ts) still writes score,
 * placement, coverage.json and fleet.json beside the case.
 */
const at = process.argv.indexOf('--domain');
if (at < 0) process.argv.push('--domain', 'esg');
else if (process.argv[at + 1] !== 'esg') throw new Error('esg-pack-eval.ts runs --domain esg only; use scripts/pack-eval.ts');
await import('./pack-eval.js');

export {};
