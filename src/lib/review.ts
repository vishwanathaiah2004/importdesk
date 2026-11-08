// When does an extracted value need a person?
//
// From the brief: "low-confidence fields and fields in a failed cross-check
// must be confirmed by a person, and nothing exports until they are cleared."
// We add two more triggers: the value is missing, or a deterministic sanity
// check flagged it (bad check digit, unknown currency, ambiguous number...).
// The model's own confidence is not calibrated, so it is never the only gate.

/** [A] The brief gives no threshold; 85% is a starting point to tune on real data. */
export const CONFIDENCE_THRESHOLD = 0.85;

export type FieldStatus = "PENDING" | "CONFIRMED" | "CORRECTED" | "MANUAL";

export type ReviewableField = {
  status: FieldStatus;
  confidence: number | null;
  flagReason: string | null;
  valueNormalized: string | null;
};

export type ReviewReason = "missing" | "low_confidence" | "flagged" | "failed_check";

export function reviewReasons(field: ReviewableField, inFailedCheck = false): ReviewReason[] {
  if (field.status !== "PENDING") return [];
  const reasons: ReviewReason[] = [];
  if (field.valueNormalized == null || field.valueNormalized === "") reasons.push("missing");
  else if (field.confidence == null || field.confidence < CONFIDENCE_THRESHOLD) reasons.push("low_confidence");
  if (field.flagReason) reasons.push("flagged");
  if (inFailedCheck) reasons.push("failed_check");
  return reasons;
}

export function needsPerson(field: ReviewableField, inFailedCheck = false) {
  return reviewReasons(field, inFailedCheck).length > 0;
}

export function isCleared(field: ReviewableField) {
  return field.status !== "PENDING";
}
