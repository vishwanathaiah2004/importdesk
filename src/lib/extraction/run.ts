import "server-only";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { DocType } from "@/lib/fields";
import { refreshShipment } from "@/lib/shipments/refresh";
import { geminiExtract, ModelError, type ExtractFn } from "./gemini";
import { interpret, manualEntryDrafts, type FieldDraft } from "./interpret";
import { ModelOutput } from "./schema";

// Orchestrates one extraction: claim the document, call the model, validate,
// interpret, and store the result in a single transaction.

export type RunResult = { status: "DONE" | "UNREADABLE" | "FAILED" | "BUSY"; message?: string };

function parse(text: string) {
  // Some models wrap JSON in a code fence even in JSON mode.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return ModelOutput.safeParse(JSON.parse(cleaned));
}

async function saveFields(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], documentId: string, fields: FieldDraft[]) {
  await tx.extractedField.deleteMany({ where: { documentId } });
  if (fields.length) await tx.extractedField.createMany({ data: fields.map((f) => ({ ...f, documentId })) });
}

export async function runExtraction(
  documentId: string,
  opts: { actorId: string; extract?: ExtractFn },
): Promise<RunResult> {
  const extract = opts.extract ?? geminiExtract;
  // Claim: only a queued or failed document can start, so two clicks (or two
  // tabs) never run the same extraction twice.
  const claimed = await db.document.updateMany({
    where: { id: documentId, status: { in: ["QUEUED", "FAILED"] } },
    data: { status: "EXTRACTING", error: null },
  });
  if (claimed.count === 0) return { status: "BUSY" };

  const doc = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { shipmentId: true, type: true, mimeType: true, blob: { select: { data: true } } },
  });
  await refreshShipment(doc.shipmentId);

  const fail = async (message: string): Promise<RunResult> => {
    await db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: documentId }, data: { status: "FAILED", error: message } });
      await audit(tx, {
        userId: opts.actorId,
        action: "document.extraction_failed",
        entityType: "document",
        entityId: documentId,
        metadata: { shipmentId: doc.shipmentId, docType: doc.type, message },
      });
      await refreshShipment(doc.shipmentId, tx);
    });
    return { status: "FAILED", message };
  };

  try {
    if (!doc.blob) return await fail("The stored file is missing. Upload it again.");
    const docType = doc.type as DocType;

    // One retry if the answer is not valid JSON in our schema.
    let output: ModelOutput | null = null;
    let model = "";
    for (let attempt = 1; attempt <= 2 && !output; attempt++) {
      const res = await extract({ bytes: new Uint8Array(doc.blob.data), mimeType: doc.mimeType, docType });
      model = res.model;
      try {
        const parsed = parse(res.text);
        if (parsed.success) output = parsed.data;
      } catch {
        // invalid JSON: try once more
      }
    }
    if (!output) return await fail("The AI answer could not be validated, so nothing was saved. Retry, or enter the values manually.");

    const result = interpret(docType, output);
    if (result.outcome === "wrong_type") return await fail(result.message);

    await db.$transaction(async (tx) => {
      await saveFields(tx, documentId, result.fields);
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: result.outcome === "unreadable" ? "UNREADABLE" : "DONE",
          error: result.outcome === "unreadable" ? `${result.reason} Enter the values manually.` : null,
          modelName: model,
          extractedAt: new Date(),
        },
      });
      await audit(tx, {
        userId: opts.actorId,
        action: result.outcome === "unreadable" ? "document.unreadable" : "document.extracted",
        entityType: "document",
        entityId: documentId,
        metadata: { shipmentId: doc.shipmentId, docType: doc.type, fields: result.fields.length },
      });
      await refreshShipment(doc.shipmentId, tx, { contentChanged: true, actorId: opts.actorId });
    });
    return { status: result.outcome === "unreadable" ? "UNREADABLE" : "DONE" };
  } catch (err) {
    if (err instanceof ModelError) return await fail(err.message);
    console.error("extraction failed", err);
    return await fail("Extraction failed unexpectedly. Retry, or enter the values manually.");
  }
}

/** For a failed document: skip the AI and let a person type the values. */
export async function startManualEntry(documentId: string, actorId: string) {
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId }, select: { shipmentId: true, type: true, status: true } });
  if (doc.status !== "FAILED") return false;
  await db.$transaction(async (tx) => {
    await saveFields(tx, documentId, manualEntryDrafts(doc.type as DocType, "Entered manually"));
    await tx.document.update({
      where: { id: documentId },
      data: { status: "UNREADABLE", error: "Values are being entered manually.", modelName: null, extractedAt: new Date() },
    });
    await audit(tx, {
      userId: actorId,
      action: "document.manual_entry",
      entityType: "document",
      entityId: documentId,
      metadata: { shipmentId: doc.shipmentId, docType: doc.type },
    });
    await refreshShipment(doc.shipmentId, tx, { contentChanged: true, actorId });
  });
  return true;
}
