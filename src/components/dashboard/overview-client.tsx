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
          supabase.from("knowledge_sources").select("*", { count: "exact", head: true }).eq("client_id", clientId)
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
            let score = 30;
            if (l.email) score += 40;
            if (l.phone) score += 20;
            if (l.name && l.name !== "Anonymous") score += 10;
            if (l.status === "qualified") score += 10;
            return {
              id: l.id,
              name: l.name || "Anonymous",
              email: l.email || "",
              company: l.metadata?.company || "Not specified",
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, <span className="text-white font-medium">{userFullName || userEmail}</span>. Managing <span className="text-indigo-400 font-medium">{tenantName || "Default Workspace"}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-indigo-500/5 border border-indigo-500/10 px-3 py-1.5 rounded-lg text-indigo-300">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          AI System Status: Operational
        </div>
      </div>

      {/* Grid of Stat Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stat Card 1 */}
        <Card className="hover:border-indigo-500/30 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-white transition-colors">Total Chat Sessions</CardTitle>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? "..." : stats.sessions}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span>All registered chats</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Card 2 */}
        <Card className="hover:border-indigo-500/30 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-white transition-colors">Total Messages</CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? "..." : stats.messages}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span>Interactive dialogue nodes</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Card 3 */}
        <Card className="hover:border-indigo-500/30 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-white transition-colors">Captured Leads</CardTitle>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? "..." : stats.leads}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span>Qualified customer contacts</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Card 4 */}
        <Card className="hover:border-indigo-500/30 group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-white transition-colors">Knowledge Sources</CardTitle>
            <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? "..." : stats.sources}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span>Indexed files & links</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart and Activity Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-md font-semibold">Performance Analytics</CardTitle>
              <CardDescription>Visual metrics over the past 7 days</CardDescription>
            </div>
            <div className="flex bg-[#121217] border border-border p-0.5 rounded-lg">
              <button
                onClick={() => setActiveMetric("sessions")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeMetric === "sessions" ? "bg-indigo-500 text-white shadow-sm" : "text-muted-foreground hover:text-white"
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => setActiveMetric("leads")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeMetric === "leads" ? "bg-indigo-500 text-white shadow-sm" : "text-muted-foreground hover:text-white"
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
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.08)" />

                {/* Shaded Area */}
                <path d={areaD} fill="url(#chart-grad)" />

                {/* Trend Line */}
                <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Data Points / Pulsing Hover effects */}
                {points.map((p, idx) => (
                  <g key={idx} className="group/dot cursor-pointer">
                    <circle cx={p.x} cy={p.y} r="4.5" fill="#09090b" stroke="#818cf8" strokeWidth="2" />
                    <circle cx={p.x} cy={p.y} r="9" fill="#818cf8" className="opacity-0 group-hover/dot:opacity-20 transition-opacity" />
                    {/* Tooltip */}
                    <foreignObject x={p.x - 25} y={p.y - 32} width="50" height="24" className="overflow-visible opacity-0 group-hover/dot:opacity-100 transition-opacity duration-200">
                      <div className="bg-[#121217] border border-indigo-500/30 text-[10px] font-bold text-white text-center rounded px-1 py-0.5 shadow-md">
                        {p.val}
                      </div>
                    </foreignObject>
                  </g>
                ))}
              </svg>
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[11px] font-medium text-muted-foreground px-5 border-t border-border/10 pt-2">
              {chartLabels.map((label, idx) => (
                <span key={idx}>{label}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-md font-semibold">Live System Logs</CardTitle>
            <CardDescription>Real-time autonomous events</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-4">
              {activities.map((act) => {
                const Icon = act.icon;
                return (
                  <div key={act.id} className="flex gap-3 text-xs leading-relaxed group">
                    <div className="flex flex-col items-center">
                      <div className={`p-1.5 rounded-lg border border-white/5 shadow-sm ${act.color} group-hover:scale-110 transition-transform`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="w-[1px] flex-1 bg-border/25 mt-2 group-last:hidden" />
                    </div>
                    <div className="flex-1 space-y-0.5 pt-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{act.title}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" />
                          {act.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-normal">{act.description}</p>
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
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-md font-semibold">Recent Conversations</CardTitle>
                <CardDescription>Live active visitor queries</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="text-xs hover:border-indigo-500/30 gap-1.5" asChild>
                <Link href="/dashboard/chats">
                  <span>View Inbox</span>
                  <ArrowRight className="h-3 w-3 inline ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-2">
                      <th className="py-2.5">Visitor</th>
                      <th className="py-2.5 max-w-[150px] truncate">Last Message</th>
                      <th className="py-2.5">Status</th>
                      <th className="py-2.5 text-right">Sentiment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {recentConvs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">
                          No active conversations recorded yet.
                        </td>
                      </tr>
                    ) : (
                      recentConvs.map((conv) => (
                        <tr key={conv.id} className="hover:bg-white/5 transition-colors group">
                          <td className="py-3 font-semibold text-white flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${conv.status === "open" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                            {conv.visitor}
                          </td>
                          <td className="py-3 text-muted-foreground truncate max-w-[160px]">{conv.lastMessage}</td>
                          <td className="py-3">
                            <Badge variant={conv.status === "open" ? "info" : "secondary"} className="text-[9px] uppercase tracking-wider px-1.5 py-0 font-bold">
                              {conv.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Badge 
                              variant={conv.sentiment === "positive" ? "success" : conv.sentiment === "negative" ? "destructive" : "outline"} 
                              className="text-[9px] capitalize px-1.5 py-0 font-bold"
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
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-md font-semibold">Leads Pipeline</CardTitle>
                <CardDescription>Latest contact details captured</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="text-xs hover:border-indigo-500/30 gap-1.5" asChild>
                <Link href="/dashboard/leads">
                  <span>View Leads</span>
                  <ArrowRight className="h-3 w-3 inline ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-2">
                      <th className="py-2.5">Lead Name</th>
                      <th className="py-2.5">Company</th>
                      <th className="py-2.5">Source</th>
                      <th className="py-2.5 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {recentLeadsList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">
                          No leads captured yet.
                        </td>
                      </tr>
                    ) : (
                      recentLeadsList.map((lead) => (
                        <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 font-semibold text-white">
                            <div className="flex flex-col">
                              <span>{lead.name}</span>
                              <span className="text-[10px] text-muted-foreground font-normal">{lead.email}</span>
                            </div>
                          </td>
                          <td className="py-3 text-muted-foreground">{lead.company}</td>
                          <td className="py-3">
                            <span className="font-mono text-[10px] bg-white/5 border border-white/5 rounded px-1.5 py-0.5 text-neutral-300">
                              {lead.source}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <Badge variant={lead.score >= 80 ? "success" : "warning"} className="text-[9px] px-1.5 py-0 font-mono font-bold">
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
