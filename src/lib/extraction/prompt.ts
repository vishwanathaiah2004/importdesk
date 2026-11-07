import { DOC_LABEL, HAS_CONTAINERS, HEADER_FIELDS, LINE_ATTRS, type DocType } from "@/lib/fields";

/** Instructions for one document. Field lists come from src/lib/fields.ts. */
export function buildPrompt(docType: DocType) {
  const fields = HEADER_FIELDS[docType].map((f) => `- ${f.key}: ${f.hint}`).join("\n");
  const lineAttrs = LINE_ATTRS[docType].map((f) => f.key).join(", ");

  return `You are reading an import shipment document for an Indian customs broker.
The user says this file is a ${DOC_LABEL[docType]} (document_type ${docType}).

Return JSON only, matching the schema. Rules:
1. Never guess. If a value is not printed on the document, return null for it.
2. For every value, quote source_snippet: the exact text as printed, including its label, e.g. "Gross Weight: 3,120 KGS".
3. Give page as the 1-based page number where the value appears.
4. Give confidence from 0 to 1 for how sure you are that you read the value correctly. Use a low value for blurred, handwritten, skewed or partly hidden text.
5. Numbers in "value": plain digits with "." as the decimal point and no thousands separators, e.g. "3120" or "42.50". Read the separators as the document uses them: "1.460 kg" on a European document is 1460.
6. Weights: put the number in "value" and the unit as printed in "unit" (e.g. "KGS", "MT"). Do not convert.
7. Dates: "value" as YYYY-MM-DD.
8. Currency: the ISO 4217 code, e.g. USD. Incoterm: the 3-letter Incoterms rule only, e.g. FOB.
9. Set document_type to what the document actually is. If it is not a ${DOC_LABEL[docType]}, say so; do not force it.
10. If the document cannot be read (too blurred, faint, cut off, or not a trade document), set readable to false, explain why in unreadable_reason, and return empty lists.

Header fields to extract (use these keys in "fields"):
${fields}
${lineAttrs ? `\nLine items: one entry per goods line, in printed order, with ${lineAttrs}. Use null for anything not printed on that line.` : "\nThis document has no line items: return an empty line_items list."}
${HAS_CONTAINERS[docType] ? "\nContainers: every container number printed, without spaces, e.g. MSKU7182345." : "\nReturn an empty containers list."}`;
}
