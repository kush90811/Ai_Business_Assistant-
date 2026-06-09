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
 * Calls the Groq chat completions endpoint to generate a response.
 */
export async function getGroqChatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const hasGroqKey = Boolean(env.groqApiKey);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!hasGroqKey && !openaiKey) {
    throw new Error("Neither GROQ_API_KEY nor OPENAI_API_KEY environment variable is set.");
  }

  const apiKey = hasGroqKey ? env.groqApiKey : openaiKey!;
  const apiUrl = hasGroqKey 
    ? "https://api.groq.com/openai/v1/chat/completions" 
    : "https://api.openai.com/v1/chat/completions";
  
  const defaultModel = hasGroqKey ? env.groqModel : "gpt-4o-mini";
  const model = options?.model ?? defaultModel;
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens;

  let response;
  try {
    response = await fetch(apiUrl, {
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
    });
  } catch (fetchErr: unknown) {
    console.warn("Failed to fetch from LLM API, falling back to simulation.", fetchErr);
    return `[Simulated] Hello! I am the AI Assistant. I received your message: "${messages[messages.length - 1]?.content}". (Note: LLM network request failed)`;
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429 || errorText.includes("insufficient_quota")) {
      console.warn("API quota exceeded. Returning simulated response.");
      const userMsg = messages[messages.length - 1]?.content || "";
      return `[Simulated] Hello! I am the AI Assistant. You asked: "${userMsg}". (Note: API quota exceeded, showing simulated response)`;
    }
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GroqChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("API returned an empty completion response.");
  }

  return content;
}
