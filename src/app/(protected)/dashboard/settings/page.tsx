import { requireSession } from "@/lib/auth/guards";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your workspace and preferences</p>
      </div>
      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold">Workspace Information</h3>
          <div className="mt-4 space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span>
              <p className="font-medium">{session.tenant?.clientName ?? "Your Workspace"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Account Email:</span>
              <p className="font-medium">{session.user.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
