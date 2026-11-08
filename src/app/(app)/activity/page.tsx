import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/input";
import { ACTION_FILTERS, listActivity, type ActionFilter } from "@/lib/activity";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const user = await requireUser();
  if (!can(user.role, "audit:view")) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState title="Managers only" body="The full audit log is visible to the documentation manager." />
      </main>
    );
  }

  const params = await searchParams;
  const filter: ActionFilter = typeof params.type === "string" && params.type in ACTION_FILTERS ? (params.type as ActionFilter) : "all";
  const code = typeof params.shipment === "string" ? params.shipment.trim().toUpperCase().slice(0, 20) : "";
  const shipment = code ? await db.shipment.findUnique({ where: { code }, select: { id: true } }) : null;
  const rows = code && !shipment ? [] : await listActivity({ shipmentId: shipment?.id, filter, take: 200 });

  const href = (type: string) => {
    const p = new URLSearchParams();
    if (type !== "all") p.set("type", type);
    if (code) p.set("shipment", code);
    const s = p.toString();
    return s ? `/activity?${s}` : "/activity";
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-1 text-sm text-muted">Every upload, extraction, correction, approval and export, newest first.</p>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Filter by type" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {(Object.keys(ACTION_FILTERS) as ActionFilter[]).map((k) => (
            <Link
              key={k}
              href={href(k)}
              aria-current={filter === k ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap ${filter === k ? "bg-ink text-white" : "text-ink-soft hover:bg-sunken"}`}
            >
              {ACTION_FILTERS[k].label}
            </Link>
          ))}
        </nav>
        <form action="/activity" className="flex gap-2 md:w-72">
          {filter !== "all" && <input type="hidden" name="type" value={filter} />}
          <input name="shipment" defaultValue={code} placeholder="Shipment, e.g. SHP-24811" aria-label="Filter by shipment" className={`${inputClass} font-mono`} />
          <button type="submit" className={buttonClass("secondary")}>
            Filter
          </button>
        </form>
      </div>

      <section className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {rows.length ? (
          <ActivityList rows={rows} showShipment={!shipment} />
        ) : (
          <EmptyState title={code && !shipment ? `No shipment ${code}` : "No activity yet"} body="Actions appear here as soon as someone works on a shipment." />
        )}
      </section>
    </main>
  );
}
