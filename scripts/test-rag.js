const fs = require('fs');
const path = require('path');

// Simple helper to load environment variables from .env.local
const loadEnv = () => {
  const envPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    console.error(".env.local file not found");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let val = parts.slice(1).join('=').trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      env[key] = val;
    }
  });
  return env;
};

const envVars = loadEnv();
const openaiApiKey = envVars['OPENAI_API_KEY'];

if (!openaiApiKey) {
  console.error("OPENAI_API_KEY is missing in .env.local. Please add it to test.");
  process.exit(1);
}

const test = async () => {
  console.log("Testing OpenAI Embeddings API with text-embedding-3-small...");
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: "Test query for vector embeddings.",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    console.log("SUCCESS: OpenAI Embeddings API is working perfectly!");
    console.log("Embedding vector dimension size:", data.data[0].embedding.length);
  } catch (err) {
    console.error("ERROR: OpenAI Embeddings API connection failed:", err);
  }
};

test();
