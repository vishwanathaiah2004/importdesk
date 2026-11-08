export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--color-brand)" />
        <path d="M6.5 7.5h9M6.5 11h5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <path d="m12.5 14.5 1.8 1.8 3.2-3.6" stroke="#9fd8b7" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">ImportDesk</span>}
    </span>
  );
}
