"use client";

import { ROUTES } from "@/config/app";
import type { SessionContext } from "@/types/auth";
import { LayoutDashboard, MessageSquare, Users, BookOpen, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarProps = {
  session: SessionContext;
};

const navItems = [
  { label: "Dashboard", href: ROUTES.dashboard.root, icon: LayoutDashboard },
  { label: "Chatbot", href: ROUTES.dashboard.chats, icon: MessageSquare },
  { label: "Leads", href: ROUTES.dashboard.leads, icon: Users },
  { label: "Knowledge", href: ROUTES.dashboard.knowledge, icon: BookOpen },
  { label: "Settings", href: ROUTES.dashboard.settings, icon: Settings },
];

export function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/50 p-6">
      <div className="space-y-8">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          <p className="text-sm text-muted-foreground">{session.tenant?.clientName ?? "Dashboard"}</p>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t pt-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">SIGNED IN AS</p>
            <p className="truncate text-sm font-medium">{session.user.email}</p>
            {session.user.fullName && (
              <p className="truncate text-xs text-muted-foreground">{session.user.fullName}</p>
            )}
          </div>
          <form action="/logout" method="post" className="mt-4">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
