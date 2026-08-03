import { describe, it, expect } from "vitest";
import { reconcileEntity } from "../reconcileEntity";
import type { WorkbookSections } from "../types";

const company = (name: string, sector = "Transport", type = "QSE") => ({
  "company-information": { meta: { companyName: name, industrySector: sector, scorecardType: type } },
});

function issue(res: ReturnType<typeof reconcileEntity>, invariant: string, needle: RegExp) {
  return res.issues.find((i) => i.invariant === invariant && needle.test(i.statement));
}

describe("reconcileEntity — representation", () => {
  it("converts Excel serial dates in date columns to ISO", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      sed: { rows: [{ _id: "s1", beneficiaryName: "OUTA", amount: 400, dateOfTransaction: 46066 }] },
    };
    const res = reconcileEntity(sections);
    expect(res.sections.sed!.rows![0].dateOfTransaction).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(issue(res, "representation", /date/i)).toBeTruthy();
  });

  it("recovers gender from the ID when the cell holds a stray value", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      "management-control": { rows: [{ _id: "m1", name: "A", surname: "B", idNumber: "8001015009087", gender: "1" }] },
    };
    const res = reconcileEntity(sections);
    // 8001015009087 (Luhn-valid) → digits 7-10 = 5009 ≥ 5000 → Male.
    expect(res.sections["management-control"]!.rows![0].gender).toBe("Male");
  });
});

describe("reconcileEntity — identity", () => {
  it("merges two rows for the same ID into one person", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      ownership: {
        rows: [
          { _id: "o1", shareholderName: "Venugopal Lutchman, Naidoo", idNumber: "5608305112083", shareholding: 100 },
          { _id: "o2", shareholderName: "Venugopal Lutchman Naidoo", idNumber: "5608305112083", votingRights: 100 },
        ],
      },
    };
    const res = reconcileEntity(sections);
    expect(res.sections.ownership!.rows).toHaveLength(1);
    expect(issue(res, "identity", /merged/i)).toBeTruthy();
  });

  it("treats an African-vs-Indian race clash as resolved (both black, score unaffected)", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      ownership: { rows: [{ _id: "o1", shareholderName: "N", idNumber: "5608305112083", race: "African", shareholding: 100 }] },
      "management-control": { rows: [{ _id: "m1", name: "N", idNumber: "5608305112083", race: "Indian" }] },
    };
    const res = reconcileEntity(sections);
    const clash = issue(res, "identity", /recorded as/i);
    expect(clash?.severity).toBe("resolved");
  });

  it("flags a black-vs-white race clash as blocking (scores differ)", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      ownership: { rows: [{ _id: "o1", shareholderName: "N", idNumber: "5608305112083", race: "African", shareholding: 100 }] },
      "management-control": { rows: [{ _id: "m1", name: "N", idNumber: "5608305112083", race: "White" }] },
    };
    const res = reconcileEntity(sections);
    const clash = issue(res, "identity", /recorded as/i);
    expect(clash?.severity).toBe("blocking");
  });
});

describe("reconcileEntity — well-formedness", () => {
  it("removes the company from its own shareholder list", () => {
    const sections: WorkbookSections = {
      ...company("Thandanani Packers and Hauliers cc"),
      ownership: {
        rows: [
          { _id: "o1", shareholderName: "Venugopal Naidoo", idNumber: "5608305112083", shareholding: 100 },
          { _id: "o2", shareholderName: "Thandanani Packers and Hauliers", numberOfShares: 10000 },
        ],
      },
    };
    const res = reconcileEntity(sections);
    expect(res.sections.ownership!.rows).toHaveLength(1);
    expect(res.sections.ownership!.rows![0].shareholderName).toBe("Venugopal Naidoo");
    expect(issue(res, "well-formedness", /cannot own itself/i)).toBeTruthy();
  });

  it("sets aside amountless contributions instead of scoring them as R0", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      sed: {
        rows: [
          { _id: "s1", beneficiaryName: "OUTA", amount: 500 },
          { _id: "s2", beneficiaryName: "HIV Awareness", amount: 0 },
          { _id: "s3", beneficiaryName: "Poverty alleviation", amount: "" },
        ],
      },
    };
    const res = reconcileEntity(sections);
    expect(res.sections.sed!.rows).toHaveLength(1);
    const cov = issue(res, "well-formedness", /no amount/i);
    expect(cov?.severity).toBe("coverage");
  });
});

describe("reconcileEntity — conservation + derivation", () => {
  it("derives economic interest + voting from a 100% shareholding by flow-through", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      ownership: { rows: [{ _id: "o1", shareholderName: "N", idNumber: "5608305112083", race: "Indian", shareholding: 100, economicInterest: 0 }] },
    };
    const res = reconcileEntity(sections);
    const row = res.sections.ownership!.rows![0];
    expect(Number(row.economicInterest)).toBe(100);
    expect(Number(row.votingRights)).toBe(100);
    expect(issue(res, "derivation", /flow-through/i)).toBeTruthy();
  });

  it("flags shareholdings that sum to 200% as blocking", () => {
    const sections: WorkbookSections = {
      ...company("Acme"),
      ownership: {
        rows: [
          { _id: "o1", shareholderName: "A", idNumber: "5608305112083", shareholding: 100 },
          { _id: "o2", shareholderName: "B", idNumber: "9001015001087", shareholding: 100 },
        ],
      },
    };
    const res = reconcileEntity(sections);
    const c = issue(res, "conservation", /add up to 200/i);
    expect(c?.severity).toBe("blocking");
  });

  it("deems a 100% black-owned QSE Level 1 (non-transport)", () => {
    const sections: WorkbookSections = {
      ...company("Acme", "Generic", "QSE"),
      ownership: { rows: [{ _id: "o1", shareholderName: "N", idNumber: "5608305112083", race: "Indian", shareholding: 100 }] },
    };
    const res = reconcileEntity(sections, { sectorCode: "RCOGP", scorecardType: "QSE" });
    expect(res.summary.deemedLevel).toBe(1);
    expect(res.summary.blackOwnershipFraction).toBeCloseTo(1, 3);
  });

  it("does NOT deem transport (excluded from the deemed regime)", () => {
    const sections: WorkbookSections = {
      ...company("Acme", "Transport", "QSE"),
      ownership: { rows: [{ _id: "o1", shareholderName: "N", idNumber: "5608305112083", race: "Indian", shareholding: 100 }] },
    };
    const res = reconcileEntity(sections, { sectorCode: "TRANSPORT", scorecardType: "QSE" });
    expect(res.summary.deemedLevel).toBeNull();
  });
});

describe("reconcileEntity — end to end on the Thandanani shape", () => {
  it("turns the garbled 3-row ownership into one clean 100% black holder", () => {
    const sections: WorkbookSections = {
      ...company("Thandanani Packers and Hauliers cc", "Transport", "QSE"),
      ownership: {
        rows: [
          { _id: "o1", shareholderName: "Venugopal Lutchman, Naidoo", idNumber: "5608305112083", race: "African", shareholding: 100, votingRights: 1, economicInterest: 0, numberOfShares: 100 },
          { _id: "o2", shareholderName: "Thandanani Packers and Hauliers", numberOfShares: 10000, votingRights: 1 },
          { _id: "o3", shareholderName: "Venugopal Lutchman Naidoo", idNumber: "5608305112083", race: "African", numberOfShares: 100 },
        ],
      },
      "management-control": { rows: [{ _id: "m1", name: "Venugopal Lutchman", surname: "Naidoo", idNumber: "5608305112083", race: "Indian", gender: "Male" }] },
    };
    const res = reconcileEntity(sections, { sectorCode: "TRANSPORT", scorecardType: "QSE" });
    const own = res.sections.ownership!.rows!;
    expect(own).toHaveLength(1);
    expect(Number(own[0].economicInterest)).toBe(100);
    expect(res.summary.blackOwnershipFraction).toBeCloseTo(1, 2);
    expect(res.summary.ownershipClosesTo).toBeCloseTo(100, 1);
  });
});
