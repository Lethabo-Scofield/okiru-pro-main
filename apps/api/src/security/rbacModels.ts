/**
 * RBAC persistence — Mongoose models for tenant-scoped roles, role
 * assignments, and teams. These are layered ON TOP of the in-code
 * default role map in `permissions.ts`, so the system stays usable
 * even if the collections are empty.
 */
import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";

/**
 * A role that exists either globally (organizationId === null) or scoped
 * to a single organization. The `permissions` array holds permission
 * strings from `permissions.ts`. When a role with a given name exists for
 * a tenant, it overrides the default permissions for that name (allowing
 * tenants to widen or narrow built-in roles).
 */
const rbacRoleSchema = new Schema(
  {
    id: { type: String, default: uuid, unique: true },
    organizationId: { type: String, default: null, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "rbacRoles" },
);
rbacRoleSchema.index({ organizationId: 1, name: 1 }, { unique: true, sparse: true });

/**
 * Assigns a role to a user, optionally scoped to a team within the org.
 * The presence of `teamId` narrows the role to that team's resources;
 * absent means org-wide.
 */
const rbacRoleAssignmentSchema = new Schema(
  {
    id: { type: String, default: uuid, unique: true },
    userId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    roleName: { type: String, required: true },
    teamId: { type: String, default: null, index: true },
    assignedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "rbacRoleAssignments" },
);
rbacRoleAssignmentSchema.index({ userId: 1, organizationId: 1 });

/**
 * A team / workspace inside an organization. Used to scope role
 * assignments and (optionally) data ownership for resources tagged
 * with `teamId`.
 */
const rbacTeamSchema = new Schema(
  {
    id: { type: String, default: uuid, unique: true },
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    memberUserIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "rbacTeams" },
);
rbacTeamSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const RbacRoleModel =
  mongoose.models.RbacRole || mongoose.model("RbacRole", rbacRoleSchema);
export const RbacRoleAssignmentModel =
  mongoose.models.RbacRoleAssignment ||
  mongoose.model("RbacRoleAssignment", rbacRoleAssignmentSchema);
export const RbacTeamModel =
  mongoose.models.RbacTeam || mongoose.model("RbacTeam", rbacTeamSchema);
