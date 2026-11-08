export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 pt-5 pb-16 sm:px-6" aria-busy="true" aria-label="Loading export">
      <div className="h-4 w-20 animate-pulse rounded bg-line/70" />
      <div className="mt-3 h-6 w-56 animate-pulse rounded bg-line" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
          <div className="h-40 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
        </div>
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
          <div className="h-32 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
        </div>
      </div>
    </main>
  );
}
