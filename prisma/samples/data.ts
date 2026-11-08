// Synthetic sample shipments. SHP-24811 and SHP-24812 come from the client's
// sample data in the brief; the others are labelled additions that show the
// happy path and the unreadable-document path.
// All companies and numbers are made up.

export type NumberStyle = "en" | "eu"; // 3,120.50 vs 3.120,50

export type Party = { name: string; lines: string[] };

export type InvoiceLine = {
  description: string;
  hsn: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type SampleShipment = {
  code: string;
  /** Who added it: the brief's sample data or this project. */
  origin: "brief" | "added";
  supplier: { name: string; country: string };
  seller: Party;
  buyer: Party;
  numberStyle: NumberStyle;
  invoice?: {
    number: string;
    date: string; // ISO
    currency: string;
    incoterm: string;
    incotermPlace: string;
    lines: InvoiceLine[];
    packages: number;
    grossKg: number;
    netKg: number;
  };
  packingList?: {
    packages: number;
    grossKg: number;
    netKg: number;
    containers: string[];
  };
  billOfLading?: {
    number: string;
    vessel: string;
    portOfLoading: string;
    portOfDischarge: string;
    packages: number;
    grossKg: number;
    containers: string[];
    /** Rendered as a faint, skewed scan the model cannot read. */
    poorScan?: boolean;
  };
  /**
   * How the stored extraction differs from the truth printed on the PDF:
   * simulated AI misreads and low-confidence reads for the demo.
   */
  extraction?: {
    misreads?: { doc: "INVOICE" | "PACKING_LIST" | "BILL_OF_LADING"; key: string; value: string; confidence: number }[];
    lowConfidence?: { doc: "INVOICE" | "PACKING_LIST" | "BILL_OF_LADING"; key: string; confidence: number }[];
  };
  /** Every field already confirmed by the executive. */
  reviewed?: boolean;
  /** Approved by the manager and exported (implies reviewed). */
  exported?: boolean;
};

const NHAVA_SHEVA = "Nhava Sheva (INNSA), India";

export const SAMPLE_SHIPMENTS: SampleShipment[] = [
  {
    // Added: an earlier shipment, already approved and exported, for the history.
    code: "SHP-24810",
    origin: "added",
    supplier: { name: "Company C", country: "Sweden" },
    seller: { name: "Company C", lines: ["Industrivägen 12", "421 31 Västra Frölunda, Sweden"] },
    buyer: { name: "Deccan Flow Controls Pvt. Ltd.", lines: ["Chakan MIDC Phase II", "Pune, Maharashtra, India"] },
    numberStyle: "eu",
    invoice: {
      number: "C-90388",
      date: "2026-10-02",
      currency: "EUR",
      incoterm: "CIF",
      incotermPlace: "Nhava Sheva",
      lines: [{ description: "Stainless steel gate valve DN80, PN16", hsn: "84818030", quantity: 60, unit: "PCS", unitPrice: 118.4 }],
      packages: 6,
      grossKg: 940,
      netKg: 860,
    },
    packingList: { packages: 6, grossKg: 940, netKg: 860, containers: ["SEGU4018732"] },
    billOfLading: {
      number: "SEGOT26NS1187",
      vessel: "MSC ARINA / 641E",
      portOfLoading: "Gothenburg (SEGOT), Sweden",
      portOfDischarge: NHAVA_SHEVA,
      packages: 6,
      grossKg: 940,
      containers: ["SEGU4018732"],
    },
    reviewed: true,
    exported: true,
  },
  {
    // From the brief: invoice says 3,120 kg, packing list says 3,165 kg.
    code: "SHP-24811",
    origin: "brief",
    supplier: { name: "Company B", country: "China" },
    seller: { name: "Company B", lines: ["No. 88 Jiangnan Road, Beilun District", "Ningbo, Zhejiang, China"] },
    buyer: { name: "Sahyadri Lighting Pvt. Ltd.", lines: ["Bhosari Industrial Area", "Pune, Maharashtra, India"] },
    numberStyle: "en",
    invoice: {
      number: "CB-2410-0873",
      date: "2026-10-14",
      currency: "USD",
      incoterm: "FOB",
      incotermPlace: "Ningbo",
      lines: [{ description: "LED panel light 40W, 600x600 mm", hsn: "94054290", quantity: 2400, unit: "PCS", unitPrice: 6.8 }],
      packages: 120,
      grossKg: 3120,
      netKg: 2880,
    },
    packingList: { packages: 120, grossKg: 3165, netKg: 2880, containers: ["MSKU7182345"] },
    billOfLading: {
      number: "MAEU263114587",
      vessel: "MAERSK KENSINGTON / 243W",
      portOfLoading: "Ningbo (CNNGB), China",
      portOfDischarge: NHAVA_SHEVA,
      packages: 120,
      grossKg: 3165,
      containers: ["MSKU7182345"],
    },
    extraction: {
      // The model misread one digit of the container number on the B/L.
      misreads: [{ doc: "BILL_OF_LADING", key: "container.1", value: "MSKU7182845", confidence: 0.58 }],
      lowConfidence: [{ doc: "INVOICE", key: "line.1.hsn", confidence: 0.71 }],
    },
  },
  {
    // From the brief: only the invoice has arrived. European number format.
    code: "SHP-24812",
    origin: "brief",
    supplier: { name: "Company C", country: "Sweden" },
    seller: { name: "Company C", lines: ["Industrivägen 12", "421 31 Västra Frölunda, Sweden"] },
    buyer: { name: "Deccan Flow Controls Pvt. Ltd.", lines: ["Chakan MIDC Phase II", "Pune, Maharashtra, India"] },
    numberStyle: "eu",
    invoice: {
      number: "C-90417",
      date: "2026-10-21",
      currency: "EUR",
      incoterm: "CIF",
      incotermPlace: "Nhava Sheva",
      lines: [{ description: "Steel ball valve DN50, PN40, flanged", hsn: "84818030", quantity: 180, unit: "PCS", unitPrice: 42.5 }],
      packages: 12,
      grossKg: 1460,
      netKg: 1310,
    },
    extraction: {
      lowConfidence: [{ doc: "INVOICE", key: "invoice_date", confidence: 0.64 }],
    },
  },
  {
    // Added: a clean shipment, already reviewed, waiting for the manager.
    code: "SHP-24813",
    origin: "added",
    supplier: { name: "Company D", country: "Japan" },
    seller: { name: "Company D", lines: ["3-14 Minatojima-nakamachi, Chuo-ku", "Kobe, Hyogo, Japan"] },
    buyer: { name: "Konkan Auto Components Pvt. Ltd.", lines: ["Taloja MIDC", "Navi Mumbai, Maharashtra, India"] },
    numberStyle: "en",
    invoice: {
      number: "KD-26-11042",
      date: "2026-10-09",
      currency: "USD",
      incoterm: "CIF",
      incotermPlace: "Nhava Sheva",
      lines: [
        { description: "Deep groove ball bearing 6205-2RS", hsn: "84821011", quantity: 5000, unit: "PCS", unitPrice: 1.24 },
        { description: "Tapered roller bearing 30206", hsn: "84822011", quantity: 1200, unit: "PCS", unitPrice: 4.15 },
      ],
      packages: 64,
      grossKg: 2210,
      netKg: 2015,
    },
    packingList: { packages: 64, grossKg: 2210, netKg: 2015, containers: ["ONEU1127640"] },
    billOfLading: {
      number: "ONEYUKBF2093301",
      vessel: "ONE COMMITMENT / 078W",
      portOfLoading: "Kobe (JPUKB), Japan",
      portOfDischarge: NHAVA_SHEVA,
      packages: 64,
      grossKg: 2210,
      containers: ["ONEU1127640"],
    },
    reviewed: true,
  },
  {
    // Added: the bill of lading is an unreadable scan, so it goes to manual entry.
    code: "SHP-24814",
    origin: "added",
    supplier: { name: "Company E", country: "Vietnam" },
    seller: { name: "Company E", lines: ["Lot C3, Tan Thuan Export Processing Zone", "Ho Chi Minh City, Vietnam"] },
    buyer: { name: "Malabar Home Textiles Pvt. Ltd.", lines: ["Kakkanad", "Kochi, Kerala, India"] },
    numberStyle: "en",
    invoice: {
      number: "E-INV-55120",
      date: "2026-10-27",
      currency: "USD",
      incoterm: "FOB",
      incotermPlace: "Ho Chi Minh City",
      lines: [
        { description: "Polyester knitted fabric, 150 gsm", hsn: "60063200", quantity: 8400, unit: "MTR", unitPrice: 1.85 },
      ],
      packages: 42,
      grossKg: 2560,
      netKg: 2390,
    },
    packingList: { packages: 42, grossKg: 2560, netKg: 2390, containers: ["TCLU9283050"] },
    billOfLading: {
      number: "VNSGN26CL04471",
      vessel: "WAN HAI 305 / N112",
      portOfLoading: "Ho Chi Minh City (VNSGN), Vietnam",
      portOfDischarge: NHAVA_SHEVA,
      packages: 42,
      grossKg: 2560,
      containers: ["TCLU9283050"],
      poorScan: true,
    },
  },
];
