/**
 * The website's "Book a demo" form (sprint task H3): an anonymous visitor's
 * text is escaped before it reaches the team's email, nothing is mailed to the
 * address typed in, the form is rate-limited, and a request that could not be
 * sent says so instead of claiming it was received.
 */

delete process.env.MONGODB_URI;
delete process.env.MONGO_URI;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { registerRoutes } from "../routes";
import { demoRequestEmail } from "../email";

describe("demoRequestEmail", () => {
  const visitor = {
    name: 'Mpho <a href="https://evil.example/login">Verify your account</a>',
    company: "Acme\r\nBcc: someone@else.example",
    email: "mpho@acme.example?subject=hi&bcc=x",
    phone: "<b>082</b>",
    message: "Line one\n<script>alert(1)</script>",
  };
  const mail = demoRequestEmail(visitor, new Date("2026-10-07T08:00:00Z"));

  it("escapes everything the visitor typed", () => {
    expect(mail.html).not.toContain('<a href="https://evil.example');
    expect(mail.html).toContain("Mpho &lt;a href=&quot;https://evil.example/login&quot;&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Line one<br/>&lt;script&gt;");
    expect(mail.html).not.toContain("<b>082</b>");
  });

  it("keeps a typed line break out of the subject, and a typed query out of the reply link", () => {
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toContain("Acme Bcc: someone@else.example");
    expect(mail.html).toContain('href="mailto:mpho@acme.example%3Fsubject%3Dhi%26bcc%3Dx"');
  });
});

let app: express.Express;
let httpServer: Server;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: "1mb" }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  void (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("POST /api/demo-request", () => {
  const valid = { name: "Mpho", company: "Acme", email: "mpho@acme.example" };

  it("asks for the name, company and a real address", async () => {
    expect((await request(app).post("/api/demo-request").send({ name: "Mpho" })).status).toBe(400);
    expect((await request(app).post("/api/demo-request").send({ ...valid, email: "not-an-address" })).status).toBe(400);
  });

  it("says when the request could not be sent — never 'received' for a request the team will not see", async () => {
    // No mail relay configured in tests: the team cannot be told.
    const res = await request(app).post("/api/demo-request").send(valid);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/contact@okiru\.co\.za/);
  });

  it("stops a flood", async () => {
    let last = 0;
    for (let i = 0; i < 6; i += 1) last = (await request(app).post("/api/demo-request").send(valid)).status;
    expect(last).toBe(429);
  });
});
