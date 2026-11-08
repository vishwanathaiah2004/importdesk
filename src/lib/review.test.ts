import { describe, expect, it } from "vitest";
import { CONFIDENCE_THRESHOLD, needsPerson, reviewReasons, type ReviewableField } from "./review";

const field = (over: Partial<ReviewableField> = {}): ReviewableField => ({
  status: "PENDING",
  confidence: 0.97,
  flagReason: null,
  valueNormalized: "3120",
  ...over,
});

describe("needsPerson", () => {
  it("accepts a confident, unflagged value without a click", () => {
    expect(needsPerson(field())).toBe(false);
  });

  it("asks for a person below the confidence threshold", () => {
    expect(reviewReasons(field({ confidence: CONFIDENCE_THRESHOLD - 0.01 }))).toEqual(["low_confidence"]);
    expect(needsPerson(field({ confidence: CONFIDENCE_THRESHOLD }))).toBe(false);
  });

  it("treats a missing confidence as low", () => {
    expect(needsPerson(field({ confidence: null }))).toBe(true);
  });

  it("asks for a person when the value is missing, whatever the confidence", () => {
    expect(reviewReasons(field({ valueNormalized: null }))).toEqual(["missing"]);
    expect(reviewReasons(field({ valueNormalized: "" }))).toEqual(["missing"]);
  });

  it("asks for a person when a sanity check flagged the value", () => {
    expect(reviewReasons(field({ flagReason: "Check digit does not match" }))).toEqual(["flagged"]);
  });

  it("asks for a person when the field is part of a failed cross-check", () => {
    expect(reviewReasons(field(), true)).toEqual(["failed_check"]);
  });

  it("never asks again once a person has confirmed, corrected or entered it", () => {
    for (const status of ["CONFIRMED", "CORRECTED", "MANUAL"] as const) {
      expect(needsPerson(field({ status, confidence: 0.1, flagReason: "x" }), true)).toBe(false);
    }
  });
});
