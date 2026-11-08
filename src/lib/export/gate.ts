// The export gate. Pure: the same function decides the status shown on screen,
// whether the manager may approve, and whether the server will export.
//
// From the brief: "low-confidence fields and fields in a failed cross-check
// must be confirmed by a person, and nothing exports until they are cleared."

import type { CheckResult } from "@/lib/checks/engine";
import { DOC_LABEL, DOC_TYPES, type DocType } from "@/lib/fields";
import { needsPerson, type ReviewableField } from "@/lib/review";
import type { ShipmentStatus } from "@/lib/shipments/status";

export type GateInput = {
  status: ShipmentStatus;
  approved: boolean;
  documents: Partial<Record<DocType, { status: string } | null>>;
  fields: (ReviewableField & { docType: DocType; key: string })[];
  checks: { rule: string; result: CheckResult; resolvedAt: Date | null; details: { label: string; message: string; blocking: boolean } }[];
  failedFields: Set<string>;
};

export type Blocker = {
  kind: "document" | "field" | "check" | "approval";
  message: string;
  docType?: DocType;
};

export function evaluateGate(input: GateInput) {
  const blockers: Blocker[] = [];

  for (const type of DOC_TYPES) {
    const doc = input.documents[type];
    const name = DOC_LABEL[type];
    if (!doc) blockers.push({ kind: "document", docType: type, message: `${name} not uploaded` });
    else if (doc.status === "QUEUED" || doc.status === "EXTRACTING") blockers.push({ kind: "document", docType: type, message: `${name} is still being extracted` });
    else if (doc.status === "FAILED") blockers.push({ kind: "document", docType: type, message: `${name}: extraction failed — retry or enter manually` });
  }

  for (const type of DOC_TYPES) {
    const n = input.fields.filter((f) => f.docType === type && needsPerson(f, input.failedFields.has(`${type}:${f.key}`))).length;
    if (n > 0) blockers.push({ kind: "field", docType: type, message: `${DOC_LABEL[type]}: ${n} field${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} a person` });
  }

  for (const c of input.checks) {
    if (c.result === "FAIL" && !c.resolvedAt) {
      blockers.push({ kind: "check", message: `${c.details.label}: ${c.details.message}` });
    } else if (c.result === "NOT_CHECKED" && c.details.blocking) {
      blockers.push({ kind: "check", message: `${c.details.label}: not checked yet. ${c.details.message}` });
    }
  }

  const readyForApproval = blockers.length === 0;
  if (!input.approved) blockers.push({ kind: "approval", message: "Waiting for the documentation manager's approval" });

  return { blockers, readyForApproval, canExport: blockers.length === 0 };
}

export function statusFor(input: GateInput): ShipmentStatus {
  if (input.status === "EXPORTED") return "EXPORTED";
  const docs = DOC_TYPES.map((t) => input.documents[t]).filter(Boolean);
  if (docs.length === 0) return "DRAFT";
  if (docs.some((d) => d!.status === "QUEUED" || d!.status === "EXTRACTING")) return "EXTRACTING";
  const gate = evaluateGate(input);
  if (gate.canExport) return "APPROVED";
  if (gate.readyForApproval) return "READY_FOR_APPROVAL";
  return "NEEDS_REVIEW";
}
