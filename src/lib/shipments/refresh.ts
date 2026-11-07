import "server-only";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { evaluateAndStore } from "@/lib/checks/persist";
import { db } from "@/lib/db";
import { statusFor } from "@/lib/export/gate";
import { loadForGate } from "@/lib/export/load";

type Tx = Prisma.TransactionClient;

/**
 * Re-run cross-checks and recompute a shipment's status after anything about it changes.
 * The status comes from the same gate the export route enforces.
 * Any change to the data also withdraws an earlier approval, because the
 * manager approved what they saw, not what came after.
 */
export async function refreshShipment(
  shipmentId: string,
  tx: Tx = db,
  opts: { contentChanged?: boolean; actorId?: string } = {},
) {
  // Every change re-runs the cross-checks, so they always match the data.
  await evaluateAndStore(tx, shipmentId);

  const { gate } = await loadForGate(tx, shipmentId);
  const withdraw = !!opts.contentChanged && gate.approved && gate.status !== "EXPORTED";
  if (withdraw && opts.actorId) {
    await audit(tx, { userId: opts.actorId, action: "approval.withdrawn", entityType: "shipment", entityId: shipmentId, metadata: { shipmentId } });
  }
  const status = statusFor({ ...gate, approved: gate.approved && !withdraw });

  await tx.shipment.update({
    where: { id: shipmentId },
    data: {
      status,
      ...(opts.contentChanged ? { version: { increment: 1 } } : {}),
      ...(withdraw ? { approvedById: null, approvedAt: null } : {}),
    },
  });
  return status;
}
