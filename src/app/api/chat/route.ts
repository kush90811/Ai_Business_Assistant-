/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { AssistantOrchestrator } from "@/lib/assistant/orchestrator";

type ChatRequestPayload = {
  message: string;
  clientId?: string;
  sessionId?: string;
  visitorId?: string;
};

export async function POST(request: Request) {
  try {
    let payload: ChatRequestPayload;
    try {
      payload = await request.json();
    } catch {
      console.log("[API Return] 400 - Invalid JSON payload.");
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { message, clientId, sessionId, visitorId } = payload;

    console.log(`[API] Received visitorId: ${visitorId}, sessionId: ${sessionId}, clientId: ${clientId}`);

    if (!message || typeof message !== "string" || message.trim() === "") {
      console.log("[API Return] 400 - Message is required.");
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let activeSessionId = sessionId;
    let activeClientId = clientId;

    // 1. Session verification & resolution
    if (activeSessionId) {
      // Load session to get the associated clientId and metadata
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("client_id, metadata")
        .eq("id", activeSessionId)
        .maybeSingle();

      if (session) {
        activeClientId = session.client_id;

        // If the session was associated with a lead, verify that the lead still exists in the database
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
      // If no session exists (or was stale), we must have a clientId to start a new one
      if (!activeClientId) {
        console.log("[API Return] 400 - clientId is required to start a new chat session.");
        return NextResponse.json(
          { error: "clientId is required to start a new chat session." },
          { status: 400 }
        );
      }

      // Verify the client exists
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("id", activeClientId)
        .maybeSingle();

      if (clientError || !client) {
        console.log(`[API Return] 404 - Client not found. activeClientId: ${activeClientId}`);
        return NextResponse.json(
          { error: "Client not found." },
          { status: 404 }
        );
      }

      // Create new chat session
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
        console.log(`[API Return] 500 - Failed to create chat session: ${createSessionError?.message}`);
        return NextResponse.json(
          { error: `Failed to create chat session: ${createSessionError?.message}` },
          { status: 500 }
        );
      }

      activeSessionId = newSession.id;
      console.log(`[API] Created new chat session: ${activeSessionId} for client: ${activeClientId}`);
    }

    // Double check we have a valid clientId and sessionId
    if (!activeClientId || !activeSessionId) {
      console.log("[API Return] 500 - Failed to resolve tenant context.");
      return NextResponse.json({ error: "Failed to resolve tenant context." }, { status: 500 });
    }

    // 2. Insert the user's message
    const { error: userMsgError } = await supabase.from("chat_messages").insert({
      client_id: activeClientId,
      session_id: activeSessionId,
      role: "user",
      content: message.trim(),
    });

    if (userMsgError) {
      console.log(`[API Return] 500 - Failed to store user message: ${userMsgError.message}`);
      return NextResponse.json(
        { error: `Failed to store user message: ${userMsgError.message}` },
        { status: 500 }
      );
    }

    // 3. Process using AssistantOrchestrator
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
