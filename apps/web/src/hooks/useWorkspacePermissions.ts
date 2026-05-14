/**
 * useWorkspacePermissions
 *
 * Fetches the current user's role and pillar scopes for a workspace and
 * exposes helper functions used throughout the build flow to gate visibility
 * and editing.
 *
 * Mapping between API role names:
 *   owner       → full access, no restrictions
 *   collaborator → can edit; pillarScopes restricts which pillars (null = all)
 *   viewer      → read-only access to everything
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@toolkit/lib/auth';

export type WorkspaceRole = 'owner' | 'collaborator' | 'viewer';

export interface WorkspacePermissions {
  /** True while the initial fetch is in progress */
  loading: boolean;
  /** Role for this workspace, null if not a member or not yet loaded */
  role: WorkspaceRole | null;
  /** Specific pillars this collaborator may edit (null = all pillars) */
  pillarScopes: string[] | null;
  /** True for owner and collaborator (non-empty pillarScopes restricts which pillars) */
  canEditFoundation: boolean;
  /** Returns true if user can VIEW the given pillar */
  canView: (pillar: string) => boolean;
  /** Returns true if user can EDIT the given pillar */
  canEdit: (pillar: string) => boolean;
  /** All workspace members can always view the final scorecard totals */
  canViewFinalScorecard: boolean;
  /** True if no pillar restrictions apply (owner or collaborator without scopes) */
  hasFullAccess: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

const DEFAULT_PERMISSIONS: WorkspacePermissions = {
  loading: false,
  role: null,
  pillarScopes: null,
  canEditFoundation: true,
  canView: () => true,
  canEdit: () => true,
  canViewFinalScorecard: true,
  hasFullAccess: true,
  isOwner: false,
  isAdmin: false,
};

/**
 * Lightweight helper – given a pillar key and the member's scope list,
 * return whether access is permitted.
 *
 * Scope matching is intentionally loose: "management" covers both
 * "management" and "employmentEquity", and vice-versa.
 */
function pillarInScope(pillar: string, scopes: string[]): boolean {
  if (scopes.includes(pillar)) return true;
  // management / employmentEquity are stored together in the build flow
  if (pillar === 'management' && scopes.includes('employmentEquity')) return true;
  if (pillar === 'employmentEquity' && scopes.includes('management')) return true;
  // esd covers both supplierDevelopment and enterpriseDevelopment
  if ((pillar === 'supplierDevelopment' || pillar === 'enterpriseDevelopment') && scopes.includes('esd')) return true;
  if (pillar === 'esd' && (scopes.includes('supplierDevelopment') || scopes.includes('enterpriseDevelopment'))) return true;
  return false;
}

export function useWorkspacePermissions(workspaceId: string | null | undefined): WorkspacePermissions {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [pillarScopes, setPillarScopes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!workspaceId || !user?.id) {
      setRole(null);
      setPillarScopes(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/workspaces/${workspaceId}/members`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { members: Array<{ userId: string; role: string; pillarScopes: string[] | null }> }) => {
        if (cancelled) return;
        const me = (data.members || []).find(m => m.userId === user.id);
        if (me) {
          setRole(me.role as WorkspaceRole);
          setPillarScopes(me.pillarScopes ?? null);
        } else {
          setRole(null);
          setPillarScopes(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRole(null);
          setPillarScopes(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [workspaceId, user?.id]);

  const canView = useCallback((pillar: string): boolean => {
    if (!role) return true; // no workspace loaded → show everything
    if (role === 'owner') return true;
    if (role === 'viewer') return true; // viewers see everything (read-only)
    // collaborator: check scopes
    if (!pillarScopes || pillarScopes.length === 0) return true;
    return pillarInScope(pillar, pillarScopes);
  }, [role, pillarScopes]);

  const canEdit = useCallback((pillar: string): boolean => {
    if (!role) return true;
    if (role === 'owner') return true;
    if (role === 'viewer') return false;
    // collaborator
    if (!pillarScopes || pillarScopes.length === 0) return true;
    return pillarInScope(pillar, pillarScopes);
  }, [role, pillarScopes]);

  if (!workspaceId || !user?.id) return DEFAULT_PERMISSIONS;

  const isOwner = role === 'owner';
  const hasFullAccess = isOwner || (role === 'collaborator' && (!pillarScopes || pillarScopes.length === 0));

  return {
    loading,
    role,
    pillarScopes,
    canEditFoundation: role === 'owner' || role === 'collaborator',
    canView,
    canEdit,
    canViewFinalScorecard: true,
    hasFullAccess,
    isOwner,
    isAdmin: isOwner,
  };
}
