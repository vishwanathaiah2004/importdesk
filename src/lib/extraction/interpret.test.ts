import { describe, expect, it } from "vitest";
import { interpret } from "./interpret";
import { ModelOutput } from "./schema";

const field = (key: string, value: string | null, source_snippet: string | null, extra: Record<string, unknown> = {}) => ({
  key,
  value,
  unit: null,
  confidence: 0.96,
  source_snippet,
  page: 1,
  ...extra,
});

const invoice = (over: Partial<ModelOutput> = {}): ModelOutput =>
  ModelOutput.parse({
    readable: true,
    document_type: "INVOICE",
    fields: [
      field("supplier_name", "Company B", "Seller: Company B"),
      field("importer_name", "Sahyadri Lighting Pvt. Ltd.", "Buyer: Sahyadri Lighting Pvt. Ltd."),
      field("invoice_number", "CB-2410-0873", "Invoice No.: CB-2410-0873"),
      field("invoice_date", "2026-10-14", "Date: 14 Oct 2026"),
      field("currency", "USD", "Currency: USD"),
      field("incoterm", "FOB", "Terms: FOB Ningbo (Incoterms 2020)"),
      field("invoice_total", "16320.00", "TOTAL USD 16,320.00"),
      field("gross_weight_kg", "3120", "Gross Weight: 3,120 KGS", { unit: "KGS" }),
    ],
    line_items: [
      {
        description: "LED panel light 40W",
        hsn: "94054290",
        quantity: "2400",
        unit: "PCS",
        unit_price: "6.80",
        amount: "16320.00",
        confidence: 0.94,
        source_snippet: "1 LED panel light 40W 94054290 2,400 PCS 6.80 16,320.00",
        page: 1,
      },
    ],
    containers: [],
    ...over,
  });

type Draft = Extract<ReturnType<typeof interpret>, { fields: unknown }>["fields"][number];
const byKey = (fields: Draft[]) => Object.fromEntries(fields.map((f) => [f.key, f])) as Record<string, Draft>;

describe("interpret", () => {
  it("stores clean values in canonical form with no flags", () => {
    const r = interpret("INVOICE", invoice());
    expect(r.outcome).toBe("extracted");
    if (r.outcome !== "extracted") return;
    const f = byKey(r.fields);
    expect(f.invoice_total).toMatchObject({ valueNormalized: "16320", flagReason: null });
    expect(f.gross_weight_kg).toMatchObject({ valueNormalized: "3120", unit: "kg", flagReason: null });
    expect(f["line.1.unit_price"]).toMatchObject({ valueNormalized: "6.8", confidence: 0.94, flagReason: null });
    expect(f["line.1.hsn"]).toMatchObject({ valueNormalized: "94054290", flagReason: null });
  });

  it("flags a number the quoted text does not contain (a likely invented value)", () => {
    const out = invoice();
    out.fields = out.fields.map((x) => (x.key === "gross_weight_kg" ? { ...x, value: "3165" } : x));
    const r = interpret("INVOICE", out);
    if (r.outcome !== "extracted") throw new Error();
    expect(byKey(r.fields).gross_weight_kg.flagReason).toMatch(/does not match the quoted source/);
  });

  it("uses the document's own number style for 1.460-style figures", () => {
    const out = invoice({
      fields: [
        field("invoice_total", "7650.00", "TOTAL EUR 7.650,00"),
        field("gross_weight_kg", "1460", "Gross Weight: 1.460 kg", { unit: "kg" }),
      ],
      line_items: [],
    });
    const r = interpret("INVOICE", out);
    if (r.outcome !== "extracted") throw new Error();
    expect(byKey(r.fields).gross_weight_kg).toMatchObject({ valueNormalized: "1460", flagReason: null });
  });

  it("creates empty rows for required fields the model could not find", () => {
    const r = interpret("INVOICE", invoice({ fields: [] }));
    if (r.outcome !== "extracted") throw new Error();
    const f = byKey(r.fields);
    expect(f.invoice_number).toMatchObject({ valueNormalized: null, flagReason: "Not found on the document" });
    expect(f.net_weight_kg).toBeUndefined(); // optional: not created when absent
  });

  it("flags container numbers whose ISO 6346 check digit fails, and drops duplicates", () => {
    const out = ModelOutput.parse({
      readable: true,
      document_type: "BILL_OF_LADING",
      fields: [],
      line_items: [],
      containers: [
        { number: "MSKU7182845", confidence: 0.58, source_snippet: "MSKU7182845 / 40HC", page: 1 },
        { number: "MSKU 7182845", confidence: 0.6, source_snippet: "MSKU 7182845", page: 1 },
      ],
    });
    const r = interpret("BILL_OF_LADING", out);
    if (r.outcome !== "extracted") throw new Error();
    const containers = r.fields.filter((f) => f.key.startsWith("container."));
    expect(containers).toHaveLength(1);
    expect(containers[0].flagReason).toMatch(/Check digit/);
  });

  it("sends an unreadable document to manual entry instead of guessing", () => {
    const out = ModelOutput.parse({ readable: false, unreadable_reason: "Too faint", document_type: "BILL_OF_LADING", fields: [], line_items: [], containers: [] });
    const r = interpret("BILL_OF_LADING", out);
    expect(r.outcome).toBe("unreadable");
    if (r.outcome !== "unreadable") return;
    expect(r.reason).toBe("Too faint");
    expect(r.fields.map((f) => f.key)).toEqual(expect.arrayContaining(["bl_number", "gross_weight_kg", "container.1"]));
    expect(r.fields.every((f) => f.valueNormalized === null)).toBe(true);
  });

  it("refuses a file uploaded in the wrong slot", () => {
    const r = interpret("INVOICE", invoice({ document_type: "PACKING_LIST" }));
    expect(r).toMatchObject({ outcome: "wrong_type", message: expect.stringMatching(/packing list/) });
  });
});

describe("ModelOutput", () => {
  it("rejects malformed model output so nothing half-valid is saved", () => {
    expect(ModelOutput.safeParse({ readable: true }).success).toBe(false);
    expect(ModelOutput.safeParse({ readable: true, document_type: "INVOICE", fields: [{ key: "x", value: "1", confidence: 7 }] }).success).toBe(false);
    expect(ModelOutput.safeParse("not json at all").success).toBe(false);
  });
});
