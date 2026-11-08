import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuditMetadata } from "@/lib/audit";
import { db } from "@/lib/db";

export type ActivityRow = {
  id: string;
  action: string;
  createdAt: Date;
  user: { name: string; role: "EXECUTIVE" | "MANAGER" };
  metadata: AuditMetadata;
  shipment: { id: string; code: string } | null;
};

export const ACTION_FILTERS = {
  all: { label: "All", prefix: null },
  fields: { label: "Field changes", prefix: "field." },
  documents: { label: "Documents", prefix: "document." },
  decisions: { label: "Approvals & exports", prefix: null },
} as const;

export type ActionFilter = keyof typeof ACTION_FILTERS;

export async function listActivity(opts: { shipmentId?: string; filter?: ActionFilter; take?: number }): Promise<ActivityRow[]> {
  const where: Prisma.AuditLogWhereInput = {};
  if (opts.shipmentId) where.metadata = { path: ["shipmentId"], equals: opts.shipmentId };
  if (opts.filter === "fields" || opts.filter === "documents") {
    where.action = { startsWith: ACTION_FILTERS[opts.filter].prefix };
  } else if (opts.filter === "decisions") {
    where.action = { in: ["shipment.approved", "shipment.exported", "check.overridden", "approval.withdrawn"] };
  }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    select: { id: true, action: true, createdAt: true, metadata: true, user: { select: { name: true, role: true } } },
  });

  const ids = [...new Set(logs.map((l) => (l.metadata as AuditMetadata | null)?.shipmentId).filter(Boolean))] as string[];
  const shipments = ids.length ? await db.shipment.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } }) : [];
  const byId = new Map(shipments.map((s) => [s.id, s]));

  return logs.map((l) => {
    const metadata = (l.metadata ?? {}) as AuditMetadata;
    return { ...l, metadata, shipment: byId.get(metadata.shipmentId) ?? null };
  });
}
