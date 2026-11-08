import type { ComponentProps } from "react";

export const inputClass =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:bg-sunken";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return <label className={`mb-1.5 block text-[13px] font-medium text-ink-soft ${className}`} {...props} />;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-fail-line bg-fail-soft px-3 py-2 text-[13px] text-fail">
      {message}
    </p>
  );
}
