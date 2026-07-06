import { env } from "@/config/env";

// Track whether we've already checked Ollama reachability
let ollamaReachabilityChecked = false;

/**
 * One-time check to verify Ollama is reachable. Logs a clear warning if not.
 */
async function checkOllamaReachability(): Promise<void> {
  if (ollamaReachabilityChecked) return;
  ollamaReachabilityChecked = true;

  const ollamaHost = env.ollamaHost;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${ollamaHost}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      console.log(`[Ollama] ✓ Ollama is reachable at ${ollamaHost}`);
    } else {
      console.warn(`[Ollama] ⚠️ WARNING: Ollama returned status ${res.status} at ${ollamaHost}. RAG context will be unavailable — the assistant will answer generically without knowledge base data.`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Ollama] ⚠️ WARNING: Ollama is NOT reachable at ${ollamaHost} (${errMsg}). RAG context will be unavailable — the assistant will answer generically without knowledge base data. Start Ollama to enable knowledge base search.`);
  }
}

/**
 * Generates a single vector embedding for a query string using local Ollama.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Check reachability on first use
  await checkOllamaReachability();

  console.log(`[Ollama Embeddings] generateEmbedding called for text of length ${text.length} characters.`);
  
  const ollamaHost = env.ollamaHost;
  
  try {
    const response = await fetch(`${ollamaHost}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: text.trim(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding API returned status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const embedding = data.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Invalid response format from Ollama /api/embeddings endpoint.");
    }

    console.log(`[Ollama Embeddings] Successfully generated embedding of dimension ${embedding.length}.`);
    return embedding;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Ollama] ⚠️ EMBEDDING FAILED: ${errMsg}. This means RAG context is MISSING for this query — the assistant will respond without knowledge base data.`);
    throw err;
  }
}

/**
 * Generates multiple vector embeddings in a batch request using local Ollama.
 * Tries the modern /api/embed endpoint first, and falls back to /api/embeddings in parallel if needed.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  console.log(`[Ollama Embeddings] generateEmbeddings called for ${texts.length} text chunks.`);

  const ollamaHost = env.ollamaHost;

  // Try the modern /api/embed endpoint first (supports batching)
  try {
    const response = await fetch(`${ollamaHost}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nomic-embed-text",
        input: texts.map(t => t.trim()),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.embeddings && Array.isArray(data.embeddings)) {
        console.log(`[Ollama Embeddings] Successfully generated ${data.embeddings.length} embeddings via /api/embed.`);
        return data.embeddings;
      }
    }
    console.warn(`[Ollama Embeddings] /api/embed failed or returned invalid format. Falling back to individual /api/embeddings requests.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Ollama Embeddings] /api/embed failed with error: ${errMsg}. Falling back to individual /api/embeddings requests.`);
  }

  // Fallback: process individual embeddings with concurrency limit
  const results: number[][] = new Array(texts.length);
  const concurrencyLimit = 4;
  
  for (let i = 0; i < texts.length; i += concurrencyLimit) {
    const batch = texts.slice(i, i + concurrencyLimit);
    const promises = batch.map(async (text, index) => {
      const globalIndex = i + index;
      const embedding = await generateEmbedding(text);
      results[globalIndex] = embedding;
    });
    await Promise.all(promises);
  }

  return results;
}
