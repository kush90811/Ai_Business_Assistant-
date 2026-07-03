/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

const run = async () => {
  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    const clientRes = await pgClient.query("SELECT id FROM clients LIMIT 1");
    if (clientRes.rows.length === 0) {
      console.error("No clients found in database.");
      return;
    }
    const clientId = clientRes.rows[0].id;
    console.log(`Using Client ID: ${clientId}`);

    const payload = {
      message: "Hello, this is a test message.",
      clientId: clientId,
      sessionId: undefined,
      visitorId: "test-visitor-trigger"
    };

    const ports = [3000, 3001];
    for (const port of ports) {
      console.log(`\nSending request to port ${port}...`);
      try {
        const response = await fetch(`http://localhost:${port}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        console.log(`Response Status: ${response.status}`);
        const text = await response.text();
        console.log(`Response Body:`, text);
      } catch (err) {
        console.error(`Failed to connect to port ${port}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pgClient.end();
  }
};

run();
