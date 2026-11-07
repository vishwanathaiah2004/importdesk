// Turns validated model output into field rows to store. Pure: no database,
// no network, so every rule here is unit-tested.

import {
  CONTAINER_DEF,
  DOC_LABEL,
  HAS_CONTAINERS,
  HEADER_FIELDS,
  LINE_ATTRS,
  REQUIRES_CONTAINER,
  containerKey,
  lineKey,
  manualEntryKeys,
  type DocType,
  type FieldDef,
} from "@/lib/fields";
import { detectNumberStyle, normalizeValue, parseNumber, snippetSupports, type NumberStyle } from "./normalize";
import type { ModelOutput } from "./schema";

export type FieldDraft = {
  key: string;
  valueRaw: string | null;
  valueNormalized: string | null;
  unit: string | null;
  confidence: number | null;
  sourceSnippet: string | null;
  sourcePage: number | null;
  flagReason: string | null;
};

export type Interpretation =
  | { outcome: "extracted"; fields: FieldDraft[] }
  | { outcome: "unreadable"; reason: string; fields: FieldDraft[] }
  | { outcome: "wrong_type"; message: string };

const NUMERIC = new Set(["number", "integer", "weight"]);

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function draft(
  def: FieldDef,
  key: string,
  raw: { value: string | null; unit?: string | null; confidence: number; snippet: string | null; page: number | null },
  style: NumberStyle | null,
): FieldDraft {
  const n = normalizeValue(def.type, raw.value, { unit: raw.unit, style, source: "model" });
  const flags: string[] = [];
  if (n.flag) flags.push(n.flag);

  if (n.value != null) {
    if (!raw.snippet) {
      flags.push("No source text was quoted for this value");
    } else if (NUMERIC.has(def.type)) {
      // The number must actually appear in the quoted text (in the unit printed).
      const asPrinted = parseNumber(raw.value ?? "", style).value;
      if (asPrinted && !snippetSupports(asPrinted, raw.snippet)) flags.push("Value does not match the quoted source text");
    } else if (def.type === "text" && !alnum(raw.snippet).includes(alnum(n.value).slice(0, 40))) {
      flags.push("Value does not match the quoted source text");
    }
  }

  return {
    key,
    valueRaw: raw.value,
    valueNormalized: n.value,
    unit: n.unit ?? null,
    confidence: raw.confidence,
    sourceSnippet: raw.snippet,
    sourcePage: raw.page,
    flagReason: flags.length ? flags.join(". ") : null,
  };
}

function empty(key: string, flagReason: string | null = null): FieldDraft {
  return { key, valueRaw: null, valueNormalized: null, unit: null, confidence: null, sourceSnippet: null, sourcePage: null, flagReason };
}

export function manualEntryDrafts(docType: DocType, reason = "Unreadable document — enter manually"): FieldDraft[] {
  return manualEntryKeys(docType).map((key) => empty(key, reason));
}

export function interpret(docType: DocType, out: ModelOutput): Interpretation {
  if (!out.readable) {
    const reason = out.unreadable_reason?.trim() || "The document could not be read.";
    return { outcome: "unreadable", reason, fields: manualEntryDrafts(docType) };
  }
  if (out.document_type !== docType) {
    const seen = out.document_type === "OTHER" ? "a trade document of this kind" : `a ${DOC_LABEL[out.document_type as DocType].toLowerCase()}`;
    return {
      outcome: "wrong_type",
      message: `This file does not look like ${DOC_LABEL[docType].toLowerCase().replace(/^/, "a ")}; it reads as ${seen}. Upload it in the right slot.`,
    };
  }

  // Resolve 1.460-style ambiguity using the document's own unambiguous figures.
  const style = detectNumberStyle([
    ...out.fields.map((f) => f.source_snippet),
    ...out.line_items.map((l) => l.source_snippet),
  ]);

  const fields: FieldDraft[] = [];

  for (const def of HEADER_FIELDS[docType]) {
    const got = out.fields.find((f) => f.key === def.key);
    if (got && got.value != null && got.value.trim() !== "") {
      fields.push(draft(def, def.key, { value: got.value, unit: got.unit, confidence: got.confidence, snippet: got.source_snippet, page: got.page }, style));
    } else if (def.required) {
      fields.push(empty(def.key, "Not found on the document"));
    }
  }

  const attrs = LINE_ATTRS[docType];
  if (attrs.length) {
    const lines = out.line_items.length ? out.line_items : [];
    if (lines.length === 0) {
      for (const def of attrs.filter((a) => a.required)) fields.push(empty(lineKey(1, def.key), "No line items found"));
    }
    lines.forEach((line, i) => {
      const row = i + 1;
      for (const def of attrs) {
        const value = line[def.key as keyof typeof line] as string | null | undefined;
        if (value != null && String(value).trim() !== "") {
          fields.push(draft(def, lineKey(row, def.key), { value: String(value), confidence: line.confidence, snippet: line.source_snippet, page: line.page }, style));
        } else if (def.required) {
          fields.push(empty(lineKey(row, def.key), "Not found on this line"));
        }
      }
    });
  }

  if (HAS_CONTAINERS[docType]) {
    const seen = new Set<string>();
    let row = 0;
    for (const c of out.containers) {
      const d = draft(CONTAINER_DEF, "", { value: c.number, confidence: c.confidence, snippet: c.source_snippet, page: c.page }, style);
      if (d.valueNormalized && seen.has(d.valueNormalized)) continue; // the same container printed twice
      if (d.valueNormalized) seen.add(d.valueNormalized);
      fields.push({ ...d, key: containerKey(++row) });
    }
    if (row === 0 && REQUIRES_CONTAINER[docType]) fields.push(empty(containerKey(1), "No container number found"));
  }

  return { outcome: "extracted", fields };
}
