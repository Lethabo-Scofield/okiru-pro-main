import type { IRepository } from "@okiru/data-layer";

/**
 * Domain shape of a User as the application sees it. This is the read model
 * exposed by repositories — it intentionally excludes Mongoose internals
 * (`_id`, `__v`) and the password hash.
 */
export interface UserView {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: string;
  organizationId: string | null;
  profilePicture: string | null;
  createdAt: string;
}

export interface IUserRepository extends IRepository<UserView, string> {
  findByUsername(username: string): Promise<UserView | null>;
}
