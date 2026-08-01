import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect(ROUTES.dashboard.root);
  }

  redirect(ROUTES.public.login);
}