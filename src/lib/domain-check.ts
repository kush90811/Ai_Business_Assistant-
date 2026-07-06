/**
 * Domain enforcement for public widget/API routes.
 *
 * Reads the request's Origin (falls back to Referer), looks up
 * widget_configs.allowed_domains for the given clientId, and rejects
 * requests from unlisted domains when the array is non-empty.
 *
 * If allowed_domains is empty (client hasn't configured it yet),
 * allows the request through but logs a warning for visibility.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface DomainCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Extract the hostname from the request's Origin or Referer header.
 */
function getRequestOriginDomain(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      return null;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).hostname;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Check whether the request's origin domain is allowed for this client.
 *
 * @returns DomainCheckResult with allowed=true if OK, allowed=false with reason if rejected
 */
export async function checkAllowedDomain(
  request: Request,
  clientId: string,
  supabase: SupabaseClient
): Promise<DomainCheckResult> {
  // Look up allowed_domains from widget_configs
  const { data: config, error } = await supabase
    .from("widget_configs")
    .select("allowed_domains")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.warn(`[Domain Check] Failed to fetch widget_configs for client ${clientId}: ${error.message}`);
    // On DB error, fail open to avoid breaking legitimate traffic
    return { allowed: true };
  }

  const allowedDomains: string[] = config?.allowed_domains || [];

  // If no domains configured, allow but warn
  if (allowedDomains.length === 0) {
    console.warn(`[Domain Check] ⚠️ Client ${clientId} has no allowed_domains configured. All origins are permitted. Configure allowed_domains in widget_configs to restrict access.`);
    return { allowed: true };
  }

  const requestDomain = getRequestOriginDomain(request);

  // No origin/referer header (e.g. server-to-server call, Postman, curl)
  if (!requestDomain) {
    console.warn(`[Domain Check] No Origin/Referer header for client ${clientId}. Rejecting request.`);
    return {
      allowed: false,
      reason: "Missing Origin header. Requests must originate from an allowed domain.",
    };
  }

  // Check if the request domain matches any allowed domain
  const isAllowed = allowedDomains.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().trim();
    const normalizedRequest = requestDomain.toLowerCase();
    // Exact match or subdomain match (e.g. "example.com" matches "www.example.com")
    return (
      normalizedRequest === normalizedAllowed ||
      normalizedRequest.endsWith(`.${normalizedAllowed}`)
    );
  });

  if (!isAllowed) {
    console.warn(`[Domain Check] ❌ Rejected request from "${requestDomain}" for client ${clientId}. Allowed domains: [${allowedDomains.join(", ")}]`);
    return {
      allowed: false,
      reason: `Origin "${requestDomain}" is not in the allowed domains list for this client.`,
    };
  }

  return { allowed: true };
}
