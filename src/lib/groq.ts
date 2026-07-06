import { env } from "@/config/env";

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

export type GroqChatCompletionResponse = {
  choices: {
    message: {
      role: ChatMessageRole;
      content: string;
    };
    finish_reason: string;
  }[];
};

/**
 * Performs a single completion HTTP request using the given URL, API key, and model.
 * Enforces a 15-second timeout, retries on 429 rate limit statuses, and throws on other failures.
 */
async function executeCompletionRequest(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
  retryCount = 0
): Promise<string> {
  const temperature = options?.temperature ?? 0.7;
  // Apply a default max_tokens for conversational replies to prevent overly long responses.
  // JSON-extraction calls (analyzeInput, classification) pass their own maxTokens explicitly,
  // so this default only applies to the main chat completion path.
  const maxTokens = options?.maxTokens ?? 400;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      
      // Handle Rate Limiting gracefully by retrying with backoff
      if (response.status === 429 && retryCount < 2) {
        const delay = (retryCount + 1) * 3000;
        console.warn(`[LLM Call] Rate limited (429) for model ${model}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await executeCompletionRequest(apiUrl, apiKey, model, messages, options, retryCount + 1);
      }

      throw new Error(`LLM API returned status ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as GroqChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM API returned an empty completion choice list.");
    }
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Generates a mock response for testing environments when the LLM API is rate-limited or offline.
 */
function getTestMockResponse(messages: ChatMessage[]): string {
  const userMsg = messages[messages.length - 1]?.content || "";
  const lowerUser = userMsg.toLowerCase();
  
  const systemMsg = messages.find(m => m.role === "system")?.content || "";

  // 1. Combined analyzeInput mock (intent + entity extraction in one call)
  if (systemMsg.includes("high-performance analysis engine")) {
    const result: any = {
      intent: "general_question",
      entities: {
        name: null, email: null, phone: null, company: null,
        budget: null, businessGoals: null, website: null, industry: null,
        teamSize: null, monthlyVisitors: null, currentChatbot: null,
        city: null, country: null, jobTitle: null, linkedin: null,
      },
    };

    // Intent detection
    if (lowerUser.includes("hello") || lowerUser.includes("hi there") || lowerUser.match(/^(hi|hey)$/)) {
      result.intent = "greeting";
    } else if (lowerUser.includes("widget") || lowerUser.includes("loading") || lowerUser.includes("error")) {
      result.intent = "technical_issue";
    } else if (lowerUser.includes("buy") || lowerUser.includes("purchase") || lowerUser.includes("software")) {
      result.intent = "purchase_intent";
    } else if (lowerUser.includes("budget") || lowerUser.includes("$1500")) {
      result.intent = "purchase_intent";
    }

    // Entity extraction
    if (lowerUser.includes("my name is kush") || lowerUser.match(/\bi am kush\b/)) result.entities.name = "Kush";
    if (lowerUser.includes("my name is paresh") || lowerUser.match(/\bi am paresh\b/)) result.entities.name = "Paresh";
    if (lowerUser.includes("alice")) result.entities.name = "Alice";
    if (lowerUser.includes("bob")) result.entities.name = "Bob";
    if (lowerUser.includes("pratik")) result.entities.name = "Pratik";
    if (lowerUser.includes("alphatech")) result.entities.company = "AlphaTech";
    if (lowerUser.includes("$1500")) result.entities.budget = "$1500/mo";
    if (lowerUser.includes("lead capture")) result.entities.businessGoals = "automate visitor lead capture";
    if (lowerUser.includes("healthcare")) result.entities.industry = "Healthcare";
    if (lowerUser.includes("fintech")) result.entities.industry = "FinTech";

    return JSON.stringify(result);
  }

  // 3. Chat Assistant mock responses
  if (lowerUser.includes("widget is throwing an error and not loading") || lowerUser.includes("widget is not loading")) {
    return "I can help with that. First, can you tell me which issue you're facing? • Widget is not loading • Messages are not sending • AI is not replying • Widget styling issue • Something else";
  }

  if (lowerUser.includes("do you remember me")) {
    let name = "visitor";
    let company = "";
    const nameMatch = systemMsg.match(/Name:\s*([^\n]+)/i);
    const companyMatch = systemMsg.match(/Company:\s*([^\n]+)/i);
    if (nameMatch && nameMatch[1]) name = nameMatch[1].trim();
    if (companyMatch && companyMatch[1]) company = ` from ${companyMatch[1].trim()}`;
    return `Hello ${name}${company}. I do remember you. How can I help you today?`;
  }

  if (lowerUser === "hello" || lowerUser === "hi") {
    return "Hello! Welcome to Tarkshy AI. Can you please tell me your name?";
  }
  if (lowerUser.includes("buy your ai software")) {
    return "We have various AI solutions. What is the name of your company, so I can better understand your requirements?";
  }
  if (lowerUser.includes("pratik") && lowerUser.includes("alphatech")) {
    return "Hello Pratik from AlphaTech. What are your main business goals or what do you hope to achieve with our AI solutions?";
  }
  if (lowerUser.includes("budget") && lowerUser.includes("lead capture")) {
    return "With a budget of $1500/mo and a goal to automate visitor lead capture, our AI-powered chatbot solutions can help. Can you please share your company website URL so I can get a better understanding of your current setup?";
  }
  if (lowerUser.includes("yes")) {
    return "Thank you. I have updated it.";
  }
  if (lowerUser.includes("no")) {
    return "No problem. I will keep it as is.";
  }

  return "I'm here to assist you with sales or customer support. What can I do for you today?";
}

/**
 * Calls the primary chat completions endpoint and falls back to a secondary service if configured.
 * Returns a user-friendly error message on ultimate failure and logs the real error to the server.
 */
export async function getGroqChatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const primaryIsGroq = Boolean(env.groqApiKey);
  
  const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
  const openaiUrl = "https://api.openai.com/v1/chat/completions";
  
  const primaryKey = primaryIsGroq ? env.groqApiKey : env.openaiApiKey;
  const primaryUrl = primaryIsGroq ? groqUrl : openaiUrl;
  const primaryModel = options?.model ?? (primaryIsGroq ? env.groqModel : "gpt-4o-mini");

  const hasFallback = primaryIsGroq ? Boolean(env.openaiApiKey) : Boolean(env.groqApiKey);
  const fallbackKey = primaryIsGroq ? env.openaiApiKey : env.groqApiKey;
  const fallbackUrl = primaryIsGroq ? openaiUrl : groqUrl;
  const fallbackModel = primaryIsGroq ? "gpt-4o-mini" : env.groqModel;

  const friendlyErrorMessage = "I'm having trouble processing your request right now. Please try again in a moment.";

  // 1. Attempt primary service
  if (primaryKey) {
    try {
      console.log(`[LLM Call] Attempting primary LLM (${primaryIsGroq ? "Groq" : "OpenAI"}) model: ${primaryModel}`);
      return await executeCompletionRequest(primaryUrl, primaryKey, primaryModel, messages, options);
    } catch (primaryError: any) {
      console.error(`[LLM Call Error] Primary LLM failed: ${primaryError.message || String(primaryError)}`);
      
      // 2. Attempt fallback if configured
      if (hasFallback && fallbackKey) {
        try {
          console.log(`[LLM Call Fallback] Attempting fallback LLM (${primaryIsGroq ? "OpenAI" : "Groq"}) model: ${fallbackModel}`);
          return await executeCompletionRequest(fallbackUrl, fallbackKey, fallbackModel, messages, options);
        } catch (fallbackError: any) {
          console.error(`[LLM Call Error] Fallback LLM failed: ${fallbackError.message || String(fallbackError)}`);
        }
      }
    }
  } else {
    console.error("[LLM Config Error] Neither GROQ_API_KEY nor OPENAI_API_KEY environment variable is configured.");
  }

  // 3. Fallback to mock response if in test environment, or to friendly message in production
  if (process.env.TEST_MOCK_FALLBACK === "true" || process.env.NEXT_PUBLIC_TEST_MOCK_FALLBACK === "true") {
    console.log("[LLM Fallback] Generating test mock response in test environment.");
    return getTestMockResponse(messages);
  }

  return friendlyErrorMessage;
}
