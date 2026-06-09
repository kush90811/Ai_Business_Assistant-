export const APP_NAME = "AI Business Assistant";

export const ROUTES = {
  public: {
    home: "/",
    login: "/login",
    signup: "/signup",
  },
  dashboard: {
    root: "/dashboard",
    chats: "/dashboard/chats",
    leads: "/dashboard/leads",
    knowledge: "/dashboard/knowledge",
    widget: "/dashboard/widget",
    settings: "/dashboard/settings",
  },
  admin: {
    root: "/admin",
    clients: "/admin/clients",
    clientDetail: (clientId: string) => `/admin/clients/${clientId}`,
  },
} as const;

export const DASHBOARD_ROUTES = [
  ROUTES.dashboard.root,
  ROUTES.dashboard.chats,
  ROUTES.dashboard.leads,
  ROUTES.dashboard.knowledge,
  ROUTES.dashboard.widget,
  ROUTES.dashboard.settings,
] as const;

export const ADMIN_ROUTES = [ROUTES.admin.root, ROUTES.admin.clients] as const;

export const PUBLIC_ROUTES = [ROUTES.public.home, ROUTES.public.login] as const;
export const AUTH_ROUTES = [ROUTES.public.login, ROUTES.public.signup] as const;

export const ROLES = {
  superAdmin: "super_admin",
  clientAdmin: "client_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
