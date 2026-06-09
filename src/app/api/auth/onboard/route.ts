import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/config/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OnboardingPayload = {
  fullName?: string;
  companyName?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

async function createUniqueSlug(
  admin: SupabaseClient,
  baseName: string,
) {
  const baseSlug = slugify(baseName) || `client-${randomSuffix()}`;
  let candidate = baseSlug;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await admin.from("clients").select("id").eq("slug", candidate).maybeSingle();

    if (!data) {
      return candidate;
    }

    candidate = `${baseSlug}-${randomSuffix()}`;
  }

  return `${baseSlug}-${randomSuffix()}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as OnboardingPayload;
  const fullName = body.fullName?.trim() || user.user_metadata?.full_name || "";
  const companyName = body.companyName?.trim() || fullName || user.email?.split("@")[0] || "New Client";

  const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: existingMembership, error: membershipError } = await admin
    .from("client_users")
    .select("client_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (existingMembership?.client_id) {
    return NextResponse.json({
      clientId: existingMembership.client_id,
      role: existingMembership.role,
      existing: true,
    });
  }

  const clientSlug = await createUniqueSlug(admin, companyName);

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      name: companyName,
      slug: clientSlug,
      status: "active",
    })
    .select("id, name, slug")
    .single();

  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  const [{ error: profileError }, { error: linkError }] = await Promise.all([
    admin.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      email: user.email ?? null,
      avatar_url: null,
      is_super_admin: false,
    }),
    admin.from("client_users").insert({
      client_id: client.id,
      user_id: user.id,
      role: "client_admin",
    }),
  ]);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({
    clientId: client.id,
    clientName: client.name,
    slug: client.slug,
    role: "client_admin",
    existing: false,
  });
}
