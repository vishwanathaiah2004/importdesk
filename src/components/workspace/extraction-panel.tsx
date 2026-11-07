"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enterManually } from "@/app/(app)/shipments/[id]/actions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

type Props = {
  documentId: string;
  status: "QUEUED" | "EXTRACTING" | "DONE" | "FAILED" | "UNREADABLE";
  error: string | null;
  modelName: string | null;
  extractedAt: Date | null;
  fieldCount: number;
  canExtract: boolean;
};

function Spinner() {
  return <span aria-hidden className="inline-block size-3.5 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />;
}

export function ExtractionPanel(p: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  async function extract() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${p.documentId}/extract`, { method: "POST" });
      if (res.status !== 409 && !res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "Extraction failed.");
      }
    } catch {
      setMessage("Network error. Check your connection and retry.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  // A freshly uploaded document starts extracting on its own.
  useEffect(() => {
    if (p.status === "QUEUED" && p.canExtract && !started.current) {
      started.current = true;
      void extract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status, p.canExtract]);

  // Another tab or person is extracting: check back every few seconds.
  useEffect(() => {
    if (p.status !== "EXTRACTING" || running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [p.status, running, router]);

  if (p.status === "QUEUED" || p.status === "EXTRACTING" || running) {
    return (
      <section aria-live="polite" className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Spinner /> Reading the document…
        </p>
        <p className="mt-1 text-[13px] text-muted">
          The AI model extracts each field with a confidence score and the text it read it from. This usually takes 10–30 seconds.
        </p>
      </section>
    );
  }

  if (p.status === "FAILED") {
    return (
      <section role="alert" className="rounded-[var(--radius-card)] border border-fail-line bg-fail-soft px-4 py-4">
        <p className="text-sm font-medium text-fail">Extraction failed</p>
        <p className="mt-1 text-[13px] text-ink-soft">{message ?? p.error ?? "The document could not be processed."}</p>
        {p.canExtract && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void extract()}>
              Retry extraction
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await enterManually(p.documentId);
                  if ("error" in r) setMessage(r.error);
                })
              }
            >
              {pending ? "Preparing…" : "Enter values manually"}
            </Button>
          </div>
        )}
      </section>
    );
  }

  if (p.status === "UNREADABLE") {
    return (
      <section className="rounded-[var(--radius-card)] border border-review-line bg-review-soft px-4 py-3.5">
        <p className="text-sm font-medium text-review">Manual entry</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{p.error ?? "This document could not be read. Fill in the fields below."}</p>
      </section>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-4 px-1 text-xs text-muted">
      <span>
        {p.fieldCount} fields read by {p.modelName ?? "AI"}
      </span>
      {p.extractedAt && <span>{formatDateTime(p.extractedAt)}</span>}
    </p>
  );
}
