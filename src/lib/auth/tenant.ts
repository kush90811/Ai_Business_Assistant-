import type { AuthUser, SessionContext, TenantContext } from "@/types/auth";

export type TenantSource = Pick<TenantContext, "clientId"> | Pick<AuthUser, "clientId"> | Pick<SessionContext, "tenant">;

export function resolveClientId(source: TenantSource | null | undefined): string | null {
  if (!source) {
    return null;
  }

  if ("clientId" in source) {
    return source.clientId ?? null;
  }

  if ("tenant" in source) {
    return source.tenant?.clientId ?? null;
  }

  return null;
}

export function hasTenantContext(source: TenantSource | null | undefined): source is TenantSource {
  return resolveClientId(source) !== null;
}

export function isTenantContextValid(tenant: TenantContext | null | undefined): tenant is TenantContext {
  return Boolean(tenant?.clientId && tenant.clientId.trim().length > 0);
}

export function createTenantContext(clientId: string, tenant?: Omit<TenantContext, "clientId">): TenantContext {
  return {
    clientId,
    ...tenant,
  };
}

export function getTenantFromSession(session: SessionContext | null | undefined): TenantContext | null {
  return isTenantContextValid(session?.tenant) ? session.tenant : null;
}

export function getClientIdOrThrow(source: TenantSource | null | undefined): string {
  const clientId = resolveClientId(source);

  if (!clientId) {
    throw new Error("Tenant context is missing client_id.");
  }

  return clientId;
}
