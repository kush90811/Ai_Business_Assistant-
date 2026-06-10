import { requireSession } from "@/lib/auth/guards";
import { KnowledgeClient } from "@/components/dashboard/knowledge-client";

export default async function KnowledgePage() {
  await requireSession();

  return (
    <main className="mx-auto max-w-7xl px-4 md:px-8 py-8">
      <KnowledgeClient />
    </main>
  );
}

