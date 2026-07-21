#!/usr/bin/env node
// Refresh the extraction-eval baseline (portable, no cross-env dependency).
// Sets UPDATE_BASELINE so the eval overwrites __tests__/eval/baseline.json.
import { execSync } from 'node:child_process';

process.env.UPDATE_BASELINE = '1';
execSync('npx vitest run __tests__/eval/extractionEval.test.ts', {
  stdio: 'inherit',
  env: process.env,
});
