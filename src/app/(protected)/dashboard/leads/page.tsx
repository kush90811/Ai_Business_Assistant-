import { requireSession } from "@/lib/auth/guards";
import { LeadsClient } from "@/components/dashboard/leads-client";

export default async function LeadsPage() {
  const session = await requireSession();

  return (
    <main className="mx-auto max-w-7xl px-4 md:px-8 py-8">
      <LeadsClient session={session} />
    </main>
  );
}

