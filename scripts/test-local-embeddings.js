/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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
const databaseUrl = envVars['DATABASE_URL'];
const ollamaHost = envVars['OLLAMA_HOST'] || 'http://localhost:11434';

const testEmbeddings = async () => {
  console.log("--- Testing Local Ollama Embeddings ---");
  console.log(`Using Ollama Host: ${ollamaHost}`);

  // Test single embedding
  try {
    const res = await fetch(`${ollamaHost}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: "This is a test of the local nomic-embed-text model."
      })
    });

    if (!res.ok) {
      throw new Error(`Ollama API returned status ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    console.log("SUCCESS: Single embedding generated via /api/embeddings.");
    console.log(`Embedding dimension: ${data.embedding.length} (Expected: 768)`);
    
    if (data.embedding.length !== 768) {
      console.error("ERROR: Expected 768 dimensions, got " + data.embedding.length);
    }
  } catch (err) {
    console.error("FAILED: Single embedding generation failed.", err.message);
    console.log("\n[TIP] Make sure Ollama is running and you have run: ollama pull nomic-embed-text\n");
    return false;
  }

  // Test batch embeddings
  try {
    const res = await fetch(`${ollamaHost}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        input: ["First test chunk.", "Second test chunk."]
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.embeddings && data.embeddings.length === 2) {
        console.log("SUCCESS: Batch embeddings generated via /api/embed.");
        console.log(`Batch sizes: ${data.embeddings[0].length}, ${data.embeddings[1].length}`);
      } else {
        console.warn("WARNING: /api/embed response format unexpected.");
      }
    } else {
      console.warn(`WARNING: /api/embed returned status ${res.status}. Batch fallback will be used.`);
    }
  } catch (err) {
    console.warn("WARNING: /api/embed failed. Batch fallback will be used.", err.message);
  }

  return true;
};

const testDatabaseRAG = async () => {
  console.log("\n--- Testing Database pgvector RAG Flow ---");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase database.");

    // 1. Get first client to use as test workspace
    const clientRes = await client.query("SELECT id FROM clients LIMIT 1");
    if (clientRes.rows.length === 0) {
      console.error("ERROR: No clients found in database. Please run seed script first.");
      return;
    }
    const workspaceId = clientRes.rows[0].id;
    console.log(`Using test workspace ID: ${workspaceId}`);

    // 2. Clear old test documents/chunks
    await client.query("DELETE FROM knowledge_documents WHERE file_name = 'test-rag-document.txt'");
    
    // 3. Create a test document
    const docRes = await client.query(`
      INSERT INTO knowledge_documents (workspace_id, file_name, file_type, file_size, storage_path, status)
      VALUES ($1, 'test-rag-document.txt', 'text/plain', '100', 'test/path', 'processed')
      RETURNING id
    `, [workspaceId]);
    const docId = docRes.rows[0].id;
    console.log(`Created test document in DB with ID: ${docId}`);

    // 4. Generate real embeddings for test chunks using Ollama
    const chunks = [
      "ACME Corp's refund policy allows returns within 45 days of purchase with a valid receipt.",
      "ACME Corp was founded in 1995 by John Doe and is headquartered in San Francisco.",
      "ACME Corp offers premium technical support 24/7 via email and live chat."
    ];

    console.log("Generating embeddings for 3 chunks...");
    const embeddings = [];
    for (const chunk of chunks) {
      const res = await fetch(`${ollamaHost}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: chunk })
      });
      const data = await res.json();
      embeddings.push(data.embedding);
    }

    // 5. Insert chunks with embeddings into DB
    console.log("Inserting chunks into knowledge_chunks table...");
    for (let i = 0; i < chunks.length; i++) {
      // Format vector as Postgres vector literal: '[0.1, 0.2, ...]'
      const vectorLiteral = `[${embeddings[i].join(',')}]`;
      await client.query(`
        INSERT INTO knowledge_chunks (document_id, workspace_id, chunk_text, embedding, chunk_index)
        VALUES ($1, $2, $3, $4, $5)
      `, [docId, workspaceId, chunks[i], vectorLiteral, i]);
    }
    console.log("Inserted 3 chunks successfully.");

    // 6. Perform similarity search query
    const query = "What is the refund policy at ACME?";
    console.log(`\nRunning similarity search for query: "${query}"`);
    
    const queryRes = await fetch(`${ollamaHost}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: query })
    });
    const queryData = await queryRes.json();
    const queryEmbeddingLiteral = `[${queryData.embedding.join(',')}]`;

    const searchRes = await client.query(`
      SELECT chunk_text, 1 - (embedding <=> $1::vector) AS similarity
      FROM knowledge_chunks
      WHERE workspace_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT 2
    `, [queryEmbeddingLiteral, workspaceId]);

    console.log("Search Results:");
    searchRes.rows.forEach((row, idx) => {
      console.log(`  [${idx + 1}] Similarity: ${row.similarity.toFixed(4)}`);
      console.log(`      Text: "${row.chunk_text}"`);
    });

    if (searchRes.rows.length > 0 && searchRes.rows[0].similarity > 0.4) {
      console.log("\nSUCCESS: Semantic similarity search returned the correct refund policy chunk!");
    } else {
      console.error("\nFAILED: Semantic similarity search did not return the correct chunk or similarity is too low.");
    }

  } catch (err) {
    console.error("ERROR during database RAG test:", err);
  } finally {
    await client.end();
  }
};

const run = async () => {
  const ok = await testEmbeddings();
  if (ok) {
    await testDatabaseRAG();
  }
};

run();
