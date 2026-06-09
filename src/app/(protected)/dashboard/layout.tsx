import { requireSession } from "@/lib/auth/guards";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <Sidebar session={session} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
