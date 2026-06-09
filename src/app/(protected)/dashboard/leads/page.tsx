import { requireSession } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface LeadRecord {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

export default async function LeadsPage() {
  const session = await requireSession();
  const clientId = session.tenant?.clientId;

  const supabase = await createSupabaseServerClient();
  let leads: LeadRecord[] = [];

  if (clientId) {
    const { data } = await supabase
      .from("leads")
      .select("id, name, email, phone, status, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    leads = (data as LeadRecord[]) || [];
  }

  return (
    <div className="space-y-8 p-8 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">Manage leads collected from your chatbot</p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          <p className="text-sm font-medium">No leads captured yet</p>
          <p className="text-xs text-muted-foreground mt-1">Leads captured by the chatbot will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card/40 overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Captured At</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {leads.map((lead) => {
                  const dateStr = lead.created_at
                    ? new Date(lead.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "N/A";

                  return (
                    <tr key={lead.id} className="hover:bg-accent/40 transition-colors">
                      <td className="p-4 font-medium">{lead.name || "Anonymous Visitor"}</td>
                      <td className="p-4 text-muted-foreground">{lead.email || "—"}</td>
                      <td className="p-4 text-muted-foreground">{lead.phone || "—"}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary capitalize">
                          {lead.status || "new"}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">{dateStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
