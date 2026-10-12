/**
 * Small invented documents for the preview tests, built in memory so no real
 * client file is ever needed: a Word file, a slide deck, an old binary Word
 * file and an e-mail.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const p = (text: string, pPr = "", rPr = "") =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

export async function docxBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/styles.xml",
    `<w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
      <w:style w:type="paragraph" w:styleId="Kop2"><w:name w:val="heading 2"/></w:style>
      <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
    </w:styles>`,
  );
  zip.file(
    "word/numbering.xml",
    `<w:numbering ${W}>
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
    </w:numbering>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/policy" TargetMode="External"/>
      <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
    </Relationships>`,
  );
  const body = [
    p("Sample overview", '<w:pStyle w:val="Title"/>'),
    p("About us", '<w:pStyle w:val="Heading1"/>'),
    `<w:p><w:r><w:t xml:space="preserve">We are a </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>level 2</w:t></w:r><w:r><w:t xml:space="preserve"> contributor. </w:t></w:r><w:r><w:rPr><w:b w:val="0"/><w:i/></w:rPr><w:t>Since 2019.</w:t></w:r></w:p>`,
    p("Services", '<w:pStyle w:val="Kop2"/>'),
    p("Haulage", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    p("Cold chain", '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>'),
    p("Warehousing", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    p("First step", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
    p("Second step", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
    `<w:tbl><w:tr><w:tc>${p("Shareholder")}</w:tc><w:tc>${p("Share")}</w:tc></w:tr><w:tr><w:tc>${p("Holder A")}</w:tc><w:tc>${p("51%")}</w:tc></w:tr></w:tbl>`,
    `<w:p><w:hyperlink r:id="rId5"><w:r><w:t>Read the policy</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> or </w:t></w:r><w:hyperlink r:id="rId6"><w:r><w:t>this bad link</w:t></w:r></w:hyperlink></w:p>`,
    `<w:p><w:del><w:r><w:delText>removed words</w:delText></w:r></w:del><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>`,
  ].join("");
  zip.file("word/document.xml", `<w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

function slide(title: string, bullets: string[], table?: string[][]): string {
  const titleShape = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const bodyShape = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${bullets
    .map((b, i) => `<a:p><a:pPr lvl="${i === 2 ? 1 : 0}"/><a:r><a:rPr b="${i === 0 ? 1 : 0}"/><a:t>${b}</a:t></a:r></a:p>`)
    .join("")}</p:txBody></p:sp>`;
  const tableFrame = table
    ? `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${table
        .map((row) => `<a:tr>${row.map((c) => `<a:tc><a:txBody><a:p><a:r><a:t>${c}</a:t></a:r></a:p></a:txBody></a:tc>`).join("")}</a:tr>`)
        .join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    : "";
  // The body shape comes before the title in the tree, as decks often have it.
  return `<p:sld ${A}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${bodyShape}${titleShape}${tableFrame}</p:spTree></p:cSld></p:sld>`;
}

export async function pptxBytes(slides = 3): Promise<Uint8Array<ArrayBuffer>> {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", `<p:presentation ${A}/>`);
  zip.file("ppt/slides/slide1.xml", slide("Results", ["Revenue up", "Costs flat", "Detail below"]));
  zip.file("ppt/slides/slide2.xml", slide("Ownership", ["One"], [["Holder", "Share"], ["Holder A", "51%"]]));
  // slide10 must sort after slide2, not after slide1.
  if (slides >= 3) zip.file("ppt/slides/slide10.xml", slide("Next steps", ["Sign off", "Submit"]));
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

/** An old Word 97 file: a WordDocument stream with a FIB and a one-piece table. */
export function legacyDocBytes(text: string): Uint8Array<ArrayBuffer> {
  const TEXT_AT = 0x400;
  const word = new Uint8Array(TEXT_AT + text.length + 16);
  const view = new DataView(word.buffer);
  view.setUint16(0, 0xa5ec, true); // wIdent
  view.setUint16(0x0a, 0x0200, true); // fWhichTblStm → "1Table"
  view.setUint32(0x4c, text.length, true); // ccpText
  view.setUint32(0x01a2, 0, true); // fcClx
  view.setUint32(0x01a6, 21, true); // lcbClx
  for (let i = 0; i < text.length; i += 1) word[TEXT_AT + i] = text.charCodeAt(i);

  const table = new Uint8Array(21);
  const t = new DataView(table.buffer);
  table[0] = 0x02; // Pcdt
  t.setUint32(1, 16, true); // lcb: two CPs + one PCD
  t.setUint32(5, 0, true); // cp 0
  t.setUint32(9, text.length, true); // cp end
  t.setUint32(13 + 2, (TEXT_AT * 2) | 0x40000000, true); // fc, compressed (8-bit)

  const CFB = (XLSX as unknown as { CFB: any }).CFB;
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "/WordDocument", word);
  CFB.utils.cfb_add(container, "/1Table", table);
  const out = CFB.write(container, { type: "array" });
  return Uint8Array.from(out as ArrayLike<number>);
}

export const EML = [
  "From: =?UTF-8?B?QWxleCBTYW1wbGU=?= <alex@example.com>",
  "To: team@example.com",
  "Cc: finance@example.com",
  "Subject: =?UTF-8?Q?Quarterly_figures_=E2=80=93_draft?=",
  "Date: Tue, 06 Oct 2026 09:15:00 +0200",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "--mix",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Plain version of the body",
  "--alt",
  "Content-Type: text/html; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<html><head><style>p{color:red}</style></head><body><p>Hello <b>team</b>, the figures are attached.</p>=",
  '<script>window.__emlPwned =3D 1</script><img src=3D"https://tracker.example.com/p.gif" width=3D"1">',
  "<ul><li>Revenue</li><li>Spend</li></ul></body></html>",
  "--alt--",
  "--mix",
  'Content-Type: application/pdf; name="summary.pdf"',
  'Content-Disposition: attachment; filename="summary.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0xLjQKJcfsj6IK",
  "--mix",
  "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "Content-Disposition: attachment; filename*=utf-8''Spend%20register.xlsx",
  "Content-Transfer-Encoding: base64",
  "",
  "UEsDBAoAAAAAAA==",
  "--mix--",
  "",
].join("\r\n");
