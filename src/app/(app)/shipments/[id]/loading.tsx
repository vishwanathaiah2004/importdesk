export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 pt-5 pb-16 sm:px-6" aria-busy="true" aria-label="Loading shipment">
      <div className="h-4 w-20 animate-pulse rounded bg-line/70" />
      <div className="mt-3 h-6 w-48 animate-pulse rounded bg-line" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-line/70" />
      <div className="mt-5 h-[54px] animate-pulse rounded-lg border border-line bg-sunken" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
        <div className="h-[62vh] animate-pulse rounded-[var(--radius-card)] border border-line bg-[#e9e8e4] lg:h-[calc(100vh-88px)]" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
          ))}
        </div>
      </div>
    </main>
  );
}
