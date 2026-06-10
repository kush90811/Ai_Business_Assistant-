import { requireSession } from "@/lib/auth/guards";
import { ChatsClient } from "@/components/dashboard/chats-client";

export default async function ChatsPage() {
  const session = await requireSession();

  return (
    <main className="mx-auto max-w-7xl px-4 md:px-8 py-8">
      <ChatsClient session={session} />
    </main>
  );
}


