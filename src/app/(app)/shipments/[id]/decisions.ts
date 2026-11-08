"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/current-user";
import type { StoredCheckDetails } from "@/lib/checks/persist";
import { db } from "@/lib/db";
import { evaluateGate } from "@/lib/export/gate";
import { loadForGate } from "@/lib/export/load";
import { UserError, actionError } from "@/lib/http";
import { refreshShipment } from "@/lib/shipments/refresh";
import type { ActionResult } from "./actions";

// Manager decisions. Both are re-checked on the server; the buttons being
// hidden for executives is a convenience, not the protection.

function done(): ActionResult {
  revalidatePath("/shipments/[id]", "page");
  revalidatePath("/shipments/[id]/export", "page");
  revalidatePath("/");
  return { ok: true };
}

const Note = z.string().trim().min(10, "Explain the decision in at least 10 characters.").max(500);

/** Accept a genuine difference between documents, with a reason on record. */
export async function overrideCheck(checkId: string, note: string): Promise<ActionResult> {
  try {
    const user = await authorize("check:override");
    const reason = Note.parse(note);
    const check = await db.crossCheck.findUnique({
      where: { id: z.string().min(1).max(40).parse(checkId) },
      select: { id: true, rule: true, result: true, resolvedAt: true, details: true, shipmentId: true, shipment: { select: { status: true } } },
    });
    if (!check) throw new UserError("That check no longer exists. Refresh the page.", 404);
    if (check.shipment.status === "EXPORTED") throw new UserError("This shipment has been exported and is locked.", 409);
    // Only a real failure can be accepted. A check that could not run (missing
    // document or value) is never waved through.
    if (check.result !== "FAIL") throw new UserError("Only a failed check can be accepted.");
    if (check.resolvedAt) throw new UserError("This check has already been accepted.");

    await db.$transaction(async (tx) => {
      await tx.crossCheck.update({ where: { id: check.id }, data: { resolvedAt: new Date(), resolvedById: user.id, resolutionNote: reason } });
      await audit(tx, {
        userId: user.id,
        action: "check.overridden",
        entityType: "check",
        entityId: check.id,
        metadata: { shipmentId: check.shipmentId, rule: check.rule, label: (check.details as unknown as StoredCheckDetails).label, note: reason },
      });
      await refreshShipment(check.shipmentId, tx);
    });
    return done();
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Invalid note." };
    return actionError(err);
  }
}

/** Approve exactly the version the manager is looking at. */
export async function approveShipment(shipmentId: string, version: number): Promise<ActionResult> {
  try {
    const user = await authorize("shipment:approve");
    const id = z.string().min(1).max(40).parse(shipmentId);

    await db.$transaction(async (tx) => {
      const { gate, version: current } = await loadForGate(tx, id);
      if (gate.status === "EXPORTED") throw new UserError("This shipment has already been exported.", 409);
      if (gate.approved) throw new UserError("This shipment is already approved.");
      if (current !== z.number().int().parse(version)) {
        throw new UserError("The shipment changed while you were reviewing it. The page has been refreshed; check it again.", 409);
      }
      const { readyForApproval, blockers } = evaluateGate(gate);
      if (!readyForApproval) throw new UserError(`Not ready to approve: ${blockers[0]?.message.replace(/\.$/, "")}.`);

      await tx.shipment.update({ where: { id }, data: { approvedById: user.id, approvedAt: new Date(), status: "APPROVED" } });
      await audit(tx, { userId: user.id, action: "shipment.approved", entityType: "shipment", entityId: id, metadata: { shipmentId: id } });
    });
    return done();
  } catch (err) {
    if (err instanceof UserError && err.status === 409) done();
    return actionError(err);
  }
}
