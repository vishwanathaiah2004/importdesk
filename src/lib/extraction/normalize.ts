// Deterministic checks and normalisation for extracted values.
//
// The same functions run on AI output and on what a person types, so a value
// is stored in one canonical form whoever produced it:
//   numbers  -> plain decimal string, "3120", "42.5"
//   weights  -> kilograms
//   dates    -> ISO yyyy-mm-dd
//   codes    -> upper case (currency, Incoterm, container), digits only (HSN)
//
// AI output is never rejected here: a doubtful value is kept and *flagged*,
// so a person sees it. Typed input is rejected with a message instead.

import type { FieldType } from "@/lib/fields";

export type NumberStyle = "en" | "eu"; // 3,120.50 vs 3.120,50

export type Normalized = {
  value: string | null;
  unit?: string | null;
  /** Something a person should look at (AI output). */
  flag?: string | null;
  /** The input cannot be accepted (typed input). */
  error?: string | null;
};

// ---- numbers ----------------------------------------------------------------

function canonical(n: string) {
  let [int, frac = ""] = n.replace(/^-/, "").split(".");
  int = int.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  const sign = n.startsWith("-") && (int !== "0" || frac) ? "-" : "";
  return sign + int + (frac ? `.${frac}` : "");
}

/**
 * Parse a number written in either English (3,120.50) or European (3.120,50)
 * style. `ambiguous` means a single separator followed by exactly three
 * digits, e.g. "1.460" (1.46 or 1460?). `style` resolves the ambiguity.
 */
export function parseNumber(
  input: string,
  style: NumberStyle | null = null,
): { value: string | null; ambiguous: boolean } {
  const s = input
    .replace(/[\s  ']/g, "")
    .replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return { value: null, ambiguous: false };

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  let normalized: string;
  let ambiguous = false;

  if (commas && dots) {
    // Whichever comes last is the decimal separator.
    normalized = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (commas || dots) {
    const sep = commas ? "," : ".";
    const count = commas || dots;
    const [before, after] = [s.slice(0, s.indexOf(sep)), s.slice(s.lastIndexOf(sep) + 1)];
    if (count > 1) {
      normalized = s.split(sep).join(""); // 1,234,567 or 1.234.567
    } else if (after.length === 3 && /^-?[1-9]\d{0,2}$/.test(before)) {
      ambiguous = true;
      const thousands = style ? (style === "en" ? sep === "," : sep === ".") : sep === ",";
      normalized = thousands ? before + after : `${before}.${after}`;
    } else {
      normalized = `${before}.${after}`;
    }
  } else {
    normalized = s;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { value: null, ambiguous };
  return { value: canonical(normalized), ambiguous };
}

/** Guess a document's number style from figures that are unambiguous. */
export function detectNumberStyle(texts: (string | null | undefined)[]): NumberStyle | null {
  let en = 0;
  let eu = 0;
  for (const t of texts) {
    for (const token of t?.match(/\d[\d.,]*\d/g) ?? []) {
      if (/\d\.\d{3},\d+$/.test(token) || /,\d{1,2}$/.test(token)) eu++;
      else if (/\d,\d{3}\.\d+$/.test(token) || /\.\d{1,2}$/.test(token)) en++;
    }
  }
  if (en === eu) return null;
  return en > eu ? "en" : "eu";
}

/** Every number the source text could mean, under either style. */
function candidates(text: string) {
  const out = new Set<number>();
  // Separate figures ("6.80 16,320.00") plus space-grouped ones ("1 234 567").
  const tokens = [
    ...(text.match(/\d[\d.,]*\d|\d/g) ?? []),
    ...(text.match(/\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?/g) ?? []),
  ];
  for (const token of tokens) {
    for (const style of ["en", "eu"] as const) {
      const v = parseNumber(token, style).value;
      if (v != null) out.add(Number(v));
    }
  }
  return out;
}

/** Does the quoted source text actually contain this number? Catches invented values. */
export function snippetSupports(value: string, snippet: string | null | undefined, factor = 1) {
  if (!snippet) return false;
  const target = Number(value);
  for (const c of candidates(snippet)) {
    if (Math.abs(c * factor - target) < 1e-6) return true;
  }
  return false;
}

// ---- codes --------------------------------------------------------------------

export const INCOTERMS_2020 = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] as const;

// ISO 4217 codes seen in Indian import trade. Anything else is flagged, not rejected.
const CURRENCIES = new Set(
  "USD EUR GBP JPY CNY HKD SGD AED SAR CHF SEK NOK DKK AUD CAD NZD KRW TWD THB MYR IDR VND PHP INR ZAR TRY BRL MXN RUB PLN CZK HUF ILS QAR KWD OMR BHD LKR BDT NPR".split(" "),
);

const SYMBOLS: Record<string, string> = { $: "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" };

const LETTER_VALUES = (() => {
  // ISO 6346: A=10, skipping multiples of 11.
  const map: Record<string, number> = {};
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    map[ch] = v++;
  }
  return map;
})();

/** ISO 6346 check digit for the first 10 characters of a container number. */
export function containerCheckDigit(first10: string) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const n = /[A-Z]/.test(ch) ? LETTER_VALUES[ch] : Number(ch);
    sum += n * 2 ** i;
  }
  return (sum % 11) % 10;
}

export function checkContainer(input: string): { value: string; error: string | null } {
  const value = input.toUpperCase().replace(/[\s\-/.]/g, "");
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(value)) {
    return { value, error: "Container numbers are 4 letters and 7 digits, e.g. MSKU1234565." };
  }
  const expected = containerCheckDigit(value.slice(0, 10));
  if (Number(value[10]) !== expected) {
    return { value, error: `Check digit does not match (ISO 6346 expects ${expected}). A character may be misread.` };
  }
  return { value, error: null };
}

// ---- dates -------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDate(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Accepts yyyy-mm-dd, dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy and "14 Oct 2026". [A] Day-first, as on Indian and European documents. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (m) return isoDate(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? isoDate(+m[3], month, +m[1]) : null;
  }
  return null;
}

// ---- weights ---------------------------------------------------------------------

function weightFactor(unit: string | null | undefined): { factor: number; flag: string | null } {
  const u = (unit ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (["kg", "kgs", "kgm", "kilo", "kilos", "kilogram", "kilograms"].includes(u)) return { factor: 1, flag: null };
  if (["mt", "t", "tne", "ton", "tons", "tonne", "tonnes"].includes(u)) return { factor: 1000, flag: null };
  if (["lb", "lbs", "pound", "pounds"].includes(u)) return { factor: 0.45359237, flag: "Converted from pounds" };
  if (["g", "gm", "gms", "gram", "grams"].includes(u)) return { factor: 0.001, flag: null };
  if (!u) return { factor: 1, flag: "Unit not stated; assumed kilograms" };
  return { factor: 1, flag: `Unknown weight unit "${unit}"; assumed kilograms` };
}

// ---- one entry point -----------------------------------------------------------

/**
 * Normalise one value of the given type.
 * `source: "model"` flags problems; `source: "user"` returns an error instead.
 */
export function normalizeValue(
  type: FieldType,
  raw: string | null | undefined,
  opts: { unit?: string | null; style?: NumberStyle | null; source: "model" | "user" },
): Normalized {
  const input = (raw ?? "").trim();
  if (!input) return { value: null };
  const problem = (message: string, value: string | null = input): Normalized =>
    opts.source === "user" ? { value: null, error: message } : { value, flag: message };

  switch (type) {
    case "text":
      return input.length > 200 ? problem("Too long (200 characters max).", input.slice(0, 200)) : { value: input.replace(/\s+/g, " ") };

    case "number":
    case "integer":
    case "weight": {
      // Typed input may include a unit, e.g. "3,165 kg".
      const unitInText = type === "weight" ? /([a-zA-Z]+)\s*$/.exec(input)?.[1] : undefined;
      // [A] Typed input is read English-style (comma = thousands, dot = decimal),
      // as on Indian documents. "1.460" is still ambiguous to a person, so ask.
      const style = opts.style ?? (opts.source === "user" ? "en" : null);
      const parsed = parseNumber(input, style);
      if (parsed.value == null) return problem("Enter a number.");
      if (opts.source === "user" && parsed.ambiguous && !input.includes(",")) {
        return problem(`"${input}" could mean two numbers. Write it without a thousands separator, e.g. 1460 or 1.46.`);
      }
      if (parsed.value.startsWith("-")) return problem("Must not be negative.", parsed.value);
      if (type === "integer" && parsed.value.includes(".")) return problem("Must be a whole number.", parsed.value);
      if (type === "weight") {
        const { factor, flag } = weightFactor(opts.unit ?? unitInText ?? (opts.source === "user" ? "kg" : null));
        const kg = canonical(String(Number((Number(parsed.value) * factor).toFixed(3))));
        if (opts.source === "user" && flag && flag.startsWith("Unknown")) return problem(flag);
        return { value: kg, unit: "kg", flag: opts.source === "model" ? flag : null };
      }
      return { value: parsed.value };
    }

    case "date": {
      const iso = parseDate(input);
      if (!iso) return problem("Enter a date like 2026-10-14 or 14/10/2026.");
      const year = Number(iso.slice(0, 4));
      const thisYear = new Date().getUTCFullYear();
      if (year < 2000 || year > thisYear + 1) return problem("This date looks wrong.", iso);
      return { value: iso };
    }

    case "currency": {
      const code = SYMBOLS[input] ?? input.toUpperCase().replace(/[^A-Z]/g, "");
      if (!/^[A-Z]{3}$/.test(code)) return problem("Use a 3-letter ISO currency code, e.g. USD.");
      if (!CURRENCIES.has(code)) return problem(`${code} is not a currency we expect; check it.`, code);
      return { value: code };
    }

    case "incoterm": {
      const code = input.toUpperCase().match(/[A-Z]{3}/)?.[0] ?? "";
      if (!(INCOTERMS_2020 as readonly string[]).includes(code)) {
        return problem(`Use an Incoterms 2020 rule: ${INCOTERMS_2020.join(", ")}.`, code || input);
      }
      return { value: code };
    }

    case "hsn": {
      const digits = input.replace(/\D/g, "");
      if (digits.length !== 8) {
        return problem(`HSN codes in India have 8 digits (ITC-HS); this has ${digits.length}.`, digits || input);
      }
      return { value: digits };
    }

    case "container": {
      const { value, error } = checkContainer(input);
      return error ? problem(error, value) : { value };
    }
  }
}
