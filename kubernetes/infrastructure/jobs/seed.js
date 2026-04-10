const { Database } = require("arangojs");

const sectorConfigs = [
  // RCOGP Generic: 25+19+25+29+10+7+5 = 120 (verified against RCOGP Generic Excel)
  { sectorCode: "RCOGP", scorecardType: "Generic", totalMaxPoints: 120, pillarConfigs: { ownership: { maxPoints: 25 }, managementControl: { maxPoints: 19 }, employmentEquity: { maxPoints: 0 }, skillsDevelopment: { maxPoints: 25 }, preferentialProcurement: { maxPoints: 29 }, enterpriseDevelopment: { maxPoints: 7 }, socioEconomicDevelopment: { maxPoints: 5 }, yesInitiative: { maxPoints: 3 } } },
  { sectorCode: "ICT", scorecardType: "Generic", totalMaxPoints: 115, pillarConfigs: { ownership: { maxPoints: 25 }, managementControl: { maxPoints: 25 }, employmentEquity: { maxPoints: 10 }, skillsDevelopment: { maxPoints: 20 }, preferentialProcurement: { maxPoints: 20 }, enterpriseDevelopment: { maxPoints: 5 }, socioEconomicDevelopment: { maxPoints: 5 }, yesInitiative: { maxPoints: 3 } } },
  { sectorCode: "AGRI", scorecardType: "Generic", totalMaxPoints: 115, pillarConfigs: { ownership: { maxPoints: 25 }, managementControl: { maxPoints: 10 }, employmentEquity: { maxPoints: 10 }, skillsDevelopment: { maxPoints: 15 }, preferentialProcurement: { maxPoints: 35 }, enterpriseDevelopment: { maxPoints: 5 }, socioEconomicDevelopment: { maxPoints: 10 }, yesInitiative: { maxPoints: 3 } } },
  { sectorCode: "QSE_10M", scorecardType: "Generic", totalMaxPoints: 135, pillarConfigs: { ownership: { maxPoints: 25 }, managementControl: { maxPoints: 25 }, employmentEquity: { maxPoints: 0 }, skillsDevelopment: { maxPoints: 25 }, preferentialProcurement: { maxPoints: 35 }, enterpriseDevelopment: { maxPoints: 15 }, socioEconomicDevelopment: { maxPoints: 5 }, yesInitiative: { maxPoints: 3 } } },
  { sectorCode: "QSE_10P", scorecardType: "Generic", totalMaxPoints: 125, pillarConfigs: { ownership: { maxPoints: 25 }, managementControl: { maxPoints: 25 }, employmentEquity: { maxPoints: 0 }, skillsDevelopment: { maxPoints: 20 }, preferentialProcurement: { maxPoints: 30 }, enterpriseDevelopment: { maxPoints: 10 }, socioEconomicDevelopment: { maxPoints: 10 }, yesInitiative: { maxPoints: 3 } } },
  { sectorCode: "FSC", scorecardType: "Generic", totalMaxPoints: 115, pillarConfigs: { ownership: { maxPoints: 20 }, managementControl: { maxPoints: 10 }, employmentEquity: { maxPoints: 10 }, skillsDevelopment: { maxPoints: 25 }, preferentialProcurement: { maxPoints: 25 }, enterpriseDevelopment: { maxPoints: 10 }, socioEconomicDevelopment: { maxPoints: 10 }, yesInitiative: { maxPoints: 3 } } }
];

async function seedArangoDB() {
  const arangoUrl = process.env.ARANGO_URL || "http://arangodb:8529";
  const arangoPassword = process.env.ARANGO_ROOT_PASSWORD || "";
  const dbName = process.env.ARANGO_DB_NAME || "okiru_production";

  console.log("Connecting to ArangoDB at", arangoUrl);

  const db = new Database({ url: arangoUrl, auth: { username: "root", password: arangoPassword } });

  try {
    const dbs = await db.listDatabases();
    if (!dbs.includes(dbName)) { await db.createDatabase(dbName); console.log("Created database:", dbName); }

    const okiruDb = db.database(dbName);
    const collections = await okiruDb.listCollections();
    const sectorRulesExists = collections.some(c => c.name === "sector_rules");
    if (!sectorRulesExists) { await okiruDb.createCollection("sector_rules"); console.log("Created collection: sector_rules"); }

    const collection = okiruDb.collection("sector_rules");

    for (const config of sectorConfigs) {
      const key = `${config.sectorCode}_${config.scorecardType}`.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const doc = { _key: key, sectorCode: config.sectorCode, scorecardType: config.scorecardType, totalMaxPoints: config.totalMaxPoints, pillarConfigs: config.pillarConfigs, updatedAt: new Date().toISOString() };
      try {
        await collection.document(key);
        await collection.update(key, doc);
        console.log("Updated sector:", config.sectorCode);
      } catch (e) {
        await collection.save(doc, { overwriteMode: "ignore" });
        console.log("Created sector:", config.sectorCode);
      }
    }
    console.log("Seed completed successfully!");
    process.exit(0);
  } catch (error) { console.error("Seed failed:", error.message); process.exit(1); }
}

seedArangoDB();
