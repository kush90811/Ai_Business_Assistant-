import { requireSession } from "@/lib/auth/guards";

export default async function KnowledgePage() {
  const session = await requireSession();

  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Knowledge Base</h1>
        <p className="text-muted-foreground">
          Upload and manage documents for your chatbot at {session.tenant?.clientName || "your workspace"}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        <p>Upload documents to get started</p>
      </div>
    </div>
  );
}
