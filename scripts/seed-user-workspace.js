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

const seed = async () => {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to database for user mapping seed.");

    const clientId = '3d8b4428-6916-41c1-ac8b-44197c405b0c';
    const users = [
      { id: 'bd47b5de-4415-44bd-a1a3-bdb3e937974f', email: 'kush.tarkshy@gmail.com', name: 'Kush Tarkshy' },
      { id: '07d9ba15-aea9-4354-b79e-b8436dc270c3', email: 'kushkundariya45@gmail.com', name: 'Kush Kundariya' }
    ];

    for (const user of users) {
      console.log(`Processing mapping for user: ${user.email} (${user.id})`);
      
      // 1. Insert Profile
      await client.query(`
        INSERT INTO public.profiles (id, full_name, email, avatar_url, is_super_admin)
        VALUES ($1, $2, $3, NULL, false)
        ON CONFLICT (id) DO UPDATE SET full_name = $2, email = $3;
      `, [user.id, user.name, user.email]);

      // 2. Insert Client User Mapping
      await client.query(`
        INSERT INTO public.client_users (client_id, user_id, role)
        VALUES ($1, $2, 'client_admin')
        ON CONFLICT (client_id, user_id) DO NOTHING;
      `, [clientId, user.id]);
    }

    console.log("Seed operations complete.");
  } catch (err) {
    console.error("Seed failed:", err);
  } finally {
    await client.end();
  }
};

seed();
