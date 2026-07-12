/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

const runAllMigrations = async () => {
  console.log("Connecting to database using URL in .env.local...");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Successfully connected to Supabase database.");

    // List of migrations to run in order
    const migrations = [
      '003_rls_tenant_isolation.sql',
      '004_response_length.sql',
      '005_business_profiles.sql',
      '006_widget_logo_url.sql',
      '007_widget_assets_bucket.sql'
    ];

    for (const file of migrations) {
      const migrationPath = path.join(__dirname, '../supabase/migrations', file);
      if (!fs.existsSync(migrationPath)) {
        console.warn(`Migration file not found: ${file}, skipping.`);
        continue;
      }

      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await client.query(sql);
      console.log(`Migration ${file} executed successfully.`);
    }

    console.log("All migrations executed successfully!");
  } catch (err) {
    console.error("Migration execution failed:", err);
  } finally {
    await client.end();
  }
};

runAllMigrations();
