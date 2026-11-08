import type { AuditAction, AuditMetadata } from "./audit";
import { DOC_LABEL, type DocType } from "./fields";

// Turns an audit entry into a plain sentence for the activity views.

function doc(m: AuditMetadata) {
  return m.docType ? DOC_LABEL[m.docType as DocType]?.toLowerCase() ?? "document" : "document";
}

function v(value: string | null | undefined) {
  return value == null || value === "" ? "empty" : value;
}

export function describeAudit(action: string, m: AuditMetadata): string {
  switch (action as AuditAction) {
    case "shipment.created":
      return "created the shipment";
    case "document.uploaded":
      return `uploaded the ${doc(m)}${m.fileName ? ` (${m.fileName})` : ""}`;
    case "document.extracted":
      return `ran AI extraction on the ${doc(m)}${m.fields != null ? `: ${m.fields} fields` : ""}`;
    case "document.unreadable":
      return `ran AI extraction; the ${doc(m)} could not be read and went to manual entry`;
    case "document.extraction_failed":
      return `ran AI extraction on the ${doc(m)}; it failed${m.message ? `: ${m.message}` : ""}`;
    case "document.manual_entry":
      return `switched the ${doc(m)} to manual entry`;
    case "document.downloaded":
      return `downloaded the ${doc(m)}`;
    case "field.confirmed":
      return `confirmed ${m.label ?? m.key} on the ${doc(m)}: ${v(m.newValue)}`;
    case "field.corrected":
      return `corrected ${m.label ?? m.key} on the ${doc(m)}: ${v(m.oldValue)} → ${v(m.newValue)}`;
    case "field.entered":
      return `entered ${m.label ?? m.key} on the ${doc(m)}: ${v(m.newValue)}`;
    case "row.added":
      return `added ${m.label ?? "a row"} to the ${doc(m)}`;
    case "row.removed":
      return `removed ${m.label ?? "a row"} from the ${doc(m)}`;
    case "approval.withdrawn":
      return "changed data after approval, so the approval was withdrawn";
    case "check.overridden":
      return `accepted a failed check (${m.label ?? m.rule})${m.note ? `: “${m.note}”` : ""}`;
    case "shipment.approved":
      return "approved the shipment for export";
    case "shipment.exported":
      return `exported the shipment${m.fileName ? ` (${m.fileName})` : ""}`;
    default:
      return action;
  }
}
