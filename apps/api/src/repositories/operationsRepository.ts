import { v4 as uuid } from "uuid";
import {
  EmployeeModel,
  TrainingProgramModel,
  SupplierModel,
  ProcurementDataModel,
  EsdContributionModel,
  SedContributionModel,
  ScenarioModel,
} from "../../models.js";
import type {
  Employee,
  EsdContribution,
  InsertEmployee,
  InsertEsdContribution,
  InsertScenario,
  InsertSedContribution,
  InsertSupplier,
  InsertTrainingProgram,
  ProcurementDataRow,
  Scenario,
  SedContribution,
  Supplier,
  TrainingProgram,
} from "../../schema.js";
import { BaseRepository, cleanDoc } from "./base.js";

export class EmployeeRepository extends BaseRepository<Employee, InsertEmployee> {
  constructor() {
    super(EmployeeModel);
  }

  async findByClient(clientId: string): Promise<Employee[]> {
    const docs = await EmployeeModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<Employee>(d));
  }
}

export class TrainingRepository extends BaseRepository<TrainingProgram, InsertTrainingProgram> {
  constructor() {
    super(TrainingProgramModel);
  }

  async findByClient(clientId: string): Promise<TrainingProgram[]> {
    const docs = await TrainingProgramModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<TrainingProgram>(d));
  }
}

export class SupplierRepository extends BaseRepository<Supplier, InsertSupplier> {
  constructor() {
    super(SupplierModel);
  }

  async findByClient(clientId: string): Promise<Supplier[]> {
    const docs = await SupplierModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<Supplier>(d));
  }
}

export class ProcurementRepository {
  async findByClient(clientId: string): Promise<ProcurementDataRow | undefined> {
    const doc = await ProcurementDataModel.findOne({ clientId }).lean();
    return doc ? cleanDoc<ProcurementDataRow>(doc) : undefined;
  }

  async upsert(clientId: string, tmps: number): Promise<ProcurementDataRow> {
    const doc = await ProcurementDataModel.findOneAndUpdate(
      { clientId },
      { $set: { tmps }, $setOnInsert: { id: uuid(), clientId } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    return cleanDoc<ProcurementDataRow>(doc!);
  }
}

export class ContributionRepository {
  async findEsdByClient(clientId: string): Promise<EsdContribution[]> {
    const docs = await EsdContributionModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<EsdContribution>(d));
  }

  async createEsd(data: InsertEsdContribution): Promise<EsdContribution> {
    const doc = await EsdContributionModel.create({ id: uuid(), ...data });
    return cleanDoc<EsdContribution>(doc);
  }

  async deleteEsd(id: string): Promise<void> {
    await EsdContributionModel.deleteOne({ id });
  }

  async findSedByClient(clientId: string): Promise<SedContribution[]> {
    const docs = await SedContributionModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<SedContribution>(d));
  }

  async createSed(data: InsertSedContribution): Promise<SedContribution> {
    const doc = await SedContributionModel.create({ id: uuid(), ...data });
    return cleanDoc<SedContribution>(doc);
  }

  async deleteSed(id: string): Promise<void> {
    await SedContributionModel.deleteOne({ id });
  }
}

export class ScenarioRepository extends BaseRepository<Scenario, InsertScenario> {
  constructor() {
    super(ScenarioModel);
  }

  async findByClient(clientId: string): Promise<Scenario[]> {
    const docs = await ScenarioModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<Scenario>(d));
  }
}
