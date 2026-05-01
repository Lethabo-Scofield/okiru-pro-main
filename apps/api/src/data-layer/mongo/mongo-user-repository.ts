import type { ClientSession } from "mongoose";
import { UserModel } from "../../../models.js";
import type { IUserRepository, UserView } from "../domain/user.js";

interface UserDoc {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: string;
  organizationId: string | null;
  profilePicture: string | null;
  createdAt: string;
}

function toView(doc: UserDoc | null): UserView | null {
  if (!doc) return null;
  return {
    id: doc.id,
    username: doc.username,
    email: doc.email ?? null,
    fullName: doc.fullName ?? null,
    role: doc.role,
    organizationId: doc.organizationId ?? null,
    profilePicture: doc.profilePicture ?? null,
    createdAt: doc.createdAt,
  };
}

/**
 * Concrete Mongo implementation of IUserRepository.
 *
 * The session is optional: MongoDB transactions require a replica set, which
 * is not available in dev / in-memory mode. When session is undefined, queries
 * still run correctly — they are just not part of a transaction.
 */
export class MongoUserRepository implements IUserRepository {
  constructor(private readonly session: ClientSession | null) {}

  async findById(id: string): Promise<UserView | null> {
    const doc = await UserModel.findOne({ id })
      .session(this.session)
      .lean<UserDoc>()
      .exec();
    return toView(doc);
  }

  async findByUsername(username: string): Promise<UserView | null> {
    const doc = await UserModel.findOne({ username })
      .session(this.session)
      .lean<UserDoc>()
      .exec();
    return toView(doc);
  }
}
