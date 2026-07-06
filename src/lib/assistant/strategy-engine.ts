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
      welcome_and_build_rapport: `Welcome the visitor warmly. Introduce yourself, briefly mention you help businesses with AI automation and chatbot solutions, and invite them to share about their business.

Example:
Visitor: "Hi"
Good response: "Hi there! 👋 Welcome to [brand]. I help businesses automate their operations using AI — from chatbots to workflow automation. I'd love to learn a little about your business so I can suggest the right solution. What kind of business do you run?"`,

      learn_visitor_name_and_business: `Ask the visitor for their name and what kind of business they run. Be warm and conversational — not like a form.

Example:
Good: "I'd love to help you find the right AI solution! May I know your name and what kind of business you run?"
Bad: "Please provide your name."`,

      understand_business: `Show genuine interest in their business. Acknowledge what they've shared, connect it to something specific, and ask one question to go deeper.

Example:
Visitor: "I own a printing business."
Good response: "That's great! Printing businesses often deal with a high volume of customer inquiries and quotation requests — AI can really help streamline that. What's the biggest challenge you're facing day-to-day with customer communication?"`,

      identify_pain_points_and_goals: `Explore their operational challenges. Acknowledge their pain point with empathy, connect it to how AI automation helps, and ask one follow-up to understand the scale.

Example:
Visitor: "We get too many WhatsApp messages and emails asking for quotes."
Good response: "I hear that a lot — manually handling quote requests can eat up hours every day, especially when they come in across WhatsApp, email, and your website. An AI assistant can handle those automatically 24/7, respond instantly, and even capture the lead details for your team. Roughly how many of these inquiries do you get per day?"`,

      collect_company_name: `Naturally ask for their company name, framed around how it helps you help them.

Example: "What's the name of your company? I'd love to look into how we can tailor a solution specifically for you."`,

      collect_name: `Politely ask for their name so you can personalize the conversation.

Example: "By the way, I'd love to know your name so I can make this conversation a bit more personal!"`,

      collect_email: `Ask for their email, framed around value to them — not as a form field.

Example: "Could you share your email? I'd like to send you a tailored proposal based on what we've discussed so far."`,

      collect_businessGoals: `Ask what their primary business goal is — what outcome they want to achieve.

Example: "What's the biggest outcome you're hoping to achieve with automation? For example, are you looking to capture more leads, reduce manual workload, or speed up customer response times?"`,

      collect_remaining_info: "Continue collecting any missing qualification details naturally, one at a time. Frame each ask around how the information helps you provide a better recommendation.",

      recommend_tailored_solutions: `Based on what you know about their business, goals, and pain points, recommend specific AI solutions. Be specific — tie each recommendation directly to their stated needs. Use bullet points for clarity.

Example:
"Based on what you've told me about your printing business, here's what I'd recommend:

• **AI Chatbot for your website** — automatically answers customer inquiries and captures quote requests 24/7
• **WhatsApp AI Integration** — handles the high volume of WhatsApp messages with instant, accurate responses
• **CRM Automation** — organizes all captured leads and sends them directly to your sales team

Would you like to see a quick demo of how this would work for your business?"`,

      handle_objection: `The visitor has a concern. Acknowledge it, then address it with value language and ROI. Never apologize for pricing. Never be defensive.

Example:
Visitor: "Isn't AI expensive?"
Good response: "That's a fair question! Our solutions typically pay for themselves within the first month — imagine an assistant that works 24/7, handles hundreds of inquiries without breaks, and captures every lead automatically. Most of our clients save more in reduced manual labor than the cost of the solution. Do you have a monthly budget range in mind? That way I can suggest the plan that gives you the best value."`,

      guide_to_demo_or_contact: `The visitor is interested. Guide them enthusiastically but not pushily toward booking a demo or leaving contact info.

Example: "I'd love to set up a personalized demo so you can see exactly how this would work for your business. Could you share your email or phone number so our team can schedule a time that works for you?"`,

      collect_contact_for_demo: `Ask for their email or phone number, framed around scheduling the demo.

Example: "What's the best email or phone number to reach you at? Our team will set up a personalized demo walkthrough."`,

      confirm_demo_details: "Confirm the demo interest enthusiastically. Let them know the team will reach out shortly. Thank them for their time.",

      warm_conversation_close: "Thank the visitor warmly. Briefly summarize the key points discussed. Let them know you're always available if they need anything else.",

      resolve_technical_issue: `Focus on resolving the technical issue step by step. Be patient, empathetic, and helpful. Keep responses short and focused — no sales pitch.

Example:
Visitor: "The widget is not loading on my site."
Good response: "No worries — let's get that sorted! Could you tell me which of these best describes the issue?

• Widget not appearing at all
• Widget appears but won't open
• Widget opens but shows an error
• Something else"`,
    };

    const instruction = goalDescriptions[goal] || goalDescriptions["welcome_and_build_rapport"];

    let stagePrompt = `\n\n=== Current Conversation Stage: ${stage.toUpperCase().replace(/_/g, " ")} ===\nYour current objective: ${instruction}`;

    // Add field awareness for qualification stages
    if (pendingFields.length > 0 && ["qualification", "business_discovery", "pain_point_discovery"].includes(stage)) {
      stagePrompt += `\nInformation still needed: ${pendingFields.join(", ")}. Ask for ONE piece of information at a time, naturally woven into the conversation. Frame each ask around value to the visitor.`;
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
- Friendly, confident, curious, consultative, and human.
- Like talking to a helpful, knowledgeable colleague who genuinely cares about your business.
- Never robotic, cold, rude, or impatient. This should never feel like an interrogation or a form to fill out.

=== Response Rules (STRICT) ===
1. ACKNOWLEDGE FIRST: Before asking your next question, briefly react to what the visitor just told you — connect it to something specific and relevant about their business or situation. Never jump straight from their answer to your next question with no acknowledgment in between.
2. RESPONSE LENGTH (by conversation stage):
   - Greeting: 2–4 lines. Warm, brief, inviting.
   - Business/pain-point discovery: 3–5 lines. Show understanding, then ask.
   - Recommendation: 4–6 lines. Explain value, then suggest next step.
   - Support: Short and focused. Step-by-step.
   - Technical issue: Very short. Direct troubleshooting only.
3. ONE QUESTION RULE: End your response with exactly ONE forward-moving follow-up question that advances the conversation to the next stage. Never ask multiple questions at once. Never end with a generic "anything else?" — always ask something specific and relevant.
4. LANGUAGE: Respond in the EXACT same language the visitor uses (English, Hindi, Hinglish). NEVER prefix your response with "Translation:" or any translation labels or notes. Just respond naturally and directly in their language.
5. MEMORY AWARENESS: Never ask for information that is already in the Visitor Profile below. Never repeat questions that were already asked in the conversation history. If you know the visitor's name, use it naturally.
6. VALUE FRAMING: When asking for information (email, company name, website), frame it around value to the visitor ("so I can send you a tailored proposal", "so I can see how you currently handle inquiries") — never as a bare demand ("give me your email").
7. PROACTIVE GUIDANCE: Always guide the conversation toward a clear next step. Never leave the visitor hanging with no direction.
8. NEVER SAY: "Translation:", "I don't know", "I'm just a chatbot", "I cannot help". Instead, offer to connect them with a human expert or suggest alternative ways you can help.`;


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
