"use client";

import { ROUTES } from "@/config/app";
import type { SessionContext } from "@/types/auth";
import { LayoutDashboard, MessageSquare, Users, BookOpen, Settings, LogOut, Terminal } from "lucide-react";
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
    <aside className="w-64 border-r border-border bg-[#09090b]/80 backdrop-blur-md p-6 flex flex-col justify-between min-h-screen sticky top-0">
      <div className="space-y-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white shadow-inner border border-white/5 relative">
            <Terminal className="h-5 w-5 text-indigo-400" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-white">Tarkshy AI</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
              {session.tenant?.clientName ?? "SaaS Console"}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1.5">
          <p className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Navigation</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 relative group ${
                  isActive
                    ? "bg-indigo-500/10 text-white border-l-2 border-indigo-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                    : "text-muted-foreground hover:text-white hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 transition-colors duration-200 ${
                  isActive ? "text-indigo-400" : "text-muted-foreground group-hover:text-indigo-300"
                }`} />
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="border-t border-border pt-4 mt-auto space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-900/40 text-indigo-200 font-bold border border-indigo-500/20 text-xs shadow-inner">
            {session.user.fullName ? session.user.fullName.slice(0, 2).toUpperCase() : session.user.email.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {session.user.fullName || "User Account"}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </div>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}

