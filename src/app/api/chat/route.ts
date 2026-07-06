/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { AssistantOrchestrator } from "@/lib/assistant/orchestrator";
import { checkRateLimit, buildRateLimitKey } from "@/lib/rate-limit";
import { checkAllowedDomain } from "@/lib/domain-check";

const ChatPayloadSchema = z.object({
  message: z.string().min(1, "Message is required").max(5000),
  clientId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  visitorId: z.string().max(200).optional(),
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

    const parsed = ChatPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, clientId, sessionId, visitorId } = parsed.data;

    console.log(`[API] Received visitorId: ${visitorId}, sessionId: ${sessionId}, clientId: ${clientId}`);

    // 1. Rate limiting — 20 req/min per clientId+IP
    const rlKey = buildRateLimitKey(request, clientId);
    const rlResult = checkRateLimit(rlKey, 20);
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
    if (clientId) {
      const domainResult = await checkAllowedDomain(request, clientId, supabase);
      if (!domainResult.allowed) {
        return NextResponse.json({ error: domainResult.reason }, { status: 403 });
      }
    }

    // 3. Session verification & resolution
    let activeSessionId = sessionId;
    let activeClientId = clientId;

    if (activeSessionId) {
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("client_id, metadata")
        .eq("id", activeSessionId)
        .maybeSingle();

      if (session) {
        activeClientId = session.client_id;

        const leadId = session.metadata?.lead_id;
        if (leadId) {
          const { data: leadCheck } = await supabase
            .from("leads")
            .select("id")
            .eq("id", leadId)
            .maybeSingle();

          if (!leadCheck) {
            console.log(`[API] Lead ${leadId} was deleted. Invalidating session.`);
            activeSessionId = undefined;
          }
        }
      } else {
        console.log(`[API] Stale or invalid sessionId provided: ${activeSessionId}. Clearing to force session recreation.`);
        activeSessionId = undefined;
      }
    }

    if (!activeSessionId) {
      if (!activeClientId) {
        return NextResponse.json(
          { error: "clientId is required to start a new chat session." },
          { status: 400 }
        );
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("id", activeClientId)
        .maybeSingle();

      if (clientError || !client) {
        return NextResponse.json({ error: "Client not found." }, { status: 404 });
      }

      const { data: newSession, error: createSessionError } = await supabase
        .from("chat_sessions")
        .insert({
          client_id: activeClientId,
          visitor_id: visitorId || null,
          status: "open",
        })
        .select("id")
        .single();

      if (createSessionError || !newSession) {
        return NextResponse.json(
          { error: `Failed to create chat session: ${createSessionError?.message}` },
          { status: 500 }
        );
      }

      activeSessionId = newSession.id;
      console.log(`[API] Created new chat session: ${activeSessionId} for client: ${activeClientId}`);
    }

    if (!activeClientId || !activeSessionId) {
      return NextResponse.json({ error: "Failed to resolve tenant context." }, { status: 500 });
    }

    // 4. Insert the user's message
    const { error: userMsgError } = await supabase.from("chat_messages").insert({
      client_id: activeClientId,
      session_id: activeSessionId,
      role: "user",
      content: message.trim(),
    });

    if (userMsgError) {
      return NextResponse.json(
        { error: `Failed to store user message: ${userMsgError.message}` },
        { status: 500 }
      );
    }

    // 5. Process using AssistantOrchestrator
    try {
      const orchestratorResult = await AssistantOrchestrator.processMessage({
        message: message.trim(),
        clientId: activeClientId,
        sessionId: activeSessionId,
        visitorId: visitorId || undefined,
      });

      console.log(`[API Return] 200 - Success. Response length: ${orchestratorResult.response.length}`);
      return NextResponse.json({
        response: orchestratorResult.response,
        sessionId: orchestratorResult.sessionId,
        stage: orchestratorResult.stage,
      });
    } catch (orchestratorError: any) {
      console.error("[API Return] 500 - Assistant Orchestrator failed:", orchestratorError);
      return NextResponse.json(
        { error: `Assistant Orchestrator failed: ${orchestratorError.message || orchestratorError}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[API Return] 500 - Internal Server Error. Full stack trace:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal Server Error: ${errMsg}` },
      { status: 500 }
    );
  }
}
