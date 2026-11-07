import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-8 text-sm font-semibold">Page not found</p>
      <p className="mt-1 text-sm text-muted">The shipment or page may have been removed, or the link is wrong.</p>
      <ButtonLink href="/" variant="secondary" className="mt-6">
        Back to shipments
      </ButtonLink>
    </main>
  );
}
