import type { Role } from "@/config/app";

export type UserRole = Role;

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  clientId?: string;
  fullName?: string;
  isSuperAdmin: boolean;
};

export type TenantContext = {
  clientId: string;
  clientName?: string;
  slug?: string;
};

export type SessionContext = {
  user: AuthUser;
  tenant?: TenantContext;
  accessToken?: string;
  expiresAt?: number;
};

export type AuthState =
  | {
      status: "authenticated";
      session: SessionContext;
    }
  | {
      status: "unauthenticated";
      session: null;
    }
  | {
      status: "loading";
      session: null;
    };
