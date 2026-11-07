import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, cleanFileName, detectFileType } from "@/lib/documents/file-type";
import { DOC_TYPES, type DocType } from "@/lib/fields";
import { UserError, errorResponse } from "@/lib/http";
import { refreshShipment } from "@/lib/shipments/refresh";

// Upload (or replace) one document of a shipment.
export async function POST(request: Request, ctx: RouteContext<"/api/shipments/[id]/documents">) {
  try {
    const user = await authorize("document:upload");
    const { id } = await ctx.params;

    const shipment = await db.shipment.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!shipment) throw new UserError("Shipment not found.", 404);
    if (shipment.status === "EXPORTED") throw new UserError("This shipment has been exported and is locked.", 409);

    const form = await request.formData().catch(() => null);
    if (!form) throw new UserError("Send the file as multipart form data.");
    const type = form.get("type");
    const file = form.get("file");
    if (typeof type !== "string" || !DOC_TYPES.includes(type as DocType)) throw new UserError("Unknown document type.");
    if (!(file instanceof File)) throw new UserError("Choose a file to upload.");
    if (file.size === 0) throw new UserError("That file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) throw new UserError("Files must be 4 MB or smaller.", 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectFileType(bytes);
    if (!mimeType) throw new UserError("Upload a PDF, PNG, JPG or WebP file.", 415);

    const document = await db.$transaction(async (tx) => {
      // One document of each type per shipment: a new upload replaces the old
      // one, together with its extracted fields.
      await tx.document.deleteMany({ where: { shipmentId: id, type: type as DocType } });
      const doc = await tx.document.create({
        data: {
          shipmentId: id,
          type: type as DocType,
          fileName: cleanFileName(file.name),
          storageKey: `db/${id}/${type.toLowerCase()}`,
          mimeType,
          sizeBytes: bytes.byteLength,
          status: "QUEUED",
          blob: { create: { data: Buffer.from(bytes) } },
        },
        select: { id: true },
      });
      await audit(tx, {
        userId: user.id,
        action: "document.uploaded",
        entityType: "document",
        entityId: doc.id,
        metadata: { shipmentId: id, docType: type, fileName: cleanFileName(file.name) },
      });
      await refreshShipment(id, tx, { contentChanged: true, actorId: user.id });
      return doc;
    });

    return NextResponse.json({ documentId: document.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
