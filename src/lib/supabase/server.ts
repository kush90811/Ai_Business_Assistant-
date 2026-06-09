import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/config/env";

type CookieValue = Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  type CookieToSet = {
    name: string;
    value: string;
    options?: CookieValue;
  };

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}