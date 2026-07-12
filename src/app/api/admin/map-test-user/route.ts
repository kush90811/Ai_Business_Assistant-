import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { Client } from "pg";

export const dynamic = "force-dynamic";

export async function GET() {
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const supabase = createSupabaseServiceClient();

    // 1. Get user ID from Auth.users for test@example.com
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      throw authError;
    }

    const testUser = users.find((u) => u.email === "test@example.com");
    if (!testUser) {
      return NextResponse.json({ success: false, error: "test@example.com not found in auth.users. Please sign up first." });
    }

    const userId = testUser.id;
    const clientId = "3d8b4428-6916-41c1-ac8b-44197c405b0c";

    await pgClient.connect();

    // 2. Insert/update profile
    console.log(`[Test User Map] Mapping profile for ${userId}...`);
    await pgClient.query(`
      INSERT INTO public.profiles (id, full_name, email, avatar_url, is_super_admin)
      VALUES ($1, 'Test Admin', 'test@example.com', NULL, false)
      ON CONFLICT (id) DO UPDATE SET full_name = 'Test Admin', email = 'test@example.com';
    `, [userId]);

    // 3. Insert client user mapping
    console.log(`[Test User Map] Mapping client_users for client ${clientId} and user ${userId}...`);
    await pgClient.query(`
      INSERT INTO public.client_users (client_id, user_id, role)
      VALUES ($1, $2, 'client_admin')
      ON CONFLICT (client_id, user_id) DO NOTHING;
    `, [clientId, userId]);

    return NextResponse.json({ success: true, message: "User mapped successfully to client_admin!" });
  } catch (err: any) {
    console.error("[Test User Map Error] Failed:", err);
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 200 });
  } finally {
    await pgClient.end();
  }
}
