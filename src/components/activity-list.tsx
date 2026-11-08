import Link from "next/link";
import type { ActivityRow } from "@/lib/activity";
import { describeAudit } from "@/lib/audit-text";
import { formatDateTime } from "@/lib/format";

const DOT: Record<string, string> = {
  "field.corrected": "bg-review",
  "field.entered": "bg-review",
  "check.overridden": "bg-review",
  "approval.withdrawn": "bg-review",
  "document.extraction_failed": "bg-fail",
  "shipment.approved": "bg-ok",
  "shipment.exported": "bg-ok",
};

export function ActivityList({ rows, showShipment = false }: { rows: ActivityRow[]; showShipment?: boolean }) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3 px-4 py-2.5">
          <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT[r.action] ?? "bg-line-strong"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug break-words">
              <span className="font-medium">{r.user.name}</span> {describeAudit(r.action, r.metadata)}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDateTime(r.createdAt)}
              {r.user.role === "MANAGER" && " · manager"}
              {showShipment && r.shipment && (
                <>
                  {" · "}
                  <Link href={`/shipments/${r.shipment.id}`} className="font-mono text-ink-soft hover:text-ink hover:underline">
                    {r.shipment.code}
                  </Link>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
