export class RecommendationEngine {
  /**
   * Evaluates message content and intent to supply target recommendations.
   */
  public static getRecommendationInstructions(
    intent: string,
    message: string
  ): string {
    const lowerMsg = message.toLowerCase();
    const isPricingOrPlan =
      intent === "pricing_inquiry" ||
      lowerMsg.includes("plan") ||
      lowerMsg.includes("price") ||
      lowerMsg.includes("cost") ||
      lowerMsg.includes("subscription") ||
      lowerMsg.includes("tier");

    const isIntegration =
      lowerMsg.includes("integrate") ||
      lowerMsg.includes("zapier") ||
      lowerMsg.includes("slack") ||
      lowerMsg.includes("crm") ||
      lowerMsg.includes("hubspot") ||
      lowerMsg.includes("whatsapp") ||
      lowerMsg.includes("connection");

    const isService =
      intent === "product_inquiry" ||
      lowerMsg.includes("service") ||
      lowerMsg.includes("consulting") ||
      lowerMsg.includes("software") ||
      lowerMsg.includes("develop");

    const isComparison =
      lowerMsg.includes("intercom") ||
      lowerMsg.includes("better than") ||
      lowerMsg.includes("choose you") ||
      lowerMsg.includes("different") ||
      lowerMsg.includes("competitor") ||
      lowerMsg.includes("versus") ||
      lowerMsg.includes("vs");

    let recommendations = "";

    if (isPricingOrPlan) {
      recommendations += `\n- The visitor is asking about pricing. Present our plans confidently: we offer flexible Business and Custom Enterprise plans tailored to their needs. Mention the 14-day full satisfaction refund policy. Do NOT apologize for pricing — instead, explain the value: 24/7 AI automation replaces manual effort, captures leads automatically, and scales without hiring. Ask about their budget to recommend the right plan.`;
    }
    if (isIntegration) {
      recommendations += `\n- The visitor is interested in integrations. Highlight our seamless connectivity with Zapier, Slack, CRM tools (HubSpot, Salesforce), WhatsApp Business, and voice AI. Explain how these integrations help automate their existing workflows without replacing their current tools.`;
    }
    if (isService) {
      recommendations += `\n- The visitor is asking about services. Highlight our key offerings clearly:
  • AI Chatbots & Business Assistants (intelligent lead capture, not simple Q&A)
  • AI Workflow Automation (automate repetitive business processes)
  • Custom AI Solutions (tailored to specific business needs)
  • Cloud Architecture & Data Engineering
  • CRM & Email Automation
  Tie each service to their specific business needs if known.`;
    }
    if (isComparison) {
      recommendations += `\n- The visitor is comparing us with competitors. Be professional and confident — never bad-mouth competitors. Highlight our unique advantages:
  • Guided Sales Conversations (not just Q&A — we convert visitors into qualified leads)
  • Visitor Memory (remembers visitors across multiple sessions)
  • RAG Knowledge Base (semantic search through your business data)
  • Progressive Lead Qualification (collects information naturally through conversation)
  • Local AI Support (data stays on your infrastructure)
  • Custom AI Workflows & Business Automation
  Keep the comparison brief, factual, and focused on business outcomes.`;
    }

    if (recommendations === "") {
      return "";
    }

    return `\n\nRecommendation Guidelines (weave naturally into your response):${recommendations}\n- Always frame recommendations as solutions to the visitor's specific business challenges. Keep explanations concise and value-focused.`;
  }
}
