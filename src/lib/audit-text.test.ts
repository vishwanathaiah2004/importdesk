import { describe, expect, it } from "vitest";
import { describeAudit } from "./audit-text";

describe("describeAudit", () => {
  it("writes corrections as old → new", () => {
    expect(
      describeAudit("field.corrected", {
        shipmentId: "s",
        docType: "BILL_OF_LADING",
        label: "Container 1",
        oldValue: "MSKU7182845",
        newValue: "MSKU7182345",
      }),
    ).toBe("corrected Container 1 on the bill of lading: MSKU7182845 → MSKU7182345");
  });

  it("names empty values instead of printing nothing", () => {
    expect(describeAudit("field.entered", { shipmentId: "s", docType: "INVOICE", label: "HSN", newValue: null })).toBe(
      "entered HSN on the commercial invoice: empty",
    );
  });

  it("falls back to the raw action for unknown entries", () => {
    expect(describeAudit("something.new", { shipmentId: "s" })).toBe("something.new");
  });
});
