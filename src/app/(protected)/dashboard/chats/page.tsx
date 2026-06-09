import { requireSession } from "@/lib/auth/guards";

export default async function ChatsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Chatbot</h1>
        <p className="text-muted-foreground">Manage and monitor chatbot conversations for {session.tenant?.clientName ?? "your workspace"}</p>
      </div>
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        <p>Chat sessions will appear here</p>
      </div>
    </div>
  );
}
