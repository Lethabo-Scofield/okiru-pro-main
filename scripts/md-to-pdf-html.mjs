// Minimal, dependency-free Markdown -> styled HTML converter for the
// B-BBEE expert questions document. Handles the limited Markdown subset
// used in that file: headings, paragraphs, bold/italic/code, blockquotes,
// horizontal rules, GFM pipe tables and unordered lists.
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node md-to-pdf-html.mjs <input.md> <output.html>");
  process.exit(1);
}

const src = readFileSync(inPath, "utf8").replace(/\r\n/g, "\n");

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text) {
  let t = escapeHtml(text);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  // italics: single * not adjacent to another *
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  return t;
}

function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const lines = src.split("\n");
const out = [];
let i = 0;

function isTableSep(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

while (i < lines.length) {
  const line = lines[i];

  if (line.trim() === "") {
    i++;
    continue;
  }

  // Horizontal rule
  if (/^---+\s*$/.test(line.trim())) {
    out.push("<hr/>");
    i++;
    continue;
  }

  // Headings
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    i++;
    continue;
  }

  // Blockquote (collect consecutive > lines)
  if (line.startsWith(">")) {
    const buf = [];
    while (i < lines.length && lines[i].startsWith(">")) {
      buf.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
    continue;
  }

  // Table: current line has pipes and next line is a separator
  if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
    const header = parseTableRow(line);
    const aligns = parseTableRow(lines[i + 1]).map((c) => {
      const l = c.startsWith(":");
      const r = c.endsWith(":");
      if (l && r) return "center";
      if (r) return "right";
      if (l) return "left";
      return "left";
    });
    i += 2;
    const body = [];
    while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
      body.push(parseTableRow(lines[i]));
      i++;
    }
    let html = '<table><thead><tr>';
    header.forEach((c, idx) => {
      html += `<th style="text-align:${aligns[idx] || "left"}">${inline(c)}</th>`;
    });
    html += "</tr></thead><tbody>";
    for (const row of body) {
      html += "<tr>";
      row.forEach((c, idx) => {
        html += `<td style="text-align:${aligns[idx] || "left"}">${inline(c)}</td>`;
      });
      html += "</tr>";
    }
    html += "</tbody></table>";
    out.push(html);
    continue;
  }

  // Unordered list
  if (/^\s*-\s+/.test(line)) {
    const buf = [];
    while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
      buf.push(`<li>${inline(lines[i].replace(/^\s*-\s+/, ""))}</li>`);
      i++;
    }
    out.push(`<ul>${buf.join("")}</ul>`);
    continue;
  }

  // Paragraph (collect until blank line / block start)
  const buf = [];
  while (
    i < lines.length &&
    lines[i].trim() !== "" &&
    !/^(#{1,6})\s+/.test(lines[i]) &&
    !/^---+\s*$/.test(lines[i].trim()) &&
    !lines[i].startsWith(">") &&
    !/^\s*-\s+/.test(lines[i]) &&
    !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
  ) {
    buf.push(lines[i]);
    i++;
  }
  if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
}

const css = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.5; max-width: 100%; }
  h1 { font-size: 22pt; color: #4c2889; margin: 0 0 4pt; border-bottom: 3px solid #6d28d9; padding-bottom: 6pt; }
  h2 { font-size: 15pt; color: #4c2889; margin: 22pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #d8ccf0; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #2a2a2a; margin: 14pt 0 4pt; page-break-after: avoid; }
  h3 + p { page-break-before: avoid; }
  p { margin: 5pt 0; }
  blockquote { margin: 8pt 0; padding: 8pt 12pt; background: #f5f1fc; border-left: 4px solid #8b5cf6; color: #3a3357; border-radius: 3px; }
  hr { border: none; border-top: 1px solid #e4e4e7; margin: 14pt 0; }
  code { background: #f0ecfa; color: #4c2889; padding: 1px 4px; border-radius: 3px; font-family: "Cascadia Code", Consolas, monospace; font-size: 9.5pt; }
  ul { margin: 5pt 0; padding-left: 18pt; }
  li { margin: 2pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 9.5pt; page-break-inside: avoid; }
  th { background: #6d28d9; color: #fff; padding: 5pt 8pt; text-align: left; font-weight: 600; }
  td { padding: 4pt 8pt; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  tr:nth-child(even) td { background: #faf8fe; }
  strong { color: #2a2a2a; }
  h2, h3 { break-after: avoid; }
`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>B-BBEE Scorecard — Questions for Practitioner Review</title>
<style>${css}</style></head>
<body>${out.join("\n")}</body></html>`;

writeFileSync(outPath, html, "utf8");
console.log("wrote", outPath);
