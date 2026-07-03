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

const cleanDatabase = async () => {
  console.log("==================================================");
  console.log("   CLEANING DEVELOPMENT DATABASE DATA            ");
  console.log("==================================================");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres database.");

    // 1. Fetch all session IDs associated with leads
    const leadsRes = await client.query("SELECT DISTINCT session_id FROM leads WHERE session_id IS NOT NULL");
    const sessionIds = leadsRes.rows.map(r => r.session_id);
    console.log(`Found ${sessionIds.length} sessions associated with existing leads.`);

    // 2. Delete chat messages for these sessions
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map((_, idx) => `$${idx + 1}`).join(',');
      const msgDel = await client.query(`DELETE FROM chat_messages WHERE session_id IN (${placeholders})`, sessionIds);
      console.log(`Deleted ${msgDel.rowCount} related chat messages.`);
    } else {
      console.log("No related chat messages to delete.");
    }

    // 3. Delete leads
    const leadDel = await client.query("DELETE FROM leads");
    console.log(`Deleted ${leadDel.rowCount} leads from the database.`);

    // 4. Delete chat sessions
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map((_, idx) => `$${idx + 1}`).join(',');
      const sessionDel = await client.query(`DELETE FROM chat_sessions WHERE id IN (${placeholders})`, sessionIds);
      console.log(`Deleted ${sessionDel.rowCount} related chat sessions.`);
    } else {
      console.log("No related chat sessions to delete.");
    }

    // ==================================================
    // VERIFICATION
    // ==================================================
    console.log("\n--------------------------------------------------");
    console.log("VERIFYING CLEANUP RESULTS");
    console.log("--------------------------------------------------");

    // Count remaining leads
    const finalLeads = await client.query("SELECT COUNT(*) FROM leads");
    const totalLeads = parseInt(finalLeads.rows[0].count, 10);
    console.log(`Total Leads in Database = ${totalLeads}`);

    // Check for orphan messages (messages referencing non-existent sessions)
    const orphanMsgs = await client.query(`
      SELECT COUNT(*) FROM chat_messages m 
      LEFT JOIN chat_sessions s ON m.session_id = s.id 
      WHERE s.id IS NULL
    `);
    const orphanMsgCount = parseInt(orphanMsgs.rows[0].count, 10);
    console.log(`Orphan Chat Messages (referencing non-existent sessions) = ${orphanMsgCount}`);

    // Check for orphan leads (leads referencing non-existent sessions)
    const orphanLeads = await client.query(`
      SELECT COUNT(*) FROM leads l 
      LEFT JOIN chat_sessions s ON l.session_id = s.id 
      WHERE s.id IS NULL AND l.session_id IS NOT NULL
    `);
    const orphanLeadCount = parseInt(orphanLeads.rows[0].count, 10);
    console.log(`Orphan Leads (referencing non-existent sessions) = ${orphanLeadCount}`);

    if (totalLeads === 0 && orphanMsgCount === 0 && orphanLeadCount === 0) {
      console.log("\nCLEANUP VERIFICATION SUCCESSFUL!");
      console.log("Database is clean and ready for fresh end-to-end testing.");
    } else {
      console.error("\nCLEANUP VERIFICATION FAILED!");
      if (totalLeads !== 0) console.error(`- Expected 0 leads, got ${totalLeads}`);
      if (orphanMsgCount !== 0) console.error(`- Found ${orphanMsgCount} orphan messages`);
      if (orphanLeadCount !== 0) console.error(`- Found ${orphanLeadCount} orphan leads`);
      process.exit(1);
    }

  } catch (err) {
    console.error("Cleanup failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
};

cleanDatabase();
