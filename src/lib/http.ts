import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/current-user";

/** A problem we can explain to the user. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Turn thrown errors into JSON responses without leaking internals. */
export function errorResponse(err: unknown) {
  if (err instanceof AuthError || err instanceof UserError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** Same idea for server actions, which return a result object instead. */
export function actionError(err: unknown): { error: string } {
  if (err instanceof AuthError || err instanceof UserError) return { error: err.message };
  console.error(err);
  return { error: "Something went wrong. Please try again." };
}
