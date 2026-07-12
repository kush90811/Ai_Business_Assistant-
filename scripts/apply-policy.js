const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:Tarkshy2026@db.cmxatcdugiuvcgkgwfoq.supabase.co:5432/postgres';

const run = async () => {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    // 1. Drop existing clients_update_member if exists
    await client.query('DROP POLICY IF EXISTS "clients_update_member" ON public.clients;');

    // 2. Create the update policy
    await client.query(`
      CREATE POLICY "clients_update_member" ON public.clients
      FOR UPDATE
      USING (
        id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
      )
      WITH CHECK (
        id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
      );
    `);

    console.log("UPDATE policy successfully applied to public.clients table.");
  } catch (err) {
    console.error("Failed to apply policy:", err);
  } finally {
    await client.end();
  }
};

run();
