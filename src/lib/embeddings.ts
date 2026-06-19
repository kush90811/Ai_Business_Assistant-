/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from "@/config/env";

/**
 * Helper to execute a fetch request with exponential backoff retries.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (res.status === 429 && retries > 0) {
      console.warn(`[OpenAI Embeddings] Rate limited (429). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[OpenAI Embeddings] Request failed. Retrying in ${delay}ms...`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw err;
  }
}

/**
 * Generates a single vector embedding for a query string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = env.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI API Key is missing. Please set the OPENAI_API_KEY environment variable."
    );
  }

  const response = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `OpenAI Embedding Generation Failed (${response.status}): ${errText}`
    );
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Invalid response format received from OpenAI Embeddings API.");
  }

  return embedding;
}

/**
 * Generates multiple vector embeddings in a batch request.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  const apiKey = env.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI API Key is missing. Please set the OPENAI_API_KEY environment variable."
    );
  }

  // OpenAI supports batching inputs. We send all chunks in one request.
  const response = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `OpenAI Batch Embedding Generation Failed (${response.status}): ${errText}`
    );
  }

  const data = await response.json();
  const embeddings = data.data?.map((item: any) => item.embedding);
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error("Received mismatching number of embeddings from OpenAI Embeddings API.");
  }

  return embeddings;
}
