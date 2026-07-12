import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getGroqChatCompletion, ChatMessage } from "@/lib/groq";
import { generateEmbedding } from "@/lib/embeddings";
import { MemoryEngine } from "./memory-engine";
import { SalesEngine } from "./sales-engine";
import { SupportEngine } from "./support-engine";
import { RecommendationEngine } from "./recommendation-engine";
import { StrategyEngine } from "./strategy-engine";
import { VisitorProfile, AssistantMode, UserIntent, ConversationStage, StageMetadata } from "./types";

export interface OrchestratorParams {
  message: string;
  clientId: string;
  sessionId: string;
  visitorId?: string;
}

export class AssistantOrchestrator {
  /**
   * Orchestrates the entire assistant workflow: gets history, classifies intent,
   * handles lead updates/conflicts, decides mode, runs RAG, and obtains final AI completion.
   */
  public static async processMessage(params: OrchestratorParams): Promise<{
    response: string;
    sessionId: string;
    stage: string;
  }> {
    const { message, clientId, sessionId, visitorId } = params;
    const supabase = createSupabaseServiceClient();

    // 1. Fetch visitor profile & session metadata
    let existingLead = await MemoryEngine.getVisitorProfile(
      supabase,
      clientId,
      visitorId,
      sessionId
    );

    let profile = MemoryEngine.mapToVisitorProfile(existingLead);

    // 2. Fetch session data for current mode
    const { data: sessionData } = await supabase
      .from("chat_sessions")
      .select("metadata")
      .eq("id", sessionId)
      .maybeSingle();

    const currentMode = (sessionData?.metadata?.mode || "standard") as AssistantMode;
    const currentStage = (sessionData?.metadata?.currentStage || "greeting") as ConversationStage;

    // Load Session Chat History early for combined analysis context
    const { data: history, error: historyError } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(50);

    const messageHistory = (history || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // 3. Process Pending Confirmation if any exists
    if (existingLead && existingLead.metadata?.pending_confirmation) {
      const pending = existingLead.metadata.pending_confirmation;
      const classification = SalesEngine.classifyConfirmation(message);

      console.log(`[Orchestrator] Found pending confirmation for '${pending.field}'. Response classified as: ${classification}`);

      if (classification === "yes") {
        const updates: any = {};
        const newMetadata = { ...existingLead.metadata };
        delete newMetadata.pending_confirmation;

        if (["name", "email", "phone"].includes(pending.field)) {
          updates[pending.field] = pending.value;
        } else {
          newMetadata[pending.field] = pending.value;
        }
        updates.metadata = newMetadata;

        await supabase
          .from("leads")
          .update(updates)
          .eq("id", existingLead.id);

        const responseText = `Thank you. I have updated your ${pending.field} to ${pending.value}.`;

        // Save reply in database
        await supabase.from("chat_messages").insert({
          client_id: clientId,
          session_id: sessionId,
          role: "assistant",
          content: responseText,
        });

        // Update activity timestamp
        await supabase
          .from("chat_sessions")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", sessionId);

        return { response: responseText, sessionId, stage: "greeting" };
      } else if (classification === "no") {
        const newMetadata = { ...existingLead.metadata };
        delete newMetadata.pending_confirmation;

        await supabase
          .from("leads")
          .update({ metadata: newMetadata })
          .eq("id", existingLead.id);

        const responseText = `No problem. I will keep your ${pending.field} as ${pending.original}.`;

        await supabase.from("chat_messages").insert({
          client_id: clientId,
          session_id: sessionId,
          role: "assistant",
          content: responseText,
        });

        await supabase
          .from("chat_sessions")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", sessionId);

        return { response: responseText, sessionId, stage: "greeting" };
      } else {
        // Unrelated input: clear pending state and proceed to standard execution
        console.log("[Orchestrator] Input unrelated to confirmation. Clearing pending state.");
        const newMetadata = { ...existingLead.metadata };
        delete newMetadata.pending_confirmation;
        await supabase
          .from("leads")
          .update({ metadata: newMetadata })
          .eq("id", existingLead.id);

        existingLead.metadata = newMetadata;
        profile = MemoryEngine.mapToVisitorProfile(existingLead);
      }
    }

    // 4. Fast-path: try conservative rule-based analysis first (0 LLM calls)
    //    Falls back to LLM analyzeInput() if there is any ambiguity.
    const quickResult = AssistantOrchestrator.quickAnalyze(message);

    let analysis: { intent: UserIntent; entities: any };
    if (quickResult.confident) {
      console.log(`[Orchestrator] Fast-path matched: intent=${quickResult.intent}, skipping LLM analysis.`);
      analysis = { intent: quickResult.intent, entities: quickResult.entities };
    } else {
      analysis = await AssistantOrchestrator.analyzeInput(message, messageHistory);
    }
    
    // Merge regex-based deterministic extraction for accuracy
    const deterministic = SalesEngine.deterministicExtract(message);
    const extracted = {
      ...analysis.entities,
      email: deterministic.email || analysis.entities.email || null,
      phone: deterministic.phone || analysis.entities.phone || null,
      website: deterministic.website || analysis.entities.website || null,
      linkedin: deterministic.linkedin || analysis.entities.linkedin || null,
    };
    const intent = analysis.intent;

    const hasAnyEntity = Object.values(extracted).some((v) => v !== null);

    if (hasAnyEntity) {
      console.log(`[Orchestrator] Extracted entities:`, JSON.stringify(extracted));

      const { updates, conflict } = SalesEngine.evaluateUpdates(existingLead, extracted);

      if (conflict) {
        // We have a conflict! Store pending confirmation and return conflict prompt
        const newMetadata = {
          ...(existingLead?.metadata || {}),
          pending_confirmation: conflict,
        };

        if (existingLead) {
          await supabase
            .from("leads")
            .update({ metadata: newMetadata })
            .eq("id", existingLead.id);
        } else {
          const insertPayload = {
            client_id: clientId,
            session_id: sessionId,
            name: extracted.name || "Anonymous Visitor",
            email: extracted.email || null,
            phone: extracted.phone || null,
            status: "new",
            source: "chatbot",
            metadata: newMetadata,
          };
          const { data: newLead } = await supabase
            .from("leads")
            .insert(insertPayload)
            .select("*")
            .single();
          existingLead = newLead;
        }

        const friendlyFieldNames: Record<string, string> = {
          name: "name",
          email: "email",
          phone: "phone",
          company: "company",
          industry: "industry",
          website: "website",
          teamSize: "team size",
          monthlyVisitors: "monthly website visitors",
          budget: "budget",
          currentChatbot: "current chatbot",
          businessGoals: "business goals",
        };
        const friendlyField = friendlyFieldNames[conflict.field] || conflict.field;
        const conflictResponse = `I currently have your ${friendlyField} as '${conflict.original}'. Would you like me to update it to '${conflict.value}'?`;

        await supabase.from("chat_messages").insert({
          client_id: clientId,
          session_id: sessionId,
          role: "assistant",
          content: conflictResponse,
        });

        await supabase
          .from("chat_sessions")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", sessionId);

        return { response: conflictResponse, sessionId, stage: "greeting" };
      }

      // If no conflict and updates exist, apply enrichment
      if (Object.keys(updates).length > 0) {
        if (existingLead) {
          if (existingLead.session_id !== sessionId) {
            updates.session_id = sessionId;
          }
          await supabase
            .from("leads")
            .update(updates)
            .eq("id", existingLead.id);

          console.log(`[Orchestrator] Enriched existing lead: ${existingLead.id}`);
        } else {
          // Create new lead row
          const insertPayload = {
            client_id: clientId,
            session_id: sessionId,
            name: extracted.name || "Anonymous Visitor",
            email: extracted.email || null,
            phone: extracted.phone || null,
            status: "new",
            source: "chatbot",
            metadata: {
              company: extracted.company || null,
              industry: extracted.industry || null,
              website: extracted.website || null,
              teamSize: extracted.teamSize || null,
              monthlyVisitors: extracted.monthlyVisitors || null,
              budget: extracted.budget || null,
              currentChatbot: extracted.currentChatbot || null,
              businessGoals: extracted.businessGoals || null,
              city: extracted.city || null,
              country: extracted.country || null,
              jobTitle: extracted.jobTitle || null,
              linkedin: extracted.linkedin || null,
            },
          };

          const { data: newLead } = await supabase
            .from("leads")
            .insert(insertPayload)
            .select("*")
            .single();

          existingLead = newLead;
          console.log(`[Orchestrator] Created new lead record.`);
        }

        // Refresh local profile reference
        const { data: refreshedLead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", existingLead.id)
          .single();
        profile = MemoryEngine.mapToVisitorProfile(refreshedLead);
      }
    }

    // 6. Determine Strategy Mode
    const newMode = StrategyEngine.determineMode(currentMode, intent);

    // 7. Deterministic Stage Progression (business rules, NOT LLM)
    const stageMetadata = StrategyEngine.determineStage(currentStage, intent, profile, newMode);

    console.log(`[Orchestrator] Mode: ${currentMode}→${newMode} | Intent: ${intent} | Stage: ${currentStage}→${stageMetadata.currentStage} | Goal: ${stageMetadata.currentGoal}`);

    // 8. Save mode + stage metadata to session
    const updatedSessionMeta = {
      ...(sessionData?.metadata || {}),
      mode: newMode,
      currentStage: stageMetadata.currentStage,
      currentGoal: stageMetadata.currentGoal,
      completedFields: stageMetadata.completedFields,
      pendingFields: stageMetadata.pendingFields,
    };
    await supabase
      .from("chat_sessions")
      .update({ metadata: updatedSessionMeta })
      .eq("id", sessionId);

    // 9. Perform Vector Search (RAG)
    let ragContext = "";
    try {
      const queryEmbedding = await generateEmbedding(message);
      const { data: chunks, error: matchError } = await supabase.rpc("match_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 5,
        filter_workspace_id: clientId,
      });

      if (!matchError && chunks && chunks.length > 0) {
        ragContext = chunks.map((c: any) => c.chunk_text).join("\n\n");
      }
    } catch (err) {
      console.warn("[Orchestrator] ⚠️ RAG CONTEXT UNAVAILABLE: Vector search failed. The assistant will respond WITHOUT knowledge base context for this message. Error:", err);
    }

    // 10. Mode-specific guidelines
    let modeInstructions = "";
    if (newMode === "support") {
      modeInstructions = SupportEngine.getSupportInstructions();
    } else {
      const { remainingFields } = MemoryEngine.getQualificationStatus(profile);
      modeInstructions = SalesEngine.getQualificationPromptSnippet(remainingFields);
    }

    // 11. Recommendation engine guidelines
    const recommendationInstructions = RecommendationEngine.getRecommendationInstructions(
      intent,
      message
    );

    // 12. Load historical visitor background memory
    const backgroundContext = await MemoryEngine.getBackgroundContext(
      supabase,
      clientId,
      visitorId,
      sessionId
    );

    // 13. Compile visitor details memory
    const memoryContext = MemoryEngine.getKnownInfoPromptString(profile);

    // 14. Fetch widget config details (for brand name and response length)
    const { data: widgetConfig } = await supabase
      .from("widget_configs")
      .select("brand_name, response_length")
      .eq("client_id", clientId)
      .maybeSingle();

    const brandName = widgetConfig?.brand_name || "our business";
    const responseLength = (widgetConfig?.response_length || "medium") as "short" | "medium" | "detailed";

    // Map response length to token count
    let maxTokens = 400;
    if (responseLength === "short") {
      maxTokens = 150;
    } else if (responseLength === "detailed") {
      maxTokens = 800;
    }

    // 14b. Fetch Business Profile details
    const { data: businessProfile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    let businessProfileContext = "";
    if (businessProfile) {
      const social = businessProfile.social_links || {};
      const socialLines: string[] = [];
      if (social.twitter) socialLines.push(`Twitter/X: ${social.twitter}`);
      if (social.facebook) socialLines.push(`Facebook: ${social.facebook}`);
      if (social.linkedin) socialLines.push(`LinkedIn: ${social.linkedin}`);
      if (social.instagram) socialLines.push(`Instagram: ${social.instagram}`);

      businessProfileContext = `=== Business Profile (CRITICAL: Use these details directly to answer questions about the company, location, contact, hours, or socials. NEVER make up or guess these details) ===
- Company Name: ${brandName}
- Description: ${businessProfile.description || "N/A"}
- Address: ${businessProfile.address || "N/A"}
- Phone: ${businessProfile.phone || "N/A"}
- Email: ${businessProfile.email || "N/A"}
- Website: ${businessProfile.website || "N/A"}
- Working Hours: ${businessProfile.working_hours || "N/A"}${socialLines.length > 0 ? `\n- Social Links:\n  ${socialLines.map(s => `• ${s}`).join("\n  ")}` : ""}`;
    }

    // 15. Build System Prompt (stage-aware, length-aware, and business-profile-aware)
    const systemPrompt = StrategyEngine.buildSystemPrompt({
      brandName,
      mode: newMode,
      stageMetadata,
      memoryContext,
      backgroundContext,
      ragContext,
      modeInstructions,
      recommendationInstructions,
      responseLength,
      businessProfileContext,
    });

    // 16. Query Groq
    const formattedMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messageHistory.map((m) => ({
        role: (m.role === "user" || m.role === "assistant" || m.role === "system") ? m.role : "user",
        content: m.content,
      })),
    ];

    let assistantReply = "";
    try {
      assistantReply = await getGroqChatCompletion(formattedMessages, { maxTokens });
    } catch (err) {
      console.error("[Orchestrator] Groq invocation failed:", err);
      assistantReply = `Thank you for reaching out. I'm having a connection issue, but how else can I help?`;
    }

    // 15. Save assistant reply in database
    await supabase.from("chat_messages").insert({
      client_id: clientId,
      session_id: sessionId,
      role: "assistant",
      content: assistantReply,
    });

    // 16. Update session activity
    await supabase
      .from("chat_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionId);

    return { response: assistantReply, sessionId, stage: stageMetadata.currentStage };
  }

  /**
   * Combined LLM call to perform both intent detection and entity extraction.
   * This reduces LLM calls by reusing a single analysis context prompt.
   */
  private static async analyzeInput(
    message: string,
    history: { role: string; content: string }[]
  ): Promise<{ intent: UserIntent; entities: any }> {
    const recentHistory = history.slice(-5);
    const formattedHistory = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are a high-performance analysis engine for a multi-tenant AI business assistant.
Your task is to analyze the latest user message and the context from the conversation history, and return a single valid JSON object containing both the user's intent and any extracted entities.

=== Task 1: Intent Detection ===
Classify the user's latest message into EXACTLY ONE of these intents:
- "greeting": Greetings or hellos (e.g., "hi", "hello", "good morning")
- "small_talk": Casual non-business conversations (e.g., "how are you?", "who are you?", general chit-chat)
- "product_inquiry": Questions about services, features, or what the company does
- "pricing_inquiry": Inquiries about pricing, costs, plans, or billing models
- "demo_request": Explicit requests to see a demo, walkthrough, or booking a meeting
- "support_request": General requests for assistance or opening a support ticket
- "technical_issue": Specifically reporting errors, bugs, or widget/system loading failures
- "purchase_intent": Clear expressions of intent to purchase, upgrade, subscribe, or buy
- "feature_comparison": Comparing the product/service with competitors (e.g., "vs Intercom", "compared to competitors")
- "general_question": Any other question or statement that doesn't fit the above

=== Task 2: Lead Entity Extraction ===
Extract lead qualification fields from the user's latest message.
CRITICAL EXTRACTION RULES:
- "name": Extract the person's name ONLY if they explicitly state it (e.g., "My name is Kush", "I am Paresh", "Call me Alice").
  DO NOT extract names from greetings, company names, cities, or pronouns.
  DO NOT guess or assume. If not explicitly stated, set to null.
- "company": Extract the explicit company or business name.
- "website": Extract the website URL.
- "industry": Extract the vertical/sector (e.g., "Healthcare", "FinTech", "eCommerce").
- "teamSize": Extract the size of the team or company (e.g., "10-20", "500").
- "budget": Extract budget figures (e.g., "$1500/mo", "$10k").
- "currentChatbot": Extract any competitor chatbot mentioned (e.g., "Intercom", "Drift").
- "businessGoals": Extract the core goals mentioned (e.g., "automate visitor lead capture").
- "phone": Extract phone numbers.
- "email": Extract email addresses.
- "city": Extract the city.
- "country": Extract the country.
- "jobTitle": Extract job titles (e.g., "CTO", "Founder").
- "linkedin": Extract LinkedIn URLs.

Respond with a single JSON object matching this schema (no markdown formatting, no other text):
{
  "intent": "detected_intent",
  "entities": {
    "name": "string or null",
    "company": "string or null",
    "website": "string or null",
    "industry": "string or null",
    "teamSize": "string or null",
    "budget": "string or null",
    "currentChatbot": "string or null",
    "businessGoals": "string or null",
    "phone": "string or null",
    "email": "string or null",
    "city": "string or null",
    "country": "string or null",
    "jobTitle": "string or null",
    "linkedin": "string or null"
  }
}`;

    const userContent = `Message History:\n${formattedHistory}\n\nLatest User Message: "${message}"`;

    try {
      const response = await getGroqChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        { temperature: 0.1, maxTokens: 800 }
      );

      const jsonStart = response.indexOf("{");
      const jsonEnd = response.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = response.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        return {
          intent: parsed.intent || "general_question",
          entities: parsed.entities || {},
        };
      }
    } catch (err) {
      console.warn("[Orchestrator] Combined input analysis failed, using fallback:", err);
    }

    return {
      intent: "general_question",
      entities: {},
    };
  }

  /**
   * Conservative rule-based fast-path for message analysis.
   * Only returns confident=true for messages that are completely unambiguous.
   * If there is ANY doubt, returns confident=false to fall back to the LLM.
   *
   * Design principles:
   * - Never guess. Never overwrite.
   * - A false negative (falling back to LLM) is harmless.
   * - A false positive (wrong intent/entity) is harmful.
   * - Only match when the ENTIRE message fits a known pattern.
   */
  private static quickAnalyze(message: string): {
    intent: UserIntent;
    entities: any;
    confident: boolean;
  } {
    const text = message.trim();
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    const emptyEntities = {
      name: null, email: null, phone: null, company: null,
      industry: null, website: null, teamSize: null,
      monthlyVisitors: null, budget: null, currentChatbot: null,
      businessGoals: null, city: null, country: null,
      jobTitle: null, linkedin: null,
    };

    // --- Rule 1: Pure greeting (message is ONLY a greeting, max 4 words) ---
    if (wordCount <= 4) {
      const greetingPattern = /^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening|day)|namaste|namaskar)\s*[!.,]?$/i;
      if (greetingPattern.test(text)) {
        return { intent: "greeting", entities: emptyEntities, confident: true };
      }
    }

    // --- Rule 2: Explicit name statement (and NOTHING else meaningful) ---
    //     Only matches: "My name is X" / "I am X" / "Call me X" as the entire message.
    //     Rejects if additional clauses exist ("and", "from", commas, etc.)
    if (wordCount <= 6) {
      const namePatterns = [
        /^my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[.!]?$/i,
        /^i\s+am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[.!]?$/i,
        /^call me\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[.!]?$/i,
      ];

      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const candidateName = match[1].trim();
          // Reject if the "name" looks like a title, role, or common word
          const blacklist = ["cto", "ceo", "cfo", "coo", "manager", "director", "founder",
            "owner", "president", "engineer", "developer", "here", "good", "fine",
            "interested", "looking", "from", "the", "a", "an"];
          if (blacklist.includes(candidateName.toLowerCase())) break;
          // Reject if message contains conjunctions indicating more content
          if (/\b(and|from|at|with|,)\b/i.test(text)) break;

          return {
            intent: "general_question",
            entities: { ...emptyEntities, name: candidateName },
            confident: true,
          };
        }
      }
    }

    // --- Rule 3: Pure email sharing (message is essentially just an email) ---
    //     Matches: "my email is x@y.com" / "email: x@y.com" / just "x@y.com"
    if (wordCount <= 6) {
      const emailOnly = /^(?:my\s+email\s+(?:is|:)\s*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*[.!]?$/i;
      const match = text.match(emailOnly);
      if (match && match[1] && !/\b(and|also|name|company|phone)\b/i.test(text)) {
        return {
          intent: "general_question",
          entities: { ...emptyEntities, email: match[1].toLowerCase() },
          confident: true,
        };
      }
    }

    // --- Rule 4: Pure phone sharing (message is essentially just a phone number) ---
    //     Matches: "my phone is 9876543210" / "phone: 9876543210" / just "9876543210"
    if (wordCount <= 6) {
      const phoneOnly = /^(?:my\s+(?:phone|number|mobile|cell)\s+(?:is|:)\s*)?([+]?\d[\d\s\-().]{7,15})\s*[.!]?$/i;
      const match = text.match(phoneOnly);
      if (match && match[1] && !/\b(and|also|name|company|email)\b/i.test(text)) {
        return {
          intent: "general_question",
          entities: { ...emptyEntities, phone: match[1].replace(/[\s\-().]/g, "") },
          confident: true,
        };
      }
    }

    // --- No confident match: fall back to LLM ---
    return { intent: "general_question", entities: emptyEntities, confident: false };
  }
}
