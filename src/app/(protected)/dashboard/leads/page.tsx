import { requireSession } from "@/lib/auth/guards";

export default async function LeadsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Leads</h1>
        <p className="text-muted-foreground">Manage leads collected from your chatbot</p>
      </div>
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        <p>Leads will appear here</p>
      </div>
    </div>
  );
}
