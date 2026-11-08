import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SAMPLE_SHIPMENTS } from "../prisma/samples/data";
import { renderBillOfLading, renderInvoice, renderPackingList } from "../prisma/samples/render";

// Writes the synthetic sample PDFs to samples/ so they can be uploaded by hand
// to try live AI extraction. Run with: npm run samples
async function main() {
  const dir = path.join(process.cwd(), "samples");
  await mkdir(dir, { recursive: true });
  for (const s of SAMPLE_SHIPMENTS) {
    const docs = [
      ["invoice", s.invoice && renderInvoice],
      ["packing-list", s.packingList && renderPackingList],
      ["bill-of-lading", s.billOfLading && renderBillOfLading],
    ] as const;
    for (const [name, render] of docs) {
      if (!render) continue;
      const { bytes } = await render(s);
      const file = path.join(dir, `${s.code}_${name}.pdf`);
      await writeFile(file, bytes);
      console.log("wrote", path.relative(process.cwd(), file));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
