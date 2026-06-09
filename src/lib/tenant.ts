export const TENANT_HEADER = "x-client-id";

export type TenantContext = {
  clientId: string;
  userId?: string;
};