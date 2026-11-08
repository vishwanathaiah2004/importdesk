"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

// Shown when a page fails to load (for example, the database is unreachable).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 pt-24 text-center">
      <p className="text-sm font-semibold">Something went wrong loading this page</p>
      <p className="mt-2 text-sm text-muted">
        Nothing you saved was lost. Try again; if it keeps happening, the database or network may be down.
        {error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Back to shipments
        </ButtonLink>
      </div>
    </main>
  );
}
