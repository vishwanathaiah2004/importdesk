import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth/current-user";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <AppHeader user={user} />
      {children}
    </div>
  );
}
