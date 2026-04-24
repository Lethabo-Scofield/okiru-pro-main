import { UserModel, OrganizationModel } from "../../models.js";
import type { InsertOrganization, InsertUser, Organization, User } from "../../schema.js";
import { BaseRepository, cleanDoc } from "./base.js";

export class UserRepository extends BaseRepository<User, InsertUser & { organizationId?: string }> {
  constructor() {
    super(UserModel);
  }

  async findByUsername(username: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ username }).lean();
    return doc ? cleanDoc<User>(doc) : undefined;
  }

  async updateProfile(id: string, data: Partial<{ fullName: string; email: string; profilePicture: string }>): Promise<User | undefined> {
    const doc = await UserModel.findOneAndUpdate({ id }, { $set: data }, { returnDocument: "after" }).lean();
    return doc ? cleanDoc<User>(doc) : undefined;
  }
}

export class OrganizationRepository extends BaseRepository<Organization, InsertOrganization> {
  constructor() {
    super(OrganizationModel);
  }
}
