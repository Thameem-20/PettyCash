import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "./auth";
import { Role, SessionUser } from "./types";
import {
  loadUserBranchPreference,
  preferredParamFromUser,
} from "./preferredBranch";
import { resolveEffectiveRole } from "./branchMembership";
import { queryOne } from "./db";

/** Read the current session from the cookie (server-side), with effective role. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const base = await verifySession(token);
  if (!base) return null;

  // Prefer live DB role so role renames/migrations apply without re-login.
  const dbUser = await queryOne<{ role: Role; default_branch_id: number | null }>(
    "SELECT role, default_branch_id FROM users WHERE id = ? AND is_active = 1",
    [base.id]
  );
  if (!dbUser) return null;

  const primaryRole = dbUser.role;
  const prefs = await loadUserBranchPreference(base.id);
  const preferred = preferredParamFromUser(prefs);
  const { role, active_branch_id } = await resolveEffectiveRole(
    base.id,
    preferred,
    primaryRole
  );

  return {
    ...base,
    role,
    primary_role: primaryRole,
    default_branch_id: prefs?.default_branch_id ?? dbUser.default_branch_id ?? base.default_branch_id,
    preferred_branch_param: preferred,
    active_branch_id,
  };
}

/** Require a session; redirect to /login if missing. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Require one of the given roles; redirect to /dashboard if not allowed. */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const session = await requireSession();
  // Allow primary elevated roles even when effective role is branch-specific.
  const checkRoles = [session.role];
  if (session.primary_role && session.primary_role !== session.role) {
    checkRoles.push(session.primary_role);
  }
  if (!checkRoles.some((r) => roles.includes(r))) redirect("/dashboard");
  return session;
}
