import type { Tone } from "@/components/ui/badge";

export type ShipmentStatus =
  | "DRAFT"
  | "EXTRACTING"
  | "NEEDS_REVIEW"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "EXPORTED";

export const STATUS_META: Record<ShipmentStatus, { label: string; tone: Tone; description: string }> = {
  DRAFT: { label: "Awaiting documents", tone: "neutral", description: "No documents uploaded yet" },
  EXTRACTING: { label: "Extracting", tone: "brand", description: "AI is reading the documents" },
  NEEDS_REVIEW: { label: "Needs review", tone: "review", description: "Fields or checks need a person" },
  READY_FOR_APPROVAL: { label: "Ready for approval", tone: "brand", description: "Reviewed, waiting for the manager" },
  APPROVED: { label: "Approved", tone: "ok", description: "Approved and ready to export" },
  EXPORTED: { label: "Exported", tone: "neutral", description: "Exported to the filing software" },
};

export const STATUS_FILTERS: { value: ShipmentStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
  { value: "READY_FOR_APPROVAL", label: "Ready for approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "EXPORTED", label: "Exported" },
];
