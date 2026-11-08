"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveShipment } from "../decisions";

export function ApproveButton({ shipmentId, version, disabled }: { shipmentId: string; version: number; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        className="w-full"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const r = await approveShipment(shipmentId, version);
            setError("error" in r ? r.error : null);
          })
        }
      >
        {pending ? "Approving…" : "Approve for export"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-fail">
          {error}
        </p>
      )}
    </div>
  );
}

export function ExportButton({ shipmentId, disabled }: { shipmentId: string; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/export`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Export failed.");
      // Download the file that was just stored.
      const a = document.createElement("a");
      a.href = `/api/exports/${body.exportId}`;
      a.download = body.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button className="w-full" disabled={disabled || busy} onClick={run}>
        {busy ? "Exporting…" : "Export CSV for filing"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-fail">
          {error}
        </p>
      )}
    </div>
  );
}
