import { getGroqChatCompletion } from "@/lib/groq";
import { UserIntent } from "./types";

export class IntentEngine {
  /**
   * Detects the user's intent based on the latest message and recent chat history.
   */
  public static async detectIntent(
    message: string,
    history: { role: string; content: string }[] = []
  ): Promise<UserIntent> {
    try {
      const recentHistory = history.slice(-5);
      const formattedHistory = recentHistory
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const systemPrompt = `You are an AI assistant specialized in detecting the intent of a user's latest message in a business chatbot.
Analyze the message and context (if any) and classify it into EXACTLY ONE of the following intents:
- greeting (e.g. hello, hi, hey, good morning)
- small_talk (e.g. how are you, who made you, joke, general non-business chat)
- product_inquiry (e.g. what is this service, tell me about your features, what do you do)
- pricing_inquiry (e.g. how much is it, what are the plans, pricing plans, is it free)
- demo_request (e.g. can I see a demo, I want a product walkthrough, book a demo)
- support_request (e.g. I need support, help, contact support, open a ticket)
- technical_issue (e.g. it is broken, error message, widget is not loading, bug)
- purchase_intent (e.g. I want to buy this, I'm ready to upgrade, subscribe, purchase)
- feature_comparison (e.g. how do you compare to competitors, versus, vs)
- general_question (any other standard question or query)

You MUST respond with a JSON object containing a single key "intent" with one of the values above. Do not include any other text or explanation.

Example JSON output:
{
  "intent": "pricing_inquiry"
}`;

      const userContent = `Message history:\n${formattedHistory}\n\nLatest User Message: "${message}"`;

      const response = await getGroqChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        { temperature: 0.1 }
      );

      const jsonStart = response.indexOf("{");
      const jsonEnd = response.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = response.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.intent) {
          const intent = parsed.intent.toLowerCase().trim() as UserIntent;
          const validIntents: UserIntent[] = [
            "greeting",
            "small_talk",
            "product_inquiry",
            "pricing_inquiry",
            "demo_request",
            "support_request",
            "technical_issue",
            "purchase_intent",
            "feature_comparison",
            "general_question",
            "off_topic",
          ];
          if (validIntents.includes(intent)) {
            console.log(`[Intent Engine] Detected intent: ${intent}`);
            return intent;
          }
        }
      }
    } catch (err) {
      console.warn("[Intent Engine] Failed to detect intent:", err);
    }

    console.log("[Intent Engine] Fallback intent: general_question");
    return "general_question";
  }
}
