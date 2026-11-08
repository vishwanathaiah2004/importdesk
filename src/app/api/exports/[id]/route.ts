import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { UserError, errorResponse } from "@/lib/http";

// Download a stored export file exactly as it was produced.
export async function GET(_request: Request, ctx: RouteContext<"/api/exports/[id]">) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UserError("Not signed in.", 401);
    const { id } = await ctx.params;
    const exp = await db.export.findUnique({ where: { id }, select: { fileName: true, content: true } });
    if (!exp) throw new UserError("Export not found.", 404);

    return new Response(exp.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exp.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
