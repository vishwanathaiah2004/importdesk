import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/current-user";

export function AppHeader({ user }: { user: CurrentUser }) {
  const links = [{ href: "/", label: "Shipments" }];
  if (can(user.role, "audit:view")) links.push({ href: "/activity", label: "Activity" });

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" aria-label="ImportDesk home">
          <span className="sm:hidden">
            <Logo compact />
          </span>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </Link>
        <NavLinks links={links} />
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-[13px] font-medium">{user.name}</p>
            <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="h-8 rounded-md px-2.5 text-[13px] whitespace-nowrap text-ink-soft hover:bg-sunken hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
