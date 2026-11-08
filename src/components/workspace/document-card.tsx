"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/documents/file-type";
import { DOC_LABEL } from "@/lib/fields";
import { formatDateTime } from "@/lib/format";
import type { WorkspaceDocument } from "@/lib/shipments/workspace";
import { Uploader } from "./uploader";

/** File details for the active document, with a guarded "replace" action. */
export function DocumentCard({
  shipmentId,
  doc,
  locked,
}: {
  shipmentId: string;
  doc: WorkspaceDocument;
  locked: boolean;
}) {
  const [replacing, setReplacing] = useState(false);

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{DOC_LABEL[doc.type]}</p>
          <p className="mt-0.5 truncate text-sm font-medium" title={doc.fileName}>
            {doc.fileName}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatBytes(doc.sizeBytes)} · uploaded {formatDateTime(doc.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <a href={`/api/documents/${doc.id}/file?download=1`} className="h-8 rounded-md px-2.5 text-[13px] leading-8 text-ink-soft hover:bg-sunken hover:text-ink">
            Download
          </a>
          {!locked && !replacing && (
            <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>
              Replace
            </Button>
          )}
        </div>
      </div>
      {replacing && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-[13px] text-review">
            Replacing the file discards its extracted fields and any review work on them.
          </p>
          <Uploader shipmentId={shipmentId} type={doc.type} compact onUploaded={() => setReplacing(false)} onCancel={() => setReplacing(false)} />
        </div>
      )}
    </section>
  );
}
