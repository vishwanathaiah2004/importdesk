import "server-only";
import { HEADER_FIELDS, type DocType } from "@/lib/fields";
import { buildPrompt } from "./prompt";
import { responseJsonSchema } from "./schema";

// Calls Google Gemini with the document and returns the raw JSON text.
// Kept behind a small interface (ExtractFn) so tests can use a fake model.

/** [A] Google's recommended Flash model for new projects at the time of writing; override with GEMINI_MODEL. */
export const DEFAULT_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 50_000;

export type ExtractFn = (input: { bytes: Uint8Array; mimeType: string; docType: DocType }) => Promise<{ text: string; model: string }>;

/** A failure we can show to the user as-is. */
export class ModelError extends Error {
  constructor(
    message: string,
    /** Worth trying again later (rate limit, timeout, outage). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function call(model: string, apiKey: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new ModelError("The AI service took too long to answer. Try again.", true);
    throw new ModelError("Could not reach the AI service. Check the connection and try again.", true);
  } finally {
    clearTimeout(timer);
  }
}

export const geminiExtract: ExtractFn = async ({ bytes, mimeType, docType }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ModelError("AI extraction is not configured on this server (GEMINI_API_KEY is missing).", false);
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const contents = [
    {
      role: "user",
      parts: [{ inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }, { text: buildPrompt(docType) }],
    },
  ];
  const schema = responseJsonSchema(HEADER_FIELDS[docType].map((f) => f.key));

  let res = await call(model, apiKey, {
    contents,
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
  });

  // If this model rejects the schema option, fall back to JSON mode; the
  // prompt describes the shape and our own validation still applies.
  if (res.status === 400) {
    const detail = await res.text();
    if (/schema/i.test(detail)) {
      res = await call(model, apiKey, { contents, generationConfig: { responseMimeType: "application/json" } });
    } else {
      throw new ModelError("The AI service could not process this file. Try a clearer scan or a PDF.", false);
    }
  }

  if (res.status === 401 || res.status === 403) throw new ModelError("The AI API key was rejected. Check GEMINI_API_KEY.", false);
  if (res.status === 404) throw new ModelError(`The AI model "${model}" is not available to this API key. Set GEMINI_MODEL.`, false);
  if (res.status === 429) throw new ModelError("The AI service is busy (rate limit). Wait a minute and retry.", true);
  if (!res.ok) throw new ModelError(`The AI service returned an error (${res.status}). Try again.`, true);

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new ModelError("The AI service declined to read this file.", false);
  const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new ModelError("The AI service returned an empty answer. Try again.", true);
  return { text, model };
};
