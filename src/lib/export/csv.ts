// The file handed to the customs filing software.
//
// [A] The filing software's real import layout is not given in the brief.
// This layout (one row per invoice line, shipment-level values repeated) is
// defined in one place, COLUMNS, so it can be matched to the real layout in
// a day without touching anything else.

import Decimal from "decimal.js";
import { parseKey, type DocType } from "@/lib/fields";

export type ExportSource = {
  code: string;
  supplier: { name: string; country: string } | null;
  values: Partial<Record<DocType, Record<string, string | null>>>;
};

type Row = Record<string, string>;

const COLUMNS: { header: string; value: (s: ExportSource, line: Record<string, string | null>, row: number) => string | null | undefined }[] = [
  { header: "Shipment ID", value: (s) => s.code },
  { header: "Invoice No", value: (s) => s.values.INVOICE?.invoice_number },
  { header: "Invoice Date", value: (s) => s.values.INVOICE?.invoice_date },
  { header: "Supplier", value: (s) => s.values.INVOICE?.supplier_name ?? s.supplier?.name },
  { header: "Supplier Country", value: (s) => s.supplier?.country },
  { header: "Importer", value: (s) => s.values.INVOICE?.importer_name },
  { header: "Currency", value: (s) => s.values.INVOICE?.currency },
  { header: "Incoterm", value: (s) => s.values.INVOICE?.incoterm },
  { header: "Invoice Total", value: (s) => money(s.values.INVOICE?.invoice_total) },
  { header: "BL No", value: (s) => s.values.BILL_OF_LADING?.bl_number },
  { header: "Vessel Voyage", value: (s) => s.values.BILL_OF_LADING?.vessel_voyage },
  { header: "Port of Loading", value: (s) => s.values.BILL_OF_LADING?.port_of_loading },
  { header: "Port of Discharge", value: (s) => s.values.BILL_OF_LADING?.port_of_discharge },
  { header: "Containers", value: (s) => containers(s.values.BILL_OF_LADING) },
  // [A] Packages and gross weight are declared as on the B/L, the carrier's document.
  { header: "Total Packages", value: (s) => s.values.BILL_OF_LADING?.total_packages },
  { header: "Gross Weight KG", value: (s) => s.values.BILL_OF_LADING?.gross_weight_kg },
  { header: "Net Weight KG", value: (s) => s.values.PACKING_LIST?.net_weight_kg ?? s.values.INVOICE?.net_weight_kg },
  { header: "Line No", value: (_s, _l, row) => String(row) },
  { header: "Description", value: (_s, l) => l.description },
  { header: "HSN", value: (_s, l) => l.hsn },
  { header: "Quantity", value: (_s, l) => l.quantity },
  { header: "Unit", value: (_s, l) => l.unit },
  { header: "Unit Price", value: (_s, l) => l.unit_price },
  { header: "Line Amount", value: (_s, l) => money(l.amount) ?? lineAmount(l) },
];

function money(v: string | null | undefined) {
  if (v == null || v === "") return null;
  return new Decimal(v).toFixed(2);
}

function lineAmount(l: Record<string, string | null>) {
  if (!l.quantity || !l.unit_price) return null;
  return new Decimal(l.quantity).times(l.unit_price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function containers(values: Record<string, string | null> | undefined) {
  if (!values) return null;
  return Object.entries(values)
    .filter(([k, v]) => parseKey(k).kind === "container" && v)
    .map(([, v]) => v)
    .join("; ");
}

export function buildRows(source: ExportSource): Row[] {
  const lines = new Map<number, Record<string, string | null>>();
  for (const [key, value] of Object.entries(source.values.INVOICE ?? {})) {
    const k = parseKey(key);
    if (k.kind !== "line") continue;
    if (!lines.has(k.row)) lines.set(k.row, {});
    lines.get(k.row)![k.attr] = value;
  }
  const ordered = [...lines.entries()].sort((a, b) => a[0] - b[0]);
  return ordered.map(([, line], i) =>
    Object.fromEntries(COLUMNS.map((c) => [c.header, c.value(source, line, i + 1) ?? ""])),
  );
}

/** One cell, per RFC 4180, and safe to open in Excel. */
export function csvCell(value: string) {
  // A cell starting with = + - @ would run as a formula in Excel (CSV injection).
  let v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(rows: Row[]) {
  const headers = COLUMNS.map((c) => c.header);
  const lines = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))].map((cells) => cells.map(csvCell).join(","));
  // BOM so Excel reads UTF-8 names (e.g. Västra Frölunda) correctly; CRLF per RFC 4180.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export const EXPORT_HEADERS = COLUMNS.map((c) => c.header);
