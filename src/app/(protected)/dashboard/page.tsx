import { requireSession } from "@/lib/auth/guards";
import { OverviewClient } from "@/components/dashboard/overview-client";

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <main className="mx-auto max-w-7xl px-4 md:px-8 py-8 space-y-10">
      <OverviewClient 
        userEmail={session.user.email}
        userFullName={session.user.fullName}
        tenantName={session.tenant?.clientName}
        clientId={session.tenant?.clientId}
      />
    </main>
  );
}

