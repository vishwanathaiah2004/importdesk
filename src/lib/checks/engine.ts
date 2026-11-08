// Cross-checks across the invoice, packing list and bill of lading.
//
// Pure functions: values in, results out. No database, no AI. Arithmetic uses
// Decimal, never floating point, so 2,400 × 6.80 is exactly 16,320.00.
//
// Principles:
//  - A missing document or value is NOT_CHECKED, never PASS.
//  - The engine never decides which document is right. It reports the
//    difference; a person corrects a misread value or the manager overrides.

import Decimal from "decimal.js";
import { DOC_SHORT, parseKey, type DocType } from "@/lib/fields";

export type CheckResult = "PASS" | "FAIL" | "NOT_CHECKED";

export type RuleId =
  | "invoice_total"
  | "line_amounts"
  | "quantity"
  | "packages"
  | "gross_weight"
  | "containers"
  | "invoice_reference";

export type DocSnapshot = {
  status: "QUEUED" | "EXTRACTING" | "DONE" | "FAILED" | "UNREADABLE";
  /** Normalised values by field key. */
  values: Record<string, string | null>;
};

export type Snapshot = Partial<Record<DocType, DocSnapshot>>;

export type CheckValue = { source: DocType | "computed"; label: string; value: string | null; unit?: string };

export type CheckOutcome = {
  rule: RuleId;
  label: string;
  result: CheckResult;
  /** Blocks export unless it passes (or a manager overrides a failure). */
  blocking: boolean;
  message: string;
  values: CheckValue[];
  /** Fields involved, so a failed check can highlight them for review. */
  fields: { doc: DocType; key: string }[];
  /** Changes whenever the compared values change; an override only holds for the same values. */
  signature: string;
};

export type CheckConfig = {
  /** [A] The brief gives no tolerance; 0 kg so that a 45 kg gap is caught. */
  weightToleranceKg: number;
};

export const DEFAULT_CONFIG: CheckConfig = { weightToleranceKg: 0 };

export const RULE_LABEL: Record<RuleId, string> = {
  invoice_total: "Invoice total = sum of line items",
  line_amounts: "Line amounts = quantity × unit price",
  quantity: "Quantities: invoice vs packing list",
  packages: "Packages across all three documents",
  gross_weight: "Gross weight across all three documents",
  containers: "Containers: packing list vs B/L",
  invoice_reference: "Packing list refers to this invoice",
};

// ---- helpers ------------------------------------------------------------------

const ALL: DocType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];

function usable(doc: DocSnapshot | undefined): doc is DocSnapshot {
  return !!doc && (doc.status === "DONE" || doc.status === "UNREADABLE");
}

function dec(v: string | null | undefined): Decimal | null {
  if (v == null || v === "") return null;
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function money(d: Decimal) {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function fmt(d: Decimal, places?: number) {
  const s = places == null ? d.toString() : d.toFixed(places);
  const [int, frac] = s.split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
}

/** Line rows present on a document: { 1: { quantity: "2400", ... }, ... } */
function lines(doc: DocSnapshot) {
  const rows = new Map<number, Record<string, string | null>>();
  for (const [key, value] of Object.entries(doc.values)) {
    const k = parseKey(key);
    if (k.kind !== "line") continue;
    if (!rows.has(k.row)) rows.set(k.row, {});
    rows.get(k.row)![k.attr] = value;
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}

function containers(doc: DocSnapshot) {
  return Object.entries(doc.values)
    .filter(([key, v]) => parseKey(key).kind === "container" && v)
    .map(([, v]) => v!.toUpperCase());
}

function missingDocs(snap: Snapshot, needed: DocType[]) {
  return needed.filter((t) => !usable(snap[t]));
}

function waitingMessage(missing: DocType[], snap: Snapshot) {
  const names = missing.map((t) => {
    const s = snap[t]?.status;
    const name = DOC_SHORT[t].toLowerCase().replace("b/l", "B/L");
    if (!s) return `${name} not uploaded`;
    if (s === "FAILED") return `${name} extraction failed`;
    return `${name} still extracting`;
  });
  return `Waiting for documents: ${names.join(", ")}.`;
}

function outcome(
  rule: RuleId,
  result: CheckResult,
  message: string,
  values: CheckValue[],
  fields: { doc: DocType; key: string }[],
  blocking = true,
): CheckOutcome {
  return {
    rule,
    label: RULE_LABEL[rule],
    result,
    blocking,
    message,
    values,
    fields,
    signature: JSON.stringify(values.map((v) => [v.source, v.label, v.value])),
  };
}

// ---- rules -----------------------------------------------------------------------

function invoiceTotal(snap: Snapshot): CheckOutcome {
  const rule = "invoice_total";
  const inv = snap.INVOICE;
  if (!usable(inv)) return outcome(rule, "NOT_CHECKED", waitingMessage(["INVOICE"], snap), [], []);

  const currency = inv.values.currency ?? "";
  const rows = lines(inv);
  const fields = [{ doc: "INVOICE" as const, key: "invoice_total" }];
  let sum = new Decimal(0);
  for (const [row, l] of rows) {
    const qty = dec(l.quantity);
    const price = dec(l.unit_price);
    fields.push({ doc: "INVOICE", key: `line.${row}.quantity` }, { doc: "INVOICE", key: `line.${row}.unit_price` });
    if (!qty || !price) {
      return outcome(rule, "NOT_CHECKED", `Line ${row} has no ${!qty ? "quantity" : "unit price"} yet.`, [], fields);
    }
    sum = sum.plus(money(qty.times(price)));
  }
  const total = dec(inv.values.invoice_total);
  const values: CheckValue[] = [
    { source: "INVOICE", label: "Invoice total", value: total ? money(total).toFixed(2) : null, unit: currency },
    { source: "computed", label: `Sum of ${rows.length} line${rows.length === 1 ? "" : "s"}`, value: money(sum).toFixed(2), unit: currency },
  ];
  if (rows.length === 0) return outcome(rule, "NOT_CHECKED", "The invoice has no line items yet.", values, fields);
  if (!total) return outcome(rule, "NOT_CHECKED", "The invoice total is missing.", values, fields);

  const diff = money(total).minus(money(sum));
  if (diff.isZero()) return outcome(rule, "PASS", `Lines add up to ${currency} ${fmt(money(sum), 2)}.`, values, fields);
  return outcome(
    rule,
    "FAIL",
    `Lines add up to ${currency} ${fmt(money(sum), 2)}, but the invoice total is ${currency} ${fmt(money(total), 2)} (difference ${fmt(diff.abs(), 2)}).`,
    values,
    fields,
  );
}

function lineAmounts(snap: Snapshot): CheckOutcome {
  const rule = "line_amounts";
  const inv = snap.INVOICE;
  if (!usable(inv)) return outcome(rule, "NOT_CHECKED", waitingMessage(["INVOICE"], snap), [], []);

  const wrong: string[] = [];
  const fields: { doc: DocType; key: string }[] = [];
  const values: CheckValue[] = [];
  let printed = 0;
  for (const [row, l] of lines(inv)) {
    const amount = dec(l.amount);
    if (!amount) continue;
    printed++;
    const qty = dec(l.quantity);
    const price = dec(l.unit_price);
    if (!qty || !price) continue;
    const expected = money(qty.times(price));
    values.push({ source: "INVOICE", label: `Line ${row} amount`, value: money(amount).toFixed(2) });
    if (!money(amount).equals(expected)) {
      wrong.push(`line ${row}: ${fmt(qty)} × ${fmt(price)} = ${fmt(expected, 2)}, printed ${fmt(money(amount), 2)}`);
      fields.push(
        { doc: "INVOICE", key: `line.${row}.amount` },
        { doc: "INVOICE", key: `line.${row}.quantity` },
        { doc: "INVOICE", key: `line.${row}.unit_price` },
      );
    }
  }
  if (printed === 0) return outcome(rule, "PASS", "No line amounts are printed, so there is nothing to recompute.", [], [], false);
  if (wrong.length === 0) return outcome(rule, "PASS", "Every printed line amount equals quantity × unit price.", values, []);
  return outcome(rule, "FAIL", `Line amount does not match: ${wrong.join("; ")}.`, values, fields);
}

function quantity(snap: Snapshot): CheckOutcome {
  const rule = "quantity";
  const missing = missingDocs(snap, ["INVOICE", "PACKING_LIST"]);
  if (missing.length) return outcome(rule, "NOT_CHECKED", waitingMessage(missing, snap), [], []);

  const totals = (doc: DocType) => {
    const byUnit = new Map<string, Decimal>();
    for (const [, l] of lines(snap[doc]!)) {
      const q = dec(l.quantity);
      if (!q) return null;
      const unit = (l.unit ?? "").toUpperCase().replace(/^(NOS|PIECES|PC)$/, "PCS");
      byUnit.set(unit, (byUnit.get(unit) ?? new Decimal(0)).plus(q));
    }
    return byUnit;
  };
  const fieldsOf = (doc: DocType) => lines(snap[doc]!).map(([row]) => ({ doc, key: `line.${row}.quantity` }));
  const fields = [...fieldsOf("INVOICE"), ...fieldsOf("PACKING_LIST")];
  const inv = totals("INVOICE");
  const pl = totals("PACKING_LIST");
  if (!inv || !pl || inv.size === 0 || pl.size === 0) {
    return outcome(rule, "NOT_CHECKED", "A line quantity is missing.", [], fields);
  }

  const show = (m: Map<string, Decimal>) => [...m.entries()].map(([u, q]) => `${fmt(q)}${u ? ` ${u}` : ""}`).join(" + ");
  const values: CheckValue[] = [
    { source: "INVOICE", label: "Total quantity", value: show(inv) },
    { source: "PACKING_LIST", label: "Total quantity", value: show(pl) },
  ];
  const units = new Set([...inv.keys(), ...pl.keys()]);
  const same = [...units].every((u) => (inv.get(u) ?? new Decimal(0)).equals(pl.get(u) ?? new Decimal(0)));
  return same
    ? outcome(rule, "PASS", `Both list ${show(inv)}.`, values, fields)
    : outcome(rule, "FAIL", `The invoice lists ${show(inv)}; the packing list lists ${show(pl)}.`, values, fields);
}

/** Packages and gross weight: the same value on all three documents. */
function acrossAll(snap: Snapshot, rule: "packages" | "gross_weight", key: string, config: CheckConfig): CheckOutcome {
  const missing = missingDocs(snap, ALL);
  if (missing.length) return outcome(rule, "NOT_CHECKED", waitingMessage(missing, snap), [], []);

  const unit = rule === "gross_weight" ? "kg" : undefined;
  const values: CheckValue[] = ALL.map((doc) => ({ source: doc, label: DOC_SHORT[doc], value: snap[doc]!.values[key] ?? null, unit }));
  const fields = ALL.filter((doc) => snap[doc]!.values[key] != null).map((doc) => ({ doc, key }));

  // The invoice may not state packages or weight; the packing list and B/L must.
  const absent = values.filter((v) => v.value == null && v.source !== "INVOICE");
  if (absent.length) {
    return outcome(rule, "NOT_CHECKED", `Missing on the ${absent.map((v) => v.label).join(" and ")}.`, values, fields);
  }
  const present = values.filter((v) => v.value != null).map((v) => ({ ...v, d: dec(v.value)! }));
  const min = Decimal.min(...present.map((v) => v.d));
  const max = Decimal.max(...present.map((v) => v.d));
  const spread = max.minus(min);
  const tolerance = rule === "gross_weight" ? new Decimal(config.weightToleranceKg) : new Decimal(0);
  const list = present.map((v) => `${v.label} ${fmt(v.d)}${unit ? ` ${unit}` : ""}`).join(", ");

  if (spread.lte(tolerance)) return outcome(rule, "PASS", `All documents agree: ${list}.`, values, fields);
  const pct = min.isZero() ? "" : ` (${spread.div(min).times(100).toDecimalPlaces(2).toString()}%)`;
  return outcome(rule, "FAIL", `Documents disagree by ${fmt(spread)}${unit ? ` ${unit}` : ""}${pct}: ${list}.`, values, fields);
}

function containerMatch(snap: Snapshot): CheckOutcome {
  const rule = "containers";
  const missing = missingDocs(snap, ["PACKING_LIST", "BILL_OF_LADING"]);
  if (missing.length) return outcome(rule, "NOT_CHECKED", waitingMessage(missing, snap), [], []);

  const pl = containers(snap.PACKING_LIST!);
  const bl = containers(snap.BILL_OF_LADING!);
  const keys = (doc: DocType) => Object.keys(snap[doc]!.values).filter((k) => parseKey(k).kind === "container").map((key) => ({ doc, key }));
  const fields = [...keys("PACKING_LIST"), ...keys("BILL_OF_LADING")];
  const values: CheckValue[] = [
    { source: "PACKING_LIST", label: "Containers", value: pl.join(", ") || null },
    { source: "BILL_OF_LADING", label: "Containers", value: bl.join(", ") || null },
  ];
  if (bl.length === 0) return outcome(rule, "NOT_CHECKED", "No container number on the B/L yet.", values, fields);
  // [A] Many packing lists do not list containers; then there is nothing to compare.
  if (pl.length === 0) return outcome(rule, "NOT_CHECKED", "The packing list does not list containers.", values, [], false);

  const a = new Set(pl);
  const b = new Set(bl);
  const onlyPl = pl.filter((c) => !b.has(c));
  const onlyBl = bl.filter((c) => !a.has(c));
  if (!onlyPl.length && !onlyBl.length) return outcome(rule, "PASS", `Same container${bl.length > 1 ? "s" : ""}: ${bl.join(", ")}.`, values, fields);
  const parts = [onlyPl.length && `only on the packing list: ${onlyPl.join(", ")}`, onlyBl.length && `only on the B/L: ${onlyBl.join(", ")}`].filter(Boolean);
  return outcome(rule, "FAIL", `Containers differ, ${parts.join("; ")}.`, values, fields);
}

function invoiceReference(snap: Snapshot): CheckOutcome {
  const rule = "invoice_reference";
  const missing = missingDocs(snap, ["INVOICE", "PACKING_LIST"]);
  if (missing.length) return outcome(rule, "NOT_CHECKED", waitingMessage(missing, snap), [], [], false);
  const inv = snap.INVOICE!.values.invoice_number ?? null;
  const ref = snap.PACKING_LIST!.values.invoice_number ?? null;
  const values: CheckValue[] = [
    { source: "INVOICE", label: "Invoice number", value: inv },
    { source: "PACKING_LIST", label: "Invoice reference", value: ref },
  ];
  if (!ref) return outcome(rule, "NOT_CHECKED", "The packing list does not quote an invoice number.", values, [], false);
  if (!inv) return outcome(rule, "NOT_CHECKED", "The invoice number is missing.", values, [{ doc: "INVOICE", key: "invoice_number" }]);
  const fields = [
    { doc: "INVOICE" as const, key: "invoice_number" },
    { doc: "PACKING_LIST" as const, key: "invoice_number" },
  ];
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return norm(inv) === norm(ref)
    ? outcome(rule, "PASS", `Packing list quotes invoice ${inv}.`, values, fields)
    : outcome(rule, "FAIL", `Packing list quotes ${ref}, but the invoice number is ${inv}.`, values, fields);
}

// ---- entry point -------------------------------------------------------------------

export function runChecks(snap: Snapshot, config: CheckConfig = DEFAULT_CONFIG): CheckOutcome[] {
  return [
    invoiceTotal(snap),
    lineAmounts(snap),
    quantity(snap),
    acrossAll(snap, "packages", "total_packages", config),
    acrossAll(snap, "gross_weight", "gross_weight_kg", config),
    containerMatch(snap),
    invoiceReference(snap),
  ];
}

/** "INVOICE:gross_weight_kg" for every field in an unresolved failed check. */
export function fieldsInFailedChecks(
  checks: { result: CheckResult; resolvedAt?: Date | null; details: unknown }[],
): Set<string> {
  const out = new Set<string>();
  for (const c of checks) {
    if (c.result !== "FAIL" || c.resolvedAt) continue;
    const fields = (c.details as { fields?: { doc: string; key: string }[] } | null)?.fields ?? [];
    for (const f of fields) out.add(`${f.doc}:${f.key}`);
  }
  return out;
}
