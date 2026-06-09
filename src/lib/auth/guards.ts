import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";
import { getCurrentSession } from "@/lib/auth/session";

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect(ROUTES.public.login);
  }

  return session;
}
