import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { clientId, visitorId, sessionId } = payload;

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // 1. Resolve or generate visitorId
    const activeVisitorId = visitorId || `visitor_${crypto.randomUUID()}`;

    // 2. Resolve sessionId and load history if valid
    let activeSessionId = sessionId || null;
    let history = null;

    if (activeSessionId) {
      // Check if session exists and belongs to this client
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", activeSessionId)
        .eq("client_id", clientId)
        .maybeSingle();

      if (session) {
        // Load history for this session
        const { data: messages, error: messagesError } = await supabase
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("session_id", activeSessionId)
          .order("created_at", { ascending: true });

        if (!messagesError && messages) {
          history = messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.created_at).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }),
          }));
        }
      } else {
        // Clear stale session
        activeSessionId = null;
      }
    }

    // 3. Find known visitor profile (lead) — with coherence validation
    //    Only return a profile if the lead's linked session ALSO still exists.
    //    This ensures deleted sessions/leads never produce stale profiles.
    let lead = null;
    let visitorHasValidData = false;

    const { data: sessions } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("visitor_id", activeVisitorId)
      .eq("client_id", clientId);

    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false })
        .limit(1);

      if (leads && leads.length > 0) {
        // Verify that the lead's linked session still exists
        const leadSessionId = leads[0].session_id;
        if (leadSessionId && sessionIds.includes(leadSessionId)) {
          lead = leads[0];
          visitorHasValidData = true;
        } else {
          console.log(`[Widget Init] Lead ${leads[0].id} found but its session ${leadSessionId} no longer exists. Treating as new visitor.`);
        }
      }
    }

    // If the widget sent a visitorId but no valid session or lead exists,
    // signal the client to reset and start fresh.
    const shouldResetVisitor = Boolean(visitorId) && !activeSessionId && !visitorHasValidData;

    // 4. Fetch widget config welcome message
    const { data: widgetConfig } = await supabase
      .from("widget_configs")
      .select("welcome_message")
      .eq("client_id", clientId)
      .maybeSingle();

    const defaultGreeting = "Hello! I am your AI assistant. Ask me anything about our products or plans.";
    const baseWelcome = widgetConfig?.welcome_message || defaultGreeting;

    // 5. Personalize greeting if returning visitor is known
    let greeting = baseWelcome;
    if (lead && lead.name && lead.name !== "Anonymous Visitor" && lead.name.trim() !== "") {
      greeting = `Welcome back, ${lead.name.trim()}! ${baseWelcome}`;
    }

    return NextResponse.json({
      success: true,
      visitorId: shouldResetVisitor ? null : activeVisitorId,
      sessionId: activeSessionId,
      greeting,
      history,
      resetVisitor: shouldResetVisitor,
      profile: lead
        ? {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          status: lead.status,
          metadata: lead.metadata,
        }
        : null,
    });
  } catch (error: any) {
    console.error("[Widget Init Error] Failed to initialize widget:", error);
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
