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

const inspect = async () => {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("--- Connected to Supabase Database ---");

    // 1. Check if tables exist
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('knowledge_documents', 'knowledge_chunks', 'clients', 'client_users');
    `);
    console.log("Existing tables in public schema:");
    tablesRes.rows.forEach(r => console.log(` - ${r.table_name}`));

    // 2. Check RLS status of tables
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('knowledge_documents', 'knowledge_chunks');
    `);
    console.log("\nRLS status of RAG tables (true = enabled, false = disabled):");
    rlsRes.rows.forEach(r => console.log(` - ${r.tablename}: RLS enabled = ${r.rowsecurity}`));

    // 3. Check storage buckets
    const bucketRes = await client.query(`
      SELECT id, name, public, file_size_limit, allowed_mime_types 
      FROM storage.buckets;
    `);
    console.log("\nExisting storage buckets:");
    bucketRes.rows.forEach(r => console.log(` - id: ${r.id}, name: ${r.name}, public: ${r.public}`));

    // 4. Check storage policies on storage.objects
    const policiesRes = await client.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'storage' AND tablename = 'objects';
    `);
    console.log("\nStorage policies on storage.objects:");
    if (policiesRes.rows.length === 0) {
      console.log(" - No policies configured on storage.objects!");
    } else {
      policiesRes.rows.forEach(r => console.log(` - policyname: ${r.policyname}, command: ${r.cmd}, roles: ${r.roles}`));
    }

  } catch (err) {
    console.error("Inspection failed:", err);
  } finally {
    await client.end();
  }
};

inspect();
