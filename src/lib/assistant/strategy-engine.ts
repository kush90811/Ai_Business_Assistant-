import {
  AssistantMode,
  UserIntent,
  ConversationStage,
  StageMetadata,
  VisitorProfile,
  PRIORITY_FIELDS,
  QUALIFICATION_FIELDS,
} from "./types";

export class StrategyEngine {
  /**
   * Evaluates and updates the mode of the session based on current mode and detected intent.
   */
  public static determineMode(
    currentMode: AssistantMode,
    intent: UserIntent
  ): AssistantMode {
    if (intent === "support_request" || intent === "technical_issue") {
      return "support";
    }

    if (
      intent === "purchase_intent" ||
      intent === "demo_request" ||
      intent === "pricing_inquiry"
    ) {
      return "sales";
    }

    return currentMode || "standard";
  }

  /**
   * Deterministically computes the current conversation stage, goal,
   * and field tracking using business rules — NOT the LLM.
   */
  public static determineStage(
    currentStage: ConversationStage,
    intent: UserIntent,
    profile: VisitorProfile,
    mode: AssistantMode
  ): StageMetadata {
    // Compute completed and pending qualification fields
    const completedFields: string[] = [];
    const pendingFields: string[] = [];

    for (const field of QUALIFICATION_FIELDS) {
      const val = profile[field];
      if (val !== null && val !== undefined && String(val).trim() !== "" && String(val) !== "Anonymous Visitor") {
        completedFields.push(field);
      } else {
        pendingFields.push(field);
      }
    }
    // Also track email separately (it's in VisitorProfile but not QUALIFICATION_FIELDS)
    if (profile.email && profile.email.trim() !== "") {
      if (!completedFields.includes("email")) completedFields.push("email");
    } else {
      if (!pendingFields.includes("email")) pendingFields.push("email");
    }

    // If in support mode, stay at current stage but with support goal
    if (mode === "support") {
      return {
        currentStage: currentStage,
        currentGoal: "resolve_technical_issue",
        completedFields,
        pendingFields,
      };
    }

    // Check if all priority fields are collected
    const priorityMet = PRIORITY_FIELDS.every((f) => completedFields.includes(f));

    // Check if contact info is present (email or phone)
    const hasContactInfo = Boolean(
      (profile.email && profile.email.trim() !== "") ||
      (profile.phone && profile.phone.trim() !== "")
    );

    // --- Deterministic stage progression rules ---

    let nextStage: ConversationStage = currentStage;
    let currentGoal = "";

    switch (currentStage) {
      case "greeting":
        // Exit greeting when: intent is not greeting/small_talk, OR name is known
        if (
          (intent !== "greeting" && intent !== "small_talk") ||
          completedFields.includes("name")
        ) {
          nextStage = "business_discovery";
        } else {
          nextStage = "greeting";
          currentGoal = "welcome_and_build_rapport";
          break;
        }
      // falls through intentionally to evaluate next stage

      case "business_discovery":
        if (
          completedFields.includes("company") ||
          completedFields.includes("industry") ||
          completedFields.includes("businessGoals")
        ) {
          nextStage = "pain_point_discovery";
        } else {
          nextStage = "business_discovery";
          currentGoal = completedFields.includes("name")
            ? "understand_business"
            : "learn_visitor_name_and_business";
          break;
        }
      // falls through

      case "pain_point_discovery":
        if (completedFields.includes("businessGoals") || completedFields.length >= 4) {
          nextStage = "qualification";
        } else {
          nextStage = "pain_point_discovery";
          currentGoal = "identify_pain_points_and_goals";
          break;
        }
      // falls through

      case "qualification":
        if (priorityMet) {
          nextStage = "recommendation";
        } else {
          nextStage = "qualification";
          // Find the next priority field to collect
          const nextPriority = PRIORITY_FIELDS.find((f) => !completedFields.includes(f));
          currentGoal = nextPriority ? `collect_${nextPriority}` : "collect_remaining_info";
          break;
        }
      // falls through

      case "recommendation":
        // Move to objection_handling if pricing/comparison intent detected
        if (intent === "pricing_inquiry" || intent === "feature_comparison") {
          nextStage = "objection_handling";
          currentGoal = "handle_objection";
          break;
        }
        // Move to demo_booking if purchase/demo intent detected
        if (intent === "purchase_intent" || intent === "demo_request") {
          nextStage = "demo_booking";
          currentGoal = "guide_to_demo_or_contact";
          break;
        }
        nextStage = "recommendation";
        currentGoal = "recommend_tailored_solutions";
        break;

      case "objection_handling":
        // Stay in objection handling if still objecting
        if (intent === "pricing_inquiry" || intent === "feature_comparison") {
          nextStage = "objection_handling";
          currentGoal = "handle_objection";
          break;
        }
        // Move to demo after objections are resolved
        if (intent === "purchase_intent" || intent === "demo_request") {
          nextStage = "demo_booking";
          currentGoal = "guide_to_demo_or_contact";
          break;
        }
        // Default: advance to recommendation if no longer objecting
        nextStage = "recommendation";
        currentGoal = "recommend_tailored_solutions";
        break;

      case "demo_booking":
        if (hasContactInfo && priorityMet) {
          nextStage = "close";
          currentGoal = "warm_conversation_close";
        } else {
          nextStage = "demo_booking";
          currentGoal = hasContactInfo
            ? "confirm_demo_details"
            : "collect_contact_for_demo";
        }
        break;

      case "close":
        nextStage = "close";
        currentGoal = "warm_conversation_close";
        break;

      default:
        nextStage = "greeting";
        currentGoal = "welcome_and_build_rapport";
    }

    // Intent-based overrides (can jump stages when visitor explicitly asks)
    if (intent === "demo_request" && nextStage !== "close") {
      nextStage = "demo_booking";
      currentGoal = "guide_to_demo_or_contact";
    }
    if (intent === "purchase_intent" && nextStage !== "close" && nextStage !== "demo_booking") {
      nextStage = "demo_booking";
      currentGoal = "guide_to_demo_or_contact";
    }

    return {
      currentStage: nextStage,
      currentGoal,
      completedFields,
      pendingFields,
    };
  }

  /**
   * Returns stage-specific conversation instructions for the system prompt.
   */
  private static getStageInstructions(stage: ConversationStage, goal: string, pendingFields: string[]): string {
    const goalDescriptions: Record<string, string> = {
      welcome_and_build_rapport: "Welcome the visitor warmly. Introduce yourself as their AI assistant. Briefly mention that you help businesses with AI automation, chatbots, and custom solutions. Ask them about their business to get started.",
      learn_visitor_name_and_business: "Ask the visitor for their name and what kind of business they run. Be warm and conversational.",
      understand_business: "Ask about their business — what industry they are in, what they do, and what their main challenges are. Show genuine interest.",
      identify_pain_points_and_goals: "Explore the visitor's operational challenges. Ask about manual processes, repetitive tasks, or bottlenecks they face. Connect their pain points to how AI automation could help.",
      collect_company_name: "Naturally ask for their company name so you can better understand their needs.",
      collect_name: "Politely ask for their name so you can personalize the conversation.",
      collect_email: "Ask for their email so you can send them relevant information or a proposal.",
      collect_businessGoals: "Ask what their primary business goals are — what outcome they want to achieve with AI.",
      collect_remaining_info: "Continue collecting any missing qualification details naturally.",
      recommend_tailored_solutions: "Based on what you know about the visitor's business and goals, recommend specific AI solutions that would benefit them. Be specific and tie each recommendation to their stated needs.",
      handle_objection: "The visitor has a concern or objection. Address it professionally by emphasizing the business value and ROI. Do NOT apologize for pricing. Instead, explain the value (24/7 automation, lead capture, human hour savings) and ask about their budget or specific concern.",
      guide_to_demo_or_contact: "The visitor is interested. Guide them toward booking a demo call or leaving their contact details. Be enthusiastic but not pushy.",
      collect_contact_for_demo: "Ask for their email or phone number so your team can schedule a personalized demo.",
      confirm_demo_details: "Confirm the demo interest and let them know the team will reach out shortly.",
      warm_conversation_close: "Thank the visitor warmly. Summarize what was discussed. Let them know you're always available if they need anything else.",
      resolve_technical_issue: "Focus on resolving the visitor's technical issue step by step. Be patient and helpful.",
    };

    const instruction = goalDescriptions[goal] || goalDescriptions["welcome_and_build_rapport"];

    let stagePrompt = `\n\n=== Current Conversation Stage: ${stage.toUpperCase().replace(/_/g, " ")} ===\nYour current objective: ${instruction}`;

    // Add field awareness for qualification stages
    if (pendingFields.length > 0 && ["qualification", "business_discovery", "pain_point_discovery"].includes(stage)) {
      stagePrompt += `\nInformation still needed: ${pendingFields.join(", ")}. Ask for ONE piece of information at a time, naturally woven into the conversation.`;
    }

    return stagePrompt;
  }

  /**
   * Builds the master system prompt by coordinating persona, stage, constraints, and context.
   */
  public static buildSystemPrompt(params: {
    brandName: string;
    mode: AssistantMode;
    stageMetadata: StageMetadata;
    memoryContext: string;
    backgroundContext: string;
    ragContext: string;
    modeInstructions: string;
    recommendationInstructions: string;
  }): string {
    const {
      brandName,
      mode,
      stageMetadata,
      memoryContext,
      backgroundContext,
      ragContext,
      modeInstructions,
      recommendationInstructions,
    } = params;

    let prompt = `You are ${brandName}'s AI Business Assistant — a warm, professional, and confident virtual sales executive and customer support specialist.

You are NOT a simple Q&A chatbot. You are a skilled conversationalist who builds trust, understands business needs, recommends solutions, and guides visitors toward becoming qualified leads.

=== Personality ===
- Friendly, warm, and approachable — like talking to a helpful colleague.
- Confident and knowledgeable about AI automation, chatbots, and business solutions.
- Professional but never stiff or robotic.
- Genuinely interested in the visitor's business and challenges.

=== Response Rules (STRICT) ===
1. TONE: Be conversational and engaging. Use short paragraphs (3-6 lines typical). Use bullet points when listing services or features. Never give cold one-sentence answers.
2. LANGUAGE: Respond in the EXACT same language the visitor uses (English, Hindi, Hinglish). NEVER prefix your response with "Translation:" or any translation labels. Just respond naturally in their language.
3. ONE QUESTION RULE: End your response with exactly ONE follow-up question to guide the conversation forward. Never ask multiple questions at once.
4. MEMORY AWARENESS: Never ask for information that is already in the Visitor Profile below. Never repeat questions that were already asked in the conversation history.
5. PROACTIVE GUIDANCE: Always guide the conversation toward a clear next step (understanding their needs, recommending a solution, booking a demo). Never leave the visitor hanging.
6. NEVER SAY: "Translation:", "I don't know", "I'm just a chatbot", "I cannot help". Instead, offer to connect them with a human expert or suggest alternative ways you can help.`;

    // Stage-specific instructions
    prompt += StrategyEngine.getStageInstructions(
      stageMetadata.currentStage,
      stageMetadata.currentGoal,
      stageMetadata.pendingFields
    );

    if (memoryContext) {
      prompt += `\n\n${memoryContext}`;
    }

    if (backgroundContext) {
      prompt += `\n\nConversation Memory (Previous discussions from past sessions of this visitor — use this to remember past requests naturally, greet returning visitors warmly):\n${backgroundContext}`;
    }

    if (ragContext) {
      prompt += `\n\nUse the following retrieved context from our knowledge base to answer the user's question. Answer using the provided context first. If the answer cannot be found in the context, say: "I don't have that specific detail in my knowledge base, but let me connect you with someone who can help." Do not make up details.\n\nRetrieved Context:\n${ragContext}`;
    }

    if (modeInstructions) {
      prompt += modeInstructions;
    }

    if (recommendationInstructions) {
      prompt += recommendationInstructions;
    }

    return prompt;
  }
}
