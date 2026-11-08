"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { normalizeValue } from "@/lib/extraction/normalize";
import { startManualEntry } from "@/lib/extraction/run";
import { HAS_CONTAINERS, LINE_ATTRS, containerKey, fieldDef, lineKey, parseKey, type DocType } from "@/lib/fields";
import { UserError, actionError } from "@/lib/http";
import { refreshShipment } from "@/lib/shipments/refresh";

export type ActionResult = { ok: true } | { error: string };

const Id = z.string().min(1).max(40);
const Stamp = z.string().datetime();

function done(): ActionResult {
  revalidatePath("/shipments/[id]", "page");
  revalidatePath("/");
  return { ok: true };
}

/** Load a field with what we need to authorise and validate a change. */
async function loadField(fieldId: string) {
  const field = await db.extractedField.findUnique({
    where: { id: Id.parse(fieldId) },
    select: {
      id: true,
      key: true,
      status: true,
      valueNormalized: true,
      updatedAt: true,
      document: { select: { id: true, type: true, shipmentId: true, shipment: { select: { status: true } } } },
    },
  });
  if (!field) throw new UserError("That field no longer exists. Refresh the page.", 404);
  if (field.document.shipment.status === "EXPORTED") throw new UserError("This shipment has been exported and is locked.", 409);
  return field;
}

/** What the audit log needs to describe a field in words. */
function fieldMeta(field: Awaited<ReturnType<typeof loadField>>) {
  const type = field.document.type as DocType;
  const key = parseKey(field.key);
  const def = fieldDef(type, field.key);
  const label =
    key.kind === "line" ? `line ${key.row} ${def?.label.toLowerCase() ?? key.attr}` : key.kind === "container" ? `container ${key.row}` : (def?.label ?? field.key);
  return { shipmentId: field.document.shipmentId, docType: type, key: field.key, label };
}

const STALE = "Someone changed this field after you opened it. The page has been refreshed; check the new value.";

export async function enterManually(documentId: string): Promise<ActionResult> {
  try {
    const user = await authorize("document:extract");
    if (!(await startManualEntry(Id.parse(documentId), user.id))) throw new UserError("Only a failed extraction can switch to manual entry.");
    return done();
  } catch (err) {
    return actionError(err);
  }
}

/** One click: a person agrees with the extracted value. */
export async function confirmField(fieldId: string, seenAt: string): Promise<ActionResult> {
  try {
    const user = await authorize("field:review");
    const field = await loadField(fieldId);
    if (field.valueNormalized == null || field.valueNormalized === "") throw new UserError("Enter a value before confirming.");

    await db.$transaction(async (tx) => {
      // Optimistic concurrency: only if nobody changed the field since this user loaded it.
      const res = await tx.extractedField.updateMany({
        where: { id: field.id, updatedAt: new Date(Stamp.parse(seenAt)) },
        data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() },
      });
      if (res.count === 0) throw new UserError(STALE, 409);
      await audit(tx, {
        userId: user.id,
        action: "field.confirmed",
        entityType: "field",
        entityId: field.id,
        metadata: { ...fieldMeta(field), newValue: field.valueNormalized },
      });
      await refreshShipment(field.document.shipmentId, tx);
    });
    return done();
  } catch (err) {
    if (err instanceof UserError && err.status === 409) revalidatePath("/shipments/[id]", "page");
    return actionError(err);
  }
}

/** A person types the right value. The old value is kept for the accuracy history. */
export async function correctField(fieldId: string, seenAt: string, input: string): Promise<ActionResult> {
  try {
    const user = await authorize("field:review");
    const field = await loadField(fieldId);
    const def = fieldDef(field.document.type as DocType, field.key);
    if (!def) throw new UserError("Unknown field.");

    const text = z.string().max(300).parse(input);
    const n = normalizeValue(def.type, text, { source: "user" });
    if (n.error) throw new UserError(n.error);
    if (n.value == null && def.required) throw new UserError(`${def.label} is required.`);

    const unchanged = n.value === field.valueNormalized;
    await db.$transaction(async (tx) => {
      const res = await tx.extractedField.updateMany({
        where: { id: field.id, updatedAt: new Date(Stamp.parse(seenAt)) },
        data: {
          valueRaw: text.trim() || null,
          valueNormalized: n.value,
          unit: n.unit ?? (def.type === "weight" ? "kg" : null),
          flagReason: null,
          // Typing a value the AI never found is manual entry, not a correction.
          status: unchanged ? "CONFIRMED" : field.valueNormalized == null ? "MANUAL" : "CORRECTED",
          confirmedById: user.id,
          confirmedAt: new Date(),
        },
      });
      if (res.count === 0) throw new UserError(STALE, 409);
      if (!unchanged) {
        await tx.fieldCorrection.create({
          data: { fieldId: field.id, userId: user.id, oldValue: field.valueNormalized, newValue: n.value ?? "" },
        });
      }
      await audit(tx, {
        userId: user.id,
        action: unchanged ? "field.confirmed" : field.valueNormalized == null ? "field.entered" : "field.corrected",
        entityType: "field",
        entityId: field.id,
        metadata: { ...fieldMeta(field), oldValue: field.valueNormalized, newValue: n.value },
      });
      await refreshShipment(field.document.shipmentId, tx, { contentChanged: !unchanged, actorId: user.id });
    });
    return done();
  } catch (err) {
    if (err instanceof UserError && err.status === 409) revalidatePath("/shipments/[id]", "page");
    return actionError(err);
  }
}

const Group = z.enum(["line", "container"]);

async function loadDocument(documentId: string) {
  const doc = await db.document.findUnique({
    where: { id: Id.parse(documentId) },
    select: { id: true, type: true, shipmentId: true, status: true, shipment: { select: { status: true } }, fields: { select: { key: true } } },
  });
  if (!doc) throw new UserError("Document not found.", 404);
  if (doc.shipment.status === "EXPORTED") throw new UserError("This shipment has been exported and is locked.", 409);
  if (doc.status !== "DONE" && doc.status !== "UNREADABLE") throw new UserError("Wait for extraction to finish.");
  return doc;
}

/** Add a line item or container the AI missed. */
export async function addRow(documentId: string, group: "line" | "container"): Promise<ActionResult> {
  try {
    const user = await authorize("field:review");
    const doc = await loadDocument(documentId);
    const kind = Group.parse(group);
    const type = doc.type as DocType;
    const rows = doc.fields.map((f) => parseKey(f.key)).filter((k) => k.kind === kind).map((k) => ("row" in k ? k.row : 0));
    const next = Math.max(0, ...rows) + 1;

    let data: { documentId: string; key: string; status: "PENDING" | "MANUAL"; flagReason: string | null }[];
    if (kind === "line") {
      if (!LINE_ATTRS[type].length) throw new UserError("This document has no line items.");
      // Required parts must be filled in; optional parts start empty but cleared.
      data = LINE_ATTRS[type].map((a) => ({
        documentId: doc.id,
        key: lineKey(next, a.key),
        status: a.required ? "PENDING" : "MANUAL",
        flagReason: a.required ? "Added manually — enter a value" : null,
      }));
    } else {
      if (!HAS_CONTAINERS[type]) throw new UserError("This document has no containers.");
      data = [{ documentId: doc.id, key: containerKey(next), status: "PENDING", flagReason: "Added manually — enter a value" }];
    }

    await db.$transaction(async (tx) => {
      await tx.extractedField.createMany({ data });
      await audit(tx, {
        userId: user.id,
        action: "row.added",
        entityType: "document",
        entityId: doc.id,
        metadata: { shipmentId: doc.shipmentId, docType: type, label: `${kind === "line" ? "line" : "container"} ${next}` },
      });
      await refreshShipment(doc.shipmentId, tx, { contentChanged: true, actorId: user.id });
    });
    return done();
  } catch (err) {
    return actionError(err);
  }
}

/** Remove a line item or container the AI invented or duplicated. */
export async function removeRow(documentId: string, group: "line" | "container", row: number): Promise<ActionResult> {
  try {
    const user = await authorize("field:review");
    const doc = await loadDocument(documentId);
    const kind = Group.parse(group);
    const n = z.number().int().min(1).max(500).parse(row);
    const prefix = kind === "line" ? `line.${n}.` : containerKey(n);
    const keys = doc.fields.map((f) => f.key).filter((k) => (kind === "line" ? k.startsWith(prefix) : k === prefix));
    if (!keys.length) throw new UserError("That row no longer exists.", 404);

    await db.$transaction(async (tx) => {
      await tx.extractedField.deleteMany({ where: { documentId: doc.id, key: { in: keys } } });
      await audit(tx, {
        userId: user.id,
        action: "row.removed",
        entityType: "document",
        entityId: doc.id,
        metadata: { shipmentId: doc.shipmentId, docType: doc.type, label: `${kind === "line" ? "line" : "container"} ${n}` },
      });
      await refreshShipment(doc.shipmentId, tx, { contentChanged: true, actorId: user.id });
    });
    return done();
  } catch (err) {
    return actionError(err);
  }
}
