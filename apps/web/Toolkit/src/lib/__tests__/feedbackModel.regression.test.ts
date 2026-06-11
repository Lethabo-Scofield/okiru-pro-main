import { describe, it, expect, beforeEach, vi } from "vitest";

// The store's update*/remove* reducers call the api layer unconditionally
// (only add* are guarded by activeClientId). Mock the api module so the suite
// is fully offline and deterministic regardless of which reducer runs.
vi.mock("../api", () => {
  const noop = () => Promise.resolve({});
  return {
    api: new Proxy({}, { get: () => noop }),
    invalidateClientData: () => {},
  };
});

import { useBbeeStore } from "../store";
import type { Employee, Supplier, TrainingProgram } from "../types";

/**
 * Regression suite for the Toolkit Feedback fixes:
 *   T001 — Management Control: Employee.annualSalary + votingRightsPercent
 *          (plus the "Total Annual Salary" KPI roll-up).
 *   T002 — Procurement: Supplier.registrationNumber (optional, VAT-independent).
 *   T003 — Skills Development: TrainingProgram.municipality (known + "Other").
 *
 * These run against the real Zustand store. With no activeClientId (the default)
 * the add* reducers do NOT make any network/api calls, and _recalculateAll()
 * no-ops because calculatorConfig is null — so the store is a clean, pure data
 * model harness here.
 */

function resetStore() {
  useBbeeStore.setState({
    activeClientId: null,
    calculatorConfig: null,
    management: { id: "", clientId: "", employees: [] },
    procurement: {
      ...useBbeeStore.getState().procurement,
      suppliers: [],
    },
    skills: {
      ...useBbeeStore.getState().skills,
      trainingPrograms: [],
    },
  } as any);
}

function makeEmployee(over: Partial<Employee> = {}): Employee {
  return {
    id: `emp-${Math.random().toString(36).slice(2)}`,
    name: "Test Person",
    gender: "Female",
    race: "African",
    designation: "Senior",
    isDisabled: false,
    isForeign: false,
    ...over,
  };
}

function makeSupplier(over: Partial<Supplier> = {}): Supplier {
  return {
    id: `sup-${Math.random().toString(36).slice(2)}`,
    name: "Test Supplier",
    beeLevel: 4,
    blackOwnership: 0,
    blackWomenOwnership: 0,
    youthOwnership: 0,
    disabledOwnership: 0,
    enterpriseType: "generic",
    isEmpoweringSupplier: false,
    isSupplierDevRecipient: false,
    hasThreeYearContract: false,
    spend: 1000,
    ...over,
  } as Supplier;
}

function makeProgram(over: Partial<TrainingProgram> = {}): TrainingProgram {
  return {
    id: `tp-${Math.random().toString(36).slice(2)}`,
    programName: "Test Program",
    categoryCode: "C",
    learnerName: "Test Learner",
    gender: "Male",
    race: "African",
    isDisabled: false,
    isForeign: false,
    employmentStatus: "Permanent",
    isYesEmployee: false,
    isCompleted: false,
    isAbsorbed: false,
    transactionDate: "2026-01-01",
    courseCost: 1000,
    travelCost: 0,
    accommodationCost: 0,
    cateringCost: 0,
    stationeryCost: 0,
    facilityCost: 0,
    salaryCost: 0,
    otherCosts: 0,
    isAbet: false,
    isMandatory: false,
    isBursary: false,
    ...over,
  } as TrainingProgram;
}

beforeEach(() => {
  resetStore();
});

describe("T001 — Management Control: annual salary & voting rights", () => {
  it("persists annualSalary and votingRightsPercent on an added employee", () => {
    const emp = makeEmployee({ annualSalary: 850000, votingRightsPercent: 12.5 });
    useBbeeStore.getState().addEmployee(emp);

    const stored = useBbeeStore.getState().management.employees.find((e) => e.id === emp.id)!;
    expect(stored).toBeDefined();
    expect(stored.annualSalary).toBe(850000);
    expect(stored.votingRightsPercent).toBe(12.5);
  });

  it("allows the fields to be omitted (they are optional)", () => {
    const emp = makeEmployee();
    useBbeeStore.getState().addEmployee(emp);
    const stored = useBbeeStore.getState().management.employees.find((e) => e.id === emp.id)!;
    expect(stored.annualSalary).toBeUndefined();
    expect(stored.votingRightsPercent).toBeUndefined();
  });

  it("Total Annual Salary rolls up across employees, treating missing salaries as 0", () => {
    useBbeeStore.getState().addEmployee(makeEmployee({ annualSalary: 500000 }));
    useBbeeStore.getState().addEmployee(makeEmployee({ annualSalary: 250000 }));
    useBbeeStore.getState().addEmployee(makeEmployee()); // no salary

    const total = useBbeeStore
      .getState()
      .management.employees.reduce((sum, e) => sum + (e.annualSalary || 0), 0);
    expect(total).toBe(750000);
  });

  it("updateEmployee can set/replace the salary & voting fields", () => {
    const emp = makeEmployee();
    useBbeeStore.getState().addEmployee(emp);
    useBbeeStore.getState().updateEmployee(emp.id, { annualSalary: 99000, votingRightsPercent: 5 });
    const stored = useBbeeStore.getState().management.employees.find((e) => e.id === emp.id)!;
    expect(stored.annualSalary).toBe(99000);
    expect(stored.votingRightsPercent).toBe(5);
  });
});

describe("T002 — Procurement: supplier registration number", () => {
  it("persists registrationNumber when provided", () => {
    const sup = makeSupplier({ registrationNumber: "2019/123456/07" });
    useBbeeStore.getState().addSupplier(sup);
    const stored = useBbeeStore.getState().procurement.suppliers.find((s) => s.id === sup.id)!;
    expect(stored.registrationNumber).toBe("2019/123456/07");
  });

  it("saves a supplier with a registration number but NO VAT number", () => {
    const sup = makeSupplier({ registrationNumber: "2019/123456/07", vatNumber: undefined });
    useBbeeStore.getState().addSupplier(sup);
    const stored = useBbeeStore.getState().procurement.suppliers.find((s) => s.id === sup.id)!;
    expect(stored.registrationNumber).toBe("2019/123456/07");
    expect(stored.vatNumber).toBeUndefined();
  });

  it("saves a supplier with a VAT number but NO registration number", () => {
    const sup = makeSupplier({ vatNumber: "4123456789", registrationNumber: undefined });
    useBbeeStore.getState().addSupplier(sup);
    const stored = useBbeeStore.getState().procurement.suppliers.find((s) => s.id === sup.id)!;
    expect(stored.vatNumber).toBe("4123456789");
    expect(stored.registrationNumber).toBeUndefined();
  });

  it("registrationNumber is optional (omitting it does not break adding)", () => {
    const sup = makeSupplier();
    useBbeeStore.getState().addSupplier(sup);
    const stored = useBbeeStore.getState().procurement.suppliers.find((s) => s.id === sup.id)!;
    expect(stored).toBeDefined();
    expect(stored.registrationNumber).toBeUndefined();
  });
});

describe("T003 — Skills Development: training municipality", () => {
  it("persists a known municipality on an added program", () => {
    const tp = makeProgram({ municipality: "City of Johannesburg" });
    useBbeeStore.getState().addTrainingProgram(tp);
    const stored = useBbeeStore.getState().skills.trainingPrograms.find((p) => p.id === tp.id)!;
    expect(stored.municipality).toBe("City of Johannesburg");
  });

  it("persists a custom ('Other') municipality value verbatim", () => {
    const tp = makeProgram({ municipality: "Stellenbosch Local Municipality" });
    useBbeeStore.getState().addTrainingProgram(tp);
    const stored = useBbeeStore.getState().skills.trainingPrograms.find((p) => p.id === tp.id)!;
    expect(stored.municipality).toBe("Stellenbosch Local Municipality");
  });

  it("municipality is optional", () => {
    const tp = makeProgram();
    useBbeeStore.getState().addTrainingProgram(tp);
    const stored = useBbeeStore.getState().skills.trainingPrograms.find((p) => p.id === tp.id)!;
    expect(stored.municipality).toBeUndefined();
  });

  it("updateTrainingProgram can change the municipality", () => {
    const tp = makeProgram({ municipality: "City of Cape Town" });
    useBbeeStore.getState().addTrainingProgram(tp);
    useBbeeStore.getState().updateTrainingProgram(tp.id, { municipality: "eThekwini" });
    const stored = useBbeeStore.getState().skills.trainingPrograms.find((p) => p.id === tp.id)!;
    expect(stored.municipality).toBe("eThekwini");
  });
});
