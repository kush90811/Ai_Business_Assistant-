import { NextResponse } from "next/server";
import { getGroqChatCompletion, type ChatMessage } from "@/lib/groq";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

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
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { message, clientId, sessionId, visitorId } = payload;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let activeSessionId = sessionId;
    let activeClientId = clientId;

    // 1. Session verification / creation
    if (activeSessionId) {
      // Load session to get the associated clientId
      const { data: session, error: sessionError } = await supabase
        .from("chat_sessions")
        .select("client_id")
        .eq("id", activeSessionId)
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { error: "Chat session not found or invalid." },
          { status: 404 }
        );
      }
      activeClientId = session.client_id;
    } else {
      // If no session exists, we must have a clientId to start a new one
      if (!activeClientId) {
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
        .single();

      if (clientError || !client) {
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
        return NextResponse.json(
          { error: `Failed to create chat session: ${createSessionError?.message}` },
          { status: 500 }
        );
      }

      activeSessionId = newSession.id;
    }

    // Double check we have a valid clientId and sessionId
    if (!activeClientId || !activeSessionId) {
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
      return NextResponse.json(
        { error: `Failed to store user message: ${userMsgError.message}` },
        { status: 500 }
      );
    }

    // Lead Capture Logic
    const contactInfo = extractContactInfo(message);
    if (contactInfo.email || contactInfo.phone || contactInfo.name) {
      let existingLead = null;

      // Check if a lead with same email or phone already exists for this client
      if (contactInfo.email || contactInfo.phone) {
        let query = supabase.from("leads").select("*").eq("client_id", activeClientId);
        
        if (contactInfo.email && contactInfo.phone) {
          query = query.or(`email.eq."${contactInfo.email}",phone.eq."${contactInfo.phone}"`);
        } else if (contactInfo.email) {
          query = query.eq("email", contactInfo.email);
        } else {
          query = query.eq("phone", contactInfo.phone);
        }

        const { data } = await query.limit(1).maybeSingle();
        existingLead = data;
      }

      if (existingLead) {
        // Update existing lead with new info if available
        const updates: { email?: string; phone?: string; name?: string; session_id?: string } = {};
        if (contactInfo.email && !existingLead.email) {
          updates.email = contactInfo.email;
        }
        if (contactInfo.phone && !existingLead.phone) {
          updates.phone = contactInfo.phone;
        }
        if (contactInfo.name && !existingLead.name) {
          updates.name = contactInfo.name;
        }
        if (!existingLead.session_id) {
          updates.session_id = activeSessionId;
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("leads")
            .update(updates)
            .eq("id", existingLead.id);
        }
      } else {
        // Create new lead
        await supabase.from("leads").insert({
          client_id: activeClientId,
          session_id: activeSessionId,
          name: contactInfo.name,
          email: contactInfo.email,
          phone: contactInfo.phone,
          status: "new",
          source: "chatbot",
        });
      }
    }

    // 3. Fetch past messages for context (limit to last 50 to avoid prompt size limits)
    const { data: history, error: historyError } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (historyError) {
      return NextResponse.json(
        { error: `Failed to retrieve chat history: ${historyError.message}` },
        { status: 500 }
      );
    }

    // 4. Fetch widget config to customize the system prompt if available
    const { data: widgetConfig } = await supabase
      .from("widget_configs")
      .select("brand_name")
      .eq("client_id", activeClientId)
      .maybeSingle();

    const brandName = widgetConfig?.brand_name || "our business";
    const systemPrompt = `You are a helpful, professional, and friendly AI Business Assistant representing ${brandName}. Answer user inquiries clearly and concisely based on context.`;

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
    return NextResponse.json({
      response: assistantReply,
      sessionId: activeSessionId,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal Server Error: ${errMsg}` },
      { status: 500 }
    );
  }
}

function extractContactInfo(text: string) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Match standard numbers (local and international formats)
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  const emails = text.match(emailRegex);
  const phones = text.match(phoneRegex);

  let name: string | null = null;
  const nameRegexes = [
    /my name is\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
    /i am\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
    /call me\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
  ];

  for (const regex of nameRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      name = match[1].trim();
      break;
    }
  }

  return {
    email: emails ? emails[0].toLowerCase() : null,
    phone: phones ? phones[0].trim() : null,
    name,
  };
}
