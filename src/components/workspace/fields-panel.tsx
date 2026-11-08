"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addRow, confirmField, correctField, removeRow, type ActionResult } from "@/app/(app)/shipments/[id]/actions";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";
import {
  CONTAINER_DEF,
  GROUP_LABEL,
  HAS_CONTAINERS,
  HEADER_FIELDS,
  LINE_ATTRS,
  fieldDef,
  parseKey,
  type DocType,
  type FieldDef,
  type FieldGroup,
} from "@/lib/fields";
import { displayValue, formatDateTime, percent } from "@/lib/format";
import { CONFIDENCE_THRESHOLD, reviewReasons } from "@/lib/review";
import type { WorkspaceField } from "@/lib/shipments/workspace";

type Props = {
  documentId: string;
  docType: DocType;
  fields: WorkspaceField[];
  failedKeys: string[];
  editable: boolean;
};

const PLACEHOLDER: Partial<Record<FieldDef["type"], string>> = {
  date: "2026-10-14 or 14/10/2026",
  weight: "e.g. 3165 or 3.165 MT",
  currency: "e.g. USD",
  incoterm: "e.g. FOB",
  hsn: "8 digits, e.g. 94054290",
  container: "e.g. MSKU7182345",
};

export function FieldsPanel({ documentId, docType, fields, failedKeys, editable }: Props) {
  const failed = new Set(failedKeys);
  const attention = fields.filter((f) => reviewReasons(f, failed.has(f.key)).length > 0);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const visible = (f: WorkspaceField) => !onlyAttention || attention.includes(f);

  // Header fields grouped as defined; then line items by row; then containers.
  const headerGroups = new Map<FieldGroup, { def: FieldDef; field: WorkspaceField }[]>();
  const lines = new Map<number, { def: FieldDef; field: WorkspaceField }[]>();
  const containers: { row: number; field: WorkspaceField }[] = [];
  for (const field of fields) {
    const key = parseKey(field.key);
    const def = fieldDef(docType, field.key);
    if (!def) continue;
    if (key.kind === "header") {
      if (!headerGroups.has(def.group)) headerGroups.set(def.group, []);
      headerGroups.get(def.group)!.push({ def, field });
    } else if (key.kind === "line") {
      if (!lines.has(key.row)) lines.set(key.row, []);
      lines.get(key.row)!.push({ def, field });
    } else {
      containers.push({ row: key.row, field });
    }
  }
  const groupOrder = [...new Set(HEADER_FIELDS[docType].map((d) => d.group))];

  return (
    <section aria-labelledby="fields-title" className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="fields-title" className="text-sm font-semibold">
          Extracted fields
          {attention.length > 0 ? (
            <span className="ml-2 font-normal text-review">{attention.length} need a person</span>
          ) : (
            <span className="ml-2 font-normal text-ok">all clear</span>
          )}
        </h2>
        <div role="group" aria-label="Show" className="flex rounded-md border border-line p-0.5 text-xs">
          {[
            { v: false, label: "All" },
            { v: true, label: `Needs a person (${attention.length})` },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={onlyAttention === o.v}
              onClick={() => setOnlyAttention(o.v)}
              className={`rounded px-2 py-1 ${onlyAttention === o.v ? "bg-ink text-white" : "text-ink-soft hover:bg-sunken"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </header>

      {onlyAttention && attention.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nothing on this document needs a person.</p>}

      {groupOrder.map((group) => {
        const rows = (headerGroups.get(group) ?? []).filter((r) => visible(r.field));
        if (!rows.length) return null;
        return (
          <div key={group}>
            <GroupHeading>{GROUP_LABEL[group]}</GroupHeading>
            {rows.map(({ def, field }) => (
              <FieldRow key={field.id} def={def} field={field} inFailedCheck={failed.has(field.key)} editable={editable} />
            ))}
          </div>
        );
      })}

      {LINE_ATTRS[docType].length > 0 && (!onlyAttention || [...lines.values()].some((cells) => cells.some((c) => visible(c.field)))) && (
        <div>
          <GroupHeading>{GROUP_LABEL.lines}</GroupHeading>
          {[...lines.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([row, cells]) => {
              const shown = cells.filter((c) => visible(c.field));
              if (!shown.length) return null;
              return (
                <div key={row} className="border-b border-line last:border-b-0">
                  <RowHeading label={`Line ${row}`} documentId={documentId} group="line" row={row} editable={editable} />
                  <div className="grid sm:grid-cols-2">
                    {shown.map(({ def, field }) => (
                      <FieldRow key={field.id} def={def} field={field} inFailedCheck={failed.has(field.key)} editable={editable} compact />
                    ))}
                  </div>
                </div>
              );
            })}
          {editable && !onlyAttention && <AddRow documentId={documentId} group="line" label="Add line item" />}
        </div>
      )}

      {HAS_CONTAINERS[docType] && (onlyAttention ? containers.some((c) => visible(c.field)) : containers.length > 0 || editable) && (
        <div>
          <GroupHeading>{GROUP_LABEL.containers}</GroupHeading>
          {containers
            .filter((c) => visible(c.field))
            .sort((a, b) => a.row - b.row)
            .map(({ row, field }) => (
              <FieldRow
                key={field.id}
                def={{ ...CONTAINER_DEF, label: `Container ${row}` }}
                field={field}
                inFailedCheck={failed.has(field.key)}
                editable={editable}
                onRemove={editable ? () => removeRow(documentId, "container", row) : undefined}
              />
            ))}
          {editable && !onlyAttention && <AddRow documentId={documentId} group="container" label="Add container" />}
        </div>
      )}
    </section>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="border-b border-line bg-sunken/60 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{children}</h3>;
}

function RowHeading({ label, documentId, group, row, editable }: { label: string; documentId: string; group: "line"; row: number; editable: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between px-4 pt-2.5">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {editable &&
        (confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted">Remove this line?</span>
            <button type="button" disabled={pending} className="font-medium text-fail hover:underline" onClick={() => start(async () => void (await removeRow(documentId, group, row)))}>
              {pending ? "Removing…" : "Remove"}
            </button>
            <button type="button" className="text-muted hover:text-ink" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="text-xs text-muted hover:text-fail" onClick={() => setConfirming(true)}>
            Remove line
          </button>
        ))}
    </div>
  );
}

function AddRow({ documentId, group, label }: { documentId: string; group: "line" | "container"; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="px-4 py-2.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await addRow(documentId, group);
            setError("error" in r ? r.error : null);
          })
        }
        className="text-[13px] font-medium text-focus hover:text-brand disabled:opacity-50"
      >
        {pending ? "Adding…" : `+ ${label}`}
      </button>
      {error && <p className="mt-1 text-xs text-fail">{error}</p>}
    </div>
  );
}

function FieldRow({
  def,
  field,
  inFailedCheck,
  editable,
  compact = false,
  onRemove,
}: {
  def: FieldDef;
  field: WorkspaceField;
  inFailedCheck: boolean;
  editable: boolean;
  compact?: boolean;
  onRemove?: () => Promise<ActionResult>;
}) {
  const reasons = reviewReasons(field, inFailedCheck);
  const needs = reasons.length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.valueRaw ?? field.valueNormalized ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showHistory, setShowHistory] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const missing = field.valueNormalized == null || field.valueNormalized === "";

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const seenAt = new Date(field.updatedAt).toISOString();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) setError(r.error);
      else {
        setError(null);
        after?.();
      }
    });

  const save = () => run(() => correctField(field.id, seenAt, draft), () => setEditing(false));

  const accent = !needs ? "border-l-transparent" : inFailedCheck ? "border-l-fail bg-fail-soft/40" : "border-l-review bg-review-soft/50";
  const latest = field.corrections[0];
  const cleared = field.status !== "PENDING";

  // Nothing to decide: one compact line. The source text is in the tooltip.
  if (!needs && !editing) {
    const by = field.confirmedBy ? ` by ${field.confirmedBy.name}` : "";
    const statusText = cleared
      ? `${field.status === "CONFIRMED" ? "Confirmed" : field.status === "CORRECTED" ? "Corrected" : "Entered"}${by}`
      : "Accepted: high confidence, no issues found";
    return (
      <div
        id={`f-${field.key}`}
        title={field.sourceSnippet ? `Source: “${field.sourceSnippet}”${field.sourcePage ? ` (page ${field.sourcePage})` : ""}` : undefined}
        className={`grid scroll-mt-24 items-center gap-x-3 border-b border-l-2 border-l-transparent border-b-line px-4 py-1.5 last:border-b-0 target:ring-2 target:ring-focus/40 target:ring-inset ${
          compact ? "grid-cols-[minmax(72px,96px)_1fr_auto]" : "grid-cols-[minmax(96px,136px)_1fr_auto]"
        }`}
      >
        <span className="truncate text-xs text-muted">{def.label}</span>
        <span className="min-w-0 text-[13px]">
          <span className={`tabular font-mono break-words ${missing ? "text-muted italic" : ""}`}>
            {missing ? "—" : displayValue(def.type, field.key, field.valueNormalized, field.unit)}
          </span>
          {field.status === "CORRECTED" && latest?.oldValue && (
            <span className="ml-2 text-xs text-muted">AI read {displayValue(def.type, field.key, latest.oldValue, field.unit)}</span>
          )}
          {field._count.corrections > 0 && (
            <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="ml-2 text-xs text-focus hover:underline">
              History
            </button>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span title={statusText} className={`tabular text-[11px] ${cleared ? "text-ok" : "text-muted"}`}>
            {cleared ? <span aria-label={statusText}>✓</span> : percent(field.confidence)}
          </span>
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                setDraft(field.valueNormalized ?? "");
                setEditing(true);
              }}
              aria-label={`Edit ${def.label}`}
            >
              Edit
            </Button>
          )}
          {onRemove && editable && (
            <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Remove ${def.label}`} onClick={() => run(onRemove)}>
              ✕
            </Button>
          )}
        </span>
        {error && (
          <p role="alert" className="col-span-3 mt-1 text-xs text-fail">
            {error}
          </p>
        )}
        {showHistory && (
          <div className="col-span-3">
            <History def={def} field={field} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div id={`f-${field.key}`} className={`scroll-mt-24 border-b border-l-2 border-b-line px-4 py-2.5 last:border-b-0 target:ring-2 target:ring-focus/40 target:ring-inset ${accent}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted">
          {def.label}
          {def.required && <span className="sr-only"> (required)</span>}
        </span>
        {field.confidence != null && field.status === "PENDING" && (
          <span
            title="Confidence reported by the AI model"
            className={`tabular text-[11px] ${field.confidence < CONFIDENCE_THRESHOLD ? "font-medium text-review" : "text-muted"}`}
          >
            {percent(field.confidence)}
          </span>
        )}
      </div>

      {editing ? (
        <form
          className="mt-1 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setError(null);
              }
            }}
            placeholder={PLACEHOLDER[def.type]}
            aria-label={`New value for ${def.label}`}
            aria-invalid={!!error}
            className={`${inputClass} h-8 flex-1 font-mono text-[13px] ${compact ? "min-w-[120px]" : "min-w-[180px]"}`}
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => (setEditing(false), setError(null))}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span className={`tabular min-w-0 font-mono text-[13.5px] break-words ${missing ? "text-muted italic" : "text-ink"}`}>
            {missing ? "No value" : displayValue(def.type, field.key, field.valueNormalized, field.unit)}
          </span>
          {editable && (
            <span className="flex shrink-0 items-center gap-1">
              {needs && !missing && (
                <Button size="sm" disabled={pending} onClick={() => run(() => confirmField(field.id, seenAt))} aria-label={`Confirm ${def.label}`}>
                  {pending ? "…" : "Confirm"}
                </Button>
              )}
              <Button
                size="sm"
                variant={missing ? "primary" : "ghost"}
                onClick={() => {
                  setDraft(field.valueNormalized ?? "");
                  setEditing(true);
                }}
                aria-label={`${missing ? "Enter" : "Edit"} ${def.label}`}
              >
                {missing ? "Enter" : "Edit"}
              </Button>
              {onRemove && (
                <Button size="sm" variant="ghost" aria-label={`Remove ${def.label}`} onClick={() => run(onRemove)}>
                  ✕
                </Button>
              )}
            </span>
          )}
        </div>
      )}

      {field.sourceSnippet && !editing && (
        <p className="mt-1 truncate text-xs text-muted" title={field.sourceSnippet}>
          <span aria-hidden>“</span>
          {field.sourceSnippet}
          <span aria-hidden>”</span>
          {field.sourcePage && <span> · p.{field.sourcePage}</span>}
        </p>
      )}

      {needs && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {reasons.includes("failed_check") && <li className="font-medium text-fail">In a failed cross-check</li>}
          {reasons.includes("missing") && <li className="font-medium text-review">{field.flagReason ?? "Missing"}</li>}
          {reasons.includes("low_confidence") && <li className="font-medium text-review">Low confidence</li>}
          {reasons.includes("flagged") && !reasons.includes("missing") && <li className="text-review">{field.flagReason}</li>}
        </ul>
      )}

      {!needs && field.status !== "PENDING" && (
        <p className="mt-1 text-xs text-ok">
          ✓ {field.status === "CONFIRMED" ? "Confirmed" : field.status === "CORRECTED" ? "Corrected" : "Entered"}
          {field.confirmedBy && ` by ${field.confirmedBy.name}`}
          {field.status === "CORRECTED" && latest?.oldValue && (
            <span className="text-muted"> · AI read {displayValue(def.type, field.key, latest.oldValue, field.unit)}</span>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-fail">
          {error}
        </p>
      )}
    </div>
  );
}

/** Every change a person made to this value, newest first. Feeds the accuracy history. */
function History({ def, field }: { def: FieldDef; field: WorkspaceField }) {
  return (
    <ol className="mt-1.5 mb-1 space-y-1 rounded-md border border-line bg-sunken/60 px-3 py-2 text-xs">
      {field.corrections.map((c, i) => (
        <li key={i} className="flex flex-wrap gap-x-2">
          <span className="tabular font-mono">
            {c.oldValue == null ? "empty" : displayValue(def.type, field.key, c.oldValue, field.unit)} →{" "}
            {displayValue(def.type, field.key, c.newValue, field.unit) || "empty"}
          </span>
          <span className="text-muted">
            {c.user.name} · {formatDateTime(c.createdAt)}
          </span>
        </li>
      ))}
      {field._count.corrections > field.corrections.length && (
        <li className="text-muted">and {field._count.corrections - field.corrections.length} earlier changes</li>
      )}
    </ol>
  );
}
