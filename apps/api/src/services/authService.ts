import bcrypt from "bcrypt";
import type { InsertOrganization, InsertUser, User } from "../../schema.js";
import { OrganizationRepository, UserRepository } from "../repositories/userRepository.js";

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  async register(input: {
    username: string;
    password: string;
    fullName?: string;
    email?: string | null;
    organizationName?: string;
  }): Promise<{ user: User; organizationId: string }> {
    const existing = await this.users.findByUsername(input.username);
    if (existing) throw new Error("Username already taken");

    const org = await this.organizations.create({ name: input.organizationName || `${input.username}'s Organization` } as InsertOrganization);
    const hashedPassword = await bcrypt.hash(input.password, 12);

    const user = await this.users.create({
      username: input.username,
      password: hashedPassword,
      fullName: input.fullName || input.username,
      email: input.email ?? null,
      organizationId: org.id,
    } as InsertUser & { organizationId?: string });

    return { user, organizationId: org.id };
  }

  async login(username: string, password: string): Promise<User | undefined> {
    const user = await this.users.findByUsername(username);
    if (!user) return undefined;
    const valid = await bcrypt.compare(password, user.password);
    return valid ? user : undefined;
  }

  async getMe(userId: string): Promise<User | undefined> {
    return this.users.findById(userId);
  }
}
