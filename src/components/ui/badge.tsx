import type { ReactNode } from "react";

export type Tone = "neutral" | "review" | "fail" | "ok" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-soft border-line",
  review: "bg-review-soft text-review border-review-line",
  fail: "bg-fail-soft text-fail border-fail-line",
  ok: "bg-ok-soft text-ok border-ok-line",
  brand: "bg-[#eef1f8] text-brand border-[#d5dcee]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-line-strong",
    review: "bg-review",
    fail: "bg-fail",
    ok: "bg-ok",
    brand: "bg-brand",
  };
  return <span aria-hidden className={`inline-block size-1.5 rounded-full ${colors[tone]}`} />;
}
