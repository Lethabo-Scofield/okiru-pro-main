/**
 * Unit tests for the standard API envelope helpers used by all new
 * certificate + admin endpoints.
 *
 * The envelope contract is part of the public API:
 *   success:  { success: true,  data: T,    error: null }
 *   failure:  { success: false, data: null, error: { message, code } }
 *
 * Frontend code (CertificateDetail, AdminCertificates) reads from this shape,
 * so any drift breaks the UI silently. These assertions lock the shape down.
 */
import { describe, it, expect } from 'vitest';
import { ok, fail, failWith } from '../apiResponse.js';

describe('apiResponse helpers', () => {
  describe('ok()', () => {
    it('wraps the payload in the success envelope', () => {
      const result = ok({ id: '123', name: 'Acme' });
      expect(result).toEqual({
        success: true,
        data: { id: '123', name: 'Acme' },
        error: null,
      });
    });

    it('preserves nested arrays and falsy values verbatim', () => {
      const data = { items: [1, 2, 3], total: 0, label: '' };
      const result = ok(data);
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBe(data); // same reference, not cloned
    });

    it('handles null payloads explicitly', () => {
      const result = ok(null);
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe('fail()', () => {
    it('returns the failure envelope with message + code', () => {
      const result = fail('Not found', 'NOT_FOUND');
      expect(result).toEqual({
        success: false,
        data: null,
        error: { message: 'Not found', code: 'NOT_FOUND' },
      });
    });

    it('always sets data to null', () => {
      const result = fail('boom', 'X');
      expect(result.data).toBeNull();
      expect(result.success).toBe(false);
    });
  });

  describe('failWith()', () => {
    it('returns failure envelope but keeps a data payload (e.g. existing record on 409)', () => {
      const existing = { id: 'abc', vatNumber: '4123456789' };
      const result = failWith('Duplicate VAT', 'DUPLICATE_VAT', existing);
      expect(result.success).toBe(false);
      expect(result.error).toEqual({ message: 'Duplicate VAT', code: 'DUPLICATE_VAT' });
      expect(result.data).toBe(existing);
    });
  });
});
