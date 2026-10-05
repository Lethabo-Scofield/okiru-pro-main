/**
 * The rules that decide whether a client keeps their data.
 *
 * Submitting a workbook used to `$set` each register with whatever the
 * workbook held, replacing the array whole. Three hundred suppliers bulk-
 * uploaded in the toolkit, then a workbook submit, and they were gone — with
 * no error, and nothing on screen that had ever shown them.
 *
 * These tests are the guarantee that the fix neither loses rows nor invents
 * them. Both failures are silent, and they pull in opposite directions: a
 * replace deletes what it does not know about, a blind merge resurrects what
 * the user deleted. Every case below is one or the other.
 */
import { describe, expect, it } from "vitest";
import {
  WORKBOOK_SOURCE,
  reconcileRegister,
  reconcileRegisters,
  signatureFor,
} from "../registerReconcile";

const fromToolkit = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  registrationNumber: `REG-${name}`,
  spend: 1000,
  ...extra,
});

const fromWorkbook = (name: string, extra: Record<string, unknown> = {}) => ({
  ...fromToolkit(name, extra),
  source: WORKBOOK_SOURCE,
});

describe("reconcileRegister", () => {
  /** The incident. */
  it("keeps rows the toolkit wrote when a workbook is submitted", () => {
    const existing = [fromToolkit("Bolt & Nut Co"), fromToolkit("Cape Fasteners")];
    const result = reconcileRegister("suppliers", existing, [{ name: "Workbook Supplies" }]);

    expect(result.rows.map((r) => r.name)).toEqual([
      "Bolt & Nut Co",
      "Cape Fasteners",
      "Workbook Supplies",
    ]);
    expect(result.kept).toBe(2);
  });

  it("does not empty a register when the workbook has nothing in it", () => {
    const existing = [fromToolkit("Bolt & Nut Co")];
    const result = reconcileRegister("suppliers", existing, []);

    // An empty sheet is not an instruction to delete a client's suppliers.
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Bolt & Nut Co");
  });

  /** The opposite failure: a merge that never forgets. */
  it("replaces its own rows rather than piling them up", () => {
    const existing = [fromWorkbook("Alpha"), fromWorkbook("Beta")];
    const result = reconcileRegister("suppliers", existing, [
      { name: "Alpha", registrationNumber: "REG-Alpha", spend: 5000 },
      { name: "Beta", registrationNumber: "REG-Beta" },
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((r) => r.name === "Alpha")?.spend).toBe(5000);
  });

  it("deletes a row the user removed from the workbook", () => {
    const existing = [fromWorkbook("Alpha"), fromWorkbook("Beta")];
    const result = reconcileRegister("suppliers", existing, [
      { name: "Alpha", registrationNumber: "REG-Alpha" },
    ]);

    // Beta was the workbook's to delete, so it goes.
    expect(result.rows.map((r) => r.name)).toEqual(["Alpha"]);
  });

  it("deletes its own rows but not the toolkit's, in the same submit", () => {
    const existing = [
      fromWorkbook("Workbook Row"),
      fromToolkit("Toolkit Row"),
    ];
    const result = reconcileRegister("suppliers", existing, []);

    expect(result.rows.map((r) => r.name)).toEqual(["Toolkit Row"]);
  });

  /**
   * Rows written before the tag existed. The first submit after this change
   * has to recognise them, or every client's register doubles.
   */
  it("supersedes an untagged row the submit is providing again", () => {
    const legacy = [{ name: "Alpha", registrationNumber: "REG-Alpha", spend: 100 }];
    const result = reconcileRegister("suppliers", legacy, [
      { name: "Alpha", registrationNumber: "REG-Alpha", spend: 999 },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].spend).toBe(999);
    expect(result.superseded).toBe(1);
  });

  it("keeps an untagged row the submit says nothing about", () => {
    const legacy = [{ name: "Old Supplier", registrationNumber: "REG-Old" }];
    const result = reconcileRegister("suppliers", legacy, [{ name: "New", registrationNumber: "REG-New" }]);

    expect(result.rows.map((r) => r.name)).toEqual(["Old Supplier", "New"]);
    expect(result.superseded).toBe(0);
  });

  it("is idempotent — submitting twice changes nothing the second time", () => {
    const first = reconcileRegister("suppliers", [fromToolkit("Toolkit Row")], [
      { name: "Alpha", registrationNumber: "REG-Alpha" },
    ]);
    const second = reconcileRegister("suppliers", first.rows, [
      { name: "Alpha", registrationNumber: "REG-Alpha" },
    ]);

    expect(second.rows).toHaveLength(2);
    expect(second.rows.map((r) => r.name).sort()).toEqual(["Alpha", "Toolkit Row"]);
  });

  it("treats a register that has never been written as empty, not as a failure", () => {
    expect(reconcileRegister("suppliers", undefined, [{ name: "A" }]).rows).toHaveLength(1);
    expect(reconcileRegister("suppliers", null, [{ name: "A" }]).rows).toHaveLength(1);
    expect(reconcileRegister("suppliers", "not an array", [{ name: "A" }]).rows).toHaveLength(1);
  });
});

describe("row identity", () => {
  it("matches a person on their ID number before their name", () => {
    expect(signatureFor("employees", { idNumber: "8501015800083", name: "T", surname: "M" }))
      .toBe(signatureFor("employees", { idNumber: "8501015800083", name: "Thandi", surname: "Mokoena" }));
  });

  it("does not merge two different people who share a name", () => {
    const a = signatureFor("employees", { idNumber: "8501015800083", name: "John", surname: "Smith" });
    const b = signatureFor("employees", { idNumber: "9002025800081", name: "John", surname: "Smith" });
    expect(a).not.toBe(b);
  });

  /**
   * A row with nothing identifying is nobody. Two of them are not each other,
   * and collapsing them would delete a row because both happened to be blank.
   */
  it("gives a row with no identifying field no signature at all", () => {
    expect(signatureFor("suppliers", {})).toBeNull();
    expect(signatureFor("suppliers", { spend: 100 })).toBeNull();
    expect(signatureFor("employees", { name: "", surname: "" })).toBeNull();
  });

  it("keeps two unidentifiable rows rather than folding them together", () => {
    const existing = [{ spend: 100 }, { spend: 200 }];
    const result = reconcileRegister("suppliers", existing, [{ spend: 300 }]);
    expect(result.rows).toHaveLength(3);
  });

  it("ignores case and padding when deciding two rows are the same", () => {
    expect(signatureFor("suppliers", { name: "  Bolt & Nut Co  " }))
      .toBe(signatureFor("suppliers", { name: "bolt & nut co" }));
  });
});

describe("reconcileRegisters", () => {
  it("folds every register and reports what a replace would have destroyed", () => {
    const client = {
      suppliers: [fromToolkit("Toolkit Supplier")],
      employees: [{ name: "Thandi", surname: "Mokoena", idNumber: "8501015800083" }],
      shareholders: [],
    };
    const projected = {
      suppliers: [{ name: "Workbook Supplier", registrationNumber: "REG-W" }],
      employees: [{ name: "Pieter", surname: "van Wyk", idNumber: "7203126000081" }],
      shareholders: [{ name: "Nomsa Khumalo" }],
      trainingPrograms: [],
      esdContributions: [],
      sedContributions: [],
    };

    const { rows, summary, preserved } = reconcileRegisters(client, projected);

    expect(rows.suppliers).toHaveLength(2);
    expect(rows.employees).toHaveLength(2);
    expect(rows.shareholders).toHaveLength(1);
    expect(summary.suppliers).toEqual({ kept: 1, written: 1, superseded: 0 });
    expect(preserved).toBe(2);
  });

  /**
   * A projection that does not mention a register is not making a claim about
   * it. Writing [] there would delete a pillar's data on the strength of the
   * workbook not having an opinion.
   */
  it("leaves a register alone when the projection omits it", () => {
    const client = { suppliers: [fromToolkit("Keep Me")] };
    const { rows } = reconcileRegisters(client, { employees: [{ name: "A", surname: "B" }] });

    expect(rows.suppliers).toBeUndefined();
    expect(rows.employees).toHaveLength(1);
  });

  it("copes with a client that has no registers yet", () => {
    const { rows, preserved } = reconcileRegisters(null, { suppliers: [{ name: "First" }] });
    expect(rows.suppliers).toHaveLength(1);
    expect(preserved).toBe(0);
  });
});
