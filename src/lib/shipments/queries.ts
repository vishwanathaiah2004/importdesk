import "server-only";
import { db } from "@/lib/db";
import { DOC_TYPES, type DocType } from "@/lib/fields";
import { fieldsInFailedChecks } from "@/lib/checks/engine";
import { needsPerson } from "@/lib/review";
import type { ShipmentStatus } from "./status";

export type ShipmentRow = {
  id: string;
  code: string;
  status: ShipmentStatus;
  supplier: string | null;
  country: string | null;
  importer: string | null;
  updatedAt: Date;
  documents: { type: DocType; status: string | null }[];
  fieldsToReview: number;
  failedChecks: number;
};

export async function listShipments(filter: { status?: ShipmentStatus; q?: string }): Promise<ShipmentRow[]> {
  const q = filter.q?.trim();
  const shipments = await db.shipment.findMany({
    where: {
      status: filter.status,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { supplier: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      status: true,
      updatedAt: true,
      supplier: { select: { name: true, country: true } },
      crossChecks: { select: { result: true, resolvedAt: true, details: true } },
      documents: {
        select: {
          type: true,
          status: true,
          fields: {
            select: { key: true, status: true, confidence: true, flagReason: true, valueNormalized: true },
          },
        },
      },
    },
  });

  return shipments.map((s) => {
    const byType = new Map(s.documents.map((d) => [d.type as DocType, d]));
    const failed = fieldsInFailedChecks(s.crossChecks);
    const invoice = byType.get("INVOICE");
    const importer = invoice?.fields.find((f) => f.key === "importer_name")?.valueNormalized ?? null;
    return {
      id: s.id,
      code: s.code,
      status: s.status,
      supplier: s.supplier?.name ?? null,
      country: s.supplier?.country ?? null,
      importer,
      updatedAt: s.updatedAt,
      documents: DOC_TYPES.map((type) => ({ type, status: byType.get(type)?.status ?? null })),
      fieldsToReview: s.documents.reduce(
        (n, d) => n + d.fields.filter((f) => needsPerson(f, failed.has(`${d.type}:${f.key}`))).length,
        0,
      ),
      failedChecks: s.crossChecks.filter((c) => c.result === "FAIL" && !c.resolvedAt).length,
    };
  });
}

export async function shipmentCounts() {
  const groups = await db.shipment.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Partial<Record<ShipmentStatus, number>>;
  const total = groups.reduce((n, g) => n + g._count._all, 0);
  return { counts, total };
}
