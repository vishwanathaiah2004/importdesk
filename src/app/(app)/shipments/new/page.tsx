import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { NewShipmentForm } from "./new-shipment-form";

export const metadata: Metadata = { title: "New shipment" };

async function nextCode() {
  const latest = await db.shipment.findMany({ select: { code: true }, orderBy: { code: "desc" }, take: 50 });
  const max = latest.reduce((m, s) => Math.max(m, Number(/^SHP-(\d+)$/.exec(s.code)?.[1] ?? 0)), 24800);
  return `SHP-${String(max + 1).padStart(5, "0")}`;
}

export default async function NewShipmentPage() {
  await requireUser();
  const [code, suppliers] = await Promise.all([
    nextCode(),
    db.supplier.findMany({ select: { name: true, country: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-xl px-4 pt-8 pb-16 sm:px-6">
      <Link href="/" className="text-[13px] text-muted hover:text-ink">
        ← Shipments
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">New shipment</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Create the shipment, then upload its invoice, packing list and bill of lading.
      </p>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <NewShipmentForm suggestedCode={code} suppliers={suppliers} />
      </div>
    </main>
  );
}
