import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, buildRateLimitKey } from "@/lib/rate-limit";
import { checkAllowedDomain } from "@/lib/domain-check";
import crypto from "crypto";

const InitPayloadSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
  visitorId: z.string().max(200).optional(),
  sessionId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    // 0. Parse and validate payload
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = InitPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { clientId, visitorId, sessionId } = parsed.data;

    // 1. Rate limiting — 60 req/min
    const rlKey = buildRateLimitKey(request, clientId);
    const rlResult = checkRateLimit(rlKey, 60);
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rlResult.retryAfterMs || 60000) / 1000)) },
        }
      );
    }

    const supabase = createSupabaseServiceClient();

    // 2. Domain enforcement
    const domainResult = await checkAllowedDomain(request, clientId, supabase);
    if (!domainResult.allowed) {
      return NextResponse.json({ error: domainResult.reason }, { status: 403 });
    }

    // 3. Resolve or generate visitorId
    const activeVisitorId = visitorId || `visitor_${crypto.randomUUID()}`;

    // 4. Resolve sessionId and load history if valid
    let activeSessionId = sessionId || null;
    let history = null;

    if (activeSessionId) {
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", activeSessionId)
        .eq("client_id", clientId)
        .maybeSingle();

      if (session) {
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
        activeSessionId = null;
      }
    }

    // 5. Find known visitor profile (lead) — with coherence validation
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
        const leadSessionId = leads[0].session_id;
        if (leadSessionId && sessionIds.includes(leadSessionId)) {
          lead = leads[0];
          visitorHasValidData = true;
        } else {
          console.log(`[Widget Init] Lead ${leads[0].id} found but its session ${leadSessionId} no longer exists. Treating as new visitor.`);
        }
      }
    }

    const shouldResetVisitor = Boolean(visitorId) && !activeSessionId && !visitorHasValidData;

    // 6. Fetch widget config welcome message
    const { data: widgetConfig } = await supabase
      .from("widget_configs")
      .select("welcome_message")
      .eq("client_id", clientId)
      .maybeSingle();

    const defaultGreeting = "Hi there! 👋 Welcome — I'm your AI assistant, and I'm here to help you explore how AI can transform your business. Whether you're looking for chatbots, workflow automation, or custom solutions, I've got you covered. What kind of business do you run?";
    const baseWelcome = widgetConfig?.welcome_message || defaultGreeting;

    // 7. Personalize greeting if returning visitor is known
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
