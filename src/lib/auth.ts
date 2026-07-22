import { SignJWT, jwtVerify } from "jose";
import { SessionUser } from "./types";

export const COOKIE_NAME = "pc_session";
const ALG = "HS256";
/** Keep users signed in for 90 days (cookie + JWT). */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET || "dev_insecure_secret_change_me";
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return await new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
    default_branch_id: user.default_branch_id,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    return {
      id: Number(payload.sub),
      name: String(payload.name),
      email: String(payload.email),
      role: payload.role as SessionUser["role"],
      default_branch_id:
        payload.default_branch_id == null ? null : Number(payload.default_branch_id),
    };
  } catch {
    return null;
  }
}

export const COOKIE_MAX_AGE = MAX_AGE_SECONDS;
