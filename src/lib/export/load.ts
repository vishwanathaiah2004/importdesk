import type { Prisma, PrismaClient } from "@prisma/client";
import { fieldsInFailedChecks } from "@/lib/checks/engine";
import type { StoredCheckDetails } from "@/lib/checks/persist";
import type { DocType } from "@/lib/fields";
import type { ExportSource } from "./csv";
import type { GateInput } from "./gate";

type Client = Prisma.TransactionClient | PrismaClient;

/** Everything the gate and the CSV need, read in one go (inside the caller's transaction). */
export async function loadForGate(client: Client, shipmentId: string): Promise<{ gate: GateInput; source: ExportSource; version: number }> {
  const s = await client.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: {
      code: true,
      status: true,
      version: true,
      approvedById: true,
      supplier: { select: { name: true, country: true } },
      crossChecks: { select: { rule: true, result: true, resolvedAt: true, details: true } },
      documents: {
        select: {
          type: true,
          status: true,
          fields: { select: { key: true, status: true, confidence: true, flagReason: true, valueNormalized: true } },
        },
      },
    },
  });

  const gate: GateInput = {
    status: s.status,
    approved: !!s.approvedById,
    documents: Object.fromEntries(s.documents.map((d) => [d.type, { status: d.status }])),
    fields: s.documents.flatMap((d) => d.fields.map((f) => ({ ...f, docType: d.type as DocType }))),
    checks: s.crossChecks.map((c) => ({ ...c, details: c.details as unknown as StoredCheckDetails })),
    failedFields: fieldsInFailedChecks(s.crossChecks),
  };

  const source: ExportSource = {
    code: s.code,
    supplier: s.supplier,
    values: Object.fromEntries(s.documents.map((d) => [d.type, Object.fromEntries(d.fields.map((f) => [f.key, f.valueNormalized]))])),
  };

  return { gate, source, version: s.version };
}
