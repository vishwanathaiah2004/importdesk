import Link from "next/link";
import { Dot, type Tone } from "@/components/ui/badge";
import { DOC_LABEL, DOC_SHORT, DOC_TYPES, type DocType } from "@/lib/fields";

export type TabState = { status: string | null; toReview: number };

function tone(state: TabState): Tone {
  if (!state.status) return "neutral";
  if (state.status === "FAILED") return "fail";
  if (state.toReview > 0 || state.status === "UNREADABLE") return "review";
  if (state.status === "DONE") return "ok";
  return "brand";
}

function caption(state: TabState) {
  if (!state.status) return "Not uploaded";
  if (state.status === "QUEUED" || state.status === "EXTRACTING") return "Extracting…";
  if (state.status === "FAILED") return "Extraction failed";
  if (state.toReview > 0) return `${state.toReview} to check`;
  if (state.status === "UNREADABLE") return "Manual entry";
  return "Clear";
}

export function DocTabs({
  shipmentId,
  active,
  states,
}: {
  shipmentId: string;
  active: DocType;
  states: Record<DocType, TabState>;
}) {
  return (
    <nav aria-label="Documents" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-sunken p-1">
      {DOC_TYPES.map((type) => {
        const state = states[type];
        const isActive = type === active;
        return (
          <Link
            key={type}
            href={`/shipments/${shipmentId}?doc=${type}`}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            title={DOC_LABEL[type]}
            className={`flex min-w-[132px] flex-1 flex-col rounded-md px-3 py-1.5 transition-colors ${
              isActive ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "hover:bg-surface/60"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              <Dot tone={tone(state)} />
              {DOC_SHORT[type]}
            </span>
            <span className="text-xs text-muted">{caption(state)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
