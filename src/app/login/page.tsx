import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-7">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Shipment documents, extracted and cross-checked.</p>
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>

        {/* Shown deliberately: this is a demo build for reviewers with seeded, synthetic data. */}
        <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-soft">
          <p className="mb-1.5 font-medium text-ink">Demo accounts</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
            <dt className="text-muted">Executive</dt>
            <dd>executive@importdesk.demo</dd>
            <dt className="text-muted">Manager</dt>
            <dd>manager@importdesk.demo</dd>
            <dt className="text-muted">Password</dt>
            <dd>Demo@1234</dd>
          </dl>
        </div>
      </div>
    </main>
  );
}
