import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="mb-4 text-line-strong">
        <rect x="8" y="5" width="24" height="30" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 14h12M14 19h12M14 24h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
