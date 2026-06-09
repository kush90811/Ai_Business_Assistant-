import { env } from "@/config/env";

export const openRouterConfig = {
  apiKey: env.openRouterApiKey,
  baseUrl: env.openRouterBaseUrl,
  model: env.openRouterModel,
} as const;