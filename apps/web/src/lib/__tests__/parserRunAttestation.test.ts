import { afterEach, describe, expect, it, vi } from "vitest";
import { postParserRun, postSignedRun, signedRunsByFile, withoutSignedRuns } from "../parserRunAttestation";

const run = { filename: "cert.pdf", payload: '{"typ":"okiru.parser-run"}', signature: "sig" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signedRunsByFile", () => {
  it("indexes the parser's signed runs by uploaded file", () => {
    const byFile = signedRunsByFile({ run_attestations: [run, { ...run, filename: "afs.pdf" }] });
    expect(Array.from(byFile!.keys())).toEqual(["cert.pdf", "afs.pdf"]);
    expect(byFile!.get("cert.pdf")).toEqual(run);
  });

  it("is null when the parser signed nothing, so the caller can say so", () => {
    expect(signedRunsByFile({ documents_detected: [] })).toBeNull();
    expect(signedRunsByFile(null)).toBeNull();
  });

  it("ignores anything that is not a whole signed record", () => {
    const byFile = signedRunsByFile({ run_attestations: [{ filename: "cert.pdf", payload: "{}" }, null, run] });
    expect(byFile!.get("cert.pdf")).toEqual(run);
  });
});

describe("withoutSignedRuns", () => {
  it("drops the signed copies and keeps the case", () => {
    const result = { case_id: "c1", documents_detected: [], run_attestations: [run] };
    expect(withoutSignedRuns(result)).toEqual({ case_id: "c1", documents_detected: [] });
    expect(result.run_attestations).toEqual([run]);
  });
});

describe("postSignedRun", () => {
  it("files the signed text exactly as the parser issued it, and nothing else", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    await postSignedRun("doc 1", run);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/parser-documents/doc%201/runs");
    expect(JSON.parse(String(init.body))).toEqual({ attestation: { payload: run.payload, signature: run.signature } });
  });

  it("surfaces the library's refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: "This parser result was not issued by the parser, so it cannot be saved." }),
    })));
    await expect(postSignedRun("doc-1", run)).rejects.toThrow(/not issued by the parser/);
  });
});

describe("postParserRun", () => {
  const capture = () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    return () => JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
  };

  it("sends the pre-signing body beside the signed record, for an api that predates signing", async () => {
    const body = capture();
    await postParserRun("doc-1", "cert.pdf", { signed: run, legacy: { parserOutput: { status: "passed" }, caseId: "c1", reviewReasons: [] } });
    expect(body()).toEqual({
      parserOutput: { status: "passed" },
      caseId: "c1",
      reviewReasons: [],
      attestation: { payload: run.payload, signature: run.signature },
    });
  });

  it("refuses to send nothing — a file the parser did not sign is reported", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postParserRun("doc-1", "pack.xlsx", { signed: null, legacy: null })).rejects.toThrow(/did not sign its result for pack\.xlsx/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
