import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { WidgetPlaygroundClient } from "@/components/widget/playground-client";

export default async function WidgetPage() {
  const supabase = createSupabaseServiceClient();

  // Retrieve the first client ID from database to use as the simulation context
  const { data: clients } = await supabase.from("clients").select("id").limit(1);

  const defaultClientId = clients && clients.length > 0 
    ? clients[0].id 
    : "00000000-0000-0000-0000-000000000000";

  return (
    <main className="min-h-screen bg-[#09090b]">
      <WidgetPlaygroundClient defaultClientId={defaultClientId} />
    </main>
  );
}
