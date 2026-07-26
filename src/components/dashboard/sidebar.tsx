"use client";

import React, { useState, useEffect } from "react";
import { ROUTES } from "@/config/app";
import type { SessionContext } from "@/types/auth";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BookOpen,
  Settings,
  LogOut,
  Terminal,
  Sun,
  Moon
} from "lucide-react";
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

const subtitlePhrases = ["Business Assistant", "Sales Agent", "Lead Manager"];

export function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [logoError, setLogoError] = useState(false);
  const [subtitleIdx, setSubtitleIdx] = useState(0);
  const [subtitleFade, setSubtitleFade] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }
    } else {
      document.documentElement.classList.remove("light");
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSubtitleFade(false);
      setTimeout(() => {
        setSubtitleIdx((prev) => (prev + 1) % subtitlePhrases.length);
        setSubtitleFade(true);
      }, 300);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  };

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 z-40 border-r border-violet-500/20 bg-card/85 backdrop-blur-2xl p-4 flex flex-col justify-between shadow-xl transition-colors duration-200">
      <div className="flex flex-col flex-1 min-h-0 space-y-3">
        {/* Brand Logo - TarkAssist Header */}
        <div className="flex items-center gap-1.5 px-0.5 py-0.5 shrink-0 group cursor-pointer">
          <div className="relative shrink-0 flex items-center justify-center h-16 w-16">
            {!logoError ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img 
                src={theme === "light" ? "/tarkshy-logo-light.png" : "/tarkshy-logo-dark.png"} 
                alt="TarkAssist Logo" 
                className="h-full w-full object-contain filter drop-shadow-[0_0_12px_rgba(56,189,248,0.35)] transition-transform duration-300 group-hover:scale-105"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Terminal className="h-8 w-8 text-cyan-300" />
            )}
            <span className="absolute top-0.5 right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xl font-black tracking-tight flex items-center font-sans">
                <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 text-transparent bg-clip-text font-black drop-shadow-[0_0_10px_rgba(56,189,248,0.4)]">
                  Tark
                </span>
                <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 text-transparent bg-clip-text font-black drop-shadow-[0_0_14px_rgba(232,121,249,0.5)]">
                  Assist
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase truncate font-mono">
              <span className="text-cyan-400 font-extrabold shrink-0">AI</span>
              <span
                className={`transition-all duration-300 transform text-muted-foreground truncate ${
                  subtitleFade ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                }`}
              >
                {subtitlePhrases[subtitleIdx]}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation - Scrollable if screen height is small */}
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
          <p className="px-2 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-1.5 opacity-80">
            Navigation Menu
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-200 relative group ${isActive
                  ? "bg-gradient-to-r from-violet-500/20 via-purple-500/15 to-cyan-500/10 text-violet-300 border border-violet-500/40 shadow-md shadow-violet-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/70 border border-transparent"
                  }`}
              >
                <Icon className={`h-4 w-4 transition-all duration-200 group-hover:scale-110 ${isActive ? "text-cyan-400" : "text-muted-foreground group-hover:text-violet-400"
                  }`} />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout - Always Pinned & Visible at Bottom */}
      <div className="shrink-0 border-t border-violet-500/20 pt-3 mt-auto space-y-2">
        {/* User Card */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-muted/40 border border-border/80 shadow-inner">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/30 to-cyan-500/30 text-violet-200 font-extrabold border border-violet-500/40 text-xs shadow-inner shrink-0">
            {session.user.fullName ? session.user.fullName.slice(0, 2).toUpperCase() : session.user.email.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">
              {session.user.fullName || "User Account"}
            </p>
            <p className="truncate text-[10px] text-muted-foreground font-medium">
              {session.user.email}
            </p>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          type="button"
          className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200 border border-border/80 shadow-sm"
        >
          <span className="flex items-center gap-2">
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-cyan-400" />
            )}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </span>
          <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-cyan-300 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/30">
            {theme}
          </span>
        </button>

        {/* Logout Form & Button */}
        <form action="/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 border border-transparent"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}

