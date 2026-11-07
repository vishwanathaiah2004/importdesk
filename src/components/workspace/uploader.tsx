"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPT_ATTR, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/documents/file-type";
import { DOC_LABEL, type DocType } from "@/lib/fields";

type Phase = { kind: "idle" } | { kind: "uploading"; name: string; progress: number } | { kind: "error"; message: string };

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function upload(url: string, form: FormData, onProgress: (p: number) => void) {
  // XHR rather than fetch, because fetch cannot report upload progress.
  return new Promise<{ documentId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string; documentId?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.documentId) resolve({ documentId: body.documentId });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.send(form);
  });
}

export function Uploader({
  shipmentId,
  type,
  compact = false,
  onUploaded,
  onCancel,
}: {
  shipmentId: string;
  type: DocType;
  compact?: boolean;
  onUploaded?: (documentId: string) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    if (file.type && !ACCEPTED.includes(file.type)) {
      return setPhase({ kind: "error", message: "Upload a PDF, PNG, JPG or WebP file." });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return setPhase({ kind: "error", message: `That file is ${formatBytes(file.size)}. The limit is 4 MB.` });
    }
    setPhase({ kind: "uploading", name: file.name, progress: 0 });
    const form = new FormData();
    form.set("type", type);
    form.set("file", file);
    try {
      const { documentId } = await upload(`/api/shipments/${shipmentId}/documents`, form, (progress) =>
        setPhase({ kind: "uploading", name: file.name, progress }),
      );
      await onUploaded?.(documentId);
      setPhase({ kind: "idle" });
      router.refresh();
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const busy = phase.kind === "uploading";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) handle(e.dataTransfer.files[0]);
      }}
      className={`flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed text-center transition-colors ${
        compact ? "px-4 py-6" : "h-full min-h-[320px] px-6 py-10"
      } ${dragging ? "border-focus bg-[#eef2fb]" : "border-line-strong bg-surface"}`}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        aria-label={`Upload ${DOC_LABEL[type].toLowerCase()}`}
        onChange={(e) => handle(e.target.files?.[0])}
        disabled={busy}
      />

      {phase.kind === "uploading" ? (
        <div className="w-full max-w-xs" aria-live="polite">
          <p className="truncate text-sm font-medium">{phase.name}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.max(phase.progress * 100, 4)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{phase.progress < 1 ? "Uploading…" : "Saving…"}</p>
        </div>
      ) : (
        <>
          {!compact && (
            <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden className="mb-3 text-muted">
              <path d="M18 23V9m0 0-5 5m5-5 5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 22v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          )}
          <p className="text-sm font-medium">
            {compact ? "Drop the new file here or " : `Drop the ${DOC_LABEL[type].toLowerCase()} here or `}
            <button type="button" onClick={() => input.current?.click()} className="text-focus underline underline-offset-2 hover:text-brand">
              browse
            </button>
          </p>
          <p className="mt-1 text-xs text-muted">PDF, scan or photo · up to 4 MB</p>
          {phase.kind === "error" && (
            <p role="alert" className="mt-3 rounded-md border border-fail-line bg-fail-soft px-3 py-1.5 text-[13px] text-fail">
              {phase.message}
            </p>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="mt-3 text-xs text-muted hover:text-ink">
              Cancel
            </button>
          )}
        </>
      )}
    </div>
  );
}
