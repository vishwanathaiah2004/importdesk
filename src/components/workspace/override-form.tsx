"use client";

import { useState, useTransition } from "react";
import { overrideCheck } from "@/app/(app)/shipments/[id]/decisions";
import { Button } from "@/components/ui/button";

/** Manager only: accept a genuine difference between documents, with a reason on record. */
export function OverrideForm({ checkId }: { checkId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-xs font-medium text-review hover:underline">
        Accept this difference…
      </button>
    );
  }

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await overrideCheck(checkId, note);
          if ("error" in r) setError(r.error);
          else setOpen(false);
        });
      }}
    >
      <label className="block text-xs text-ink-soft" htmlFor={`note-${checkId}`}>
        Why is this difference acceptable? This is recorded with your name.
      </label>
      <textarea
        id={`note-${checkId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. Supplier confirmed 3,165 kg by email; amended invoice requested."
        className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
      />
      {error && <p className="text-xs text-fail">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Accept with this note"}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => (setOpen(false), setError(null))}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
