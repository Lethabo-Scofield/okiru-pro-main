/**
 * The ESG import must be able to RECEIVE the file the client sends.
 *
 * The upload client posts the workbook as raw binary
 * (Content-Type: application/octet-stream — EsgInformationRequest.tsx). The
 * server only ever mounted express.json + urlencoded, which both ignore
 * octet-stream, so req.body arrived as {} and the route's Buffer.isBuffer
 * branch was unreachable: EVERY binary import answered 400 "Missing xlsx file"
 * in milliseconds. Zoleka reported it live — "can't import on ESG" — and the
 * prod log showed the 6ms 400 to prove it.
 *
 * This test drives the REAL route stack over HTTP with a REAL xlsx buffer, so
 * a body-parser regression fails here rather than in an expert's browser.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as XLSX from "xlsx";
import { registerEsgWorkbookRoutes } from "../esgWorkbookRoutes";
import { createClient } from "../clientsMemoryStore";

let server: http.Server;
let port = 0;

// The in-memory storage seeds a demo user with id "1" at import time; using it
// lets the REAL requireAuth run (it re-derives the user from storage and
// session.destroy()s on a miss — a fake user id 500s the whole stack).
const USER = { id: "1", organizationId: null as string | null };

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  // Session for the seeded demo user — requireAuth does the rest for real.
  app.use((req, _res, next) => {
    (req as any).session = { userId: USER.id, destroy: (cb?: () => void) => cb?.() };
    next();
  });
  registerEsgWorkbookRoutes(app);

  createClient({
    clientId: "C-ESG-IMPORT",
    id: "C-ESG-IMPORT",
    name: "Import Test Co",
    createdByUserId: USER.id,
    organizationId: null,
  } as never);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function tinyWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Company Name", "Import Test Co"],
    ["Sector", "Transport / Logistics"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Cover");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("POST /api/esg/workbook/:companyId/import (binary)", () => {
  it("accepts an application/octet-stream body — the format the client actually sends", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/esg/workbook/C-ESG-IMPORT/import`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(tinyWorkbook()),
    });
    // The regression answered 400 "Missing xlsx file" here. Any 2xx means the
    // buffer reached the parser; the preview's content is the parser's concern.
    expect(res.status).toBe(200);
    const preview = await res.json();
    expect(preview).toBeTypeOf("object");
  });

  it("still answers 400 when there is genuinely no file", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/esg/workbook/C-ESG-IMPORT/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("Missing xlsx");
  });

  it("keeps the JSON confirm path on the JSON parser", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/esg/workbook/C-ESG-IMPORT/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirm: true,
        sections: { "company-reporting-setup": { cells: { sector: "Transport / Logistics" } } },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
