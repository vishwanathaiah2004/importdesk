import Link from "next/link";
import type { ReactNode } from "react";
import type { RuleId } from "@/lib/checks/engine";
import type { StoredCheckDetails } from "@/lib/checks/persist";
import { DOC_SHORT, type DocType } from "@/lib/fields";
import { formatDecimal } from "@/lib/format";

export type CheckRow = {
  id: string;
  rule: RuleId;
  result: "PASS" | "FAIL" | "NOT_CHECKED";
  details: StoredCheckDetails;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  resolvedBy: { name: string } | null;
};

function Icon({ kind }: { kind: "pass" | "fail" | "open" | "accepted" | "info" }) {
  const styles = {
    pass: "bg-ok-soft text-ok border-ok-line",
    fail: "bg-fail-soft text-fail border-fail-line",
    accepted: "bg-review-soft text-review border-review-line",
    open: "bg-surface text-muted border-line-strong border-dashed",
    info: "bg-surface text-muted border-line",
  }[kind];
  const glyph = { pass: "✓", fail: "✕", accepted: "!", open: "", info: "–" }[kind];
  return (
    <span aria-hidden className={`mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${styles}`}>
      {glyph}
    </span>
  );
}

function valueText(v: StoredCheckDetails["values"][number]) {
  if (v.value == null) return "—";
  const looksNumeric = /^-?\d+(\.\d+)?$/.test(v.value);
  const shown = looksNumeric ? formatDecimal(v.value) : v.value;
  return `${v.unit && v.unit !== "kg" ? `${v.unit} ` : ""}${shown}${v.unit === "kg" ? " kg" : ""}`;
}

/** Shipment-level checks across the three documents. Failures link to the fields involved. */
export function CrossChecks({ shipmentId, checks, actions }: { shipmentId: string; checks: CheckRow[]; actions?: (c: CheckRow) => ReactNode }) {
  const failed = checks.filter((c) => c.result === "FAIL" && !c.resolvedAt).length;
  const open = checks.filter((c) => c.result === "NOT_CHECKED" && c.details.blocking).length;
  const passed = checks.filter((c) => c.result === "PASS").length;
  // Failures, overrides and checks still waiting stay in view; passes fold away.
  const attention = checks.filter((c) => c.result === "FAIL" || (c.result === "NOT_CHECKED" && c.details.blocking));
  const quiet = checks.filter((c) => !attention.includes(c));

  const row = (c: CheckRow) => {
    const accepted = c.result === "FAIL" && !!c.resolvedAt;
    const kind = c.result === "PASS" ? "pass" : accepted ? "accepted" : c.result === "FAIL" ? "fail" : c.details.blocking ? "open" : "info";
    const expanded = c.result === "FAIL";
    return (
      <li key={c.id} className={`flex gap-3 px-4 py-2.5 ${c.result === "FAIL" && !accepted ? "bg-fail-soft/40" : ""}`}>
        <Icon kind={kind} />
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-medium ${kind === "info" ? "text-muted" : ""}`}>{c.details.label}</p>
          <p className={`text-xs leading-relaxed ${c.result === "FAIL" && !accepted ? "text-fail" : "text-muted"}`}>{c.details.message}</p>
          {expanded && c.details.values.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.details.values.map((v, i) => {
                const chip = (
                  <>
                    <span className="text-muted">{v.source === "computed" ? v.label : DOC_SHORT[v.source as DocType]}</span>{" "}
                    <span className="tabular font-mono font-medium text-ink">{valueText(v)}</span>
                  </>
                );
                const field = c.details.fields.find((f) => f.doc === v.source);
                return v.source !== "computed" && field ? (
                  <Link
                    key={i}
                    href={`/shipments/${shipmentId}?doc=${v.source}#f-${field.key}`}
                    scroll={false}
                    className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs hover:border-line-strong"
                  >
                    {chip}
                  </Link>
                ) : (
                  <span key={i} className="rounded border border-line bg-sunken px-1.5 py-0.5 text-xs">
                    {chip}
                  </span>
                );
              })}
            </div>
          )}
          {accepted && (
            <p className="mt-1.5 rounded border border-review-line bg-review-soft px-2 py-1 text-xs text-ink-soft">
              <span className="font-medium text-review">Accepted by {c.resolvedBy?.name ?? "manager"}:</span> {c.resolutionNote}
            </p>
          )}
          {actions?.(c)}
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="checks-title" className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="checks-title" className="text-sm font-semibold">
          Cross-checks
        </h2>
        <p className="text-xs text-muted">
          {failed > 0 && <span className="font-medium text-fail">{failed} mismatch{failed === 1 ? "" : "es"} · </span>}
          {open > 0 && <span>{open} waiting · </span>}
          <span>
            {passed} of {checks.length} passed
          </span>
        </p>
      </header>
      {attention.length > 0 && <ul className="divide-y divide-line">{attention.map(row)}</ul>}
      {quiet.length > 0 && (
        <details className={`group ${attention.length ? "border-t border-line" : ""}`} open={attention.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs text-muted hover:text-ink">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>
            {quiet.filter((c) => c.result === "PASS").length} passed
            {quiet.some((c) => c.result !== "PASS") && ", others not applicable"}
          </summary>
          <ul className="divide-y divide-line border-t border-line">{quiet.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
