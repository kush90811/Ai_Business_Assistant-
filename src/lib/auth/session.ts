import { cache } from "react";

import { createTenantContext } from "@/lib/auth/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthState, SessionContext } from "@/types/auth";

export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createSupabaseServerClient();

  // Fast 0ms local JWT cookie session check
  const {
    data: { session },
  } = await supabase.auth.getSession();
  
  let user = session?.user ?? null;

  if (!user) {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  }

  if (!user) {
    return { status: "unauthenticated", session: null };
  }

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("client_users")
      .select("client_id, role")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name, is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const tenant = membership?.client_id
    ? createTenantContext(membership.client_id)
    : undefined;

  const role = profile?.is_super_admin ? "super_admin" : membership?.role ?? "client_admin";

  const context: SessionContext = {
    user: {
      id: user.id,
      email: user.email ?? "",
      role,
      clientId: tenant?.clientId,
      fullName: profile?.full_name ?? user.user_metadata?.full_name ?? undefined,
      isSuperAdmin: Boolean(profile?.is_super_admin),
    },
    tenant,
    accessToken: session?.access_token,
    expiresAt: session?.expires_at,
  };

  return {
    status: "authenticated",
    session: context,
  };
});

export async function getCurrentSession() {
  const state = await getAuthState();
  return state.status === "authenticated" ? state.session : null;
}
