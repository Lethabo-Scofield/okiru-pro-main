import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  DOCUMENT_READING_UNAVAILABLE_MESSAGE,
  documentReadingDisabled,
  startsDocumentRead,
} from "../documentReading";
import { registerApiProxy } from "../apiProxy";

const KEY = "DOCUMENT_READING_DISABLED";

describe("the document-reading switch", () => {
  afterEach(() => {
    delete process.env[KEY];
  });

  it("is off unless the variable says true", () => {
    expect(documentReadingDisabled({})).toBe(false);
    expect(documentReadingDisabled({ [KEY]: "false" })).toBe(false);
    expect(documentReadingDisabled({ [KEY]: "1" })).toBe(false);
    expect(documentReadingDisabled({ [KEY]: " TRUE " })).toBe(true);
  });

  it("stops every request that starts, prices or repeats a read, and nothing else", () => {
    for (const path of [
      "/api/parser/quote-files",
      "/api/parser/resolve-case-files-stream",
      "/api/parser/esg/quote-files",
      "/api/parser/esg/resolve-case-files-stream",
      "/api/parser-documents/upload",
      "/api/parser-documents/abc123/reparse",
      "/api/parser-documents/abc123/reread",
      "/api/parser-documents/abc123/reread/quote",
    ]) {
      expect(startsDocumentRead("POST", path), path).toBe(true);
    }
    // Looking things up stays open.
    expect(startsDocumentRead("GET", "/api/parser/document-types")).toBe(false);
    expect(startsDocumentRead("GET", "/api/parser-documents/abc123/download")).toBe(false);
    expect(startsDocumentRead("POST", "/api/parser-documents/abc123/runs")).toBe(false);
    expect(startsDocumentRead("PATCH", "/api/parser-documents/abc123")).toBe(false);
    // /api/parser-documents is not the parser namespace.
    expect(startsDocumentRead("POST", "/api/parser-documentsX/upload")).toBe(false);
  });

  function app() {
    const a = express();
    a.use(express.json());
    registerApiProxy(a);
    a.use((_req, res) => res.status(404).json({ reached: "fallthrough" }));
    return a;
  }

  it("answers the upload screens' question itself, on or off", async () => {
    expect((await request(app()).get("/api/parser/availability")).body).toEqual({ available: true });
    process.env[KEY] = "true";
    const res = await request(app()).get("/api/parser/availability");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, message: DOCUMENT_READING_UNAVAILABLE_MESSAGE });
  });

  it("refuses a read with a plain 503 before it reaches the parser", async () => {
    process.env[KEY] = "true";
    process.env.PARSER_SERVICE_URL = "http://127.0.0.1:1"; // nothing listens: reaching it would be a 502
    const res = await request(app()).post("/api/parser/quote-files").send({ files: [] });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: DOCUMENT_READING_UNAVAILABLE_MESSAGE, code: "document_reading_unavailable" });
  });
});
