export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 pt-8 pb-16 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 animate-pulse rounded bg-line" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-line/70" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-line px-5 py-5 last:border-b-0">
            <div className="h-4 w-24 animate-pulse rounded bg-line" />
            <div className="h-4 w-40 animate-pulse rounded bg-line/70" />
            <div className="hidden h-4 w-48 animate-pulse rounded bg-line/70 md:block" />
          </div>
        ))}
      </div>
    </main>
  );
}
