import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { runExtraction } from "@/lib/extraction/run";
import { UserError, errorResponse } from "@/lib/http";

// The model call can take tens of seconds for a multi-page scan.
export const maxDuration = 60;

export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/extract">) {
  try {
    const user = await authorize("document:extract");
    const { id } = await ctx.params;
    const doc = await db.document.findUnique({ where: { id }, select: { shipment: { select: { status: true } } } });
    if (!doc) throw new UserError("Document not found.", 404);
    if (doc.shipment.status === "EXPORTED") throw new UserError("This shipment has been exported and is locked.", 409);

    const result = await runExtraction(id, { actorId: user.id });
    if (result.status === "BUSY") return NextResponse.json({ status: "BUSY" }, { status: 409 });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
