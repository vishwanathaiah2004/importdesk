import type { Prisma, PrismaClient } from "@prisma/client";

// Append-only record of who did what. Written in the same transaction as the
// change it describes, so the log can never disagree with the data.

type Client = Prisma.TransactionClient | PrismaClient;

export type AuditAction =
  | "shipment.created"
  | "document.uploaded"
  | "document.extracted"
  | "document.unreadable"
  | "document.extraction_failed"
  | "document.manual_entry"
  | "document.downloaded"
  | "field.confirmed"
  | "field.corrected"
  | "field.entered"
  | "row.added"
  | "row.removed"
  | "approval.withdrawn"
  | "check.overridden"
  | "shipment.approved"
  | "shipment.exported";

export type AuditMetadata = {
  shipmentId: string;
  code?: string;
  docType?: string;
  key?: string;
  label?: string;
  oldValue?: string | null;
  newValue?: string | null;
  fileName?: string;
  message?: string;
  note?: string;
  rule?: string;
  fields?: number;
};

export function audit(
  client: Client,
  entry: { userId: string; action: AuditAction; entityType: "shipment" | "document" | "field" | "check" | "export"; entityId: string; metadata: AuditMetadata },
) {
  return client.auditLog.create({
    data: { ...entry, metadata: entry.metadata as Prisma.InputJsonValue },
  });
}
