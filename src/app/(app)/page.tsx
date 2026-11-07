import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/input";
import { DocStrip } from "@/components/shipments/doc-strip";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { formatRelative } from "@/lib/format";
import { listShipments, shipmentCounts, type ShipmentRow } from "@/lib/shipments/queries";
import { STATUS_FILTERS, STATUS_META, type ShipmentStatus } from "@/lib/shipments/status";

export const metadata: Metadata = { title: "Shipments" };

const VALID = new Set(Object.keys(STATUS_META));

function hrefFor(status: string, q: string) {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `/?${s}` : "/";
}

export default async function ShipmentsPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const params = await searchParams;
  const rawStatus = typeof params.status === "string" ? params.status : "ALL";
  const status = VALID.has(rawStatus) ? (rawStatus as ShipmentStatus) : undefined;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";

  const [{ counts, total }, rows] = await Promise.all([shipmentCounts(), listShipments({ status, q })]);

  const tiles: { status: ShipmentStatus; hint: string }[] = [
    { status: "NEEDS_REVIEW", hint: "fields or checks need a person" },
    { status: "READY_FOR_APPROVAL", hint: "waiting for the manager" },
    { status: "APPROVED", hint: "ready to export" },
    { status: "EXPORTED", hint: "sent to filing software" },
  ];

  return (
    <main className="mx-auto max-w-[1440px] px-4 pt-8 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
          <p className="mt-1 text-sm text-muted">
            {total} shipment{total === 1 ? "" : "s"} · invoice, packing list and bill of lading checked against each other
          </p>
        </div>
        {can(user.role, "shipment:create") && <ButtonLink href="/shipments/new">New shipment</ButtonLink>}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const meta = STATUS_META[t.status];
          const active = status === t.status;
          return (
            <Link
              key={t.status}
              href={hrefFor(active ? "ALL" : t.status, q)}
              className={`rounded-[var(--radius-card)] border bg-surface px-4 py-3.5 transition-colors hover:border-line-strong ${
                active ? "border-brand ring-1 ring-brand" : "border-line"
              }`}
            >
              <p className="text-[13px] font-medium text-ink-soft">{meta.label}</p>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{counts[t.status] ?? 0}</p>
              <p className="mt-0.5 text-xs text-muted">{t.hint}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {STATUS_FILTERS.map((f) => {
            const active = (status ?? "ALL") === f.value;
            return (
              <Link
                key={f.value}
                href={hrefFor(f.value, q)}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap ${
                  active ? "bg-ink text-white" : "text-ink-soft hover:bg-sunken"
                }`}
              >
                {f.label}
                {f.value !== "ALL" && (
                  <span className={`tabular ml-1.5 ${active ? "text-white/70" : "text-muted"}`}>
                    {counts[f.value as ShipmentStatus] ?? 0}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <form action="/" className="flex gap-2 md:w-80">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search shipment or supplier"
            aria-label="Search shipments"
            className={inputClass}
          />
          <button type="submit" className={buttonClass("secondary")}>
            Search
          </button>
        </form>
      </div>

      <section className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {rows.length === 0 ? (
          total === 0 ? (
            <EmptyState
              title="No shipments yet"
              body="Create a shipment and upload its invoice, packing list and bill of lading."
              action={<ButtonLink href="/shipments/new">New shipment</ButtonLink>}
            />
          ) : (
            <EmptyState
              title="No shipments match"
              body="Try a different status or search term."
              action={
                <Link href="/" className={buttonClass("secondary", "sm")}>
                  Clear filters
                </Link>
              }
            />
          )
        ) : (
          <ShipmentTable rows={rows} />
        )}
      </section>
    </main>
  );
}

const GRID = "md:grid md:grid-cols-[minmax(110px,0.8fr)_minmax(150px,1.1fr)_minmax(170px,1.3fr)_190px_150px_150px_90px] md:items-center md:gap-4";

function ShipmentTable({ rows }: { rows: ShipmentRow[] }) {
  return (
    <div role="table" aria-label="Shipments">
      <div role="row" className={`hidden border-b border-line bg-sunken/60 px-5 py-2.5 text-xs font-medium text-muted ${GRID}`}>
        <span role="columnheader">Shipment</span>
        <span role="columnheader">Supplier</span>
        <span role="columnheader">Importer</span>
        <span role="columnheader">Documents</span>
        <span role="columnheader">Review</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="text-right">
          Updated
        </span>
      </div>
      {rows.map((row) => {
        const meta = STATUS_META[row.status];
        return (
          <Link
            key={row.id}
            href={`/shipments/${row.id}`}
            role="row"
            className={`block border-b border-line px-5 py-4 last:border-b-0 hover:bg-sunken/50 ${GRID}`}
          >
            <span role="cell" className="flex items-center justify-between md:block">
              <span className="font-mono text-[13px] font-medium">{row.code}</span>
              <span className="md:hidden">
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </span>
            </span>
            <span role="cell" className="mt-1 block truncate text-sm md:mt-0">
              {row.supplier ?? <span className="text-muted">—</span>}
              {row.country && <span className="text-muted"> · {row.country}</span>}
            </span>
            <span role="cell" className="block truncate text-sm text-ink-soft">
              {row.importer ?? <span className="text-muted">—</span>}
            </span>
            <span role="cell" className="mt-2.5 block md:mt-0">
              <DocStrip documents={row.documents} />
            </span>
            <span role="cell" className="mt-2 block text-[13px] md:mt-0">
              <ReviewSummary row={row} />
            </span>
            <span role="cell" className="hidden md:block">
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </span>
            <span role="cell" className="mt-1 block text-xs text-muted md:mt-0 md:text-right">
              {formatRelative(row.updatedAt)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ReviewSummary({ row }: { row: ShipmentRow }) {
  const parts: React.ReactNode[] = [];
  if (row.failedChecks > 0)
    parts.push(
      <span key="c" className="font-medium text-fail">
        {row.failedChecks} mismatch{row.failedChecks === 1 ? "" : "es"}
      </span>,
    );
  if (row.fieldsToReview > 0)
    parts.push(
      <span key="f" className="font-medium text-review">
        {row.fieldsToReview} field{row.fieldsToReview === 1 ? "" : "s"} to check
      </span>,
    );
  if (parts.length === 0) {
    const waiting = row.documents.some((d) => !d.status);
    return <span className="text-muted">{waiting ? "Waiting for documents" : "All clear"}</span>;
  }
  return <span className="flex flex-wrap gap-x-2">{parts}</span>;
}
