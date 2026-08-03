import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { queryOne } from "@/lib/db";
import { COOKIE_NAME, COOKIE_MAX_AGE, signSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isMaintenanceMode } from "@/lib/appSettings";

export async function POST(req: NextRequest) {
  try {
    const { email, password, adminOnly } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
    }

    const user = await queryOne<{
      id: number;
      name: string;
      email: string;
      password_hash: string;
      role: string;
      default_branch_id: number | null;
      is_active: number;
    }>("SELECT id, name, email, password_hash, role, default_branch_id, is_active FROM users WHERE email = ?", [
      String(email).trim().toLowerCase(),
    ]);

    if (!user || !user.is_active) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const maintenance = await isMaintenanceMode();
    const isAdmin = user.role === "admin";

    if (adminOnly && !isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Admin sign-in only. This account is not an administrator." },
        { status: 403 }
      );
    }

    const token = await signSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
      default_branch_id: user.default_branch_id,
    });

    await audit({ userId: user.id, action: "login", entityType: "user", entityId: user.id });

    const res = NextResponse.json({
      ok: true,
      role: user.role,
      maintenance: maintenance && !isAdmin,
    });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}
