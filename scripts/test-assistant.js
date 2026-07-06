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

if (!databaseUrl) {
  console.error("DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiCall = async (message, clientId, sessionId, visitorId) => {
  await sleep(2500);
  const response = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, clientId, sessionId, visitorId })
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
};

const runTests = async () => {
  console.log("==================================================");
  console.log("   RUNNING AI BUSINESS ASSISTANT INTEGRATION TESTS");
  console.log("==================================================");

  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    
    // Get client id
    const clientRes = await pgClient.query("SELECT id FROM clients LIMIT 1");
    if (clientRes.rows.length === 0) {
      throw new Error("No clients found. Please onboarding first.");
    }
    const clientId = clientRes.rows[0].id;
    console.log(`Using Client ID: ${clientId}`);

    // ==================================================
    // SCENARIO 1: Sales Qualification Progression (New Visitor)
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("SCENARIO 1: Sales Qualification Progression (New Visitor)");
    console.log("--------------------------------------------------");
    
    const visitor1 = `visitor-assistant-sales-${Math.random().toString(36).substring(2, 10)}`;
    let sessionId1 = undefined;

    // 1. Initial greeting (Standard)
    console.log(`- Sending "Hello"`);
    let res = await apiCall("Hello", clientId, sessionId1, visitor1);
    sessionId1 = res.sessionId;
    console.log(`  Assistant Response: "${res.response}"`);

    // Verify session mode starts as standard or inherits greeting
    let sessionRow = (await pgClient.query("SELECT * FROM chat_sessions WHERE id = $1", [sessionId1])).rows[0];
    console.log(`  Session Mode in DB: "${sessionRow.metadata?.mode || 'standard'}"`);

    // 2. Buy/Purchase intent triggers sales mode
    console.log(`\n- Sending "I want to buy your AI software for my company"`);
    res = await apiCall("I want to buy your AI software for my company", clientId, sessionId1, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);
    
    sessionRow = (await pgClient.query("SELECT * FROM chat_sessions WHERE id = $1", [sessionId1])).rows[0];
    console.log(`  Session Mode in DB: "${sessionRow.metadata?.mode}"`);
    if (sessionRow.metadata?.mode !== "sales") {
      throw new Error("Expected session mode to switch to 'sales'");
    }

    // 3. Provide Name and Company
    console.log(`\n- Sending "My name is Pratik and my company is AlphaTech"`);
    res = await apiCall("My name is Pratik and my company is AlphaTech", clientId, sessionId1, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);

    let leadRow = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [sessionId1])).rows[0];
    console.log(`  Lead Name in DB: "${leadRow.name}"`);
    console.log(`  Lead Company in DB: "${leadRow.metadata?.company}"`);
    if (leadRow.name !== "Pratik") throw new Error("Expected lead name 'Pratik'");
    if (leadRow.metadata?.company !== "AlphaTech") throw new Error("Expected company 'AlphaTech'");

    // 4. Provide Budget and Goals
    console.log(`\n- Sending "We have a budget of $1500/mo and we want to automate visitor lead capture"`);
    res = await apiCall("We have a budget of $1500/mo and we want to automate visitor lead capture", clientId, sessionId1, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);

    leadRow = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [sessionId1])).rows[0];
    console.log(`  Lead Budget in DB: "${leadRow.metadata?.budget}"`);
    console.log(`  Lead Goals in DB: "${leadRow.metadata?.businessGoals}"`);
    if (!leadRow.metadata?.budget.includes("1500")) throw new Error("Expected budget containing 1500");
    if (!leadRow.metadata?.businessGoals.includes("lead capture")) throw new Error("Expected goals containing lead capture");

    console.log("=> SCENARIO 1 PASSED: Successfully qualified details progressively and entered sales mode.");

    // ==================================================
    // SCENARIO 2: Support Mode Switching
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("SCENARIO 2: Support Mode Switching (Suppresses Sales)");
    console.log("--------------------------------------------------");
    
    // Switch mid-conversation to support
    console.log(`- Sending "I need help, my chatbot widget is throwing an error and not loading"`);
    res = await apiCall("I need help, my chatbot widget is throwing an error and not loading", clientId, sessionId1, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);

    sessionRow = (await pgClient.query("SELECT * FROM chat_sessions WHERE id = $1", [sessionId1])).rows[0];
    console.log(`  Session Mode in DB: "${sessionRow.metadata?.mode}"`);
    if (sessionRow.metadata?.mode !== "support") {
      throw new Error("Expected session mode to switch to 'support'");
    }

    console.log("=> SCENARIO 2 PASSED: Successfully transitioned to support mode on technical issues.");

    // ==================================================
    // SCENARIO 3: Return Visitor Memory
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("SCENARIO 3: Return Visitor Memory");
    console.log("--------------------------------------------------");
    
    // Day 2 session: Same visitorId, new sessionId
    let sessionId2 = undefined;
    console.log(`- Sending "Hi there, do you remember me?" under visitorId ${visitor1}`);
    res = await apiCall("Hi there, do you remember me?", clientId, sessionId2, visitor1);
    sessionId2 = res.sessionId;
    console.log(`  Assistant Response: "${res.response}"`);
    
    if (sessionId1 === sessionId2) {
      throw new Error("Expected a new session ID for returning visitor simulation");
    }

    const lowercaseResponse = res.response.toLowerCase();
    if (!lowercaseResponse.includes("pratik")) {
      throw new Error("Expected assistant to remember name 'Pratik' from profile memory");
    }

    console.log("=> SCENARIO 3 PASSED: Assistant successfully remembered returning user details.");

    // ==================================================
    // SCENARIO 4: Conflict Resolution for New Fields
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("SCENARIO 4: Conflict Resolution for New Fields (Industry)");
    console.log("--------------------------------------------------");

    // Provide initial industry
    console.log(`- Sending "We are in the Healthcare sector"`);
    res = await apiCall("We are in the Healthcare sector", clientId, sessionId2, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);

    leadRow = (await pgClient.query("SELECT * FROM leads WHERE id = $1", [leadRow.id])).rows[0];
    console.log(`  Industry in DB: "${leadRow.metadata?.industry}"`);
    if (leadRow.metadata?.industry !== "Healthcare") {
      throw new Error("Expected industry to be 'Healthcare'");
    }

    // Change industry to trigger conflict
    console.log(`\n- Sending "Actually, my company is in the FinTech industry"`);
    res = await apiCall("Actually, my company is in the FinTech industry", clientId, sessionId2, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);

    leadRow = (await pgClient.query("SELECT * FROM leads WHERE id = $1", [leadRow.id])).rows[0];
    console.log(`  Industry in DB (before confirmation): "${leadRow.metadata?.industry}"`);
    console.log(`  Pending Confirmation in DB:`, JSON.stringify(leadRow.metadata?.pending_confirmation));

    if (leadRow.metadata?.industry !== "Healthcare") {
      throw new Error("Expected industry to remain 'Healthcare' before confirmation");
    }
    if (!leadRow.metadata?.pending_confirmation || leadRow.metadata.pending_confirmation.field !== "industry") {
      throw new Error("Expected pending confirmation for industry");
    }

    // Confirm update with "Yes"
    console.log(`\n- Sending "Yes, correct"`);
    res = await apiCall("Yes, correct", clientId, sessionId2, visitor1);
    console.log(`  Assistant Response: "${res.response}"`);

    leadRow = (await pgClient.query("SELECT * FROM leads WHERE id = $1", [leadRow.id])).rows[0];
    console.log(`  Industry in DB (after confirmation): "${leadRow.metadata?.industry}"`);
    console.log(`  Pending Confirmation in DB (after confirmation):`, JSON.stringify(leadRow.metadata?.pending_confirmation));

    if (leadRow.metadata?.industry !== "FinTech") {
      throw new Error("Expected industry to be updated to 'FinTech' after confirmation");
    }
    if (leadRow.metadata?.pending_confirmation) {
      throw new Error("Expected pending confirmation to be cleared");
    }

    console.log("=> SCENARIO 4 PASSED: Successfully detected conflict, prompted confirmation, and applied updates on approval.");

    console.log("\n==================================================");
    console.log("   ALL AI BUSINESS ASSISTANT TESTS PASSED!         ");
    console.log("==================================================");

  } catch (err) {
    console.error("\nTEST RUN FAILED:", err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
};

runTests();
