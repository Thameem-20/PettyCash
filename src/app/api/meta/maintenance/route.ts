import { NextResponse } from "next/server";
import { isMaintenanceMode } from "@/lib/appSettings";
import { MAINTENANCE_COOKIE } from "@/lib/maintenanceCookie";

export const dynamic = "force-dynamic";

/** Public status for middleware / clients. Also syncs the maintenance cookie. */
export async function GET() {
  const enabled = await isMaintenanceMode();
  const res = NextResponse.json({ ok: true, maintenance: enabled });
  res.cookies.set(MAINTENANCE_COOKIE, enabled ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  return res;
}
