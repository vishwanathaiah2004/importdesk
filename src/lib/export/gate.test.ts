import { describe, expect, it } from "vitest";
import { evaluateGate, statusFor, type GateInput } from "./gate";

const ok = { status: "DONE" };
const field = (over: Partial<GateInput["fields"][number]> = {}): GateInput["fields"][number] => ({
  docType: "INVOICE",
  key: "invoice_total",
  status: "PENDING",
  confidence: 0.97,
  flagReason: null,
  valueNormalized: "16320",
  ...over,
});
const pass = (rule: string) => ({ rule, result: "PASS" as const, resolvedAt: null, details: { label: rule, message: "", blocking: true } });

const ready = (over: Partial<GateInput> = {}): GateInput => ({
  status: "READY_FOR_APPROVAL",
  approved: false,
  documents: { INVOICE: ok, PACKING_LIST: ok, BILL_OF_LADING: ok },
  fields: [field()],
  checks: [pass("gross_weight"), pass("packages")],
  failedFields: new Set(),
  ...over,
});

describe("export gate", () => {
  it("blocks only on approval when everything else is clear", () => {
    const g = evaluateGate(ready());
    expect(g.readyForApproval).toBe(true);
    expect(g.canExport).toBe(false);
    expect(g.blockers.map((b) => b.kind)).toEqual(["approval"]);
  });

  it("lets an approved, clean shipment export", () => {
    expect(evaluateGate(ready({ approved: true })).canExport).toBe(true);
  });

  it("blocks a missing or failed document", () => {
    const g = evaluateGate(ready({ approved: true, documents: { INVOICE: ok, PACKING_LIST: { status: "FAILED" } } }));
    expect(g.canExport).toBe(false);
    expect(g.blockers.map((b) => b.message)).toEqual(
      expect.arrayContaining(["Bill of lading not uploaded", expect.stringContaining("Packing list: extraction failed")]),
    );
  });

  it("blocks an unconfirmed low-confidence field", () => {
    const g = evaluateGate(ready({ approved: true, fields: [field({ confidence: 0.5 })] }));
    expect(g.canExport).toBe(false);
    expect(g.blockers[0]).toMatchObject({ kind: "field", message: "Commercial invoice: 1 field needs a person" });
  });

  it("clears once a person confirms the field", () => {
    expect(evaluateGate(ready({ approved: true, fields: [field({ confidence: 0.5, status: "CONFIRMED" })] })).canExport).toBe(true);
  });

  it("blocks an unresolved failed check, and allows it once the manager accepts it", () => {
    const failing = { rule: "gross_weight", result: "FAIL" as const, resolvedAt: null, details: { label: "Gross weight", message: "45 kg", blocking: true } };
    expect(evaluateGate(ready({ approved: true, checks: [failing] })).canExport).toBe(false);
    expect(evaluateGate(ready({ approved: true, checks: [{ ...failing, resolvedAt: new Date() }] })).canExport).toBe(true);
  });

  it("never treats a check that could not run as passed", () => {
    const open = { rule: "packages", result: "NOT_CHECKED" as const, resolvedAt: null, details: { label: "Packages", message: "", blocking: true } };
    expect(evaluateGate(ready({ approved: true, checks: [open] })).canExport).toBe(false);
    expect(evaluateGate(ready({ approved: true, checks: [{ ...open, details: { ...open.details, blocking: false } }] })).canExport).toBe(true);
  });

  it("treats a confident field inside a failed check as needing a person", () => {
    const g = evaluateGate(ready({ approved: true, failedFields: new Set(["INVOICE:invoice_total"]) }));
    expect(g.blockers.some((b) => b.kind === "field")).toBe(true);
  });
});

describe("statusFor", () => {
  it("follows the gate", () => {
    expect(statusFor(ready({ documents: {} }))).toBe("DRAFT");
    expect(statusFor(ready({ documents: { INVOICE: { status: "EXTRACTING" } } }))).toBe("EXTRACTING");
    expect(statusFor(ready({ fields: [field({ confidence: 0.2 })] }))).toBe("NEEDS_REVIEW");
    expect(statusFor(ready())).toBe("READY_FOR_APPROVAL");
    expect(statusFor(ready({ approved: true }))).toBe("APPROVED");
    expect(statusFor(ready({ status: "EXPORTED" }))).toBe("EXPORTED");
  });
});
