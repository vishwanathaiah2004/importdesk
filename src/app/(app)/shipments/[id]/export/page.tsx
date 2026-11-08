import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { EXPORT_HEADERS, buildRows } from "@/lib/export/csv";
import { evaluateGate, type Blocker } from "@/lib/export/gate";
import { loadForGate } from "@/lib/export/load";
import { formatDateTime } from "@/lib/format";
import { STATUS_META } from "@/lib/shipments/status";
import { ApproveButton, ExportButton } from "./export-controls";

export const metadata: Metadata = { title: "Approve and export" };

const KIND_LABEL: Record<Blocker["kind"], string> = {
  document: "Documents",
  field: "Fields",
  check: "Cross-checks",
  approval: "Approval",
};

export default async function ExportPage({ params }: PageProps<"/shipments/[id]/export">) {
  const user = await requireUser();
  const { id } = await params;
  const shipment = await db.shipment.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      exports: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, rowCount: true, createdAt: true, exportedBy: { select: { name: true } } } },
    },
  });
  if (!shipment) notFound();

  const { gate, source, version } = await loadForGate(db, id);
  const { blockers, readyForApproval, canExport } = evaluateGate(gate);
  const exported = gate.status === "EXPORTED";
  const rows = buildRows(source);
  const meta = STATUS_META[gate.status];
  const work = blockers.filter((b) => b.kind !== "approval");

  return (
    <main className="mx-auto max-w-[1440px] px-4 pt-5 pb-16 sm:px-6">
      <Link href={`/shipments/${id}`} className="text-[13px] text-muted hover:text-ink">
        ← {shipment.code}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Approve and export</h1>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        <span className="font-mono">{shipment.code}</span> goes to the filing software only when every document, field and cross-check is clear and the
        manager has approved it.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="ready-title" className="rounded-[var(--radius-card)] border border-line bg-surface">
            <h2 id="ready-title" className="border-b border-line px-4 py-3 text-sm font-semibold">
              Readiness
            </h2>
            {exported ? (
              <p className="px-4 py-4 text-sm text-ok">✓ Exported. This shipment is locked.</p>
            ) : work.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ok">✓ All three documents are in, every field that needed a person is cleared, and every cross-check passed or was accepted.</p>
            ) : (
              <ul className="divide-y divide-line">
                {work.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                    <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${b.kind === "check" ? "bg-fail" : "bg-review"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="text-xs text-muted">{KIND_LABEL[b.kind]} · </span>
                      {b.message}
                    </span>
                    <Link href={`/shipments/${id}${b.docType ? `?doc=${b.docType}` : ""}`} className="shrink-0 text-xs font-medium text-focus hover:underline">
                      Fix
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="preview-title" className="rounded-[var(--radius-card)] border border-line bg-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 id="preview-title" className="text-sm font-semibold">
                File preview
              </h2>
              <p className="text-xs text-muted">
                {rows.length} row{rows.length === 1 ? "" : "s"} · one per invoice line · layout set in <code className="font-mono">src/lib/export/csv.ts</code>
              </p>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-max min-w-full text-left text-xs">
                  <thead className="bg-sunken/60 text-muted">
                    <tr>
                      {EXPORT_HEADERS.map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-mono">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {EXPORT_HEADERS.map((h) => (
                          <td key={h} className="tabular px-3 py-2 whitespace-nowrap">
                            {r[h] || <span className="text-muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted">No invoice lines yet.</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">1. Manager approval</h2>
            {gate.approved || exported ? (
              <p className="mt-2 text-[13px] text-ok">
                ✓ Approved{shipment.approvedBy && ` by ${shipment.approvedBy.name}`}
                {shipment.approvedAt && <span className="text-muted"> · {formatDateTime(shipment.approvedAt)}</span>}
              </p>
            ) : can(user.role, "shipment:approve") ? (
              <div className="mt-3">
                <ApproveButton shipmentId={id} version={version} disabled={!readyForApproval} />
                <p className="mt-2 text-xs text-muted">
                  {readyForApproval ? "You approve the data exactly as shown. Any later change withdraws the approval." : "Clear the readiness items first."}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                {readyForApproval ? "Ready. Waiting for the documentation manager to approve." : "The manager can approve once the readiness items are clear."}
              </p>
            )}
          </section>

          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">2. Export</h2>
            {exported ? (
              <p className="mt-2 text-[13px] text-muted">Exported. Download the file again below.</p>
            ) : (
              <div className="mt-3">
                <ExportButton shipmentId={id} disabled={!canExport || !can(user.role, "shipment:export")} />
                <p className="mt-2 text-xs text-muted">
                  {canExport ? "Creates the file in the filing software's import layout and locks the shipment." : "Available after approval. The server checks every rule again."}
                </p>
              </div>
            )}
          </section>

          {shipment.exports.length > 0 && (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Export history</h2>
              <ul className="divide-y divide-line">
                {shipment.exports.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-mono text-[12.5px]">{e.fileName}</p>
                      <p className="text-muted">
                        {e.rowCount} row{e.rowCount === 1 ? "" : "s"} · {e.exportedBy.name} · {formatDateTime(e.createdAt)}
                      </p>
                    </div>
                    <a href={`/api/exports/${e.id}`} className="shrink-0 text-xs font-medium text-focus hover:underline">
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
