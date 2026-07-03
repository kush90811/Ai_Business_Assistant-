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

const inspectUsers = async () => {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("--- Connected to Database ---");

    // 1. Fetch Clients
    const clientsRes = await client.query("SELECT id, name, slug FROM public.clients;");
    console.log("Clients:");
    clientsRes.rows.forEach(r => console.log(` - id: ${r.id}, name: ${r.name}, slug: ${r.slug}`));

    // 2. Fetch Client Users
    const usersRes = await client.query("SELECT id, client_id, user_id, role FROM public.client_users;");
    console.log("\nClient Users Mapping:");
    usersRes.rows.forEach(r => console.log(` - id: ${r.id}, client_id: ${r.client_id}, user_id: ${r.user_id}, role: ${r.role}`));

    // 3. Fetch Profiles
    const profilesRes = await client.query("SELECT id, email, full_name FROM public.profiles;");
    console.log("\nUser Profiles:");
    profilesRes.rows.forEach(r => console.log(` - id: ${r.id}, email: ${r.email}, name: ${r.full_name}`));

  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await client.end();
  }
};

inspectUsers();
