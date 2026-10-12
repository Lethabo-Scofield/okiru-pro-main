/**
 * @vitest-environment jsdom
 *
 * Every kind of document a user uploads converts into something readable:
 * Word (new and old), PowerPoint, Markdown, e-mail, web pages, CSV and text.
 */
import { describe, expect, it } from "vitest";
import { convertDocument, previewKind, isRichKind, rasterImageType } from "..";
import { csvToDoc, parseCsv } from "../csv";
import { docxToDoc } from "../docx";
import { decodeHeader, emlToDoc } from "../eml";
import { htmlToDoc } from "../html";
import { cleanWordText, legacyDocToDoc } from "../legacyDoc";
import { MAX_BLOCKS, MAX_TEXT_BYTES } from "../limits";
import { markdownToDoc, parseInline } from "../markdown";
import { pptxToDoc } from "../pptx";
import { safeHref } from "../safeHref";
import { inlineText, type Block, type Inline } from "../types";
import { docxBytes, EML, legacyDocBytes, pptxBytes } from "./fixtures";

const text = (content: Inline[]) => inlineText(content);
const bytesOf = (s: string) => new TextEncoder().encode(s);

describe("previewKind", () => {
  it("knows every document type by its extension, whatever the case", () => {
    expect(previewKind("Profile.DOCX")).toBe("word");
    expect(previewKind("old.doc")).toBe("legacy-word");
    expect(previewKind("notes.md")).toBe("markdown");
    expect(previewKind("thread.eml")).toBe("email");
    expect(previewKind("deck.pptx")).toBe("slides");
    expect(previewKind("register.csv")).toBe("csv");
    expect(previewKind("register.tsv")).toBe("csv");
    expect(previewKind("readme.txt")).toBe("text");
    expect(previewKind("data.json")).toBe("code");
    expect(previewKind("page.html")).toBe("html");
    expect(previewKind("scan.TIF")).toBe("image");
    expect(previewKind("photo.jpeg")).toBe("image");
    expect(previewKind("book.xlsm")).toBe("spreadsheet");
    expect(previewKind("cert.pdf")).toBe("pdf");
    expect(previewKind("drawing.dwg")).toBe("other");
    // SVG can carry script: never an inline picture, by name or by type.
    expect(previewKind("logo.svg")).toBe("other");
    expect(previewKind("logo.SVGZ")).toBe("other");
    expect(previewKind("upload", "image/svg+xml")).toBe("other");
    expect(previewKind("upload", "image/png")).toBe("image");
    expect(rasterImageType("photo.JPG")).toBe("image/jpeg");
    expect(rasterImageType("logo.svg")).toBe("application/octet-stream");
  });

  it("falls back to the file's type when the name has no extension", () => {
    expect(previewKind("download", "application/pdf")).toBe("pdf");
    expect(previewKind("download", "message/rfc822")).toBe("email");
    expect(previewKind("download", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("word");
    expect(previewKind("download", "application/octet-stream")).toBe("other");
  });

  it("sends the word-holding kinds to the converter", () => {
    for (const kind of ["word", "legacy-word", "slides", "markdown", "email", "html", "csv", "text", "code"] as const) expect(isRichKind(kind)).toBe(true);
    for (const kind of ["pdf", "image", "spreadsheet", "other"] as const) expect(isRichKind(kind)).toBe(false);
  });
});

describe("Word (.docx)", () => {
  it("keeps headings, emphasis, lists, tables and checked links", async () => {
    const doc = await docxToDoc(await docxBytes());
    const types = doc.blocks.map((b) => b.type);
    expect(types).toEqual(["heading", "heading", "paragraph", "heading", "list", "list", "table", "paragraph", "paragraph"]);

    const [title, h1, para, h2, bullets, numbers, table, links, breaks] = doc.blocks as any[];
    expect(title).toMatchObject({ level: 1 });
    expect(text(title.content)).toBe("Sample overview");
    expect(h1.level).toBe(1);
    expect(h2.level).toBe(2); // a translated style name ("kop 2") is still a heading
    expect(text(para.content)).toBe("We are a level 2 contributor. Since 2019.");
    expect(para.content.find((n: any) => n.text === "level 2")).toMatchObject({ bold: true });
    expect(para.content.find((n: any) => n.text === "Since 2019.")).toMatchObject({ italic: true });
    expect(para.content.find((n: any) => n.text === "Since 2019.").bold).toBeUndefined();

    expect(bullets.ordered).toBe(false);
    expect(bullets.items.map((i: any) => [text(i.content), i.depth])).toEqual([["Haulage", 0], ["Cold chain", 1], ["Warehousing", 0]]);
    expect(numbers.ordered).toBe(true);
    expect(numbers.items.map((i: any) => text(i.content))).toEqual(["First step", "Second step"]);

    expect(table.rows).toEqual([["Shareholder", "Share"], ["Holder A", "51%"]]);

    expect(links.content.find((n: any) => n.text === "Read the policy").href).toBe("https://example.com/policy");
    expect(links.content.find((n: any) => n.text === "this bad link").href).toBeUndefined();

    // Tracked deletions are left out; a line break stays a line break.
    expect(text(breaks.content)).toBe("Line one\nLine two");
    expect(doc.truncated).toBe(false);
  });

  it("refuses a zip that is not a Word file", async () => {
    await expect(docxToDoc(await pptxBytes())).rejects.toThrow(/Not a Word document/);
  });
});

describe("old Word (.doc)", () => {
  it("finds the text through the piece table, dropping field codes and keeping their results", async () => {
    const doc = await legacyDocToDoc(legacyDocBytes('Supplier letter\rDear team, see \x13 HYPERLINK "https://example.com" \x14our site\x15.\rName\x07Level\x07\x07\r'));
    expect(doc.blocks.map((b) => text((b as any).content))).toEqual(["Supplier letter", "Dear team, see our site.", "Name | Level"]);
  });

  it("goes through convertDocument for a .doc, and reads a .docx saved as .doc", async () => {
    const legacy = await convertDocument(new Blob([legacyDocBytes("Hello\r")]), "legacy-word", "a.doc");
    expect(text((legacy.blocks[0] as any).content)).toBe("Hello");
    const renamed = await convertDocument(new Blob([await docxBytes()]), "legacy-word", "a.doc");
    expect(renamed.blocks[0].type).toBe("heading");
  });

  it("cleans Word's control characters", () => {
    expect(cleanWordText("a\x0bb\rc\x1ed\x01\r\r")).toEqual(["a", "b", "c-d"]);
  });

  it("rejects bytes that are not a Word file", async () => {
    await expect(convertDocument(new Blob([bytesOf("just some text")]), "legacy-word", "x.doc")).rejects.toThrow();
  });
});

describe("PowerPoint (.pptx)", () => {
  it("gives one section per slide in slide order, title first, bullets and tables kept", async () => {
    const doc = await pptxToDoc(await pptxBytes());
    expect(doc.blocks.map((b) => (b as any).label)).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
    const [first, second, third] = doc.blocks as Array<Extract<Block, { type: "section" }>>;
    expect(first.blocks[0]).toMatchObject({ type: "heading" });
    expect(text((first.blocks[0] as any).content)).toBe("Results");
    const list = first.blocks[1] as Extract<Block, { type: "list" }>;
    expect(list.items.map((i) => [text(i.content), i.depth])).toEqual([["Revenue up", 0], ["Costs flat", 0], ["Detail below", 1]]);
    expect(list.items[0].content[0]).toMatchObject({ bold: true });
    expect(second.blocks.find((b) => b.type === "table")).toMatchObject({ rows: [["Holder", "Share"], ["Holder A", "51%"]] });
    expect(text((third.blocks[0] as any).content)).toBe("Next steps");
  });
});

describe("Markdown", () => {
  it("renders the structure a note uses", () => {
    const md = [
      "# Data request",
      "",
      "Please send the **signed** AFS and the *latest* `TMPS` [template](https://example.com/t).",
      "",
      "## Checklist",
      "- [x] Certificate",
      "- [ ] Payroll",
      "  - December",
      "1. First",
      "2. Second",
      "",
      "| Item | Due |",
      "| --- | --- |",
      "| AFS | 30 Oct |",
      "| Payroll \\| wages | 2 Nov |",
      "",
      "> Quoted reply",
      "",
      "```",
      "raw <b>code</b>",
      "```",
      "",
      "---",
      "Underlined heading",
      "==================",
    ].join("\n");
    const doc = markdownToDoc(md);
    expect(doc.blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "heading", "list", "list", "table", "quote", "code", "rule", "heading"]);
    const para = (doc.blocks[1] as any).content as any[];
    expect(para.find((n) => n.text === "signed")).toMatchObject({ bold: true });
    expect(para.find((n) => n.text === "latest")).toMatchObject({ italic: true });
    expect(para.find((n) => n.text === "TMPS")).toMatchObject({ code: true });
    expect(para.find((n) => n.text === "template")).toMatchObject({ href: "https://example.com/t" });
    const checklist = doc.blocks[3] as Extract<Block, { type: "list" }>;
    expect(checklist.items.map((i) => [text(i.content), i.depth])).toEqual([["☑ Certificate", 0], ["☐ Payroll", 0], ["December", 1]]);
    expect((doc.blocks[4] as any).ordered).toBe(true);
    expect((doc.blocks[5] as any).rows).toEqual([["Item", "Due"], ["AFS", "30 Oct"], ["Payroll | wages", "2 Nov"]]);
    expect((doc.blocks[7] as any).text).toBe("raw <b>code</b>");
    expect((doc.blocks[9] as any).level).toBe(1);
  });

  it("does not read snake_case names or lone asterisks as emphasis", () => {
    const nodes = parseInline("total_spend_value is 5 * 3 and file_name");
    expect(nodes).toEqual([{ text: "total_spend_value is 5 * 3 and file_name" }]);
  });

  it("stays fast on a long line full of emphasis openers that never close", () => {
    // These took 2 s, 18 s and 106 s before the closer search was memoised.
    for (const line of ["*a ".repeat(8000), "**a ".repeat(8000), "_a ".repeat(8000), "~~a ".repeat(8000), "`` a ".repeat(8000), "[a ".repeat(8000)]) {
      const started = performance.now();
      const doc = markdownToDoc(line);
      expect(performance.now() - started).toBeLessThan(1500);
      // Nothing is lost: the first MAX_INLINE_CHARS are parsed, the rest kept as text.
      if (!line.startsWith("`")) expect(text((doc.blocks[0] as any).content)).toBe(line.trim());
    }
  });

  it("stays fast on a whole budget of text in one line, and on deeply nested emphasis", () => {
    const huge = "**a *b _c_ d* e** ".repeat(30_000);
    let started = performance.now();
    markdownToDoc(huge);
    expect(performance.now() - started).toBeLessThan(1500);
    const nested = `${"*a **b ".repeat(2000)}c${"** d*".repeat(2000)}`;
    started = performance.now();
    markdownToDoc(nested);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("still reads emphasis after a run of openers that never close", () => {
    const nodes = parseInline(`${"*a ".repeat(50)}and **bold** end`);
    expect(nodes.find((n) => (n as any).text === "bold")).toMatchObject({ bold: true });
  });

  it("keeps raw HTML as visible text and turns pictures into notes", () => {
    const doc = markdownToDoc('<img src="https://tracker.example.com/x.png" onerror="alert(1)"> ![logo](https://cdn.example.com/logo.png) [bad](javascript:alert(1))');
    const nodes = (doc.blocks[0] as any).content as any[];
    expect(text(nodes)).toContain('<img src="https://tracker.example.com/x.png" onerror="alert(1)">');
    expect(text(nodes)).toContain("[Image: logo]");
    expect(nodes.every((n) => !n.href)).toBe(true);
  });
});

describe("e-mail (.eml)", () => {
  it("shows the headers, the HTML body (sanitised) and lists the attachments", () => {
    const doc = emlToDoc(bytesOf(EML));
    expect(doc.title).toBe("Quarterly figures – draft");
    expect(doc.meta?.map((m) => m.label)).toEqual(["From", "To", "Cc", "Date"]);
    expect(doc.meta?.[0].value).toBe("Alex Sample <alex@example.com>");
    expect(doc.attachments).toEqual([
      { name: "summary.pdf", type: "application/pdf", size: 15 },
      { name: "Spend register.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 10 },
    ]);
    const all = JSON.stringify(doc.blocks);
    expect(all).toContain("the figures are attached.");
    expect(all).not.toContain("__emlPwned");
    expect(all).not.toContain("tracker.example.com");
    expect(all).not.toContain("color:red");
    expect(doc.blocks.find((b) => b.type === "list")).toBeTruthy();
  });

  it("uses the text part when there is no HTML part", () => {
    const doc = emlToDoc(bytesOf("Subject: Hi\r\nContent-Type: text/plain\r\n\r\nLine one\r\nLine two\r\n\r\n> quoted\r\n"));
    expect(doc.blocks.map((b) => b.type)).toEqual(["paragraph", "quote"]);
    expect(text((doc.blocks[0] as any).content)).toBe("Line one\nLine two");
  });

  it("decodes encoded-word headers", () => {
    expect(decodeHeader("=?iso-8859-1?Q?Caf=E9?= =?UTF-8?B?IG9wZW4=?=")).toBe("Café open");
  });
});

describe("CSV and text", () => {
  it("parses quotes, embedded delimiters and semicolon exports", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n').rows).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(csvToDoc("Name;Spend\nSupplier A;100\n").blocks[0]).toMatchObject({ rows: [["Name", "Spend"], ["Supplier A", "100"]], header: true });
  });

  it("caps a huge CSV and says so", () => {
    const big = ["h1,h2", ...Array.from({ length: 2000 }, (_, i) => `${i},x`)].join("\n");
    const doc = csvToDoc(big);
    expect((doc.blocks[0] as any).rows.length).toBe(501);
    expect(doc.truncated).toBe(true);
  });

  it("reads only the start of a very large text file", async () => {
    const huge = new Blob([("A line of text.\n\n").repeat(Math.ceil((MAX_TEXT_BYTES * 2) / 17))]);
    const doc = await convertDocument(huge, "text", "big.txt");
    expect(doc.truncated).toBe(true);
    expect(doc.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });

  it("pretty-prints JSON as code", async () => {
    const doc = await convertDocument(new Blob(['{"a":1}']), "code", "x.json");
    expect(doc.blocks[0]).toEqual({ type: "code", text: '{\n  "a": 1\n}' });
  });
});

describe("safeHref", () => {
  it("keeps web and mail links only", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    for (const bad of ["javascript:alert(1)", "java\tscript:alert(1)", " javascript:alert(1)", "data:text/html,<script>", "vbscript:x", "file:///c:/x", "/relative", "//evil.example.com"]) {
      expect(safeHref(bad)).toBeUndefined();
    }
  });
});

describe("html", () => {
  it("lays out an e-mail built from single-column tables as paragraphs", () => {
    const doc = htmlToDoc("<table><tr><td><p>Hello</p></td></tr><tr><td>World</td></tr></table>");
    expect(doc.blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("keeps real tables", () => {
    const doc = htmlToDoc("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
    expect(doc.blocks[0]).toMatchObject({ type: "table", header: true, rows: [["A", "B"], ["1", "2"]] });
  });
});
