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

const runSimulation = async () => {
  console.log("--- Starting User Flow Simulation ---");
  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    
    const clientRes = await pgClient.query("SELECT id FROM clients LIMIT 1");
    const clientId = clientRes.rows[0].id;
    console.log(`Using client ID: ${clientId}`);

    const visitorId = `visitor-sim-${Math.random().toString(36).substring(2, 10)}`;
    let sessionId = undefined;

    const messages = [
      "Hello",
      "My name is Pratham",
      "My email is prathamdharsandiya@gmail.com",
      "My phone is 9426465165",
      "I am from Porbandar"
    ];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      console.log(`\n[Step ${i + 1}] Sending: "${msg}" (visitorId: ${visitorId}, sessionId: ${sessionId})`);

      const response = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          clientId,
          sessionId,
          visitorId
        })
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      sessionId = data.sessionId;
      console.log(`Received sessionId: ${sessionId}`);

      // Query leads for this session
      const leadsRes = await pgClient.query("SELECT id, name, email, phone, metadata FROM leads WHERE session_id = $1", [sessionId]);
      console.log(`Leads in DB for this session: ${leadsRes.rows.length}`);
      leadsRes.rows.forEach((r, idx) => {
        console.log(`  Lead [${idx + 1}]: ID: ${r.id}, Name: "${r.name}", Email: "${r.email}", Phone: "${r.phone}", Metadata: ${JSON.stringify(r.metadata)}`);
      });
    }

    // Check final count of leads for this session
    const finalLeads = await pgClient.query("SELECT id FROM leads WHERE session_id = $1", [sessionId]);
    console.log(`\n--- Simulation Completed ---`);
    console.log(`Total leads created for session: ${finalLeads.rows.length}`);
    if (finalLeads.rows.length === 1) {
      console.log("SUCCESS: Exactly 1 lead created and updated.");
    } else {
      console.error(`FAILURE: Created ${finalLeads.rows.length} leads instead of 1.`);
    }

  } catch (err) {
    console.error("Simulation failed:", err);
  } finally {
    await pgClient.end();
  }
};

runSimulation();
