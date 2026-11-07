import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CrossChecks } from "@/components/workspace/cross-checks";
import { DocTabs, type TabState } from "@/components/workspace/doc-tabs";
import { DocumentCard } from "@/components/workspace/document-card";
import { DocumentViewer } from "@/components/workspace/document-viewer";
import { ExtractionPanel } from "@/components/workspace/extraction-panel";
import { FieldsPanel } from "@/components/workspace/fields-panel";
import { OverrideForm } from "@/components/workspace/override-form";
import { Uploader } from "@/components/workspace/uploader";
import { listActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { DOC_LABEL, DOC_TYPES, type DocType } from "@/lib/fields";
import { needsPerson } from "@/lib/review";
import { STATUS_META } from "@/lib/shipments/status";
import { getWorkspace } from "@/lib/shipments/workspace";

export async function generateMetadata({ params }: PageProps<"/shipments/[id]">): Promise<Metadata> {
  const ws = await getWorkspace((await params).id);
  return { title: ws?.code ?? "Shipment" };
}

export default async function ShipmentPage({ params, searchParams }: PageProps<"/shipments/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const ws = await getWorkspace(id);
  if (!ws) notFound();
  const activity = await listActivity({ shipmentId: ws.id, take: 30 });

  const states = Object.fromEntries(
    DOC_TYPES.map((t) => {
      const doc = ws.documents[t];
      const toReview = doc?.fields.filter((f) => needsPerson(f, ws.failedFields.has(`${t}:${f.key}`))).length ?? 0;
      return [t, { status: doc?.status ?? null, toReview }];
    }),
  ) as Record<DocType, TabState>;

  const requested = (await searchParams).doc;
  const active: DocType =
    typeof requested === "string" && DOC_TYPES.includes(requested as DocType)
      ? (requested as DocType)
      : (DOC_TYPES.find((t) => states[t].toReview > 0) ?? "INVOICE");

  const doc = ws.documents[active];
  const locked = ws.status === "EXPORTED";
  const meta = STATUS_META[ws.status];

  return (
    <main className="mx-auto max-w-[1440px] px-4 pt-5 pb-16 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-[13px] text-muted hover:text-ink">
            ← Shipments
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{ws.code}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {ws.supplier ? `${ws.supplier.name} · ${ws.supplier.country}` : "Supplier not set"} · created by {ws.createdBy.name}
          </p>
        </div>
        <ExportLink id={ws.id} status={ws.status} isManager={can(user.role, "shipment:approve")} />
      </div>

      <div className="mt-5">
        <DocTabs shipmentId={ws.id} active={active} states={states} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
        <div className="h-[62vh] lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)]">
          {doc ? (
            <DocumentViewer doc={doc} />
          ) : locked || !can(user.role, "document:upload") ? (
            <div className="flex h-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong text-sm text-muted">
              No {DOC_LABEL[active].toLowerCase()} was uploaded.
            </div>
          ) : (
            <Uploader shipmentId={ws.id} type={active} />
          )}
        </div>

        <div className="space-y-4">
          <CrossChecks
            shipmentId={ws.id}
            checks={ws.checks}
            actions={(c) =>
              c.result === "FAIL" && !c.resolvedAt && !locked && can(user.role, "check:override") ? <OverrideForm checkId={c.id} /> : null
            }
          />
          {doc ? (
            <>
              <ExtractionPanel
                key={`${doc.id}-${doc.status}`}
                documentId={doc.id}
                status={doc.status}
                error={doc.error}
                modelName={doc.modelName}
                extractedAt={doc.extractedAt}
                fieldCount={doc.fields.length}
                canExtract={!locked && can(user.role, "document:extract")}
              />
              {(doc.status === "DONE" || doc.status === "UNREADABLE") && (
                <FieldsPanel
                  key={doc.id}
                  documentId={doc.id}
                  docType={active}
                  fields={doc.fields}
                  failedKeys={[...ws.failedFields].filter((k) => k.startsWith(`${active}:`)).map((k) => k.slice(active.length + 1))}
                  editable={!locked && can(user.role, "field:review")}
                />
              )}
              <DocumentCard shipmentId={ws.id} doc={doc} locked={locked} />
            </>
          ) : (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-4 text-sm">
              <p className="font-medium">{DOC_LABEL[active]} not uploaded yet</p>
              <p className="mt-1 text-muted">
                Cross-checks that need this document stay open, and the shipment cannot be exported until it arrives.
              </p>
            </section>
          )}
          {activity.length > 0 && (
            <details className="group rounded-[var(--radius-card)] border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
                <span>Activity</span>
                <span className="text-xs font-normal text-muted">
                  {activity.length} event{activity.length === 1 ? "" : "s"} <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <div className="border-t border-line">
                <ActivityList rows={activity} />
              </div>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}

/** The next step, worded for where the shipment is. */
function ExportLink({ id, status, isManager }: { id: string; status: string; isManager: boolean }) {
  const href = `/shipments/${id}/export`;
  if (status === "EXPORTED") return <ButtonLink href={href} variant="secondary">View export</ButtonLink>;
  if (status === "APPROVED") return <ButtonLink href={href}>Export CSV</ButtonLink>;
  if (status === "READY_FOR_APPROVAL")
    return <ButtonLink href={href} variant={isManager ? "primary" : "secondary"}>{isManager ? "Review and approve" : "Approval and export"}</ButtonLink>;
  return <ButtonLink href={href} variant="secondary">Approval and export</ButtonLink>;
}
