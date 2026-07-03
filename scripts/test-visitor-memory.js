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
  console.log("==================================================");
  console.log("   TESTING VISITOR MEMORY & PROFILE RETRIEVAL    ");
  console.log("==================================================");

  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    
    // Get a valid client
    const clientRes = await pgClient.query("SELECT id FROM clients LIMIT 1");
    if (clientRes.rows.length === 0) {
      console.error("No clients found in the database. Run migrations or seed first.");
      return;
    }
    const clientId = clientRes.rows[0].id;
    console.log(`Using Client ID: ${clientId}`);

    // Generate a unique visitor ID for this test run
    const visitorId = `visitor_test_memory_${Date.now()}`;
    console.log(`Generated Visitor ID for simulation: ${visitorId}`);

    // ==================================================
    // STEP 1: INITIALIZE WIDGET (FIRST TIME VISITOR)
    // ==================================================
    console.log("\n--- STEP 1: Initializing Widget (New Visitor) ---");
    const initRes1 = await fetch("http://localhost:3000/api/widget/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, visitorId, sessionId: null })
    });
    
    const initData1 = await initRes1.json();
    console.log("Init Response 1:", initData1);
    
    if (initData1.profile) {
      console.error("Error: New visitor should not have a profile yet.");
      process.exit(1);
    }
    console.log("Verified: New visitor has no profile yet.");

    // ==================================================
    // STEP 2: START A CHAT AND TRIGGER LEAD CAPTURE
    // ==================================================
    console.log("\n--- STEP 2: First Message (Hello) ---");
    const chatRes1 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        visitorId,
        sessionId: undefined,
        message: "Hello"
      })
    });
    const chatData1 = await chatRes1.json();
    const sessionId1 = chatData1.sessionId;
    console.log(`Chat Response 1:`, chatData1);
    console.log(`Session ID Created: ${sessionId1}`);

    console.log("\n--- STEP 3: Submit Lead Details ---");
    const leadRes = await fetch("http://localhost:3000/api/widget/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        sessionId: sessionId1,
        name: "Kush Memory Test",
        email: "kush-memory@example.com",
        phone: "+91 9999988888",
        source: "chatbot-widget"
      })
    });
    const leadData = await leadRes.json();
    console.log("Lead Submission Response:", leadData);

    // ==================================================
    // STEP 3: SIMULATE RETURNING VISIT (DAYS LATER)
    // ==================================================
    console.log("\n--- STEP 4: Returning Visit (Same visitorId, sessionId cleared) ---");
    const initRes2 = await fetch("http://localhost:3000/api/widget/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, visitorId, sessionId: null })
    });
    const initData2 = await initRes2.json();
    console.log("Init Response 2 (Returning Visitor):", initData2);
    
    if (!initData2.profile || initData2.profile.name !== "Kush Memory Test") {
      console.error("Error: Returning visitor profile not found or name mismatch.");
      process.exit(1);
    }
    console.log("Success: Profile correctly identified for returning visitor!");

    if (!initData2.greeting.includes("Welcome back, Kush Memory Test!")) {
      console.error(`Error: Personalized greeting missing. Expected name in greeting: "${initData2.greeting}"`);
      process.exit(1);
    }
    console.log("Success: Greeting personalized correctly!");

    // ==================================================
    // STEP 4: SEND MESSAGE IN NEW SESSION (TEST LLM MEMORY)
    // ==================================================
    console.log("\n--- STEP 5: Chat in New Session (Verify LLM Memory) ---");
    const chatRes2 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        visitorId,
        sessionId: undefined, // New Session!
        message: "What is my name? Do you remember me?"
      })
    });
    const chatData2 = await chatRes2.json();
    console.log(`Chat Response 2:`, chatData2);

    const reply = chatData2.response.toLowerCase();
    if (!reply.includes("kush")) {
      console.error("Error: Chatbot did not remember the visitor's name from profile memory.");
      process.exit(1);
    }
    console.log("Success: Chatbot remembered visitor's name from background context!");

    console.log("\n==================================================");
    console.log("   VISITOR MEMORY & PROFILE TEST PASSED!         ");
    console.log("==================================================");
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
};

run();
