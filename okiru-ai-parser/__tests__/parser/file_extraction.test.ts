import { describe, expect, it } from 'vitest';
import { rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';

describe('file extraction upload input', () => {
  it('preserves CSV evidence values before parser resolution', async () => {
    const input = await rawExtractionInputFromUpload({
      originalname: 'supplier_certificate.csv',
      mimetype: 'text/csv',
      size: 128,
      buffer: Buffer.from([
        'Document,Value',
        'Document Type,B-BBEE Certificate',
        'Enterprise Name,ABC Suppliers Pty Ltd',
        'B-BBEE Status Level,Level Two',
        'Black Ownership,51%',
        'Expiry Date,01 Feb 2027',
      ].join('\n')),
    });

    expect(input.raw_text).toContain('Enterprise Name: ABC Suppliers Pty Ltd');
    expect(input.raw_text).toContain('B-BBEE Status Level: Level Two');
    expect(input.raw_text).toContain('Black Ownership: 51%');
    expect(input.raw_text).toContain('Expiry Date: 01 Feb 2027');
    expect(input.tables).toHaveLength(1);
  });
});
