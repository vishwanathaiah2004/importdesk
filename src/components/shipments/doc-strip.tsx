import { DOC_LABEL, DOC_SHORT, type DocType } from "@/lib/fields";

const STATE: Record<string, { cls: string; label: string }> = {
  MISSING: { cls: "border border-dashed border-line-strong bg-transparent", label: "not uploaded" },
  QUEUED: { cls: "bg-brand/40 animate-pulse", label: "queued" },
  EXTRACTING: { cls: "bg-brand/60 animate-pulse", label: "extracting" },
  DONE: { cls: "bg-ink-soft", label: "extracted" },
  FAILED: { cls: "bg-fail", label: "extraction failed" },
  UNREADABLE: { cls: "bg-review", label: "unreadable — manual entry" },
};

/** Three small markers: which of the invoice, packing list and B/L are in, and in what state. */
export function DocStrip({ documents }: { documents: { type: DocType; status: string | null }[] }) {
  return (
    <div className="flex items-center gap-2.5">
      {documents.map((d) => {
        const state = STATE[d.status ?? "MISSING"] ?? STATE.MISSING;
        return (
          <span
            key={d.type}
            title={`${DOC_LABEL[d.type]}: ${state.label}`}
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${d.status ? "text-ink-soft" : "text-muted"}`}
          >
            <span aria-hidden className={`inline-block size-2 rounded-full ${state.cls}`} />
            {DOC_SHORT[d.type]}
            <span className="sr-only">: {state.label}</span>
          </span>
        );
      })}
    </div>
  );
}
