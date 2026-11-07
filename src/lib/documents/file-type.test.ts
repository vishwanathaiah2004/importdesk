import { describe, expect, it } from "vitest";
import { cleanFileName, detectFileType } from "./file-type";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("detectFileType", () => {
  it("recognises PDF, PNG, JPEG and WebP by signature", () => {
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(detectFileType(webp)).toBe("image/webp");
  });

  it("rejects anything else, whatever it is called", () => {
    expect(detectFileType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detectFileType(new TextEncoder().encode("MZ\x90\0"))).toBeNull(); // .exe
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("drops paths and unsafe characters", () => {
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("C:\\Users\\me\\invoice<1>.pdf")).toBe("invoice_1_.pdf");
    expect(cleanFileName("")).toBe("document");
  });
});
