import { describe, expect, it } from "vitest";
import { fieldsInFailedChecks, runChecks, type CheckOutcome, type Snapshot } from "./engine";

const done = (values: Record<string, string | null>) => ({ status: "DONE" as const, values });

/** SHP-24811 from the brief: invoice says 3,120 kg, packing list and B/L say 3,165 kg. */
const shp24811 = (): Snapshot => ({
  INVOICE: done({
    invoice_number: "CB-2410-0873",
    currency: "USD",
    invoice_total: "16320",
    total_packages: "120",
    gross_weight_kg: "3120",
    "line.1.quantity": "2400",
    "line.1.unit": "PCS",
    "line.1.unit_price": "6.8",
    "line.1.amount": "16320",
  }),
  PACKING_LIST: done({
    invoice_number: "CB-2410-0873",
    total_packages: "120",
    gross_weight_kg: "3165",
    "line.1.quantity": "2400",
    "line.1.unit": "PCS",
    "container.1": "MSKU7182345",
  }),
  BILL_OF_LADING: done({ total_packages: "120", gross_weight_kg: "3165", "container.1": "MSKU7182345" }),
});

const byRule = (out: CheckOutcome[]) => Object.fromEntries(out.map((c) => [c.rule, c]));

describe("cross-checks on the brief's sample shipment SHP-24811", () => {
  const r = byRule(runChecks(shp24811()));

  it("catches the 45 kg gross weight difference", () => {
    expect(r.gross_weight.result).toBe("FAIL");
    expect(r.gross_weight.message).toContain("45 kg (1.44%)");
    expect(r.gross_weight.fields.map((f) => f.doc)).toEqual(["INVOICE", "PACKING_LIST", "BILL_OF_LADING"]);
  });

  it("passes what agrees", () => {
    expect(r.invoice_total.result).toBe("PASS");
    expect(r.line_amounts.result).toBe("PASS");
    expect(r.quantity.result).toBe("PASS");
    expect(r.packages.result).toBe("PASS");
    expect(r.containers.result).toBe("PASS");
    expect(r.invoice_reference.result).toBe("PASS");
  });
});

describe("missing documents are never a pass", () => {
  it("SHP-24812 (invoice only) leaves cross-document checks open", () => {
    const r = byRule(
      runChecks({
        INVOICE: done({ currency: "EUR", invoice_total: "7650", "line.1.quantity": "180", "line.1.unit_price": "42.5" }),
      }),
    );
    expect(r.invoice_total.result).toBe("PASS"); // 180 × 42.50 = 7,650.00
    for (const rule of ["quantity", "packages", "gross_weight", "containers"]) {
      expect(r[rule].result).toBe("NOT_CHECKED");
      expect(r[rule].message).toMatch(/not uploaded/);
    }
    expect(r.packages.blocking).toBe(true);
  });

  it("a document still extracting or failed does not count", () => {
    const snap = shp24811();
    snap.BILL_OF_LADING = { status: "FAILED", values: {} };
    expect(byRule(runChecks(snap)).packages).toMatchObject({ result: "NOT_CHECKED", message: expect.stringMatching(/extraction failed/) });
  });

  it("a value missing on the packing list or B/L leaves the check open", () => {
    const snap = shp24811();
    snap.BILL_OF_LADING!.values.gross_weight_kg = null;
    expect(byRule(runChecks(snap)).gross_weight).toMatchObject({ result: "NOT_CHECKED", message: "Missing on the B/L." });
  });

  it("the invoice may omit weight; packing list and B/L are then compared", () => {
    const snap = shp24811();
    snap.INVOICE!.values.gross_weight_kg = null;
    expect(byRule(runChecks(snap)).gross_weight.result).toBe("PASS");
  });
});

describe("arithmetic", () => {
  it("uses exact decimals, not floating point", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; here it must be exact.
    const r = byRule(
      runChecks({
        INVOICE: done({
          invoice_total: "0.3",
          "line.1.quantity": "1",
          "line.1.unit_price": "0.1",
          "line.2.quantity": "1",
          "line.2.unit_price": "0.2",
        }),
      }),
    );
    expect(r.invoice_total.result).toBe("PASS");
  });

  it("reports the exact difference when the total is wrong", () => {
    const snap = shp24811();
    snap.INVOICE!.values.invoice_total = "16230";
    expect(byRule(runChecks(snap)).invoice_total).toMatchObject({ result: "FAIL", message: expect.stringContaining("difference 90.00") });
  });

  it("recomputes printed line amounts", () => {
    const snap = shp24811();
    snap.INVOICE!.values["line.1.amount"] = "16230";
    expect(byRule(runChecks(snap)).line_amounts.result).toBe("FAIL");
  });

  it("waits for a missing unit price instead of guessing", () => {
    const snap = shp24811();
    snap.INVOICE!.values["line.1.unit_price"] = null;
    expect(byRule(runChecks(snap)).invoice_total).toMatchObject({ result: "NOT_CHECKED", message: "Line 1 has no unit price yet." });
  });
});

describe("tolerance", () => {
  it("defaults to zero but can be configured", () => {
    expect(byRule(runChecks(shp24811(), { weightToleranceKg: 45 })).gross_weight.result).toBe("PASS");
    expect(byRule(runChecks(shp24811(), { weightToleranceKg: 44.9 })).gross_weight.result).toBe("FAIL");
  });

  it("never allows a package-count difference", () => {
    const snap = shp24811();
    snap.BILL_OF_LADING!.values.total_packages = "121";
    expect(byRule(runChecks(snap, { weightToleranceKg: 100 })).packages.result).toBe("FAIL");
  });
});

describe("quantities and containers", () => {
  it("compares quantities per unit", () => {
    const snap = shp24811();
    snap.PACKING_LIST!.values["line.1.unit"] = "CTNS";
    expect(byRule(runChecks(snap)).quantity.result).toBe("FAIL");
  });

  it("catches a misread container number on one document", () => {
    const snap = shp24811();
    snap.BILL_OF_LADING!.values["container.1"] = "MSKU7182845";
    expect(byRule(runChecks(snap)).containers).toMatchObject({ result: "FAIL", message: expect.stringContaining("only on the B/L: MSKU7182845") });
  });

  it("does not block when the packing list lists no containers", () => {
    const snap = shp24811();
    delete snap.PACKING_LIST!.values["container.1"];
    expect(byRule(runChecks(snap)).containers).toMatchObject({ result: "NOT_CHECKED", blocking: false });
  });
});

describe("fieldsInFailedChecks", () => {
  it("lists fields of unresolved failures only", () => {
    const checks = runChecks(shp24811()).map((c) => ({ result: c.result, details: c, resolvedAt: null }));
    const set = fieldsInFailedChecks(checks);
    expect(set.has("PACKING_LIST:gross_weight_kg")).toBe(true);
    expect(set.has("INVOICE:invoice_total")).toBe(false);
    const resolved = checks.map((c) => ({ ...c, resolvedAt: new Date() }));
    expect(fieldsInFailedChecks(resolved).size).toBe(0);
  });

  it("changes the signature when a compared value changes", () => {
    const a = byRule(runChecks(shp24811())).gross_weight.signature;
    const snap = shp24811();
    snap.INVOICE!.values.gross_weight_kg = "3121";
    expect(byRule(runChecks(snap)).gross_weight.signature).not.toBe(a);
  });
});
