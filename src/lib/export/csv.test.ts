import { describe, expect, it } from "vitest";
import { EXPORT_HEADERS, buildRows, csvCell, toCsv, type ExportSource } from "./csv";

const source = (): ExportSource => ({
  code: "SHP-24813",
  supplier: { name: "Company D", country: "Japan" },
  values: {
    INVOICE: {
      invoice_number: "KD-26-11042",
      invoice_date: "2026-10-09",
      supplier_name: "Company D",
      importer_name: "Konkan Auto Components Pvt. Ltd.",
      currency: "USD",
      incoterm: "CIF",
      invoice_total: "11180",
      "line.1.description": "Deep groove ball bearing 6205-2RS",
      "line.1.hsn": "84821011",
      "line.1.quantity": "5000",
      "line.1.unit": "PCS",
      "line.1.unit_price": "1.24",
      "line.2.description": "Tapered roller bearing 30206",
      "line.2.hsn": "84822011",
      "line.2.quantity": "1200",
      "line.2.unit": "PCS",
      "line.2.unit_price": "4.15",
    },
    PACKING_LIST: { net_weight_kg: "2015" },
    BILL_OF_LADING: { bl_number: "ONEYUKBF2093301", total_packages: "64", gross_weight_kg: "2210", "container.1": "ONEU1127640" },
  },
});

describe("buildRows", () => {
  it("writes one row per invoice line with shipment values repeated", () => {
    const rows = buildRows(source());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ "Shipment ID": "SHP-24813", "Line No": "1", HSN: "84821011", "Invoice Total": "11180.00", "Gross Weight KG": "2210" });
    expect(rows[1]).toMatchObject({ "Line No": "2", Description: "Tapered roller bearing 30206", Containers: "ONEU1127640" });
  });

  it("computes a line amount the invoice did not print, exactly", () => {
    expect(buildRows(source()).map((r) => r["Line Amount"])).toEqual(["6200.00", "4980.00"]);
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell("Ltd., Pune")).toBe('"Ltd., Pune"');
    expect(csvCell('6" pipe')).toBe('"6"" pipe"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("neutralises spreadsheet formulas (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+91 22")).toBe("'+91 22");
  });
});

describe("toCsv", () => {
  it("starts with a BOM and the header row, and uses CRLF", () => {
    const csv = toCsv(buildRows(source()));
    expect(csv.startsWith("﻿Shipment ID,Invoice No,")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(4); // header + 2 rows + trailing
    expect(csv).toContain("Konkan Auto Components Pvt. Ltd.");
    expect(EXPORT_HEADERS).toContain("HSN");
  });

  it("keeps Unicode intact", () => {
    const s = source();
    s.values.INVOICE!.supplier_name = "Västra Frölunda AB";
    expect(toCsv(buildRows(s))).toContain("Västra Frölunda AB");
  });
});
