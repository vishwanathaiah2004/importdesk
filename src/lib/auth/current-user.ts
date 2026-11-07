import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./token";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "EXECUTIVE" | "MANAGER";
};

/** The signed-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true },
  });
  return user;
});

/** For pages: send signed-out visitors to the login screen. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

/** For actions and route handlers: throw unless the user holds the permission. */
export async function authorize(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in again.", 401);
  if (!can(user.role, permission)) {
    throw new AuthError("Your role does not allow this action.", 403);
  }
  return user;
}

export async function startSession(user: { id: string; role: CurrentUser["role"] }) {
  const token = await signSession({ sub: user.id, role: user.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
