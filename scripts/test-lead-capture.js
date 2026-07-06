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
  console.log("   RUNNING LEAD CAPTURE ARCHITECTURE TESTS        ");
  console.log("==================================================");

  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    
    const clientRes = await pgClient.query("SELECT id FROM clients LIMIT 1");
    if (clientRes.rows.length === 0) {
      throw new Error("No clients found in the database. Please onboard first.");
    }
    const clientId = clientRes.rows[0].id;
    console.log(`Using Client ID: ${clientId}`);

    // ==================================================
    // TEST 1: Progressive Lead Enrichment
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("TEST 1: Progressive Lead Enrichment");
    console.log("--------------------------------------------------");
    
    const visitor1 = `visitor-enrich-${Math.random().toString(36).substring(2, 10)}`;
    let session1 = undefined;

    // Msg 1: Hello
    let res = await apiCall("Hello", clientId, session1, visitor1);
    session1 = res.sessionId;
    let leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session1])).rows;
    console.log(`- Message: "Hello" | Leads: ${leads.length}`);
    if (leads.length !== 0) throw new Error("Expected 0 leads after 'Hello'");

    // Msg 2: My name is Kush
    res = await apiCall("My name is Kush", clientId, session1, visitor1);
    leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session1])).rows;
    console.log(`- Message: "My name is Kush" | Leads: ${leads.length}`);
    if (leads.length !== 1) throw new Error("Expected 1 lead after name extraction");
    if (leads[0].name !== "Kush") throw new Error(`Expected name 'Kush', got '${leads[0].name}'`);

    // Msg 3: My email is kush@gmail.com
    res = await apiCall("My email is kush@gmail.com", clientId, session1, visitor1);
    leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session1])).rows;
    console.log(`- Message: "My email is kush@gmail.com" | Leads: ${leads.length}`);
    if (leads.length !== 1) throw new Error("Expected exactly 1 lead");
    if (leads[0].email !== "kush@gmail.com") throw new Error(`Expected email 'kush@gmail.com', got '${leads[0].email}'`);
    if (leads[0].name !== "Kush") throw new Error("Name was corrupted during email update");

    // Msg 4: My phone is 9999999999
    res = await apiCall("My phone is 9999999999", clientId, session1, visitor1);
    leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session1])).rows;
    console.log(`- Message: "My phone is 9999999999" | Leads: ${leads.length}`);
    if (leads.length !== 1) throw new Error("Expected exactly 1 lead");
    if (leads[0].phone !== "9999999999") throw new Error(`Expected phone '9999999999', got '${leads[0].phone}'`);
    
    console.log("=> TEST 1 PASSED: Only 1 lead created and progressively enriched.");

    // ==================================================
    // TEST 2: Conflict (Name)
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("TEST 2: Name Conflict Handling");
    console.log("--------------------------------------------------");
    
    const visitor2 = `visitor-conflict-name-${Math.random().toString(36).substring(2, 10)}`;
    let session2 = undefined;

    // Msg 1: My name is Kush
    res = await apiCall("My name is Kush", clientId, session2, visitor2);
    session2 = res.sessionId;
    
    // Msg 2: My name is Paresh
    res = await apiCall("My name is Paresh", clientId, session2, visitor2);
    console.log(`- Message: "My name is Paresh"`);
    console.log(`  Bot Reply: "${res.response}"`);
    
    if (!res.response.includes("I currently have your name as 'Kush'") || !res.response.includes("update it to 'Paresh'")) {
      throw new Error("Expected bot to ask for confirmation regarding name replacement");
    }

    leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session2])).rows;
    if (leads[0].name !== "Kush") throw new Error("Name was overwritten without confirmation");
    if (!leads[0].metadata?.pending_confirmation) throw new Error("Pending confirmation was not stored in metadata");

    // Msg 3: Yes
    res = await apiCall("Yes", clientId, session2, visitor2);
    console.log(`- Message: "Yes"`);
    console.log(`  Bot Reply: "${res.response}"`);
    
    leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session2])).rows;
    if (leads[0].name !== "Paresh") throw new Error("Name was not updated after 'Yes' confirmation");
    if (leads[0].metadata?.pending_confirmation) throw new Error("Pending confirmation was not cleared from metadata");

    console.log("=> TEST 2 PASSED: Conflict detected, confirmation requested, and updated successfully.");

    // ==================================================
    // TEST 3: Email Conflict Handling (Declined)
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("TEST 3: Email Conflict Handling (Declined)");
    console.log("--------------------------------------------------");
    
    const visitor3 = `visitor-conflict-email-${Math.random().toString(36).substring(2, 10)}`;
    let session3 = undefined;

    // Msg 1: My email is kush@gmail.com
    res = await apiCall("My email is kush@gmail.com", clientId, session3, visitor3);
    session3 = res.sessionId;

    // Msg 2: My email is new@gmail.com
    res = await apiCall("My email is new@gmail.com", clientId, session3, visitor3);
    console.log(`- Message: "My email is new@gmail.com"`);
    console.log(`  Bot Reply: "${res.response}"`);

    if (!res.response.includes("I currently have your email as 'kush@gmail.com'") || !res.response.includes("update it to 'new@gmail.com'")) {
      throw new Error("Expected bot to ask for confirmation regarding email replacement");
    }

    // Msg 3: No
    res = await apiCall("No", clientId, session3, visitor3);
    console.log(`- Message: "No"`);
    console.log(`  Bot Reply: "${res.response}"`);

    leads = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session3])).rows;
    if (leads[0].email !== "kush@gmail.com") throw new Error("Email was overwritten despite 'No' response");
    if (leads[0].metadata?.pending_confirmation) throw new Error("Pending confirmation was not cleared from metadata");

    console.log("=> TEST 3 PASSED: Conflict detected, declined, and original email preserved.");

    // ==================================================
    // TEST 4: Returning Visitor
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("TEST 4: Returning Visitor");
    console.log("--------------------------------------------------");
    
    const visitor4 = `visitor-returning-${Math.random().toString(36).substring(2, 10)}`;
    
    // Day 1 Session
    let session4a = undefined;
    res = await apiCall("My name is Kush", clientId, session4a, visitor4);
    session4a = res.sessionId;

    // Day 5 Session (New Session ID, Same Visitor ID)
    let session4b = undefined;
    res = await apiCall("My email is returning@gmail.com", clientId, session4b, visitor4);
    session4b = res.sessionId;

    if (session4a === session4b) throw new Error("Session IDs must be different for returning visitor simulation");

    // Check leads for both sessions
    const leadsSessionA = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session4a])).rows;
    const leadsSessionB = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session4b])).rows;

    console.log(`- Session A (${session4a}) leads: ${leadsSessionA.length}`);
    console.log(`- Session B (${session4b}) leads: ${leadsSessionB.length}`);

    // Since it's the same visitor, the lead's session_id is updated to the latest session
    if (leadsSessionB.length !== 1) throw new Error("Expected exactly 1 lead in the latest session");
    if (leadsSessionB[0].name !== "Kush" || leadsSessionB[0].email !== "returning@gmail.com") {
      throw new Error("Returning visitor lead was not updated or fields were lost");
    }

    // Verify no duplicates exist in the database for this visitor
    const totalVisitorLeads = (await pgClient.query(
      "SELECT DISTINCT l.id FROM leads l JOIN chat_sessions s ON l.session_id = s.id WHERE s.visitor_id = $1",
      [visitor4]
    )).rows;
    console.log(`- Total unique lead rows for visitor: ${totalVisitorLeads.length}`);
    if (totalVisitorLeads.length !== 1) throw new Error("Expected exactly 1 lead row in the DB for returning visitor");

    console.log("=> TEST 4 PASSED: Returning visitor successfully identified and lead updated without duplication.");

    // ==================================================
    // TEST 5: Multiple Browser Sessions (Different Visitors)
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("TEST 5: Multiple Browser Sessions (Different Visitors)");
    console.log("--------------------------------------------------");

    const visitor5a = `visitor-multi-a-${Math.random().toString(36).substring(2, 10)}`;
    const visitor5b = `visitor-multi-b-${Math.random().toString(36).substring(2, 10)}`;

    let session5a = undefined;
    let session5b = undefined;

    res = await apiCall("My name is Alice", clientId, session5a, visitor5a);
    session5a = res.sessionId;

    res = await apiCall("My name is Bob", clientId, session5b, visitor5b);
    session5b = res.sessionId;

    const leadA = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session5a])).rows;
    const leadB = (await pgClient.query("SELECT * FROM leads WHERE session_id = $1", [session5b])).rows;

    console.log(`- Visitor A (${visitor5a}) Lead Name: "${leadA[0]?.name}"`);
    console.log(`- Visitor B (${visitor5b}) Lead Name: "${leadB[0]?.name}"`);

    if (leadA.length !== 1 || leadB.length !== 1) throw new Error("Expected 1 lead for each separate visitor");
    if (leadA[0].id === leadB[0].id) throw new Error("Separate visitors mapped to the same lead ID");

    console.log("=> TEST 5 PASSED: Separate visitors created separate lead records.");

    console.log("\n==================================================");
    console.log("   ALL 5 ARCHITECTURAL TESTS PASSED SUCCESSFULLY!  ");
    console.log("==================================================");

  } catch (err) {
    console.error("\nTEST SUITE FAILED:", err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
};

runTests();
