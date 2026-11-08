// What we extract from each document, in one place.
// The AI prompt, the review screen, validation and the CSV export all read
// from these definitions, so adding a field is a one-line change.

export type DocType = "INVOICE" | "PACKING_LIST" | "BILL_OF_LADING";

export const DOC_TYPES: DocType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];

export const DOC_LABEL: Record<DocType, string> = {
  INVOICE: "Commercial invoice",
  PACKING_LIST: "Packing list",
  BILL_OF_LADING: "Bill of lading",
};

export const DOC_SHORT: Record<DocType, string> = {
  INVOICE: "Invoice",
  PACKING_LIST: "Packing list",
  BILL_OF_LADING: "B/L",
};

export type FieldType =
  | "text"
  | "number" // plain decimal, e.g. quantity, price, amount
  | "integer" // package counts
  | "weight" // kilograms
  | "date" // ISO yyyy-mm-dd
  | "currency" // ISO 4217
  | "incoterm" // Incoterms 2020
  | "hsn" // 8-digit ITC-HS
  | "container"; // ISO 6346

export type FieldGroup = "parties" | "invoice" | "cargo" | "transport" | "lines" | "containers";

export const GROUP_LABEL: Record<FieldGroup, string> = {
  parties: "Parties",
  invoice: "Invoice details",
  cargo: "Packages & weights",
  transport: "Transport",
  lines: "Line items",
  containers: "Containers",
};

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  group: FieldGroup;
  required: boolean;
  /** Tells the AI model what to look for. */
  hint: string;
};

const f = (
  key: string,
  label: string,
  type: FieldType,
  group: FieldGroup,
  required: boolean,
  hint: string,
): FieldDef => ({ key, label, type, group, required, hint });

export const HEADER_FIELDS: Record<DocType, FieldDef[]> = {
  INVOICE: [
    f("supplier_name", "Supplier", "text", "parties", true, "Seller / exporter / shipper company name"),
    f("importer_name", "Importer", "text", "parties", true, "Buyer / consignee / importer company name"),
    f("invoice_number", "Invoice number", "text", "invoice", true, "Commercial invoice number"),
    f("invoice_date", "Invoice date", "date", "invoice", true, "Invoice date"),
    f("currency", "Currency", "currency", "invoice", true, "Invoice currency as ISO 4217 code"),
    f("incoterm", "Incoterm", "incoterm", "invoice", true, "Incoterms 2020 rule, e.g. FOB, CIF"),
    f("invoice_total", "Invoice total", "number", "invoice", true, "Total invoice value payable"),
    f("total_packages", "Packages", "integer", "cargo", false, "Total number of packages / cartons"),
    f("gross_weight_kg", "Gross weight", "weight", "cargo", false, "Total gross weight"),
    f("net_weight_kg", "Net weight", "weight", "cargo", false, "Total net weight"),
  ],
  PACKING_LIST: [
    f("supplier_name", "Supplier", "text", "parties", false, "Seller / exporter company name"),
    f("invoice_number", "Invoice reference", "text", "invoice", false, "Invoice number this packing list refers to"),
    f("total_packages", "Packages", "integer", "cargo", true, "Total number of packages / cartons"),
    f("gross_weight_kg", "Gross weight", "weight", "cargo", true, "Total gross weight"),
    f("net_weight_kg", "Net weight", "weight", "cargo", false, "Total net weight"),
  ],
  BILL_OF_LADING: [
    f("bl_number", "B/L number", "text", "transport", true, "Bill of lading number"),
    f("shipper_name", "Shipper", "text", "parties", false, "Shipper company name"),
    f("consignee_name", "Consignee", "text", "parties", true, "Consignee company name"),
    f("vessel_voyage", "Vessel / voyage", "text", "transport", false, "Vessel name and voyage number"),
    f("port_of_loading", "Port of loading", "text", "transport", true, "Port of loading"),
    f("port_of_discharge", "Port of discharge", "text", "transport", true, "Port of discharge"),
    f("total_packages", "Packages", "integer", "cargo", true, "Total number of packages"),
    f("gross_weight_kg", "Gross weight", "weight", "cargo", true, "Total gross weight"),
  ],
};

export type LineAttr = "description" | "hsn" | "quantity" | "unit" | "unit_price" | "amount";

export const LINE_ATTRS: Record<DocType, FieldDef[]> = {
  INVOICE: [
    f("description", "Description", "text", "lines", true, "Goods description"),
    f("hsn", "HSN", "hsn", "lines", true, "HSN / HS tariff code"),
    f("quantity", "Qty", "number", "lines", true, "Quantity"),
    f("unit", "Unit", "text", "lines", false, "Unit of quantity, e.g. PCS"),
    f("unit_price", "Unit price", "number", "lines", true, "Price per unit"),
    f("amount", "Amount", "number", "lines", false, "Line amount"),
  ],
  PACKING_LIST: [
    f("description", "Description", "text", "lines", true, "Goods description"),
    f("quantity", "Qty", "number", "lines", true, "Quantity"),
    f("unit", "Unit", "text", "lines", false, "Unit of quantity, e.g. PCS"),
  ],
  BILL_OF_LADING: [],
};

export const HAS_CONTAINERS: Record<DocType, boolean> = {
  INVOICE: false,
  PACKING_LIST: true,
  BILL_OF_LADING: true,
};

export const CONTAINER_DEF = f("container", "Container", "container", "containers", true, "Container number");

// ---- keys -----------------------------------------------------------------

export type ParsedKey =
  | { kind: "header"; name: string }
  | { kind: "line"; row: number; attr: string }
  | { kind: "container"; row: number };

export function lineKey(row: number, attr: string) {
  return `line.${row}.${attr}`;
}

export function containerKey(row: number) {
  return `container.${row}`;
}

export function parseKey(key: string): ParsedKey {
  const line = /^line\.(\d+)\.([a-z_]+)$/.exec(key);
  if (line) return { kind: "line", row: Number(line[1]), attr: line[2] };
  const container = /^container\.(\d+)$/.exec(key);
  if (container) return { kind: "container", row: Number(container[1]) };
  return { kind: "header", name: key };
}

/** The definition behind any stored key, or null for unknown keys. */
export function fieldDef(docType: DocType, key: string): FieldDef | null {
  const parsed = parseKey(key);
  if (parsed.kind === "header") return HEADER_FIELDS[docType].find((d) => d.key === parsed.name) ?? null;
  if (parsed.kind === "line") return LINE_ATTRS[docType].find((d) => d.key === parsed.attr) ?? null;
  return HAS_CONTAINERS[docType] ? CONTAINER_DEF : null;
}

/** Sort order for display: header fields in definition order, then lines, then containers. */
export function keyOrder(docType: DocType, key: string): number {
  const parsed = parseKey(key);
  if (parsed.kind === "header") {
    const i = HEADER_FIELDS[docType].findIndex((d) => d.key === parsed.name);
    return i === -1 ? 999 : i;
  }
  if (parsed.kind === "line") {
    const i = LINE_ATTRS[docType].findIndex((d) => d.key === parsed.attr);
    return 1000 + parsed.row * 10 + Math.max(i, 0);
  }
  return 100000 + parsed.row;
}

/** [A] The B/L must list at least one container; on a packing list it is optional. */
export const REQUIRES_CONTAINER: Record<DocType, boolean> = {
  INVOICE: false,
  PACKING_LIST: false,
  BILL_OF_LADING: true,
};

/** The fields a person fills in when a document cannot be read at all. */
export function manualEntryKeys(docType: DocType): string[] {
  const keys = HEADER_FIELDS[docType].filter((d) => d.required).map((d) => d.key);
  keys.push(...LINE_ATTRS[docType].filter((d) => d.required).map((d) => lineKey(1, d.key)));
  if (REQUIRES_CONTAINER[docType]) keys.push(containerKey(1));
  return keys;
}
