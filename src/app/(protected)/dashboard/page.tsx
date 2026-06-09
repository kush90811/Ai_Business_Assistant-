import { ROUTES } from "@/config/app";
import { requireSession } from "@/lib/auth/guards";

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="space-y-4 rounded-xl border p-6">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
        </div>

        <p className="text-sm">Protected route: {ROUTES.dashboard.root}</p>

        <form action="/logout" method="post">
          <button type="submit" className="rounded-md border px-4 py-2">
            Logout
          </button>
        </form>
      </div>
    </main>
  );
}
