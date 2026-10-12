/**
 * The ESG AI review's server half, with a stub model and a stub library. Pins
 * the contract the browser relies on:
 *
 *  - the prompt is built from the stored workbook and the filed documents;
 *  - the free document rules run first and cost nothing;
 *  - one model call per review, none when nothing is left open;
 *  - only answers the documents back come back — an invented one is dropped
 *    and becomes a question;
 *  - nothing is written.
 *
 * `esgWorkbookRoutes.ts` pulls in the whole server bootstrap and cannot be
 * imported here, so the route's wiring is pinned structurally and its handler
 * (`respondWithEsgAiReview`) is driven directly. Every figure, site and file
 * name here is invented.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { respondWithEsgAiReview, setEsgReviewModelForTests, setEsgReviewLibraryForTests, loadEsgReviewLibrary } from "../esgWorkbookAiReview";
import { esgLibraryDocumentFromRun } from "../../src/lib/esg/esgAiReviewModel";
import type { EsgWorkbookLike } from "../../src/lib/esg/esgAiReviewFill";

afterEach(() => {
  setEsgReviewModelForTests(null);
  setEsgReviewLibraryForTests(null);
});

function fakeRes() {
  const out: { status: number; body: any } = { status: 200, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res: res as never, out };
}

function stubModel(reply: (prompt: string) => unknown) {
  const create = vi.fn(async (params: { messages: Array<{ role: string; content: string }> }) => {
    const user = params.messages.find((m) => m.role === "user")?.content ?? "";
    return { choices: [{ message: { content: JSON.stringify(reply(user)) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  });
  setEsgReviewModelForTests(() => ({ client: { chat: { completions: { create } } } as never, model: "stub" }));
  return create;
}

const targetId = (prompt: string, needle: string) => {
  const line = prompt.split("\n").find((l) => /^T\d+ \|/.test(l) && l.includes(needle));
  if (!line) throw new Error(`no open cell matching ${needle}`);
  return line.split(" |")[0];
};
const docId = (prompt: string, file: string) => {
  const line = prompt.split("\n").find((l) => /^D\d+ \|/.test(l) && l.includes(file));
  if (!line) throw new Error(`no document ${file}`);
  return line.split(" |")[0];
};

const AXES = { eSites: "North\nSouth", eFirstMonth: "Jan-25", eMonthCount: 3 };
const workbook = (sections: Record<string, Record<string, unknown>>): EsgWorkbookLike => ({
  sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
});

const field = (v: unknown) => ({ raw_value: v, normalized_value: v, data_type: "string", confidence: 0.9, source: { page: 1, table: null, text_snippet: String(v) } });

const LIBRARY = [
  esgLibraryDocumentFromRun({ id: "b1", filename: "north-jan.pdf" }, {
    extracted_fields: {
      "energy.electricity_kwh": field(1200),
      "energy.site_name": field("North depot"),
      "energy.billing_period_start": field("2025-01-01"),
      "energy.billing_period_end": field("2025-01-31"),
    },
  }),
  esgLibraryDocumentFromRun({ id: "b2", filename: "harbour-mar.pdf" }, {
    extracted_fields: {
      "energy.electricity_kwh": field(700),
      "energy.site_name": field("Unit 9, Harbour Park"),
      "energy.billing_period_start": field("2025-03-01"),
      "energy.billing_period_end": field("2025-03-31"),
    },
  }),
  esgLibraryDocumentFromRun({ id: "p1", filename: "ethics-policy.pdf" }, {
    extracted_fields: { statement: field("The board approved the code of ethics on 3 March.") },
  }),
];

describe("respondWithEsgAiReview", () => {
  it("runs the free rules, then one call grounded on the workbook and the documents, returning only backed answers", async () => {
    const create = stubModel((prompt) => ({
      fills: [
        { target: targetId(prompt, "Which site is this bill for?"), value: "South", kind: "read", rule: "site", document: docId(prompt, "harbour-mar.pdf"), quote: "Unit 9, Harbour Park", reasoning: "Harbour Park is the South depot." },
        { target: targetId(prompt, "Code of ethics"), value: "Yes", kind: "read", rule: "policy", document: docId(prompt, "ethics-policy.pdf"), quote: "The board approved the code of ethics", reasoning: "Board approved." },
        // Invented: no document states this.
        { target: targetId(prompt, "Whistleblower"), value: "Yes", kind: "read", rule: "policy", document: docId(prompt, "ethics-policy.pdf"), quote: "A hotline runs all year", reasoning: "Probably." },
      ],
      questions: [],
    }));
    const { res, out } = fakeRes();
    await respondWithEsgAiReview(workbook({ "e-data": { ...AXES } }), LIBRARY, res);

    expect(out.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    const prompt = create.mock.calls[0][0].messages.find((m: { role: string }) => m.role === "user")!.content;
    expect(prompt).toContain("Unit 9, Harbour Park");
    expect(out.body.modelCalls).toBe(1);
    expect(out.body.documents).toBe(3);
    const keys = out.body.proposals.map((p: { key: string; origin: string }) => `${p.origin}:${p.key}`);
    // The North bill is placed by the rules, free; the model placed the other.
    expect(keys).toEqual(expect.arrayContaining(["rules:e-data!s2_C14", "model:e-data!s2_E15", "model:g-data!B15"]));
    expect(keys.some((k: string) => k.endsWith("g-data!B16"))).toBe(false);
    expect(out.body.rejected).toBe(1);
    expect(out.body.questions.some((q: { key?: string }) => q.key === "g-data!B16")).toBe(true);
  });

  it("makes no call when nothing is left open", async () => {
    const create = stubModel(() => ({ fills: [], questions: [] }));
    const { res, out } = fakeRes();
    await respondWithEsgAiReview(workbook({ "e-data": { ...AXES } }), [], res);
    expect(create).not.toHaveBeenCalled();
    expect(out.body).toMatchObject({ proposals: [], modelCalls: 0, considered: 0 });
    expect(out.body.notes.join(" ")).toMatch(/No documents are filed/);
  });

  it("still returns the free rules' fills when no model is configured", async () => {
    setEsgReviewModelForTests(() => null);
    const { res, out } = fakeRes();
    await respondWithEsgAiReview(workbook({ "e-data": { ...AXES } }), LIBRARY, res);
    expect(out.status).toBe(200);
    expect(out.body.modelCalls).toBe(0);
    expect(out.body.proposals.map((p: { key: string }) => p.key)).toEqual(["e-data!s2_C14"]);
    expect(out.body.error).toMatch(/not configured/);
  });

  it("says 503 when no model is configured and the rules found nothing", async () => {
    setEsgReviewModelForTests(() => null);
    const { res, out } = fakeRes();
    await respondWithEsgAiReview(workbook({ "e-data": { ...AXES } }), [LIBRARY[2]], res);
    expect(out.status).toBe(503);
  });

  it("writes nothing to the workbook it was given", async () => {
    stubModel(() => ({ fills: [], questions: [] }));
    const wb = workbook({ "e-data": { ...AXES } });
    const before = JSON.stringify(wb);
    const { res } = fakeRes();
    await respondWithEsgAiReview(wb, LIBRARY, res);
    expect(JSON.stringify(wb)).toBe(before);
  });

  it("reads the library through the seam, and an unreachable library is no documents", async () => {
    setEsgReviewLibraryForTests(async (companyId) => (companyId === "C-1" ? LIBRARY : []));
    expect(await loadEsgReviewLibrary({ headers: {} } as never, "C-1")).toHaveLength(3);
    setEsgReviewLibraryForTests(null);
    // No library service answers this session: the review carries on without documents.
    expect(await loadEsgReviewLibrary({ headers: {} } as never, "C-1")).toEqual([]);
  });
});

describe("the route", () => {
  const src = readFileSync(path.resolve(__dirname, "../esgWorkbookRoutes.ts"), "utf8");

  it("is registered under /api/esg, rate-limited, authorised, and refuses a submitted workbook", () => {
    const idx = src.indexOf('"/api/esg/workbook/:companyId/ai-review"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/requireAuth, aiReviewLimiter/);
    expect(block).toMatch(/authorizeEsgWorkbook\(req, res\)/);
    expect(block).toMatch(/submittedAt[\s\S]*423/);
    expect(block).toMatch(/respondWithEsgAiReview/);
    // The body is never read: grounding is the stored workbook.
    expect(block).not.toMatch(/req\.body/);
  });

  it("lets the section save store the review's sidecars", () => {
    expect(src).toMatch(/\.\.\.ESG_REVIEW_SIDECAR_SECTIONS/);
  });
});
