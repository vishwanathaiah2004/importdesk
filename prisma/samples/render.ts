import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceLine, NumberStyle, SampleShipment } from "./data";

// Renders realistic-looking synthetic trade documents as PDFs, and returns the
// exact text printed for each field so seeded extractions can quote it as
// their source snippet.

export type Rendered = { bytes: Uint8Array; snippets: Record<string, string> };

const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.1, 0.1, 0.12);
const GREY = rgb(0.45, 0.45, 0.48);
const RULE = rgb(0.78, 0.78, 0.8);

export function formatNumber(n: number, decimals: number, style: NumberStyle) {
  return n.toLocaleString(style === "eu" ? "de-DE" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function weight(n: number, style: NumberStyle) {
  return style === "eu" ? `${formatNumber(n, 0, style)} kg` : `${formatNumber(n, 0, style)} KGS`;
}

function date(iso: string, style: NumberStyle) {
  const [y, m, d] = iso.split("-");
  if (style === "eu") return `${d}.${m}.${y}`;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return `${d} ${month} ${y}`;
}

export function lineAmount(line: InvoiceLine) {
  return Math.round(line.quantity * line.unitPrice * 100) / 100;
}

class Sheet {
  page: PDFPage;
  constructor(
    doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
    private poorScan = false,
  ) {
    this.page = doc.addPage(A4);
    if (poorScan) {
      // Grey, speckled background like a bad phone photo of a fax.
      this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.86, 0.86, 0.84) });
      let seed = 7;
      const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 900; i++) {
        this.page.drawCircle({
          x: rand() * A4[0],
          y: rand() * A4[1],
          size: rand() * 1.6,
          color: rgb(0.55, 0.55, 0.55),
          opacity: 0.5,
        });
      }
    }
  }

  text(x: number, y: number, value: string, size = 9, bold = false, color = INK) {
    const font = bold ? this.bold : this.regular;
    if (this.poorScan) {
      // Faint, skewed and doubled: legible to nobody.
      for (const [dx, dy] of [[0, 0], [1.4, -0.9], [-1.1, 0.8], [0.4, 1.3]]) {
        this.page.drawText(value, { x: x + dx, y: y + dy, size, font, color, opacity: 0.09, rotate: degrees(4) });
      }
      return;
    }
    this.page.drawText(value, { x, y, size, font, color });
  }

  right(xRight: number, y: number, value: string, size = 9, bold = false) {
    const font = bold ? this.bold : this.regular;
    this.text(xRight - font.widthOfTextAtSize(value, size), y, value, size, bold);
  }

  rule(y: number, x1 = 40, x2 = A4[0] - 40) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: RULE, opacity: this.poorScan ? 0.2 : 1 });
  }

  party(x: number, y: number, title: string, party: { name: string; lines: string[] }) {
    this.text(x, y, title.toUpperCase(), 7, true, GREY);
    this.text(x, y - 13, party.name, 10, true);
    party.lines.forEach((l, i) => this.text(x, y - 26 - i * 11, l, 8.5));
  }
}

async function newDoc(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("ImportDesk sample generator (synthetic data)");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, regular, bold };
}

function letterhead(s: Sheet, sample: SampleShipment, title: string) {
  s.text(40, 790, sample.seller.name.toUpperCase(), 15, true);
  s.text(40, 776, sample.seller.lines.join(" · "), 8, false, GREY);
  s.right(555, 790, title, 13, true);
  s.rule(762);
}

export async function renderInvoice(sample: SampleShipment): Promise<Rendered> {
  const inv = sample.invoice!;
  const style = sample.numberStyle;
  const { doc, regular, bold } = await newDoc(`Commercial invoice ${inv.number}`);
  const s = new Sheet(doc, regular, bold);
  const snippets: Record<string, string> = {};

  letterhead(s, sample, "COMMERCIAL INVOICE");
  s.party(40, 740, "Seller", sample.seller);
  s.party(300, 740, "Buyer", sample.buyer);
  snippets.supplier_name = `Seller: ${sample.seller.name}`;
  snippets.importer_name = `Buyer: ${sample.buyer.name}`;

  const meta: [string, string, string][] = [
    ["invoice_number", "Invoice No.", inv.number],
    ["invoice_date", "Date", date(inv.date, style)],
    ["currency", "Currency", inv.currency],
    ["incoterm", "Terms", `${inv.incoterm} ${inv.incotermPlace} (Incoterms 2020)`],
  ];
  meta.forEach(([key, label, value], i) => {
    const y = 670 - i * 14;
    s.text(40, y, label, 8.5, false, GREY);
    s.text(120, y, value, 9, true);
    snippets[key] = `${label}: ${value}`;
  });

  // Line items
  const cols = { no: 40, desc: 62, hsn: 280, qty: 390, price: 465, amount: 555 };
  let y = 600;
  s.rule(y + 14);
  s.text(cols.no, y, "#", 7.5, true, GREY);
  s.text(cols.desc, y, "DESCRIPTION OF GOODS", 7.5, true, GREY);
  s.text(cols.hsn, y, "HSN CODE", 7.5, true, GREY);
  s.right(cols.qty, y, "QUANTITY", 7.5, true);
  s.right(cols.price, y, `UNIT PRICE (${inv.currency})`, 7.5, true);
  s.right(cols.amount, y, `AMOUNT (${inv.currency})`, 7.5, true);
  s.rule(y - 6);

  let total = 0;
  inv.lines.forEach((line, i) => {
    y -= 22;
    const row = i + 1;
    const amount = lineAmount(line);
    total += amount;
    const qty = `${formatNumber(line.quantity, 0, style)} ${line.unit}`;
    const price = formatNumber(line.unitPrice, 2, style);
    const amt = formatNumber(amount, 2, style);
    s.text(cols.no, y, String(row), 9);
    s.text(cols.desc, y, line.description, 9);
    s.text(cols.hsn, y, line.hsn, 9);
    s.right(cols.qty, y, qty, 9);
    s.right(cols.price, y, price, 9);
    s.right(cols.amount, y, amt, 9);
    const rowText = `${row}  ${line.description}  ${line.hsn}  ${qty}  ${price}  ${amt}`;
    for (const attr of ["description", "hsn", "quantity", "unit", "unit_price", "amount"]) {
      snippets[`line.${row}.${attr}`] = rowText;
    }
  });
  total = Math.round(total * 100) / 100;

  y -= 18;
  s.rule(y);
  y -= 18;
  const totalText = `TOTAL ${inv.currency} ${formatNumber(total, 2, style)}`;
  s.right(cols.amount, y, totalText, 10.5, true);
  snippets.invoice_total = totalText;

  y -= 40;
  const pack: [string, string, string][] = [
    ["total_packages", "Packages", `${formatNumber(inv.packages, 0, style)} CTNS`],
    ["gross_weight_kg", "Gross Weight", weight(inv.grossKg, style)],
    ["net_weight_kg", "Net Weight", weight(inv.netKg, style)],
  ];
  pack.forEach(([key, label, value], i) => {
    s.text(40, y - i * 14, label, 8.5, false, GREY);
    s.text(120, y - i * 14, value, 9, true);
    snippets[key] = `${label}: ${value}`;
  });

  s.text(40, 120, "We certify that this invoice shows the actual price of the goods described.", 8, false, GREY);
  s.text(400, 80, `For ${sample.seller.name}`, 8.5);
  s.text(400, 60, "Authorised signatory", 8, false, GREY);

  return { bytes: await doc.save(), snippets };
}

export async function renderPackingList(sample: SampleShipment): Promise<Rendered> {
  const pl = sample.packingList!;
  const inv = sample.invoice!;
  const style = sample.numberStyle;
  const { doc, regular, bold } = await newDoc(`Packing list ${inv.number}`);
  const s = new Sheet(doc, regular, bold);
  const snippets: Record<string, string> = {};

  letterhead(s, sample, "PACKING LIST");
  s.party(40, 740, "Shipper", sample.seller);
  s.party(300, 740, "Consignee", sample.buyer);
  snippets.supplier_name = `Shipper: ${sample.seller.name}`;
  s.text(40, 670, "Invoice Ref.", 8.5, false, GREY);
  s.text(120, 670, inv.number, 9, true);
  snippets.invoice_number = `Invoice Ref.: ${inv.number}`;

  let y = 620;
  s.rule(y + 14);
  s.text(40, y, "#", 7.5, true, GREY);
  s.text(62, y, "DESCRIPTION OF GOODS", 7.5, true, GREY);
  s.right(390, y, "QUANTITY", 7.5, true);
  s.right(470, y, "CARTONS", 7.5, true);
  s.right(555, y, "GROSS WT", 7.5, true);
  s.rule(y - 6);

  const totalQty = inv.lines.reduce((sum, l) => sum + l.quantity, 0);
  inv.lines.forEach((line, i) => {
    y -= 22;
    const row = i + 1;
    // Split packages and weight across lines in proportion to quantity.
    const share = line.quantity / totalQty;
    const cartons = i === inv.lines.length - 1
      ? pl.packages - inv.lines.slice(0, -1).reduce((sum, l) => sum + Math.round((l.quantity / totalQty) * pl.packages), 0)
      : Math.round(share * pl.packages);
    const qty = `${formatNumber(line.quantity, 0, style)} ${line.unit}`;
    s.text(40, y, String(row), 9);
    s.text(62, y, line.description, 9);
    s.right(390, y, qty, 9);
    s.right(470, y, `${cartons} CTNS`, 9);
    s.right(555, y, weight(Math.round(share * pl.grossKg), style), 9);
    const rowText = `${row}  ${line.description}  ${qty}  ${cartons} CTNS`;
    for (const attr of ["description", "quantity", "unit"]) snippets[`line.${row}.${attr}`] = rowText;
  });

  y -= 18;
  s.rule(y);
  const totals: [string, string, string][] = [
    ["total_packages", "Total Packages", `${formatNumber(pl.packages, 0, style)} CTNS`],
    ["gross_weight_kg", "Total Gross Weight", weight(pl.grossKg, style)],
    ["net_weight_kg", "Total Net Weight", weight(pl.netKg, style)],
  ];
  totals.forEach(([key, label, value], i) => {
    s.text(300, y - 20 - i * 14, label, 8.5, false, GREY);
    s.right(555, y - 20 - i * 14, value, 9, true);
    snippets[key] = `${label}: ${value}`;
  });

  y -= 90;
  s.text(40, y, "CONTAINER DETAILS", 7.5, true, GREY);
  pl.containers.forEach((c, i) => {
    const text = `Container No.: ${c} / 40' HC`;
    s.text(40, y - 16 - i * 14, text, 9);
    snippets[`container.${i + 1}`] = text;
  });

  s.text(40, 120, "Marks & numbers: as per invoice. Made in " + sample.supplier.country + ".", 8, false, GREY);
  return { bytes: await doc.save(), snippets };
}

export async function renderBillOfLading(sample: SampleShipment): Promise<Rendered> {
  const bl = sample.billOfLading!;
  const inv = sample.invoice!;
  const style = sample.numberStyle;
  const { doc, regular, bold } = await newDoc(`Bill of lading ${bl.number}`);
  const s = new Sheet(doc, regular, bold, bl.poorScan);
  const snippets: Record<string, string> = {};

  s.text(40, 790, "BILL OF LADING", 15, true);
  s.text(40, 776, "For combined transport or port to port shipment · Non-negotiable copy", 8, false, GREY);
  s.right(555, 790, `B/L No. ${bl.number}`, 11, true);
  snippets.bl_number = `B/L No. ${bl.number}`;
  s.rule(762);

  s.party(40, 740, "Shipper", sample.seller);
  s.party(300, 740, "Consignee", sample.buyer);
  snippets.shipper_name = `Shipper: ${sample.seller.name}`;
  snippets.consignee_name = `Consignee: ${sample.buyer.name}`;

  const rows: [string, string, string][] = [
    ["vessel_voyage", "Vessel / Voyage", bl.vessel],
    ["port_of_loading", "Port of Loading", bl.portOfLoading],
    ["port_of_discharge", "Port of Discharge", bl.portOfDischarge],
  ];
  rows.forEach(([key, label, value], i) => {
    s.text(40, 670 - i * 15, label, 8.5, false, GREY);
    s.text(150, 670 - i * 15, value, 9, true);
    snippets[key] = `${label}: ${value}`;
  });

  let y = 600;
  s.rule(y + 14);
  s.text(40, y, "CONTAINER / SEAL", 7.5, true, GREY);
  s.text(222, y, "NO. OF PACKAGES", 7.5, true, GREY);
  s.text(320, y, "DESCRIPTION OF GOODS", 7.5, true, GREY);
  s.right(555, y, "GROSS WEIGHT", 7.5, true);
  s.rule(y - 6);

  y -= 22;
  bl.containers.forEach((c, i) => {
    const text = `${c} / 40HC / SEAL ${2093 + i}`;
    s.text(40, y - i * 13, text, 8);
    snippets[`container.${i + 1}`] = text;
  });
  const packages = `${formatNumber(bl.packages, 0, style)} PACKAGES`;
  s.text(222, y, packages, 9, true);
  snippets.total_packages = packages;
  s.text(320, y, "SAID TO CONTAIN:", 8, false, GREY);
  inv.lines.forEach((l, i) => s.text(320, y - 12 - i * 12, l.description, 8));
  const gross = style === "eu" ? `${formatNumber(bl.grossKg, 3, style)} kg` : `${formatNumber(bl.grossKg, 3, style)} KGS`;
  s.right(555, y, gross, 9, true);
  snippets.gross_weight_kg = gross;

  s.text(40, 200, "FREIGHT " + (inv.incoterm.startsWith("C") ? "PREPAID" : "COLLECT"), 9, true);
  s.text(40, 180, `Place and date of issue: ${bl.portOfLoading.split(" (")[0]}, ${date(inv.date, style)}`, 8.5);
  s.text(380, 100, "Signed as agent for the carrier", 8, false, GREY);

  return { bytes: await doc.save(), snippets };
}
