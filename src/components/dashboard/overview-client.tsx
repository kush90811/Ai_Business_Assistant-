"use client";

import React, { useState, useEffect } from "react";
import { 
  Activity, 
  MessageSquare, 
  Users, 
  Sparkles, 
  Clock, 
  FileText, 
  UserPlus, 
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { calculateLeadScore } from "@/lib/utils";

interface OverviewClientProps {
  userEmail: string;
  userFullName?: string;
  tenantName?: string;
  clientId?: string;
}

const activities = [
  {
    id: "act-1",
    type: "lead",
    title: "Lead qualified automatically",
    description: "Lead score updated based on contact details.",
    time: "Just now",
    icon: UserPlus,
    color: "text-emerald-400 bg-emerald-500/10",
  },
  {
    id: "act-2",
    type: "chat",
    title: "AI Chat completion ready",
    description: "Groq Llama 3.3 model processed customer inquiries.",
    time: "Active",
    icon: Sparkles,
    color: "text-indigo-400 bg-indigo-500/10",
  },
  {
    id: "act-3",
    type: "knowledge",
    title: "Knowledge Source sync",
    description: "Document embeddings initialized in vector space.",
    time: "Synced",
    icon: FileText,
    color: "text-amber-400 bg-amber-500/10",
  },
  {
    id: "act-4",
    type: "system",
    title: "Database Syncing",
    description: "Supabase real-time client connected successfully.",
    time: "Online",
    icon: Activity,
    color: "text-sky-400 bg-sky-500/10",
  },
];

interface RecentConv {
  id: string;
  visitor: string;
  lastMessage: string;
  time: string;
  sentiment: "positive" | "neutral" | "negative";
  status: "open" | "resolved";
}

interface RecentLead {
  id: string;
  name: string;
  email: string;
  company: string;
  source: string;
  score: number;
  status: "new" | "contacted" | "qualified";
}

export function OverviewClient({ userEmail, userFullName, tenantName, clientId }: OverviewClientProps) {
  const [activeMetric, setActiveMetric] = useState<"sessions" | "leads">("sessions");
  const [stats, setStats] = useState({
    sessions: 0,
    messages: 0,
    leads: 0,
    sources: 0,
  });
  const [recentConvs, setRecentConvs] = useState<RecentConv[]>([]);
  const [recentLeadsList, setRecentLeadsList] = useState<RecentLead[]>([]);
  const [chartSessions, setChartSessions] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [chartLeads, setChartLeads] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [chartLabels, setChartLabels] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      setLoading(true);
      const supabase = createSupabaseBrowserClient();

      try {
        // 1. Fetch Total Counts
        const [
          { count: sessionsCount },
          { count: messagesCount },
          { count: leadsCount },
          { count: sourcesCount }
        ] = await Promise.all([
          supabase.from("chat_sessions").select("*", { count: "exact", head: true }).eq("client_id", clientId),
          supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("client_id", clientId),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("client_id", clientId),
          supabase.from("knowledge_documents").select("*", { count: "exact", head: true }).eq("workspace_id", clientId)
        ]);

        setStats({
          sessions: sessionsCount || 0,
          messages: messagesCount || 0,
          leads: leadsCount || 0,
          sources: sourcesCount || 0,
        });

        // 2. Fetch Recent Conversations
        const { data: recentSessions } = await supabase
          .from("chat_sessions")
          .select("id, visitor_id, status, last_activity_at, started_at")
          .eq("client_id", clientId)
          .order("last_activity_at", { ascending: false })
          .limit(4);

        if (recentSessions && recentSessions.length > 0) {
          const sessionIds = recentSessions.map(s => s.id);
          const [
            { data: recentMessages },
            { data: sessionLeads }
          ] = await Promise.all([
            supabase
              .from("chat_messages")
              .select("session_id, content")
              .in("session_id", sessionIds)
              .order("created_at", { ascending: false }),
            supabase
              .from("leads")
              .select("session_id, name")
              .in("session_id", sessionIds)
          ]);

          const leadsMap = new Map();
          sessionLeads?.forEach(l => {
            if (l.session_id) leadsMap.set(l.session_id, l.name);
          });

          const mappedConvs = recentSessions.map(s => {
            const lastMsg = recentMessages?.find(m => m.session_id === s.id)?.content || "No messages yet";
            const visitorName = leadsMap.get(s.id) || s.visitor_id || `Visitor #${s.id.slice(0, 4).toUpperCase()}`;

            let sentiment: "positive" | "neutral" | "negative" = "neutral";
            const lowerMsg = lastMsg.toLowerCase();
            if (lowerMsg.includes("great") || lowerMsg.includes("thank") || lowerMsg.includes("yes") || lowerMsg.includes("pricing") || lowerMsg.includes("demo")) {
              sentiment = "positive";
            } else if (lowerMsg.includes("error") || lowerMsg.includes("fail") || lowerMsg.includes("broke") || lowerMsg.includes("bad")) {
              sentiment = "negative";
            }

            const timeDiff = Date.now() - new Date(s.last_activity_at || s.started_at).getTime();
            const mins = Math.floor(timeDiff / 60000);
            let timeStr = "Just now";
            if (mins >= 1 && mins < 60) timeStr = `${mins}m ago`;
            else if (mins >= 60 && mins < 1440) timeStr = `${Math.floor(mins / 60)}h ago`;
            else if (mins >= 1440) timeStr = new Date(s.last_activity_at || s.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

            return {
              id: s.id,
              visitor: visitorName,
              lastMessage: lastMsg,
              time: timeStr,
              sentiment,
              status: s.status as "open" | "resolved",
            };
          });
          setRecentConvs(mappedConvs);
        } else {
          setRecentConvs([]);
        }

        // 3. Fetch Recent Leads
        const { data: recentLeads } = await supabase
          .from("leads")
          .select("id, name, email, phone, source, status, created_at, metadata")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(3);

        if (recentLeads) {
          const mappedLeads = recentLeads.map(l => {
            const meta = l.metadata as Record<string, unknown> | null;
            const score = calculateLeadScore({
              email: l.email,
              phone: l.phone,
              name: l.name,
              status: l.status,
              metadata: meta,
            });
            return {
              id: l.id,
              name: l.name || "Anonymous",
              email: l.email || "",
              company: (meta?.company as string) || "Not specified",
              source: l.source || "chatbot",
              score,
              status: l.status as "new" | "contacted" | "qualified",
            };
          });
          setRecentLeadsList(mappedLeads);
        } else {
          setRecentLeadsList([]);
        }

        // 4. Generate 7-day Analytics
        const labels = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const [
          { data: sessions7d },
          { data: leads7d }
        ] = await Promise.all([
          supabase.from("chat_sessions").select("started_at").eq("client_id", clientId).gte("started_at", sevenDaysAgo.toISOString()),
          supabase.from("leads").select("created_at").eq("client_id", clientId).gte("created_at", sevenDaysAgo.toISOString())
        ]);

        const dailySessions = Array(7).fill(0);
        const dailyLeads = Array(7).fill(0);

        for (let i = 0; i < 7; i++) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - (6 - i));
          const targetDateString = targetDate.toDateString();

          sessions7d?.forEach(s => {
            if (new Date(s.started_at).toDateString() === targetDateString) {
              dailySessions[i]++;
            }
          });

          leads7d?.forEach(l => {
            if (new Date(l.created_at).toDateString() === targetDateString) {
              dailyLeads[i]++;
            }
          });
        }

        setChartSessions(dailySessions);
        setChartLeads(dailyLeads);
        setChartLabels(labels);

      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [clientId]);

  // SVG Chart Dimensions & Computations
  const chartHeight = 160;
  const chartWidth = 500;
  const padding = 20;

  const currentPoints = activeMetric === "sessions" ? chartSessions : chartLeads;
  const maxVal = Math.max(...currentPoints, 5) * 1.15;
  const minVal = 0;

  const points = currentPoints.map((val, idx) => {
    const x = padding + (idx * (chartWidth - padding * 2)) / (currentPoints.length - 1);
    const y = chartHeight - padding - ((val - minVal) * (chartHeight - padding * 2)) / (maxVal - minVal);
    return { x, y, val };
  });

  const pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-violet-500/20 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gradient-violet">Dashboard Overview</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Welcome back, <span className="text-foreground font-semibold">{userFullName || userEmail}</span>. Managing <span className="text-cyan-400 font-semibold">{tenantName || "Default Workspace"}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-gradient-to-r from-violet-500/15 to-cyan-500/15 border border-violet-500/30 px-3.5 py-2 rounded-xl text-violet-300 font-bold shadow-md shadow-violet-500/10">
          <Sparkles className="h-4 w-4 animate-pulse text-cyan-400" />
          AI Assistant Operational
        </div>
      </div>

      {/* Grid of Stat Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stat Card 1 */}
        <Card className="cyber-card bg-card/85 backdrop-blur-xl shadow-lg transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Total Chat Sessions</CardTitle>
            <div className="p-2.5 bg-violet-500/20 rounded-xl text-violet-300 border border-violet-500/30 shadow-inner">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground tracking-tight">
              {loading ? "..." : stats.sessions}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-medium">
              <span>All registered chats</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Card 2 */}
        <Card className="cyber-card bg-card/85 backdrop-blur-xl shadow-lg transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Total Messages</CardTitle>
            <div className="p-2.5 bg-cyan-500/20 rounded-xl text-cyan-300 border border-cyan-500/30 shadow-inner">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground tracking-tight">
              {loading ? "..." : stats.messages}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-medium">
              <span>Interactive dialogue nodes</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Card 3 */}
        <Card className="cyber-card bg-card/85 backdrop-blur-xl shadow-lg transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Captured Leads</CardTitle>
            <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-300 border border-emerald-500/30 shadow-inner">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground tracking-tight">
              {loading ? "..." : stats.leads}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-medium">
              <span>Qualified customer contacts</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Card 4 */}
        <Card className="cyber-card bg-card/85 backdrop-blur-xl shadow-lg transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Knowledge Sources</CardTitle>
            <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-300 border border-amber-500/30 shadow-inner">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground tracking-tight">
              {loading ? "..." : stats.sources}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-medium">
              <span>Indexed files & links</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart and Activity Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Chart */}
        <Card className="lg:col-span-2 cyber-card bg-card/85 backdrop-blur-xl shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-base font-extrabold text-foreground">Performance Analytics</CardTitle>
              <CardDescription className="text-muted-foreground font-medium">Visual metrics over the past 7 days</CardDescription>
            </div>
            <div className="flex bg-muted/60 border border-violet-500/20 p-1 rounded-xl shadow-inner">
              <button
                onClick={() => setActiveMetric("sessions")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeMetric === "sessions" 
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => setActiveMetric("leads")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeMetric === "leads" 
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Leads
              </button>
            </div>
          </CardHeader>
          <CardContent className="h-[210px] flex flex-col justify-between pt-0">
            {/* Custom SVG Line/Area Chart */}
            <div className="relative w-full h-[160px] flex items-end">
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="stroke-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="currentColor" className="text-border/40" strokeDasharray="3,3" />
                <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="currentColor" className="text-border/40" strokeDasharray="3,3" />
                <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="currentColor" className="text-border/80" />

                {/* Shaded Area */}
                <path d={areaD} fill="url(#chart-grad)" />

                {/* Trend Line */}
                <path d={pathD} fill="none" stroke="url(#stroke-grad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Data Points */}
                {points.map((p, idx) => (
                  <g key={idx} className="group/dot cursor-pointer">
                    <circle cx={p.x} cy={p.y} r="5" className="fill-background stroke-cyan-400" strokeWidth="2.5" />
                    <circle cx={p.x} cy={p.y} r="10" fill="#06b6d4" className="opacity-0 group-hover/dot:opacity-30 transition-opacity" />
                    {/* Tooltip */}
                    <foreignObject x={p.x - 25} y={p.y - 32} width="50" height="24" className="overflow-visible opacity-0 group-hover/dot:opacity-100 transition-opacity duration-200">
                      <div className="bg-popover border border-cyan-500/40 text-[11px] font-extrabold text-cyan-300 text-center rounded-md px-1.5 py-0.5 shadow-lg">
                        {p.val}
                      </div>
                    </foreignObject>
                  </g>
                ))}
              </svg>
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[11px] font-bold text-muted-foreground px-5 border-t border-border/40 pt-2.5">
              {chartLabels.map((label, idx) => (
                <span key={idx}>{label}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <Card className="glow-card border-border/70 bg-card/80 backdrop-blur-md shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-foreground">Live System Logs</CardTitle>
            <CardDescription className="text-muted-foreground font-medium">Real-time autonomous events</CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="space-y-4">
              {activities.map((act) => {
                const Icon = act.icon;
                return (
                  <div key={act.id} className="flex gap-3 text-xs leading-relaxed group">
                    <div className="flex flex-col items-center">
                      <div className={`p-1.5 rounded-xl border border-border/60 shadow-sm ${act.color} group-hover:scale-110 transition-transform`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="w-[1px] flex-1 bg-border/40 mt-2 group-last:hidden" />
                    </div>
                    <div className="flex-1 space-y-0.5 pt-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-bold text-foreground group-hover:text-indigo-500 transition-colors">{act.title}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0 font-medium">
                          <Clock className="h-3 w-3" />
                          {act.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-medium">{act.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lower Tables Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Conversations */}
        <Card className="glow-card border-border/70 bg-card/80 backdrop-blur-md flex flex-col justify-between shadow-sm">
          <div>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">Recent Conversations</CardTitle>
                <CardDescription className="text-muted-foreground font-medium">Live active visitor queries</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="text-xs hover:border-indigo-500/40 gap-1.5 font-semibold" asChild>
                <Link href="/dashboard/chats">
                  <span>View Inbox</span>
                  <ArrowRight className="h-3.5 w-3.5 inline ml-0.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground pb-2">
                      <th className="py-2.5">Visitor</th>
                      <th className="py-2.5 max-w-[150px] truncate">Last Message</th>
                      <th className="py-2.5">Status</th>
                      <th className="py-2.5 text-right">Sentiment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {recentConvs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground font-medium text-xs">
                          No active conversations recorded yet.
                        </td>
                      </tr>
                    ) : (
                      recentConvs.map((conv) => (
                        <tr key={conv.id} className="hover:bg-muted/50 transition-colors group">
                          <td className="py-3 font-bold text-foreground flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${conv.status === "open" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                            {conv.visitor}
                          </td>
                          <td className="py-3 text-muted-foreground font-medium truncate max-w-[160px]">{conv.lastMessage}</td>
                          <td className="py-3">
                            <Badge variant={conv.status === "open" ? "info" : "secondary"} className="text-[9px] uppercase tracking-wider px-2 py-0.5 font-bold">
                              {conv.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Badge 
                              variant={conv.sentiment === "positive" ? "success" : conv.sentiment === "negative" ? "destructive" : "outline"} 
                              className="text-[9px] capitalize px-2 py-0.5 font-bold"
                            >
                              {conv.sentiment}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Recent Leads */}
        <Card className="glow-card border-border/70 bg-card/80 backdrop-blur-md flex flex-col justify-between shadow-sm">
          <div>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">Leads Pipeline</CardTitle>
                <CardDescription className="text-muted-foreground font-medium">Latest contact details captured</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="text-xs hover:border-indigo-500/40 gap-1.5 font-semibold" asChild>
                <Link href="/dashboard/leads">
                  <span>View Leads</span>
                  <ArrowRight className="h-3.5 w-3.5 inline ml-0.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground pb-2">
                      <th className="py-2.5">Lead Name</th>
                      <th className="py-2.5">Company</th>
                      <th className="py-2.5">Source</th>
                      <th className="py-2.5 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {recentLeadsList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground font-medium text-xs">
                          No leads captured yet.
                        </td>
                      </tr>
                    ) : (
                      recentLeadsList.map((lead) => (
                        <tr key={lead.id} className="hover:bg-muted/50 transition-colors">
                          <td className="py-3 font-bold text-foreground">
                            <div className="flex flex-col">
                              <span>{lead.name}</span>
                              <span className="text-[11px] text-muted-foreground font-normal">{lead.email}</span>
                            </div>
                          </td>
                          <td className="py-3 text-muted-foreground font-medium">{lead.company}</td>
                          <td className="py-3">
                            <span className="font-mono text-[10px] bg-muted/80 border border-border/60 rounded-md px-2 py-0.5 text-foreground font-medium">
                              {lead.source}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <Badge variant={lead.score >= 80 ? "success" : "warning"} className="text-[9px] px-2 py-0.5 font-mono font-bold">
                              {lead.score}/100
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>
    </div>
  );
}
