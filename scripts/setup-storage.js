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

const setup = async () => {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to database for storage bucket and policy configuration.");

    // 1. Create 'knowledge-files' storage bucket
    console.log("Creating/verifying storage bucket 'knowledge-files'...");
    await client.query(`
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'knowledge-files', 
        'knowledge-files', 
        false, 
        10485760, 
        ARRAY[
          'application/pdf', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
          'text/plain', 
          'text/csv'
        ]
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Create RLS Policy for bucket uploads/downloads/deletes based on client membership
    console.log("Re-creating policy 'Allow workspace users access to their files' on storage.objects...");
    await client.query(`DROP POLICY IF EXISTS "Allow workspace users access to their files" ON storage.objects;`);
    await client.query(`
      CREATE POLICY "Allow workspace users access to their files" ON storage.objects
      FOR ALL
      TO authenticated
      USING (
        bucket_id = 'knowledge-files'
        AND (
          EXISTS (
            SELECT 1 FROM public.client_users
            WHERE client_users.user_id = auth.uid()
            AND client_users.client_id::text = (storage.foldername(name))[1]
          )
        )
      )
      WITH CHECK (
        bucket_id = 'knowledge-files'
        AND (
          EXISTS (
            SELECT 1 FROM public.client_users
            WHERE client_users.user_id = auth.uid()
            AND client_users.client_id::text = (storage.foldername(name))[1]
          )
        )
      );
    `);

    console.log("Storage setup successfully completed!");
  } catch (err) {
    console.error("Storage setup failed:", err);
  } finally {
    await client.end();
  }
};

setup();
