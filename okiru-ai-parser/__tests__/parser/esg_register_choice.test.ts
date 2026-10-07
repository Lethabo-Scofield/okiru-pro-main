/**
 * Azure refuses a JSON-mode request whose messages never say "json". The ESG
 * register choice asked for a bare id, so it failed for every sheet without a
 * name hint, and those registers were never read deterministically.
 */
import { describe, expect, it } from 'vitest';
import { chooseEsgSheetGrid, registerIdFromReply } from '../../src/services/esgSheetTableExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

/** A model that behaves as Azure does in JSON mode. */
function azureLikeModel(reply: string): ExtractionModel & { calls: number } {
  const model = {
    name: 'azure-like',
    calls: 0,
    complete: async (system: string, user: string) => {
      model.calls += 1;
      if (!/json/i.test(system) && !/json/i.test(user)) {
        throw new Error("Azure extraction failed: 400 'messages' must contain the word 'json' in some form");
      }
      return reply;
    },
  };
  (model as { completeHard?: unknown }).completeHard = model.complete;
  return model as unknown as ExtractionModel & { calls: number };
}

describe('registerIdFromReply', () => {
  it('reads the JSON answer, and a bare id', () => {
    expect(registerIdFromReply('{"register": "fleet__vehicle_register"}')).toBe('fleet__vehicle_register');
    expect(registerIdFromReply('{"register":"NONE"}')).toBe('none');
    expect(registerIdFromReply('fleet__vehicle_register')).toBe('fleet__vehicle_register');
  });
});

describe('chooseEsgSheetGrid', () => {
  it('asks in a way JSON mode accepts, and chooses the register', async () => {
    const model = azureLikeModel('{"register": "fleet__vehicle_register"}');
    const rows = [{ 'Registration No': 'BB33CMGP', 'Reporting Level': 'SGTSPFMCG', GVM: 42000, TARE: 10500 }];
    const chosen = await chooseEsgSheetGrid(model, `DATA ${Date.now()}`, rows);
    expect(model.calls).toBe(1);
    expect(chosen?.documentId).toBe('fleet__vehicle_register');
  });
});
