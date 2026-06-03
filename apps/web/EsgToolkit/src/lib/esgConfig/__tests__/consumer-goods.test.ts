import { describe, expect, it } from "vitest";
import * as cfg from "../consumer-goods";

describe("consumer-goods config", () => {
  it("exports SG Consumer assumption constants", () => {
    const keys = Object.keys(cfg).filter((k) => k === k.toUpperCase() || k.startsWith("GHG_"));
    expect(keys.length).toBeGreaterThanOrEqual(20);
    expect(cfg.THR_WASTE).toBe(0.75);
    expect(cfg.THR_WASTE_X).toBe(0.9);
    expect(cfg.STANCE_FLOOR.standard).toBe(0.5);
    expect(Object.keys(cfg.GHG_DEPOT_BENCHMARKS).length).toBe(5);
  });
});
