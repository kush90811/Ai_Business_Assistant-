import { requireSession } from "@/lib/auth/guards";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen relative w-full bg-background overflow-x-hidden">
      <Sidebar session={session} />
      <main className="flex-1 ml-64 w-[calc(100%-16rem)] min-h-screen p-6 md:p-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
