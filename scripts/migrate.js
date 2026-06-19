const { Client } = require('pg');
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
const databaseUrl = envVars['DATABASE_URL'];

if (!databaseUrl) {
  console.error("DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const runMigration = async () => {
  console.log("Connecting to database using URL in .env.local...");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log("Successfully connected to Supabase database.");

    const migrationFile = path.join(__dirname, '../supabase/migrations/002_knowledge_base_rag.sql');
    console.log(`Loading migration file: ${migrationFile}`);
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    console.log("Executing SQL migration...");
    await client.query(sql);
    console.log("Migration executed successfully! Vector RAG schema is now deployed.");
  } catch (err) {
    console.error("Migration execution failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
};

runMigration();
