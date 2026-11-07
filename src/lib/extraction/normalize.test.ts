import { describe, expect, it } from "vitest";
import {
  checkContainer,
  containerCheckDigit,
  detectNumberStyle,
  normalizeValue,
  parseDate,
  parseNumber,
  snippetSupports,
} from "./normalize";

describe("parseNumber", () => {
  it("reads English and European formats", () => {
    expect(parseNumber("16,320.00").value).toBe("16320");
    expect(parseNumber("7.650,00").value).toBe("7650");
    expect(parseNumber("42,50").value).toBe("42.5");
    expect(parseNumber("6.80").value).toBe("6.8");
    expect(parseNumber("1 234 567").value).toBe("1234567");
    expect(parseNumber("USD 2,400").value).toBe("2400");
  });

  it("marks single-separator, three-digit numbers as ambiguous and lets the document style decide", () => {
    expect(parseNumber("1.460", "eu")).toEqual({ value: "1460", ambiguous: true });
    expect(parseNumber("1.460", "en")).toEqual({ value: "1.46", ambiguous: true });
    expect(parseNumber("3,120", "en")).toEqual({ value: "3120", ambiguous: true });
    expect(parseNumber("3,120", "eu")).toEqual({ value: "3.12", ambiguous: true });
    expect(parseNumber("0.125").ambiguous).toBe(false);
  });

  it("returns null when there is no number", () => {
    expect(parseNumber("n/a").value).toBeNull();
  });
});

describe("detectNumberStyle", () => {
  it("finds the style from unambiguous figures on the document", () => {
    expect(detectNumberStyle(["TOTAL USD 16,320.00", "Gross 3,120 KGS"])).toBe("en");
    expect(detectNumberStyle(["TOTAL EUR 7.650,00", "Unit price 42,50", "1.460 kg"])).toBe("eu");
    expect(detectNumberStyle(["Gross 1.460 kg"])).toBeNull();
  });
});

describe("snippetSupports", () => {
  it("accepts a value that appears in the quoted text under either style", () => {
    expect(snippetSupports("3120", "Gross Weight: 3,120 KGS")).toBe(true);
    expect(snippetSupports("1460", "Gross Weight: 1.460 kg")).toBe(true);
    expect(snippetSupports("3.165", "3.165 MT", 1000)).toBe(false);
    expect(snippetSupports("3165", "3.165 MT", 1000)).toBe(true);
    expect(snippetSupports("1234567", "Total 1 234 567 kg")).toBe(true);
  });

  it("keeps separate figures on one line apart", () => {
    const row = "1 LED panel 94054290 2,400 PCS 6.80 16,320.00";
    expect(snippetSupports("6.8", row)).toBe(true);
    expect(snippetSupports("2400", row)).toBe(true);
    expect(snippetSupports("16320", row)).toBe(true);
  });

  it("rejects a value the source text does not contain", () => {
    expect(snippetSupports("3165", "Gross Weight: 3,120 KGS")).toBe(false);
    expect(snippetSupports("3120", null)).toBe(false);
  });
});

describe("ISO 6346 container numbers", () => {
  it("computes the textbook check digit", () => {
    expect(containerCheckDigit("CSQU305438")).toBe(3);
  });

  it("accepts valid numbers and normalises spacing", () => {
    expect(checkContainer("MSKU 718234-5")).toEqual({ value: "MSKU7182345", error: null });
  });

  it("catches a single misread digit", () => {
    expect(checkContainer("MSKU7182845").error).toMatch(/expects 9/);
  });
});

describe("parseDate", () => {
  it("accepts ISO, day-first and written months", () => {
    expect(parseDate("2026-10-14")).toBe("2026-10-14");
    expect(parseDate("21.10.2026")).toBe("2026-10-21");
    expect(parseDate("14/10/2026")).toBe("2026-10-14");
    expect(parseDate("14 Oct 2026")).toBe("2026-10-14");
  });

  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("tomorrow")).toBeNull();
  });
});

describe("normalizeValue", () => {
  it("converts weights to kilograms", () => {
    expect(normalizeValue("weight", "3.165", { unit: "MT", source: "model" })).toMatchObject({ value: "3165", unit: "kg", flag: null });
    expect(normalizeValue("weight", "3,165 kg", { source: "user" })).toMatchObject({ value: "3165", unit: "kg" });
    expect(normalizeValue("weight", "1000", { unit: "LBS", source: "model" }).flag).toBe("Converted from pounds");
  });

  it("flags AI output but rejects typed input", () => {
    expect(normalizeValue("hsn", "940542", { source: "model" })).toMatchObject({ value: "940542", flag: expect.stringMatching(/8 digits/) });
    expect(normalizeValue("hsn", "940542", { source: "user" })).toMatchObject({ value: null, error: expect.stringMatching(/8 digits/) });
  });

  it("reads typed numbers English-style, but asks about a European-looking 1.460", () => {
    expect(normalizeValue("number", "3,165", { source: "user" }).value).toBe("3165");
    expect(normalizeValue("number", "42.50", { source: "user" }).value).toBe("42.5");
    expect(normalizeValue("number", "1.460", { source: "user" }).error).toMatch(/two numbers/);
    expect(normalizeValue("number", "1460", { source: "user" }).value).toBe("1460");
  });

  it("normalises codes", () => {
    expect(normalizeValue("hsn", "9405.42.90", { source: "user" }).value).toBe("94054290");
    expect(normalizeValue("incoterm", "FOB Ningbo", { source: "model" }).value).toBe("FOB");
    expect(normalizeValue("currency", "$", { source: "model" }).value).toBe("USD");
    expect(normalizeValue("currency", "XYZ", { source: "model" }).flag).toMatch(/not a currency/);
    expect(normalizeValue("incoterm", "FOT", { source: "user" }).error).toMatch(/Incoterms 2020/);
  });

  it("treats an empty value as missing, not as an error", () => {
    expect(normalizeValue("number", "  ", { source: "user" })).toEqual({ value: null });
  });

  it("rejects whole-number fields with decimals", () => {
    expect(normalizeValue("integer", "12.5", { source: "user" }).error).toMatch(/whole number/);
  });
});
