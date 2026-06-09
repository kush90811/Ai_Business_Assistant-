import type { UserRole } from "@/types/auth";

export const ROLES = {
  superAdmin: "super_admin" as const,
  clientAdmin: "client_admin" as const,
} as const;

export function isSuperAdmin(role: UserRole | null | undefined): role is typeof ROLES.superAdmin {
  return role === ROLES.superAdmin;
}

export function isClientAdmin(role: UserRole | null | undefined): role is typeof ROLES.clientAdmin {
  return role === ROLES.clientAdmin;
}

export type AppRole = UserRole;
