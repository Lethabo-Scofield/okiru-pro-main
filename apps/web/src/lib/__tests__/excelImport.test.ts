import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractBeeGatheringBuffer,
  isBeeGatheringWorkbook,
  mapExtractedToWorkbookSections,
  normalizeSectorDeterministic,
} from "../excelImport";
import * as XLSX from "xlsx";

const fixturePath = resolve(
  process.cwd(),
  "../../docs/BEE Information Gathering File - Thandanani Transport.xlsm",
);

describe("excelImport — Thandanani Transport fixture", () => {
  const buffer = readFileSync(fixturePath).buffer;

  it("detects BEE gathering workbook format", () => {
    const wb = XLSX.read(buffer, { type: "array" });
    expect(isBeeGatheringWorkbook(wb)).toBe(true);
  });

  it("extracts company, financials, and ownership totals", () => {
    const result = extractBeeGatheringBuffer(buffer);
    expect(result.isBeeGatheringFormat).toBe(true);
    expect(result.data.companyName).toBe("Thandanani Transport");
    expect(result.data.sector).toBe("TRANSPORT");
    expect(result.data.revenue).toBe(10_826_271);
    expect(result.data.npat).toBe(-27_124);
    expect(result.data.payroll).toBe(2_753_331);
    expect(result.data.totalProcurement).toBe(4_674_995);
    expect(result.data.blackOwnership).toBe(100);
    expect(result.data.financialYearEnd).toBe("2025-02-28");
    expect(result.data.scorecardType).toBe("QSE");
    expect(result.mappedSheets.length).toBeGreaterThan(10);
    expect(result.extractedFieldCount).toBeGreaterThanOrEqual(20);
  });

  it("extracts extended BEE pillar fields from Thandanani file", () => {
    const result = extractBeeGatheringBuffer(buffer);
    const { data, fieldConfidences } = result;

    expect(data.leviableAmount).toBe(2_124_744);
    expect(data.skillsSpend).toBe(0);
    expect(data.learnershipCount).toBe(0);
    expect(data.esdContributions).toBe(0);
    expect(data.sedContributions).toBe(0);
    expect(data.empowermentFinancing).toBe(0);
    expect(data.beeCompliantSpend).toBe(0);
    expect(data.yesEmployees).toBe(0);
    expect(data.yesAbsorbed).toBe(0);

    expect(data.topMgmtBlackPercent).toBe(100);
    expect(data.seniorMgmtEEBlackPercent).toBe(100);
    expect(data.boardBlackPercent).toBe(100);
    expect(data.boardWomenPercent).toBe(0);
    expect(data.seniorMgmtBlackPercent).toBe(100);

    expect(fieldConfidences.companyName).toBe("high");
    expect(fieldConfidences.revenue).toBe("high");
    expect(fieldConfidences.blackOwnership).toBe("high");
    expect(fieldConfidences.topMgmtBlackPercent).toBe("high");

    expect(result.ownershipChainTiers.length).toBeGreaterThan(0);
    expect(result.ownershipChainTiers[0]?.entityName).toBe("Thandanani Packers and Hauliers");
    expect(result.ownershipChainTiers[0]?.blackVotingRights).toBe(100);
  });

  it("maps extracted data into workbook sections", () => {
    const extraction = extractBeeGatheringBuffer(buffer);
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const sections = mapExtractedToWorkbookSections(
      extraction.data,
      wb,
      extraction.ownershipChainTiers,
    );

    expect(sections["company-information"]?.meta?.companyName).toBe("Thandanani Transport");
    expect(sections["company-information"]?.meta?.industrySector).toBe("TRANSPORT");
    expect(sections["company-information"]?.meta?.scorecardType).toBe("QSE");
    expect(sections["financial-information"]?.meta?.revenue).toBe(10_826_271);
    expect(sections.ownership?.rows?.length).toBeGreaterThan(0);
    expect(sections.employees?.rows?.length).toBeGreaterThan(0);

    const firstSh = sections.ownership?.rows?.[0] as Record<string, unknown> | undefined;
    expect(Number(firstSh?.blackOwnership)).toBeGreaterThan(0);
  });

  it("normalizes sector labels deterministically", () => {
    expect(normalizeSectorDeterministic("Transport")).toBe("TRANSPORT");
    expect(normalizeSectorDeterministic("Financial Services")).toBe("FSC");
    expect(normalizeSectorDeterministic("Retail / RCOGP")).toBe("RCOGP");
    expect(normalizeSectorDeterministic("retail")).toBe("RCOGP");
    expect(normalizeSectorDeterministic("Information and Communication Technology")).toBe("ICT");
    expect(normalizeSectorDeterministic("Unknown Sector XYZ")).toBeUndefined();
  });
});
