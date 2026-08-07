import { NextResponse } from "next/server";
import { Role, SessionUser } from "./types";
import { getSession } from "./session";
import { isMaintenanceMode } from "./appSettings";

/** Get the session inside a route handler, or null (effective role applied). */
export async function apiSession(): Promise<SessionUser | null> {
  return getSession();
}

function isAdminSession(session: SessionUser): boolean {
  return session.role === "admin" || session.primary_role === "admin";
}

/** Require a session inside a route handler. Throws an ApiError if missing. */
export async function requireApiSession(roles?: Role[]): Promise<SessionUser> {
  const session = await apiSession();
  if (!session) throw new ApiError(401, "Not authenticated");

  if (await isMaintenanceMode()) {
    if (!isAdminSession(session)) {
      throw new ApiError(503, "The app is under maintenance.");
    }
  }

  if (roles) {
    const check = [session.role, session.primary_role].filter(Boolean) as Role[];
    if (!check.some((r) => roles.includes(r))) throw new ApiError(403, "Not authorized");
  }
  return session;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok(data: unknown = {}) {
  return NextResponse.json({ ok: true, ...(data as object) });
}

export function fail(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  // Surface friendly insufficient-funds errors.
  if (message.startsWith("INSUFFICIENT_FUNDS")) {
    return NextResponse.json(
      { ok: false, error: message.replace("INSUFFICIENT_FUNDS: ", ""), code: "INSUFFICIENT_FUNDS" },
      { status: 422 }
    );
  }
  // Upload validation is a client problem, not a server crash.
  if (message.startsWith("File too large")) {
    return NextResponse.json({ ok: false, error: message }, { status: 413 });
  }
  if (message.startsWith("Unsupported file type")) {
    return NextResponse.json({ ok: false, error: message }, { status: 415 });
  }
  console.error(err);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
