import "dotenv/config";
import { PrismaClient, type DocumentType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth/password";
import { containerKey, fieldDef, lineKey, manualEntryKeys } from "../src/lib/fields";
import { normalizeValue } from "../src/lib/extraction/normalize";
import { evaluateAndStore } from "../src/lib/checks/persist";
import { buildRows, toCsv } from "../src/lib/export/csv";
import { statusFor } from "../src/lib/export/gate";
import { loadForGate } from "../src/lib/export/load";
import { SAMPLE_SHIPMENTS, type SampleShipment } from "./samples/data";
import { lineAmount, renderBillOfLading, renderInvoice, renderPackingList, type Rendered } from "./samples/render";

// Demo data for reviewers. Everything here is synthetic.
//
// Seeded shipments arrive "already extracted" so the reviewer sees populated
// screens immediately. Their documents are real PDFs, and live upload + AI
// extraction works for any new shipment.

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

export const DEMO_PASSWORD = "Demo@1234";
const SEEDED_MODEL = "seeded extraction";

async function seedUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = [
    { email: "executive@importdesk.demo", name: "Priya Nair", role: "EXECUTIVE" as const },
    { email: "manager@importdesk.demo", name: "Rahul Deshmukh", role: "MANAGER" as const },
  ];
  const result: Record<string, string> = {};
  for (const u of users) {
    const row = await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { ...u, passwordHash },
    });
    result[u.role] = row.id;
  }
  console.log(`Seeded ${users.length} demo users (password: ${DEMO_PASSWORD})`);
  return result as { EXECUTIVE: string; MANAGER: string };
}

/** Stable pseudo-random confidence between 0.90 and 0.99 for a field. */
function confidenceFor(code: string, doc: string, key: string) {
  let h = 0;
  for (const ch of `${code}:${doc}:${key}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.9 + (h % 10) / 100;
}

const num = (n: number) => String(Number(n.toFixed(4)));

/** The true value of every field on a document, as the extraction should read it. */
function truth(sample: SampleShipment, doc: DocumentType): Record<string, { value: string; unit?: string }> {
  const inv = sample.invoice!;
  const out: Record<string, { value: string; unit?: string }> = {};
  const lines = inv.lines;

  if (doc === "INVOICE") {
    Object.assign(out, {
      supplier_name: { value: sample.seller.name },
      importer_name: { value: sample.buyer.name },
      invoice_number: { value: inv.number },
      invoice_date: { value: inv.date },
      currency: { value: inv.currency },
      incoterm: { value: inv.incoterm },
      invoice_total: { value: lines.reduce((s, l) => s + lineAmount(l), 0).toFixed(2) },
      total_packages: { value: String(inv.packages) },
      gross_weight_kg: { value: num(inv.grossKg), unit: "kg" },
      net_weight_kg: { value: num(inv.netKg), unit: "kg" },
    });
    lines.forEach((l, i) => {
      const r = i + 1;
      out[lineKey(r, "description")] = { value: l.description };
      out[lineKey(r, "hsn")] = { value: l.hsn };
      out[lineKey(r, "quantity")] = { value: num(l.quantity) };
      out[lineKey(r, "unit")] = { value: l.unit };
      out[lineKey(r, "unit_price")] = { value: num(l.unitPrice) };
      out[lineKey(r, "amount")] = { value: lineAmount(l).toFixed(2) };
    });
  }

  if (doc === "PACKING_LIST") {
    const pl = sample.packingList!;
    Object.assign(out, {
      supplier_name: { value: sample.seller.name },
      invoice_number: { value: inv.number },
      total_packages: { value: String(pl.packages) },
      gross_weight_kg: { value: num(pl.grossKg), unit: "kg" },
      net_weight_kg: { value: num(pl.netKg), unit: "kg" },
    });
    lines.forEach((l, i) => {
      const r = i + 1;
      out[lineKey(r, "description")] = { value: l.description };
      out[lineKey(r, "quantity")] = { value: num(l.quantity) };
      out[lineKey(r, "unit")] = { value: l.unit };
    });
    pl.containers.forEach((c, i) => (out[containerKey(i + 1)] = { value: c }));
  }

  if (doc === "BILL_OF_LADING") {
    const bl = sample.billOfLading!;
    Object.assign(out, {
      bl_number: { value: bl.number },
      shipper_name: { value: sample.seller.name },
      consignee_name: { value: sample.buyer.name },
      vessel_voyage: { value: bl.vessel },
      port_of_loading: { value: bl.portOfLoading },
      port_of_discharge: { value: bl.portOfDischarge },
      total_packages: { value: String(bl.packages) },
      gross_weight_kg: { value: num(bl.grossKg), unit: "kg" },
    });
    bl.containers.forEach((c, i) => (out[containerKey(i + 1)] = { value: c }));
  }
  return out;
}

/** For header fields the snippet is "Label: value", so the printed value is after the colon. */
function printedValue(key: string, snippet: string | null) {
  if (!snippet || key.includes(".")) return null;
  const i = snippet.indexOf(": ");
  return i === -1 ? snippet.replace(/^TOTAL\s+[A-Z]{3}\s+/, "") : snippet.slice(i + 2);
}

async function seedShipment(sample: SampleShipment, users: { EXECUTIVE: string; MANAGER: string }) {
  const supplier = await db.supplier.upsert({
    where: { name_country: sample.supplier },
    update: {},
    create: sample.supplier,
  });

  const shipment = await db.shipment.create({
    data: {
      code: sample.code,
      supplierId: supplier.id,
      createdById: users.EXECUTIVE,
      status: "DRAFT", // computed from the export gate below
    },
  });

  const docs: [DocumentType, (s: SampleShipment) => Promise<Rendered>, boolean][] = [
    ["INVOICE", renderInvoice, !!sample.invoice],
    ["PACKING_LIST", renderPackingList, !!sample.packingList],
    ["BILL_OF_LADING", renderBillOfLading, !!sample.billOfLading],
  ];

  for (const [type, render, present] of docs) {
    if (!present) continue;
    const { bytes, snippets } = await render(sample);
    const unreadable = type === "BILL_OF_LADING" && !!sample.billOfLading?.poorScan;
    const slug = type.toLowerCase().replace(/_/g, "-");

    const document = await db.document.create({
      data: {
        shipmentId: shipment.id,
        type,
        fileName: `${sample.code}_${slug}.pdf`,
        storageKey: `seed/${sample.code}/${slug}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        pageCount: 1,
        status: unreadable ? "UNREADABLE" : "DONE",
        error: unreadable ? "The scan is too faint and skewed to read. Enter the values manually." : null,
        modelName: SEEDED_MODEL,
        extractedAt: new Date(),
        blob: { create: { data: Buffer.from(bytes) } },
      },
    });

    if (unreadable) {
      await db.extractedField.createMany({
        data: manualEntryKeys(type).map((key) => ({
          documentId: document.id,
          key,
          flagReason: "Unreadable document — enter manually",
        })),
      });
      continue;
    }

    const values = truth(sample, type);
    const misreads = sample.extraction?.misreads?.filter((m) => m.doc === type) ?? [];
    const lows = sample.extraction?.lowConfidence?.filter((m) => m.doc === type) ?? [];

    await db.extractedField.createMany({
      data: Object.entries(values).map(([key, { value, unit }]) => {
        const misread = misreads.find((m) => m.key === key);
        const low = lows.find((m) => m.key === key);
        const snippet = snippets[key] ?? null;
        const stored = misread?.value ?? value;
        // Seeded values go through the same sanity checks as live AI output.
        const def = fieldDef(type, key);
        const check = def ? normalizeValue(def.type, stored, { unit, source: "model" }) : null;
        return {
          documentId: document.id,
          key,
          valueRaw: misread?.value ?? printedValue(key, snippet) ?? value,
          valueNormalized: misread?.value ?? value,
          unit: unit ?? null,
          confidence: misread?.confidence ?? low?.confidence ?? confidenceFor(sample.code, type, key),
          sourceSnippet: snippet,
          sourcePage: 1,
          flagReason: check?.flag ?? null,
          status: sample.reviewed || sample.exported ? ("CONFIRMED" as const) : ("PENDING" as const),
          confirmedById: sample.reviewed || sample.exported ? users.EXECUTIVE : null,
          confirmedAt: sample.reviewed || sample.exported ? new Date() : null,
        };
      }),
    });
  }
  await evaluateAndStore(db, shipment.id);

  if (sample.exported) {
    await db.shipment.update({ where: { id: shipment.id }, data: { approvedById: users.MANAGER, approvedAt: new Date() } });
    const { source } = await loadForGate(db, shipment.id);
    const rows = buildRows(source);
    const fileName = `${sample.code}_filing-import.csv`;
    const exp = await db.export.create({
      data: { shipmentId: shipment.id, exportedById: users.EXECUTIVE, fileName, content: toCsv(rows), rowCount: rows.length },
    });
    await db.auditLog.createMany({
      data: [
        { userId: users.MANAGER, action: "shipment.approved", entityType: "shipment", entityId: shipment.id, metadata: { shipmentId: shipment.id } },
        { userId: users.EXECUTIVE, action: "shipment.exported", entityType: "export", entityId: exp.id, metadata: { shipmentId: shipment.id, fileName } },
      ],
    });
    await db.shipment.update({ where: { id: shipment.id }, data: { status: "EXPORTED" } });
  } else {
    const { gate } = await loadForGate(db, shipment.id);
    await db.shipment.update({ where: { id: shipment.id }, data: { status: statusFor(gate) } });
  }
  console.log(`Seeded ${sample.code} (${sample.origin === "brief" ? "from the brief" : "added sample"})`);
}

async function main() {
  const users = await seedUsers();

  // Start from a clean slate so the demo is the same every time.
  await db.auditLog.deleteMany();
  await db.export.deleteMany();
  await db.shipment.deleteMany();
  await db.supplier.deleteMany();

  for (const sample of SAMPLE_SHIPMENTS) await seedShipment(sample, users);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
