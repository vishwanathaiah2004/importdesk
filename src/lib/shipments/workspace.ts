import "server-only";
import { db } from "@/lib/db";
import { RULE_LABEL, fieldsInFailedChecks, type RuleId } from "@/lib/checks/engine";
import type { StoredCheckDetails } from "@/lib/checks/persist";
import { DOC_TYPES, keyOrder, type DocType } from "@/lib/fields";

/** Everything the shipment workspace needs, in one query. File bytes are never loaded here. */
export async function getWorkspace(id: string) {
  const shipment = await db.shipment.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
      supplier: { select: { name: true, country: true } },
      crossChecks: {
        select: {
          id: true,
          rule: true,
          result: true,
          details: true,
          resolvedAt: true,
          resolutionNote: true,
          resolvedBy: { select: { name: true } },
        },
      },
      documents: {
        select: {
          id: true,
          type: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          pageCount: true,
          status: true,
          error: true,
          modelName: true,
          extractedAt: true,
          createdAt: true,
          fields: {
            select: {
              id: true,
              key: true,
              valueRaw: true,
              valueNormalized: true,
              unit: true,
              confidence: true,
              sourceSnippet: true,
              sourcePage: true,
              status: true,
              flagReason: true,
              confirmedAt: true,
              updatedAt: true,
              confirmedBy: { select: { name: true } },
              _count: { select: { corrections: true } },
              corrections: {
                select: { oldValue: true, newValue: true, createdAt: true, user: { select: { name: true } } },
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
          },
        },
      },
    },
  });
  if (!shipment) return null;

  const documents = Object.fromEntries(
    DOC_TYPES.map((type) => {
      const doc = shipment.documents.find((d) => d.type === type);
      if (!doc) return [type, null];
      const fields = [...doc.fields].sort((a, b) => keyOrder(type, a.key) - keyOrder(type, b.key));
      return [type, { ...doc, fields }];
    }),
  ) as Record<DocType, WorkspaceDocument | null>;

  const order = Object.keys(RULE_LABEL) as RuleId[];
  const checks = shipment.crossChecks
    .map((c) => ({ ...c, rule: c.rule as RuleId, details: c.details as unknown as StoredCheckDetails }))
    .sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule));

  return { ...shipment, documents, checks, failedFields: fieldsInFailedChecks(shipment.crossChecks) };
}

export type Workspace = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;
export type WorkspaceDocument = {
  id: string;
  type: DocType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  status: "QUEUED" | "EXTRACTING" | "DONE" | "FAILED" | "UNREADABLE";
  error: string | null;
  modelName: string | null;
  extractedAt: Date | null;
  createdAt: Date;
  fields: WorkspaceField[];
};
export type WorkspaceField = {
  id: string;
  key: string;
  valueRaw: string | null;
  valueNormalized: string | null;
  unit: string | null;
  confidence: number | null;
  sourceSnippet: string | null;
  sourcePage: number | null;
  status: "PENDING" | "CONFIRMED" | "CORRECTED" | "MANUAL";
  flagReason: string | null;
  confirmedAt: Date | null;
  updatedAt: Date;
  confirmedBy: { name: string } | null;
  _count: { corrections: number };
  corrections: { oldValue: string | null; newValue: string; createdAt: Date; user: { name: string } }[];
};
