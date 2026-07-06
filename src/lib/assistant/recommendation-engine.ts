export class RecommendationEngine {
  /**
   * Evaluates message content and intent to supply target recommendations.
   * Prioritizes the already-classified intent; falls back to keyword heuristics
   * only for "general_question" intent. At most ONE instruction block is injected
   * per turn to avoid unfocused, listy responses.
   */
  public static getRecommendationInstructions(
    intent: string,
    message: string
  ): string {
    const lowerMsg = message.toLowerCase();

    // --- Intent-first classification (most reliable) ---
    // If intent already tells us the category, use it directly without keyword stacking.
    if (intent === "pricing_inquiry") {
      return this.pricingBlock();
    }
    if (intent === "feature_comparison") {
      return this.comparisonBlock();
    }
    if (intent === "product_inquiry") {
      return this.serviceBlock();
    }

    // --- Keyword fallback only for general_question intent ---
    if (intent !== "general_question") {
      return "";
    }

    // Use word-boundary check for "vs" to avoid false positives (e.g. "obvs")
    const isComparison =
      lowerMsg.includes("intercom") ||
      lowerMsg.includes("better than") ||
      lowerMsg.includes("choose you") ||
      lowerMsg.includes("competitor") ||
      lowerMsg.includes("versus") ||
      /\bvs\b/i.test(lowerMsg);

    if (isComparison) return this.comparisonBlock();

    const isPricingOrPlan =
      lowerMsg.includes("plan") ||
      lowerMsg.includes("price") ||
      lowerMsg.includes("cost") ||
      lowerMsg.includes("subscription") ||
      lowerMsg.includes("tier");

    if (isPricingOrPlan) return this.pricingBlock();

    const isIntegration =
      lowerMsg.includes("integrate") ||
      lowerMsg.includes("zapier") ||
      lowerMsg.includes("slack") ||
      lowerMsg.includes("crm") ||
      lowerMsg.includes("hubspot") ||
      lowerMsg.includes("whatsapp") ||
      lowerMsg.includes("connection");

    if (isIntegration) return this.integrationBlock();

    const isService =
      lowerMsg.includes("service") ||
      lowerMsg.includes("consulting") ||
      lowerMsg.includes("software") ||
      lowerMsg.includes("develop");

    if (isService) return this.serviceBlock();

    return "";
  }

  private static pricingBlock(): string {
    return `\n\nRecommendation Context: The visitor is asking about pricing. Present plans confidently: flexible Business and Custom Enterprise plans tailored to their needs. Mention the 14-day satisfaction refund policy. Do NOT apologize for pricing — explain the value: 24/7 AI automation replaces manual effort, captures leads automatically, and scales without hiring. Ask about their budget to recommend the right plan. Keep it concise and value-focused.`;
  }

  private static integrationBlock(): string {
    return `\n\nRecommendation Context: The visitor is interested in integrations. Highlight seamless connectivity with Zapier, Slack, CRM tools (HubSpot, Salesforce), WhatsApp Business, and voice AI. Explain how these integrations automate their existing workflows without replacing their current tools. Keep it concise.`;
  }

  private static serviceBlock(): string {
    return `\n\nRecommendation Context: The visitor is asking about services. Highlight key offerings clearly — AI Chatbots & Business Assistants (intelligent lead capture), AI Workflow Automation, Custom AI Solutions, Cloud Architecture, and CRM & Email Automation. Tie each service to their specific business needs if known. Keep it concise and value-focused.`;
  }

  private static comparisonBlock(): string {
    return `\n\nRecommendation Context: The visitor is comparing us with competitors. Be professional and confident — never bad-mouth competitors. Highlight unique advantages: Guided Sales Conversations (not just Q&A — we convert visitors into qualified leads), Visitor Memory (remembers visitors across sessions), RAG Knowledge Base (semantic search through business data), Progressive Lead Qualification, Local AI Support, and Custom AI Workflows. Keep the comparison brief, factual, and focused on business outcomes.`;
  }
}
