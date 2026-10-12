/**
 * A saved e-mail (.eml) is evidence like a letter: a data-request thread says
 * who asked for what, by when, and what was attached. Before this an .eml was
 * refused as an unsupported type. Now its headers, its body (plain text, or
 * the HTML as markdown) with the quoted replies, and its attachments' names
 * are read; inline signature images are not listed and no attachment's
 * content is read. An e-mail forwarded as an attachment is read after the
 * message that carries it. Every address, name and figure here is invented.
 *
 * One reader serves the upload (emailMessage.ts); these cases came from a
 * second reader built alongside it and now hold the one that is kept.
 */
import { describe, expect, it } from 'vitest';
import { decodeEncodedWords, readEmailThread } from '../../src/services/emailMessage.js';
import { isSupportedUpload, rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

const thread = [
  'From: =?utf-8?Q?Jo=C3=A3o_Example?= <jo@example.test>',
  'To: Data Team <data@example.test>',
  'Subject: RE: Data request',
  'Date: Wed, 27 May 2026 08:30:29 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed;',
  '\tboundary="outer"',
  '',
  '--outer',
  'Content-Type: multipart/related; boundary="rel"',
  '',
  '--rel',
  'Content-Type: multipart/alternative; boundary="alt"',
  '',
  '--alt',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: base64',
  '',
  b64('Hi team,\r\nThe fleet register is at 28 of 134 vehicles.\r\nPlease return the data by 22 May 2026.\r\n\r\nFrom: Data Team\r\nSent: 14 May 2026\r\nWe request data for 1 July 2025 - end April 2026.'),
  '--alt',
  'Content-Type: text/html; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<p>Hi team, the fleet register is at 28 of 134 vehicles=2E</p>',
  '--alt--',
  '--rel',
  'Content-Type: image/png; name="image001.png"',
  'Content-Disposition: inline; filename="image001.png"',
  'Content-Transfer-Encoding: base64',
  '',
  'iVBORw0KGgo=',
  '--rel--',
  '--outer',
  'Content-Type: application/pdf; name="Audit summary.pdf"',
  'Content-Disposition: attachment; filename="Audit summary.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQK',
  '--outer--',
  '',
].join('\r\n');

describe('reading a saved e-mail', () => {
  it('reads its headers, its plain body with the quoted reply, and names its attachment', async () => {
    const { markdown, text } = readEmailThread(Buffer.from(thread, 'latin1'));
    expect(markdown.startsWith('# E-mail thread: RE: Data request')).toBe(true);
    expect(markdown).toContain('From: João Example <jo@example.test>');
    expect(markdown).toContain('Date: Wed, 27 May 2026 08:30:29 +0000');
    expect(markdown).toContain('Subject: RE: Data request');
    expect(markdown).toContain('28 of 134 vehicles');
    expect(markdown).toContain('We request data for 1 July 2025 - end April 2026.');
    expect(markdown).toMatch(/Attachments: Audit summary\.pdf \(\d+ B\)/);
    expect(markdown).not.toContain('image001.png');
    expect(markdown).not.toContain('JVBERi0');
    expect(text).toContain('Please return the data by 22 May 2026.');
  });

  it('falls back to the HTML body when there is no plain text', async () => {
    const htmlOnly = [
      'From: a@example.test',
      'Subject: Note',
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>Total vehicles: 77 =E2=80=93 confirmed</p>',
      '',
    ].join('\r\n');
    const { markdown } = readEmailThread(Buffer.from(htmlOnly, 'latin1'));
    expect(markdown).toContain('Total vehicles: 77 – confirmed');
  });

  it('reads an attached e-mail after the message, with its own attachments named', async () => {
    const forwarded = [
      'From: b@example.test',
      'Subject: See attached',
      'Content-Type: multipart/mixed; boundary="m"',
      '',
      '--m',
      'Content-Type: text/plain',
      '',
      'See the attached for the audit.',
      '--m',
      'Content-Type: message/rfc822',
      'Content-Disposition: attachment',
      '',
      'From: c@example.test',
      'Subject: Audit report',
      'Date: Wed, 27 May 2026 08:15:01 +0000',
      'Content-Type: multipart/mixed; boundary="n"',
      '',
      '--n',
      'Content-Type: text/plain',
      '',
      'Report attached.',
      '--n',
      'Content-Type: application/pdf',
      'Content-Disposition: attachment; filename="Audit-0001.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQK',
      '--n--',
      '--m--',
      '',
    ].join('\r\n');
    const { markdown } = readEmailThread(Buffer.from(forwarded, 'latin1'));
    expect(markdown).toMatch(/Attachments: Audit report \(\d+ B\)/);
    expect(markdown).toContain('(attached e-mail)');
    expect(markdown).toContain('Report attached.');
    expect(markdown).toMatch(/Attachments: Audit-0001\.pdf \(\d+ B\)/);
    expect(markdown.indexOf('See the attached')).toBeLessThan(markdown.indexOf('(attached e-mail)'));
  });

  it('decodes encoded header words', () => {
    expect(decodeEncodedWords('=?utf-8?B?RGF0YSByZXF1ZXN0?= =?utf-8?Q?_=E2=80=93_May?=')).toBe('Data request – May');
  });

  it('is an accepted upload, read into the case input', async () => {
    expect(isSupportedUpload('message/rfc822', 'thread.eml')).toBe(true);
    expect(isSupportedUpload('application/octet-stream', 'thread.eml')).toBe(true);
    const input = await rawExtractionInputFromUpload({
      originalname: 'thread.eml', mimetype: 'message/rfc822', size: thread.length, buffer: Buffer.from(thread, 'latin1'),
    });
    expect(input.markdown).toContain('28 of 134 vehicles');
    expect(input.raw_text).toContain('Subject: RE: Data request');
  });
});
