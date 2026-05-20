import mongoose from "mongoose";
import { ClientModel, WorkbookModel } from "../shared/schema";
import {
  LAKE_TRADING_DEMO_CLIENT_ID,
  LAKE_TRADING_DEMO_NAME,
  buildLakeTradingWorkbookSections,
} from "../src/lib/lakeTradingWorkbookFixture";
import { validateWorkbook } from "../src/components/workbook/workbookValidation";

export type LakeTradingSeedResult = {
  clientId: string;
  name: string;
  created: boolean;
  workbookReset: boolean;
  validationIssueCount: number;
};

function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Idempotently creates/updates the Lake Trading demo client and pre-fills the workbook.
 * Assigns tenancy to the seeding super_admin so they can open/submit immediately.
 */
export async function seedLakeTradingDemo(
  userId: string,
  organizationId: string | null,
): Promise<LakeTradingSeedResult> {
  if (!mongoReady()) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  const sections = buildLakeTradingWorkbookSections();
  const validationIssues = validateWorkbook(sections);

  let client = await ClientModel.findOne({ clientId: LAKE_TRADING_DEMO_CLIENT_ID });
  let created = false;

  if (!client) {
    client = await ClientModel.create({
      id: LAKE_TRADING_DEMO_CLIENT_ID,
      clientId: LAKE_TRADING_DEMO_CLIENT_ID,
      name: LAKE_TRADING_DEMO_NAME,
      financialYear: "2026",
      industrySector: "RCOGP",
      sectorCode: "RCOGP",
      scorecardType: "Generic",
      companySize: "Generic",
      eapProvince: "Gauteng",
      revenue: sections["financial-information"]?.meta?.revenue ?? 0,
      npat: sections["financial-information"]?.meta?.npat ?? 0,
      leviableAmount: sections["financial-information"]?.meta?.leviableAmount ?? 0,
      tmps: sections["financial-information"]?.meta?.tmps ?? 0,
      annualTurnover: sections["financial-information"]?.meta?.revenue ?? 0,
      organizationId,
      createdByUserId: userId,
      lakeTradingDemo: true,
      tradingName: "Silver Lake Trading",
      registrationNumber: "2015/123456/07",
      updatedAt: new Date(),
    });
    created = true;
  } else {
    await ClientModel.updateOne(
      { clientId: LAKE_TRADING_DEMO_CLIENT_ID },
      {
        $set: {
          name: LAKE_TRADING_DEMO_NAME,
          lakeTradingDemo: true,
          industrySector: "RCOGP",
          sectorCode: "RCOGP",
          scorecardType: "Generic",
          companySize: "Generic",
          eapProvince: "Gauteng",
          organizationId: organizationId ?? client.organizationId,
          createdByUserId: userId,
          revenue: sections["financial-information"]?.meta?.revenue ?? 0,
          npat: sections["financial-information"]?.meta?.npat ?? 0,
          leviableAmount: sections["financial-information"]?.meta?.leviableAmount ?? 0,
          tmps: sections["financial-information"]?.meta?.tmps ?? 0,
          annualTurnover: sections["financial-information"]?.meta?.revenue ?? 0,
          updatedAt: new Date(),
        },
      },
    );
  }

  const workbookReset = true;
  await WorkbookModel.findOneAndUpdate(
    { companyId: LAKE_TRADING_DEMO_CLIENT_ID },
    {
      $set: {
        companyId: LAKE_TRADING_DEMO_CLIENT_ID,
        ownerOrganizationId: organizationId,
        ownerUserId: userId,
        sections,
        submittedAt: null,
        submittedByUserId: null,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true },
  );

  return {
    clientId: LAKE_TRADING_DEMO_CLIENT_ID,
    name: LAKE_TRADING_DEMO_NAME,
    created,
    workbookReset,
    validationIssueCount: validationIssues.length,
  };
}
