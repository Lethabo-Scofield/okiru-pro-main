/**
 * Per-pillar permissions for workbook sections, aligned with workspace display roles.
 *
 * Admin / owner → full access
 * Contributor (scoped) → edit + import/export, no row delete, no replace import
 * Reviewer / Viewer → read-only
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { API_BASE } from "@toolkit/lib/config";
import type { WorkspaceDisplayRole } from "../../shared/schema";
import { sectionKeyToPillar, isFoundationSection } from "@/lib/workbookSectionPillarMap";

export interface PillarPermission {
  loading: boolean;
  role: WorkspaceDisplayRole | "owner" | null;
  canEdit: boolean;
  canDelete: boolean;
  canImport: boolean;
  canExport: boolean;
  canReplaceOnImport: boolean;
}

const FULL_ACCESS: PillarPermission = {
  loading: false,
  role: "admin",
  canEdit: true,
  canDelete: true,
  canImport: true,
  canExport: true,
  canReplaceOnImport: true,
};

function pillarInScope(pillar: string, scopes: string[]): boolean {
  if (scopes.includes(pillar)) return true;
  if (pillar === "management" && scopes.includes("employmentEquity")) return true;
  if (pillar === "employmentEquity" && scopes.includes("management")) return true;
  if (
    (pillar === "supplierDevelopment" || pillar === "enterpriseDevelopment") &&
    scopes.includes("esd")
  )
    return true;
  if (
    pillar === "esd" &&
    (scopes.includes("supplierDevelopment") || scopes.includes("enterpriseDevelopment"))
  )
    return true;
  return false;
}

function resolveDisplayRole(
  role: string,
  displayRole?: WorkspaceDisplayRole | null,
): WorkspaceDisplayRole | "owner" {
  if (role === "owner") return "owner";
  if (displayRole) return displayRole;
  if (role === "viewer") return "viewer";
  if (role === "collaborator") return "admin";
  return "viewer";
}

function permissionsFromMember(
  display: WorkspaceDisplayRole | "owner",
  pillarScopes: string[] | null,
  pillarKey: string | null,
  foundation: boolean,
): PillarPermission {
  if (display === "owner" || display === "admin") return FULL_ACCESS;

  if (display === "reviewer" || display === "viewer") {
    return {
      loading: false,
      role: display,
      canEdit: false,
      canDelete: false,
      canImport: false,
      canExport: true,
      canReplaceOnImport: false,
    };
  }

  // contributor
  if (foundation) {
    return {
      loading: false,
      role: "contributor",
      canEdit: false,
      canDelete: false,
      canImport: false,
      canExport: true,
      canReplaceOnImport: false,
    };
  }

  const inScope =
    !pillarKey ||
    !pillarScopes?.length ||
    pillarInScope(pillarKey, pillarScopes);

  if (!inScope) {
    return {
      loading: false,
      role: "contributor",
      canEdit: false,
      canDelete: false,
      canImport: false,
      canExport: true,
      canReplaceOnImport: false,
    };
  }

  return {
    loading: false,
    role: "contributor",
    canEdit: true,
    canDelete: false,
    canImport: true,
    canExport: true,
    canReplaceOnImport: false,
  };
}

/**
 * @param pillarKeyOrSection - pillar scope key or workbook section key
 * @param workspaceId - optional workspace; when omitted, defaults to full access
 */
export function usePillarPermission(
  pillarKeyOrSection: string,
  workspaceId?: string | null,
): PillarPermission {
  const { user } = useAuth();
  const [loading, setLoading] = useState(Boolean(workspaceId && user?.id));
  const [member, setMember] = useState<{
    role: string;
    displayRole?: WorkspaceDisplayRole | null;
    pillarScopes: string[] | null;
  } | null>(null);

  const pillarKey = useMemo(() => {
    const mapped = sectionKeyToPillar(pillarKeyOrSection);
    return mapped !== undefined ? mapped : pillarKeyOrSection;
  }, [pillarKeyOrSection]);

  const foundation = isFoundationSection(pillarKeyOrSection);

  useEffect(() => {
    if (!workspaceId || !user?.id) {
      setMember(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/members`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { members: Array<{ userId: string; role: string; displayRole?: WorkspaceDisplayRole; pillarScopes?: string[] | null }> }) => {
        if (cancelled) return;
        const me = (data.members || []).find((m) => m.userId === user.id);
        setMember(
          me
            ? {
                role: me.role,
                displayRole: me.displayRole ?? null,
                pillarScopes: me.pillarScopes ?? null,
              }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setMember(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, user?.id]);

  return useMemo(() => {
    if (!workspaceId || !user?.id) return FULL_ACCESS;
    if (loading) {
      return {
        loading: true,
        role: null,
        canEdit: false,
        canDelete: false,
        canImport: false,
        canExport: true,
        canReplaceOnImport: false,
      };
    }
    if (!member) return FULL_ACCESS;
    const display = resolveDisplayRole(member.role, member.displayRole);
    return permissionsFromMember(display, member.pillarScopes, pillarKey, foundation);
  }, [workspaceId, user?.id, loading, member, pillarKey, foundation]);
}
