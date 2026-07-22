import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "./lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static assets, PWA files, public paths and the login API.
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    PWA_ASSETS.some((p) => pathname === p || pathname.startsWith(p) || pathname.startsWith(p + "?")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|webmanifest)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // Unauthenticated -> login (for pages) or 401 (for API).
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Root -> dashboard.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
