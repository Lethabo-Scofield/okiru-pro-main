/**
 * "Blocking" has to mean blocked.
 *
 * The submit handler has computed blocking issues since it was written. It
 * then wrote the scorecard anyway and returned the list in the response, which
 * no client code read. So a workbook with no sector, no scorecard type or no
 * financial year end produced a score that looked exactly like a correct one.
 *
 * That is worse than a missing check. A gap you can see is a gap; a gap that
 * reports itself and changes nothing is a system describing an intention as if
 * it were a behaviour.
 *
 * These tests read the handler rather than driving it end to end, because the
 * thing that went wrong was structural — the list was built and then ignored —
 * and that is visible in the shape of the code.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROUTES = fs.readFileSync(path.resolve(__dirname, "../workbookRoutes.ts"), "utf8");

/** The submit handler's body, from where it computes the issues onward. */
function submitBody(lines = 40): string {
  const at = ROUTES.indexOf("const blockingIssues = validateWorkbookForSubmit");
  expect(at, "could not find the submit validation").toBeGreaterThan(-1);
  return ROUTES.slice(at).split("\n").slice(0, lines).join("\n");
}

describe("the workbook submit gate", () => {
  it("returns before writing when there is a blocking issue", () => {
    const body = submitBody();
    expect(body).toMatch(/if \(blockingIssues\.length > 0\)/);
    expect(body).toMatch(/return res\.status\(422\)/);
  });

  /**
   * The check has to come before the projection. Deciding after the client
   * document has been built invites someone to move the write above it later
   * and never notice.
   */
  it("checks before the workbook is projected onto the client", () => {
    const body = submitBody(60);
    const gate = body.indexOf("if (blockingIssues.length > 0)");
    const project = body.indexOf("projectWorkbookToClient");
    expect(gate).toBeGreaterThan(-1);
    expect(project).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(project);
  });

  it("sends back the issues and the field names, not just a status", () => {
    const body = submitBody();
    expect(body).toMatch(/blockingIssues,/);
    expect(body).toMatch(/fields: blockingIssues\.map/);
  });

  /**
   * 422 rather than 400: the request is well formed, the workbook behind it is
   * not ready. The client branches on it to name the fields instead of showing
   * "Server error".
   */
  it("uses a status the client can tell apart from a malformed request", () => {
    expect(submitBody()).toMatch(/status\(422\)/);
    expect(submitBody()).not.toMatch(/blockingIssues\.length > 0[\s\S]{0,200}status\(400\)/);
  });
});

describe("what counts as blocking", () => {
  const VALIDATION = fs.readFileSync(
    path.resolve(__dirname, "../../src/components/workbook/workbookValidation.ts"),
    "utf8",
  );

  /**
   * Four fields decide what the scorecard IS: who is measured, under which
   * code, on which scorecard, for which period. Everything else is a gap in a
   * pillar, which scores what it scores and is reported as a warning.
   */
  it("is the company's identity, and the year end is part of it", () => {
    const at = VALIDATION.indexOf("export function isCriticalWorkbookIssue");
    const body = VALIDATION.slice(at, at + 1200);
    expect(body).toContain('issue.field === "companyName"');
    expect(body).toContain('issue.field === "industrySector"');
    expect(body).toContain('issue.field === "scorecardType"');
    expect(body).toContain('issue.field === "financialYearEnd"');
  });

  it("does not make a pillar gap block the calculation", () => {
    const at = VALIDATION.indexOf("export function isCriticalWorkbookIssue");
    const body = VALIDATION.slice(at, at + 1200);
    // Only company-information and afs-additions escalate; a thin ownership or
    // procurement section still scores, it just scores low.
    expect(body).toContain('issue.sectionKey === "company-information"');
    expect(body).not.toContain('issue.sectionKey === "procurement"');
    expect(body).not.toContain('issue.sectionKey === "ownership"');
  });
});

describe("the year end as a workbook field", () => {
  const SECTIONS = fs.readFileSync(
    path.resolve(__dirname, "../../src/components/workbook/sections.ts"),
    "utf8",
  );

  it("is marked required, which is what makes it blocking", () => {
    const at = SECTIONS.indexOf('key: "financialYearEnd"');
    expect(at, "financialYearEnd column not found").toBeGreaterThan(-1);
    expect(SECTIONS.slice(at, at + 400)).toMatch(/required: true/);
  });

  /**
   * Required year END, editable period START and END. Reporting periods are not
   * always twelve months, and the meeting asked for the year end to be
   * mandatory — not for the period to be fixed.
   */
  it("leaves the measurement period dates optional", () => {
    for (const key of ["measurementPeriodStart", "measurementPeriodEnd"]) {
      const at = SECTIONS.indexOf(`key: "${key}"`);
      expect(at, `${key} column not found`).toBeGreaterThan(-1);
      expect(SECTIONS.slice(at, at + 400)).not.toMatch(/required: true/);
    }
  });
});
