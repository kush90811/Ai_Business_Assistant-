import { requireSession } from "@/lib/auth/guards";
import { SettingsClient } from "@/components/dashboard/settings-client";

export default async function SettingsPage() {
  await requireSession();

  return (
    <main className="mx-auto max-w-7xl px-4 md:px-8 py-8">
      <SettingsClient />
    </main>
  );
}

