/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getGroqChatCompletion, type ChatMessage } from "@/lib/groq";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateEmbedding } from "@/lib/embeddings";
import { LeadCaptureService, type LeadCaptureResult } from "@/lib/services/lead-capture";

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
      // Load session to get the associated clientId
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("client_id")
        .eq("id", activeSessionId)
        .maybeSingle();

      if (session) {
        activeClientId = session.client_id;
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

    // 2. Process Lead Capture and handle conflicts/confirmations
    let leadResult: LeadCaptureResult = { hasConflict: false };
    try {
      leadResult = await LeadCaptureService.processMessage(
        message.trim(),
        activeClientId,
        activeSessionId,
        visitorId
      );
    } catch (err) {
      console.error("[RAG Chat Error] Lead capture service failed:", err);
    }

    if (leadResult.hasConflict && leadResult.response) {
      // Store the conflict response in the database as the assistant's message
      await supabase.from("chat_messages").insert({
        client_id: activeClientId,
        session_id: activeSessionId,
        role: "assistant",
        content: leadResult.response,
      });

      // Update last activity timestamp on the session
      await supabase
        .from("chat_sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", activeSessionId);

      console.log(`[API Return] 200 - Conflict/Confirmation response: "${leadResult.response}"`);
      return NextResponse.json({
        response: leadResult.response,
        sessionId: activeSessionId,
      });
    }

    // 3. Fetch past messages for current session context (limit to last 50 to avoid prompt size limits)
    const { data: history, error: historyError } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (historyError) {
      console.log(`[API Return] 500 - Failed to retrieve chat history: ${historyError.message}`);
      return NextResponse.json(
        { error: `Failed to retrieve chat history: ${historyError.message}` },
        { status: 500 }
      );
    }

    // 3b. Fetch visitor profile if visitorId is provided
    let visitorProfile = null;
    if (visitorId) {
      const { data: visitorSessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("client_id", activeClientId);

      if (visitorSessions && visitorSessions.length > 0) {
        const sessionIds = visitorSessions.map((s) => s.id);
        const { data: leads } = await supabase
          .from("leads")
          .select("*")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false })
          .limit(1);

        if (leads && leads.length > 0) {
          visitorProfile = leads[0];
          console.log(`[Memory] Found known visitor profile: ${visitorProfile.name}`);
        }
      }
    }

    // 3c. Fetch background conversation context (past messages from previous sessions of this visitor)
    let backgroundContext = "";
    if (visitorId && activeSessionId) {
      const { data: otherSessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("client_id", activeClientId)
        .neq("id", activeSessionId);

      if (otherSessions && otherSessions.length > 0) {
        const otherSessionIds = otherSessions.map((s) => s.id);
        
        const { data: pastMsgs } = await supabase
          .from("chat_messages")
          .select("role, content, created_at")
          .in("session_id", otherSessionIds)
          .order("created_at", { ascending: false })
          .limit(20);

        if (pastMsgs && pastMsgs.length > 0) {
          const chronologicalMsgs = [...pastMsgs].reverse();
          backgroundContext = chronologicalMsgs
            .map((m) => `${m.role === "user" ? "Visitor" : "AI Assistant"}: ${m.content}`)
            .join("\n");
          console.log(`[Memory] Loaded ${pastMsgs.length} historical messages as context.`);
        }
      }
    }

    // 4. Fetch widget config to customize the system prompt if available
    const { data: widgetConfig } = await supabase
      .from("widget_configs")
      .select("brand_name")
      .eq("client_id", activeClientId)
      .maybeSingle();

    const brandName = widgetConfig?.brand_name || "our business";

    // 4b. Retrieve RAG context from the knowledge base using vector similarity search
    let contextText = "";
    try {
      console.log(`[RAG Chat] Fetching semantic context for message: "${message.trim()}"`);
      const queryEmbedding = await generateEmbedding(message.trim());
      
      const { data: chunks, error: matchError } = await supabase.rpc("match_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 5,
        filter_workspace_id: activeClientId
      });

      if (matchError) {
        console.error("[RAG Chat Error] pgvector similarity search failed:", matchError);
      } else if (chunks && chunks.length > 0) {
        console.log(`[RAG Chat] Retrieved ${chunks.length} matching chunks for prompt context.`);
        contextText = chunks.map((c: any) => c.chunk_text).join("\n\n");
      } else {
        console.log("[RAG Chat] No matching chunks found in knowledge base.");
      }
    } catch (err) {
      console.error("[RAG Chat Error] Failed to generate query embedding or query vectors:", err);
    }

    // Assemble the System Prompt
    let systemPrompt = `You are a helpful, professional, and friendly AI Business Assistant representing ${brandName}. Answer user inquiries clearly and concisely based on context.`;

    if (visitorProfile) {
      const profileInfo = [];
      if (visitorProfile.name) profileInfo.push(`Name: ${visitorProfile.name}`);
      if (visitorProfile.email) profileInfo.push(`Email: ${visitorProfile.email}`);
      if (visitorProfile.phone) profileInfo.push(`Phone: ${visitorProfile.phone}`);
      if (visitorProfile.metadata) {
        const meta = visitorProfile.metadata as Record<string, any>;
        if (meta.company) profileInfo.push(`Company: ${meta.company}`);
        if (meta.city) profileInfo.push(`City: ${meta.city}`);
        if (meta.country) profileInfo.push(`Country: ${meta.country}`);
      }
      
      if (profileInfo.length > 0) {
        systemPrompt += `\n\nVisitor Profile (Known information from CRM/Leads, greet them by name if they are returning): \n${profileInfo.join("\n")}`;
      }
    }

    if (backgroundContext) {
      systemPrompt += `\n\nConversation Memory (Previous discussions from past sessions of this visitor, use this context to remember past requests naturally): \n${backgroundContext}`;
    }

    if (contextText) {
      systemPrompt += `\n\nUse the following retrieved context from our knowledge base to answer the user's question. First, answer strictly using the provided context. If the answer cannot be determined from the context, state clearly and politely: "I don't have that information in my knowledge base, but I can help you with other questions." Do not hallucinate or make up details.\n\nRetrieved Context:\n${contextText}`;
    }

    // Map conversation history to the ChatMessage format
    const formattedMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((msg) => ({
        role: (msg.role === "user" || msg.role === "assistant" || msg.role === "system") 
          ? msg.role 
          : "user",
        content: msg.content,
      })),
    ];

    // 5. Query Groq Chat Completion
    let assistantReply: string;
    try {
      assistantReply = await getGroqChatCompletion(formattedMessages);
    } catch (groqError: unknown) {
      const errMsg = groqError instanceof Error ? groqError.message : String(groqError);
      console.log(`[API Return] 502 - Groq Completion Failed: ${errMsg}`);
      return NextResponse.json(
        { error: `Groq Completion Failed: ${errMsg}` },
        { status: 502 }
      );
    }

    // 6. Save Assistant response in the database
    const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
      client_id: activeClientId,
      session_id: activeSessionId,
      role: "assistant",
      content: assistantReply,
    });

    if (assistantMsgError) {
      console.log(`[API Return] 500 - Failed to store assistant message: ${assistantMsgError.message}`);
      return NextResponse.json(
        { error: `Failed to store assistant message: ${assistantMsgError.message}` },
        { status: 500 }
      );
    }

    // 7. Update last activity timestamp on the session
    await supabase
      .from("chat_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", activeSessionId);



    // Return the response details
    console.log(`[API Return] 200 - Success. assistantReply length: ${assistantReply.length}`);
    return NextResponse.json({
      response: assistantReply,
      sessionId: activeSessionId,
    });
  } catch (error: unknown) {
    console.error("[API Return] 500 - Internal Server Error. Full stack trace:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal Server Error: ${errMsg}` },
      { status: 500 }
    );
  }
}


