import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { getStoredThemeId, setStoredThemeId } from "@/lib/appSettings";
import { THEME_COOKIE, isThemeId } from "@/lib/themes";
import { audit } from "@/lib/audit";

export async function GET() {
  try {
    await requireApiSession(["admin"]);
    const themeId = await getStoredThemeId();
    return ok({ themeId });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const body = await req.json();
    const themeId = body?.themeId;
    if (!isThemeId(themeId)) throw new ApiError(400, "Invalid theme");

    await setStoredThemeId(themeId);

    const res = ok({ themeId });
    res.cookies.set(THEME_COOKIE, themeId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });

    await audit({
      userId: session.id,
      action: "update_theme",
      entityType: "settings",
      entityId: null,
      newValue: { themeId },
    });

    return res;
  } catch (err) {
    return fail(err);
  }
}
