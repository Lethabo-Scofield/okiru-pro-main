/**
 * Supplier ledger reading.
 *
 * A ledger is the accounts-payable proof behind a spend claim, and it is shaped
 * unlike every other document we read: no supplier column (the account is named
 * only in the filename) and money split across DEBIT (invoices = spend) and
 * CREDIT (payments = not spend). Reading the wrong column roughly doubles a
 * procurement claim, which is the direction that gets a certificate revoked —
 * so that choice is pinned here.
 *
 * Shapes are taken from the real T4_Procurement ledgers.
 */
import { describe, expect, it } from 'vitest';
import {
  extractLedgerTable,
  isLedgerSheet,
  readLedgerSheet,
  supplierNameFromFilename,
} from '../../src/services/sheetLedgerExtraction.js';

/** The BP Edenvale shape: DEBIT invoices, CREDIT payments, running balance. */
function twoSidedLedger(): Array<Record<string, unknown>> {
  return [
    { DATE: '31/03/2024', DESCRIPTION: 'SEVERAL INVOICES', DEBIT: 220965.42, 'O/S BALANCE': 220965.42 },
    { DATE: '05/04/2024', DESCRIPTION: 'PAYMENT', CREDIT: 220965.42, 'O/S BALANCE': 'NIL' },
    { DATE: '30/04/2024', DESCRIPTION: 'SEVERAL INVOICES', DEBIT: 181413.97, 'O/S BALANCE': 181413.97 },
    { DATE: '05/05/2024', DESCRIPTION: 'PAYMENT', CREDIT: 181413.97, 'O/S BALANCE': 'NIL' },
    { DEBIT: 402379.39 }, // trailing summary line: no date, no balance
  ];
}

describe('recognising a ledger', () => {
  it('accepts the date + debit/credit shape', () => {
    expect(isLedgerSheet(['DATE', 'DESCRIPTION', 'DEBIT', 'O/S BALANCE', 'CREDIT'])).toBe(true);
    expect(isLedgerSheet(['DATE', 'DESCRIPTION', 'CREDIT'])).toBe(true);
  });

  it('refuses a spend SCHEDULE, which names a supplier per row', () => {
    // A schedule must keep taking the schedule path however it is filed.
    expect(isLedgerSheet(['Supplier Name', 'DATE', 'Amount'])).toBe(false);
    expect(isLedgerSheet(['Beneficiary', 'Date of Contribution', 'Amount of Contribution'])).toBe(false);
  });

  it('refuses a sheet with no date or no money column', () => {
    expect(isLedgerSheet(['DESCRIPTION', 'NOTES'])).toBe(false);
    expect(isLedgerSheet(['DATE', 'DESCRIPTION'])).toBe(false);
  });
});

describe('the supplier name comes from the filename', () => {
  it('strips ledger boilerplate, copies, extensions and the sheet suffix', () => {
    expect(supplierNameFromFilename('Copy of OUTSURANCE - DETAILED LEDGER.xlsx')).toBe('OUTSURANCE');
    expect(supplierNameFromFilename('B P EDENVALE LEDGER.xlsx')).toBe('B P EDENVALE');
    expect(supplierNameFromFilename('SUBBIAH ENTERPRISE LEDGER.xlsx')).toBe('SUBBIAH ENTERPRISE');
    expect(supplierNameFromFilename('EKJURHULENI LEDGER.xlsx › Sheet1')).toBe('EKJURHULENI');
    expect(supplierNameFromFilename('TST TRUCK LEDGER_FY2025.xlsx')).toBe('TST TRUCK');
  });
});

describe('reading the money', () => {
  it('sums DEBIT (invoices) and ignores CREDIT (payments)', () => {
    // Counting payments too would report R804,758 of spend for R402,379 of
    // invoices — a doubled claim.
    const reading = readLedgerSheet(twoSidedLedger(), 'B P EDENVALE LEDGER.xlsx')!;
    expect(reading.spendColumn).toBe('DEBIT');
    expect(reading.spend).toBeCloseTo(402379.39, 2);
    expect(reading.lines).toBe(2);
  });

  it('treats CREDIT as the spend when the ledger has no debit side', () => {
    // The other convention (the real Outsurance ledger): one credit line per
    // debit-order instalment paid to the supplier.
    const rows = [
      { DATE: '25/03/2024', DESCRIPTION: 'DEBIT ORDER', CREDIT: 26434.33 },
      { DATE: '25/04/2024', DESCRIPTION: 'DEBIT ORDER', CREDIT: 26434.33 },
      { CREDIT: 52868.66 },
    ];
    const reading = readLedgerSheet(rows, 'Copy of OUTSURANCE - DETAILED LEDGER.xlsx')!;
    expect(reading.spendColumn).toBe('CREDIT');
    expect(reading.spend).toBeCloseTo(52868.66, 2);
    expect(reading.lines).toBe(2);
  });

  it('excludes the trailing summary line even when nothing spells TOTAL', () => {
    const reading = readLedgerSheet(twoSidedLedger(), 'led.xlsx')!;
    expect(reading.labelledTotal).toBeCloseTo(402379.39, 2);
    expect(reading.exceptions).toEqual([]);
  });

  it('excludes an explicitly labelled total row', () => {
    const rows = [
      { DATE: '01/05/2024', DESCRIPTION: 'INV1232', DEBIT: 7500, 'O/S BALANCE': 7500 },
      { DATE: '01/06/2024', DESCRIPTION: 'INV1240', DEBIT: 15500, 'O/S BALANCE': 15500 },
      { DESCRIPTION: 'TOTAL', DEBIT: 23000 },
    ];
    const reading = readLedgerSheet(rows, 'SUBBIAH ENTERPRISE LEDGER.xlsx')!;
    expect(reading.spend).toBe(23000);
    expect(reading.lines).toBe(2);
    expect(reading.exceptions).toEqual([]);
  });

  it('flags a ledger that does not reconcile with its own stated total', () => {
    const rows = [
      { DATE: '01/05/2024', DESCRIPTION: 'INV1', DEBIT: 7500, 'O/S BALANCE': 7500 },
      { DESCRIPTION: 'TOTAL', DEBIT: 99999 },
    ];
    const reading = readLedgerSheet(rows, 'x LEDGER.xlsx')!;
    expect(reading.exceptions).toHaveLength(1);
    expect(reading.exceptions[0]).toContain('does not reconcile');
  });

  it('keeps a real line that merely looks like a summary', () => {
    // A dateless line whose value is NOT the running total is evidence, and
    // dropping it would quietly lose spend.
    const rows = [
      { DATE: '01/05/2024', DESCRIPTION: 'INV1', DEBIT: 100, 'O/S BALANCE': 100 },
      { DESCRIPTION: 'INV2 (undated)', DEBIT: 250 },
    ];
    const reading = readLedgerSheet(rows, 'x LEDGER.xlsx')!;
    expect(reading.spend).toBe(350);
    expect(reading.lines).toBe(2);
  });

  it('returns null for a sheet that is not a ledger', () => {
    const rows = [{ 'Supplier Name': 'Alpha', DATE: '01/01/2025', Amount: 100 }];
    expect(readLedgerSheet(rows, 'schedule.xlsx')).toBeNull();
    expect(readLedgerSheet([], 'empty.xlsx')).toBeNull();
  });
});

describe('TMPS exclusions', () => {
  it('flags a municipal / state account rather than silently counting it', () => {
    // The real pack files its Ekurhuleni ledger under "Exclusions": the Codes
    // generally exclude monopolistic and state supplies from TMPS. Whether it
    // is excludable is the agency's call, so this flags and never drops.
    const rows = [
      { DATE: '27/03/2024', DESCRIPTION: "INV'S FOR RATES ETC", DEBIT: 32901, 'O/S BALANCE': 32901 },
    ];
    const reading = readLedgerSheet(rows, 'EKJURHULENI LEDGER.xlsx')!;
    expect(reading.possibleTmpsExclusion).toBe(true);
    expect(reading.exceptions.join(' ')).toContain('EXCLUDE');
    // Still extracted — flagged, not dropped.
    expect(reading.spend).toBe(32901);
  });

  it('does not flag an ordinary trading supplier', () => {
    const reading = readLedgerSheet(twoSidedLedger(), 'B P EDENVALE LEDGER.xlsx')!;
    expect(reading.possibleTmpsExclusion).toBe(false);
  });

  it('reports an excluded account but does NOT hand its spend over as procurement', () => {
    // Counting a municipal account toward TMPS inflates a claim on our own
    // judgement. The finding still reaches the user, who can enter it
    // deliberately if the agency rules it includable.
    const rows = [
      { DATE: '27/03/2024', DESCRIPTION: "INV'S FOR RATES ETC", DEBIT: 32901, 'O/S BALANCE': 32901 },
    ];
    const extraction = extractLedgerTable(rows, 'EKJURHULENI LEDGER.xlsx')!;
    expect(extraction.values).toHaveLength(0);
    expect(extraction.exceptions.join(' ')).toContain('EXCLUDE');
  });
});

describe('as an extraction', () => {
  it('emits ONE supplier row, not one row per invoice line', () => {
    // A ledger evidences one account's total; emitting its lines as separate
    // supplier rows would present a single supplier as twenty.
    const extraction = extractLedgerTable(twoSidedLedger(), 'B P EDENVALE LEDGER.xlsx')!;
    expect(extraction.element).toBe('ESD');
    const rows = extraction.values[0].value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].supplier_name).toBe('B P EDENVALE');
    expect(rows[0].claimed_spend_ex_vat).toBeCloseTo(402379.39, 2);
  });

  it('returns null for a non-ledger so the schedule path still runs', () => {
    expect(extractLedgerTable([{ 'Supplier Name': 'Alpha', DATE: 'x', Amount: 1 }], 'a.xlsx')).toBeNull();
  });
});
