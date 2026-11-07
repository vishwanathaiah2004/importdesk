import type { WorkspaceDocument } from "@/lib/shipments/workspace";

/** The original document, shown beside the extracted fields. */
export function DocumentViewer({ doc }: { doc: WorkspaceDocument }) {
  const src = `/api/documents/${doc.id}/file`;
  return (
    <div className="h-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-[#e9e8e4]">
      {doc.mimeType === "application/pdf" ? (
        <iframe key={doc.id} src={`${src}#view=FitH&toolbar=1`} title={doc.fileName} className="h-full w-full" />
      ) : (
        <div className="h-full overflow-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; not for next/image */}
          <img src={src} alt={doc.fileName} className="mx-auto max-w-full shadow-sm" />
        </div>
      )}
    </div>
  );
}
