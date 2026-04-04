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
    console.log(`[AuthService] Register attempt: username=${input.username}, email=${input.email}`);
    const existing = await this.users.findByUsername(input.username);
    if (existing) {
      console.log(`[AuthService] Register failed: username ${input.username} already exists`);
      throw new Error("Username already taken");
    }

    const org = await this.organizations.create({ name: input.organizationName || `${input.username}'s Organization` } as InsertOrganization);
    const hashedPassword = await bcrypt.hash(input.password, 12);

    const user = await this.users.create({
      username: input.username,
      password: hashedPassword,
      fullName: input.fullName || input.username,
      email: input.email ?? null,
      organizationId: org.id,
    } as InsertUser & { organizationId?: string });

    console.log(`[AuthService] Register success: userId=${user.id}, orgId=${org.id}`);
    return { user, organizationId: org.id };
  }

  async login(username: string, password: string): Promise<User | undefined> {
    console.log(`[AuthService] Login attempt: username=${username}`);
    const user = await this.users.findByUsername(username);
    if (!user) {
      console.log(`[AuthService] Login failed: user ${username} not found`);
      return undefined;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log(`[AuthService] Login failed: invalid password for ${username}`);
      return undefined;
    }
    console.log(`[AuthService] Login success: userId=${user.id}, role=${user.role}`);
    return user;
  }

  async getMe(userId: string): Promise<User | undefined> {
    console.log(`[AuthService] GetMe: userId=${userId}`);
    return this.users.findById(userId);
  }
}
