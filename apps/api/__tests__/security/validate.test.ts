/**
 * Tests for the zod-backed body/query validators.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validateBody, validateQuery } from "../../src/security/validate.js";

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("validateBody", () => {
  const schema = z.object({
    username: z.string().min(3),
    age: z.number().int().nonnegative(),
  });

  it("returns 400 with structured errors on invalid body", () => {
    const mw = validateBody(schema);
    const req: any = { body: { username: "x", age: -1 } };
    const res = mockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toBe("Invalid request body");
    expect(Array.isArray(payload.errors)).toBe(true);
    expect(payload.errors.length).toBeGreaterThanOrEqual(1);
    const paths = payload.errors.map((e: any) => e.path);
    expect(paths).toContain("username");
    expect(paths).toContain("age");
    for (const e of payload.errors) {
      expect(e).toHaveProperty("message");
      expect(e).toHaveProperty("code");
    }
  });

  it("calls next() and replaces req.body with parsed data on valid input", () => {
    const mw = validateBody(schema);
    const req: any = { body: { username: "alice", age: 30 } };
    const res = mockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ username: "alice", age: 30 });
  });

  it("returns 400 for missing fields", () => {
    const mw = validateBody(schema);
    const req: any = { body: {} };
    const res = mockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("validateQuery", () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1),
    limit: z.coerce.number().int().min(1).max(100),
  });

  it("returns 400 on invalid query", () => {
    const mw = validateQuery(schema);
    const req: any = { query: { page: "0", limit: "200" } };
    const res = mockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe("Invalid query parameters");
  });

  it("merges parsed (coerced) values into req.query and calls next()", () => {
    const mw = validateQuery(schema);
    const req: any = { query: { page: "2", limit: "50" } };
    const res = mockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.query.page).toBe(2);
    expect(req.query.limit).toBe(50);
  });
});
