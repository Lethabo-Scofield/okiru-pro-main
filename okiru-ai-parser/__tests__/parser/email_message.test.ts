/**
 * A saved e-mail (.eml) is a document: the data request and its replies state
 * the reporting period, the deadline and who owns which figures. The upload
 * used to refuse it as an unsupported type. Invented people, company and
 * figures throughout.
 */
import { describe, expect, it } from 'vitest';
import { decodeEncodedWords, readEmailThread } from '../../src/services/emailMessage.js';
import { isSupportedUpload, rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';

const attachment = Buffer.from('invented spreadsheet bytes').toString('base64');

const EML = [
  'From: Lerato Dube <lerato@acme.example>',
  'To: Sipho Khumalo <sipho@acme.example>',
  'Cc: =?utf-8?Q?Ren=C3=A9_Botha?= <rene@acme.example>',
  'Date: Tue, 3 Feb 2026 09:14:00 +0200',
  'Subject: =?utf-8?B?UkU6IEVTRyBkYXRhIHJlcXVlc3Qg4oCUIEZZMjAyNg==?=',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="outer"',
  '',
  'This is a multi-part message in MIME format.',
  '--outer',
  'Content-Type: multipart/alternative; boundary="inner"',
  '',
  '--inner',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Hi Sipho,',
  '',
  'The fleet register is 80% done; all 48 vehicles are listed. The B-BBEE level',
  ' is Level 2. Please send the rest by 27 February 2026.',
  '',
  'Regards, Lerato',
  '',
  'From: Sipho Khumalo <sipho@acme.example>',
  'Sent: Monday, 2 February 2026 16:02',
  'To: Lerato Dube <lerato@acme.example>',
  'Subject: ESG data request =E2=80=94 FY2026',
  '',
  'Lerato, please gather the data for 1 July 2025 to 30 June 2026. Owners: fleet =',
  '=E2=80=94 Thabo; energy =E2=80=94 Naledi.',
  '--inner',
  'Content-Type: text/html; charset="utf-8"',
  '',
  '<p>Hi Sipho (HTML copy)</p>',
  '--inner--',
  '--outer',
  'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="Data request template.xlsx"',
  'Content-Disposition: attachment; filename="Data request template.xlsx"',
  'Content-Transfer-Encoding: base64',
  '',
  attachment,
  '--outer--',
  '',
].join('\r\n');

describe('a saved e-mail is read as a document', () => {
  it('reads each message of the thread — headers, plain-text body — and lists the attachments by name', () => {
    const thread = readEmailThread(Buffer.from(EML, 'utf8'));
    expect(thread.subject).toBe('RE: ESG data request — FY2026');
    expect(thread.messages).toHaveLength(2);
    const [reply, request] = thread.messages;
    expect(reply).toMatchObject({ from: 'Lerato Dube <lerato@acme.example>', cc: 'René Botha <rene@acme.example>', date: 'Tue, 3 Feb 2026 09:14:00 +0200' });
    expect(reply.body).toContain('all 48 vehicles are listed');
    expect(reply.body).not.toContain('HTML copy');
    expect(request).toMatchObject({ from: 'Sipho Khumalo <sipho@acme.example>', date: 'Monday, 2 February 2026 16:02', subject: 'ESG data request — FY2026', quoted: true });
    expect(request.body).toContain('1 July 2025 to 30 June 2026');
    expect(request.body).toContain('energy — Naledi');
    expect(thread.attachments).toEqual([
      expect.objectContaining({ filename: 'Data request template.xlsx', size: Buffer.from(attachment, 'base64').length }),
    ]);
    expect(thread.markdown).toContain('Attachments: Data request template.xlsx');
  });

  it('is an upload the parser accepts, and reads as text with its e-mail details in the metadata', async () => {
    expect(isSupportedUpload('message/rfc822', 'request.eml')).toBe(true);
    // Browsers send .eml as anything at all.
    expect(isSupportedUpload('application/octet-stream', 'request.eml')).toBe(true);
    const buffer = Buffer.from(EML, 'utf8');
    for (const mimetype of ['message/rfc822', 'text/plain']) {
      const input = await rawExtractionInputFromUpload({ originalname: 'request.eml', mimetype, buffer, size: buffer.length });
      expect(input.markdown).toContain('# E-mail thread: RE: ESG data request — FY2026');
      expect(input.raw_text).toContain('Please send the rest by 27 February 2026');
      // Not the raw MIME.
      expect(input.raw_text).not.toContain('Content-Transfer-Encoding');
      expect(input.metadata).toMatchObject({ email: { subject: 'RE: ESG data request — FY2026', messages: 2, attachments: ['Data request template.xlsx'] } });
    }
  });

  it('decodes encoded header words in both encodings', () => {
    expect(decodeEncodedWords('=?iso-8859-1?Q?Caf=E9_report?=')).toBe('Café report');
    expect(decodeEncodedWords('=?UTF-8?B?w6l0w6k=?= plain')).toBe('été plain');
  });
});
