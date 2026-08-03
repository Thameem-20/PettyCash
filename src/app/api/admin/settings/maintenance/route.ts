import { NextRequest } from "next/server";
import { fail, ok, requireApiSession } from "@/lib/api";
import { isMaintenanceMode, setMaintenanceMode } from "@/lib/appSettings";
import { MAINTENANCE_COOKIE } from "@/lib/maintenanceCookie";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiSession(["admin"]);
    const enabled = await isMaintenanceMode();
    return ok({ enabled });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const body = await req.json();
    const enabled = Boolean(body?.enabled);

    await setMaintenanceMode(enabled);

    const res = ok({ enabled });
    res.cookies.set(MAINTENANCE_COOKIE, enabled ? "1" : "0", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });

    await audit({
      userId: session.id,
      action: enabled ? "enable_maintenance" : "disable_maintenance",
      entityType: "settings",
      entityId: null,
      newValue: { enabled },
    });

    return res;
  } catch (err) {
    return fail(err);
  }
}
