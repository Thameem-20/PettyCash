import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "./lib/auth";
import { MAINTENANCE_COOKIE } from "./lib/maintenanceCookie";

const PUBLIC_PATHS = [
  "/login",
  "/admin-login",
  "/maintenance",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/meta/maintenance",
];

const PWA_ASSETS = [
  "/sw.js",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  "/apple-touch-icon.png",
  "/apple-touch-icon",
  "/opengraph-image",
  "/icons/",
];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    PWA_ASSETS.some((p) => pathname === p || pathname.startsWith(p) || pathname.startsWith(p + "?")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|webmanifest|css)$/i.test(pathname)
  );
}

function withMaintenanceCookie(res: NextResponse, enabled: boolean): NextResponse {
  res.cookies.set(MAINTENANCE_COOKIE, enabled ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

async function readMaintenanceFlag(req: NextRequest): Promise<boolean> {
  try {
    const url = new URL("/api/meta/maintenance", req.url);
    const res = await fetch(url, {
      headers: { "x-maintenance-probe": "1" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { maintenance?: boolean };
      return Boolean(data.maintenance);
    }
  } catch {
    // fall through
  }
  return req.cookies.get(MAINTENANCE_COOKIE)?.value === "1";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/meta/maintenance") {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const maintenance = await readMaintenanceFlag(req);
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  const isAdmin = session?.role === "admin";

  // Not logged in → normal login (even during maintenance).
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withMaintenanceCookie(NextResponse.redirect(url), maintenance);
  }

  // Logged in, maintenance on, non-admin → maintenance page (session stays).
  if (maintenance && !isAdmin) {
    if (pathname.startsWith("/api/")) {
      return withMaintenanceCookie(
        NextResponse.json(
          { ok: false, error: "The app is under maintenance.", code: "MAINTENANCE" },
          { status: 503 }
        ),
        true
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return withMaintenanceCookie(NextResponse.redirect(url), true);
  }

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return withMaintenanceCookie(NextResponse.redirect(url), maintenance);
  }

  return withMaintenanceCookie(NextResponse.next(), maintenance);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
