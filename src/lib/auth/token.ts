import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./permissions";

// Stateless session token: a signed JWT in an httpOnly cookie.
// The token only says who the user is; every request still loads the user
// from the database (see current-user.ts), so a role change applies at once.

export const SESSION_COOKIE = "importdesk_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day

export type SessionPayload = { sub: string; role: Role };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    if (payload.role !== "EXECUTIVE" && payload.role !== "MANAGER") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
