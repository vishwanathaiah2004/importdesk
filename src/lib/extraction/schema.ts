import { z } from "zod";

// The exact JSON shape we ask the model for. Everything the model returns is
// parsed against this before any of it is used. If it does not match, nothing
// is saved.

const Confidence = z.number().min(0).max(1);
const Str = z.string().max(500).nullable();

export const ModelOutput = z.object({
  readable: z.boolean(),
  unreadable_reason: Str.optional().default(null),
  document_type: z.enum(["INVOICE", "PACKING_LIST", "BILL_OF_LADING", "OTHER"]),
  fields: z
    .array(
      z.object({
        key: z.string().max(60),
        value: Str,
        unit: Str.optional().default(null),
        confidence: Confidence,
        source_snippet: Str.optional().default(null),
        page: z.number().int().min(1).max(500).nullable().optional().default(null),
      }),
    )
    .max(60),
  line_items: z
    .array(
      z.object({
        description: Str,
        hsn: Str.optional().default(null),
        quantity: Str,
        unit: Str.optional().default(null),
        unit_price: Str.optional().default(null),
        amount: Str.optional().default(null),
        confidence: Confidence,
        source_snippet: Str.optional().default(null),
        page: z.number().int().min(1).max(500).nullable().optional().default(null),
      }),
    )
    .max(200)
    .default([]),
  containers: z
    .array(
      z.object({
        number: z.string().max(40),
        confidence: Confidence,
        source_snippet: Str.optional().default(null),
        page: z.number().int().min(1).max(500).nullable().optional().default(null),
      }),
    )
    .max(50)
    .default([]),
});

export type ModelOutput = z.infer<typeof ModelOutput>;

const nullableString = { type: ["string", "null"] };
const page = { type: ["integer", "null"], minimum: 1 };
const confidence = { type: "number", minimum: 0, maximum: 1 };

/** The same contract as JSON Schema, sent to the model for structured output. */
export function responseJsonSchema(headerKeys: string[]) {
  return {
    type: "object",
    properties: {
      readable: { type: "boolean" },
      unreadable_reason: nullableString,
      document_type: { type: "string", enum: ["INVOICE", "PACKING_LIST", "BILL_OF_LADING", "OTHER"] },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: headerKeys },
            value: nullableString,
            unit: nullableString,
            confidence,
            source_snippet: nullableString,
            page,
          },
          required: ["key", "value", "confidence", "source_snippet", "page"],
        },
      },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: nullableString,
            hsn: nullableString,
            quantity: nullableString,
            unit: nullableString,
            unit_price: nullableString,
            amount: nullableString,
            confidence,
            source_snippet: nullableString,
            page,
          },
          required: ["description", "quantity", "confidence", "source_snippet"],
        },
      },
      containers: {
        type: "array",
        items: {
          type: "object",
          properties: { number: { type: "string" }, confidence, source_snippet: nullableString, page },
          required: ["number", "confidence"],
        },
      },
    },
    required: ["readable", "document_type", "fields", "line_items", "containers"],
  };
}
