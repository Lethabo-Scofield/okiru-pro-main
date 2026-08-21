/**
 * Healthcare. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_HEALTHCARE = defineEsgSector({
  id: "healthcare",
  label: "Healthcare",
  coverLabel: "Healthcare",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: healthcare-risk-waste (HCRW) is regulated " +
    "separately from general waste, so the inherited 75% diversion target " +
    "(Assumptions!B48) does not translate; anaesthetic gases and medical-gas leakage are " +
    "unmodelled Scope 1 sources.",
});
