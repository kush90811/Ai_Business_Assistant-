import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ChatWidget } from "@/components/widget/chat-widget";

export default async function EmbedPage(props: { searchParams: Promise<{ clientId?: string }> }) {
  const searchParams = await props.searchParams;
  let targetClientId = searchParams.clientId;
  
  const supabase = createSupabaseServiceClient();

  // If no clientId is specified in URL, fall back to the first tenant in database
  if (!targetClientId) {
    const { data: clients } = await supabase.from("clients").select("id").limit(1);
    if (clients && clients.length > 0) {
      targetClientId = clients[0].id;
    }
  }

  if (!targetClientId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-xs text-neutral-500 p-6 text-center font-sans">
        No active tenant found. Please onboard a tenant.
      </div>
    );
  }

  // Retrieve widget configuration from the database
  const { data: config } = await supabase
    .from("widget_configs")
    .select("brand_name, primary_color, welcome_message, logo_url")
    .eq("client_id", targetClientId)
    .maybeSingle();

  const widgetConfig = {
    companyName: config?.brand_name || "Tarkshy Assistant",
    accentColor: config?.primary_color || "#6366f1",
    greeting: config?.welcome_message || "Hello there! How can I help you today?",
    logoUrl: config?.logo_url || undefined,
    clientId: targetClientId,
  };

  return (
    <main className="min-h-screen bg-transparent relative">
      <ChatWidget config={widgetConfig} />
    </main>
  );
}
