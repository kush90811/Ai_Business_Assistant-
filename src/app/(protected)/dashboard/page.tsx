import { MessageSquare, Users, Activity } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { requireSession } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const session = await requireSession();
  const clientId = session.tenant?.clientId;

  const supabase = await createSupabaseServerClient();

  let totalSessions = 0;
  let totalMessages = 0;
  let totalLeads = 0;

  if (clientId) {
    const [sessionsRes, messagesRes, leadsRes] = await Promise.all([
      supabase
        .from("chat_sessions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId),
      supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId),
    ]);

    totalSessions = sessionsRes.count || 0;
    totalMessages = messagesRes.count || 0;
    totalLeads = leadsRes.count || 0;
  }

  return (
    <main className="mx-auto max-w-5xl px-8 py-12 space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {session.user.fullName || session.user.email}. Tenant: {session.tenant?.clientName || "Workspace"}.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Chat Sessions"
          value={totalSessions}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Total Messages"
          value={totalMessages}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <StatCard
          label="Total Captured Leads"
          value={totalLeads}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-xl border bg-card/40 p-6 backdrop-blur-sm space-y-4">
        <h3 className="font-semibold text-lg">Workspace Quick Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <span className="text-muted-foreground">Account User:</span>
            <p className="font-medium">{session.user.email}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Role:</span>
            <p className="font-medium capitalize">{session.user.role.replace("_", " ")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
