import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";

export default function HomePage() {
  redirect(ROUTES.public.login);
}