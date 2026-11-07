import { getCurrentUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { errorResponse, UserError } from "@/lib/http";

// Streams a stored document to signed-in users only. Files are never public.
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UserError("Not signed in.", 401);
    const { id } = await ctx.params;

    const doc = await db.document.findUnique({
      where: { id },
      select: { fileName: true, mimeType: true, type: true, shipmentId: true, blob: { select: { data: true } } },
    });
    if (!doc?.blob) throw new UserError("Document not found.", 404);

    const download = new URL(request.url).searchParams.get("download") === "1";
    if (download) {
      // Client prices are confidential: record who took a copy.
      await audit(db, { userId: user.id, action: "document.downloaded", entityType: "document", entityId: id, metadata: { shipmentId: doc.shipmentId, docType: doc.type } });
    }
    const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`;

    return new Response(new Uint8Array(doc.blob.data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
