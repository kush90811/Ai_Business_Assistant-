"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Search, 
  Send, 
  Bot, 
  User, 
  MapPin, 
  Globe, 
  Laptop, 
  Mail, 
  Phone, 
  Building, 
  Tag, 
  Sparkles,
  MoreVertical,
  Shield,
  Plus,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionContext } from "@/types/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Message {
  id: string;
  sender: "bot" | "user";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  visitorName: string;
  status: "open" | "resolved";
  lastActive: string;
  location: string;
  browser: string;
  ipAddress: string;
  email?: string;
  phone?: string;
  company?: string;
  leadScore: number;
  tags: string[];
  messages: Message[];
}

interface ChatsClientProps {
  session: SessionContext;
}

function formatLastActive(timestamp: string) {
  if (!timestamp) return "Just now";
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChatsClient({ session }: ChatsClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("all");
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const supabase = createSupabaseBrowserClient();

  const clientId = session.tenant?.clientId;

  const activeConv = conversations.find(c => c.id === activeId);

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.visitorName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = filterStatus === "all" ? true : c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConv?.messages, isTyping]);

  const fetchConversations = useCallback(async (silent = false) => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    
    if (!silent) setLoading(true);
    setErrorMessage("");

    try {
      // 1. Fetch chat sessions for this client
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("chat_sessions")
        .select("id, visitor_id, status, started_at, last_activity_at")
        .eq("client_id", clientId)
        .order("last_activity_at", { ascending: false });

      if (sessionsError) throw sessionsError;

      if (!sessionsData || sessionsData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // 2. Fetch all messages for these sessions
      const sessionIds = sessionsData.map(s => s.id);
      const { data: messagesData, error: messagesError } = await supabase
        .from("chat_messages")
        .select("id, session_id, role, content, created_at")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      // 3. Fetch leads for profile information
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, session_id, name, email, phone, status")
        .in("session_id", sessionIds);

      interface LeadRow {
        id: string;
        session_id: string | null;
        name: string | null;
        email: string | null;
        phone: string | null;
        status: string;
      }

      const leadsMap = new Map<string, LeadRow>();
      leadsData?.forEach(l => {
        if (l.session_id) leadsMap.set(l.session_id, l as LeadRow);
      });

      // 4. Map DB records to state structure
      const mapped: Conversation[] = sessionsData.map(s => {
        const sessionMsgs = (messagesData || [])
          .filter(m => m.session_id === s.id)
          .map(m => ({
            id: m.id,
            sender: m.role === "assistant" ? ("bot" as const) : ("user" as const),
            content: m.content,
            timestamp: new Date(m.created_at).toLocaleTimeString("en-US", { 
              hour: "numeric", 
              minute: "2-digit" 
            }),
          }));

        const lead = leadsMap.get(s.id);

        return {
          id: s.id,
          visitorName: lead?.name || s.visitor_id || `Visitor #${s.id.slice(0, 4).toUpperCase()}`,
          status: (s.status as "open" | "resolved") || "open",
          lastActive: formatLastActive(s.last_activity_at || s.started_at),
          location: lead ? "Identified Location" : "Anonymous Session",
          browser: "Dashboard Console",
          ipAddress: `ID: ${s.id.slice(0, 8)}`,
          email: lead?.email || undefined,
          phone: lead?.phone || undefined,
          leadScore: lead ? 85 : 30,
          tags: lead ? ["Lead Captured", "Groq Active"] : ["Groq Active"],
          messages: sessionMsgs,
        };
      });

      setConversations(mapped);
      
      // Auto-select first conversation if none is active
      if (mapped.length > 0) {
        setActiveId(prev => {
          if (prev && mapped.some(c => c.id === prev)) return prev;
          return mapped[0].id;
        });
      }
    } catch (err: unknown) {
      console.error("Failed to load conversations:", err);
      const errMsg = err instanceof Error ? err.message : "Could not retrieve chat records.";
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  }, [clientId, supabase]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !clientId) return;

    const messageText = inputText.trim();
    setInputText("");
    setIsTyping(true);

    // If it's a new temporary chat session or we don't have an active one selected
    const isNewSession = activeId === "new-chat" || !activeId;
    const requestSessionId = isNewSession ? undefined : activeId;

    // Local temporary user message insertion for instant feedback
    const tempUserMsg: Message = {
      id: `m-temp-user-${Date.now()}`,
      sender: "user",
      content: messageText,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };

    if (activeId && activeId !== "new-chat") {
      setConversations(prev => prev.map(c => {
        if (c.id === activeId) {
          return {
            ...c,
            lastActive: "Just now",
            messages: [...c.messages, tempUserMsg],
          };
        }
        return c;
      }));
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          clientId: clientId,
          sessionId: requestSessionId,
          visitorId: `dashboard-${session.user.email.split("@")[0]}`
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get reply from AI assistant.");
      }

      // Refresh conversations from the database to ensure state matches the DB exactly
      await fetchConversations(true);

      // If a new session was created on the server, select it
      if (isNewSession && data.sessionId) {
        setActiveId(data.sessionId);
        triggerToast("New chat session initialized!");
      }
    } catch (err: unknown) {
      console.error("Chat sending error:", err);
      const errMsg = err instanceof Error ? err.message : "Communication failure.";
      triggerToast(errMsg);
      
      // Append an error notice in messages
      const errorMsg: Message = {
        id: `m-temp-error-${Date.now()}`,
        sender: "bot",
        content: `⚠️ Error: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      };

      if (activeId && activeId !== "new-chat") {
        setConversations(prev => prev.map(c => {
          if (c.id === activeId) {
            return {
              ...c,
              messages: [...c.messages, errorMsg],
            };
          }
          return c;
        }));
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleStartNewChat = () => {
    setActiveId("new-chat");
    setInputText("");
  };

  const toggleStatus = async (id: string) => {
    if (id === "new-chat") return;
    const current = conversations.find(c => c.id === id);
    if (!current) return;

    const nextStatus = current.status === "open" ? "resolved" : "open";
    
    // Optimistic update
    setConversations(prev => prev.map(c => {
      if (c.id === id) return { ...c, status: nextStatus };
      return c;
    }));

    try {
      const { error } = await supabase
        .from("chat_sessions")
        .update({ status: nextStatus })
        .eq("id", id);

      if (error) throw error;
      triggerToast(`Conversation marked as ${nextStatus}!`);
    } catch (err: unknown) {
      console.error("Failed to toggle status:", err);
      triggerToast("Failed to update status on server.");
      // Rollback
      setConversations(prev => prev.map(c => {
        if (c.id === id) return { ...c, status: current.status };
        return c;
      }));
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161622] border border-indigo-500/30 rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm glass">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold text-white leading-normal">{toastMessage}</p>
        </div>
      )}

      {/* Page Title */}
      <div className="border-b border-border/40 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Chat Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor conversations and communicate directly using the real Groq API.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchConversations()}
            disabled={loading}
            className="text-xs h-9 hover:border-indigo-500/30 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleStartNewChat}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs font-semibold h-9 shadow-lg shadow-indigo-600/15"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Main Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-220px)] min-h-[550px]">
        
        {/* Left Side: Inbox Navigation List */}
        <div className="lg:col-span-4 border border-border bg-[#09090b]/40 backdrop-blur-md rounded-xl overflow-hidden flex flex-col h-full shadow-inner glow-card">
          <div className="p-4 border-b border-border/40 space-y-3 bg-black/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Inbox</span>
              <Badge variant="info" className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">
                {conversations.filter(c => c.status === "open").length} Active
              </Badge>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search visitor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-[#121217] border-border text-xs"
              />
            </div>

            <div className="flex gap-1.5 pt-1">
              {(["all", "open", "resolved"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md border transition-all ${
                    filterStatus === status 
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-inner" 
                      : "text-muted-foreground border-border/40 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/20">
            {loading && conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                Loading conversations...
              </div>
            ) : errorMessage ? (
              <div className="p-8 text-center text-xs text-red-400 flex flex-col items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {errorMessage}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No conversations recorded.
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === activeId;
                const lastMsg = c.messages[c.messages.length - 1];
                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`p-4 cursor-pointer flex flex-col gap-1.5 transition-all relative ${
                      isSelected 
                        ? "bg-indigo-500/5 shadow-[inset_2px_0_0_#6366f1]" 
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white truncate max-w-[150px]">
                        {c.visitorName}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-medium">
                        {c.lastActive}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground line-clamp-1 leading-snug">
                      {lastMsg ? lastMsg.content : "No messages"}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-1">
                        {c.tags.slice(0, 1).map((t, idx) => (
                          <span key={idx} className="text-[9px] bg-white/5 border border-white/5 text-neutral-400 rounded px-1">
                            {t}
                          </span>
                        ))}
                      </div>
                      <Badge variant={c.status === "open" ? "info" : "secondary"} className="text-[9px] px-1 py-0 uppercase">
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Middle Column: Chat Window */}
        <div className="lg:col-span-5 border border-border bg-[#09090b]/40 backdrop-blur-md rounded-xl overflow-hidden flex flex-col h-full shadow-inner glow-card">
          
          {activeId === "new-chat" ? (
            /* New Chat Welcome Area */
            <div className="flex-1 flex flex-col justify-between h-full">
              <div className="p-4 border-b border-border/40 bg-black/10 flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  New AI Conversation
                </span>
                <Button variant="ghost" onClick={() => fetchConversations()} className="h-7 text-[10px] text-muted-foreground hover:text-white">
                  Cancel
                </Button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-lg">
                  <Bot className="h-6 w-6 animate-pulse" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <h3 className="text-xs font-bold text-white">Start a Groq Chat Session</h3>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Type a prompt below to create a new session in your database and query the LLM.
                  </p>
                </div>
              </div>
              <form onSubmit={handleSendMessage} className="p-3 border-t border-border/40 bg-black/10 flex items-center gap-2">
                <Input
                  placeholder="Type message to start session..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="bg-[#121217] border-border text-xs flex-1 h-9 rounded-lg"
                  disabled={isTyping}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputText.trim() || isTyping}
                  className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          ) : activeConv ? (
            /* Selected Chat Area */
            <div className="flex-1 flex flex-col justify-between h-full">
              {/* Window Header */}
              <div className="p-4 border-b border-border/40 bg-black/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-indigo-950 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    {activeConv.visitorName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{activeConv.visitorName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{activeConv.ipAddress}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStatus(activeConv.id)}
                    className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-wider hover:border-indigo-500/30"
                  >
                    {activeConv.status === "open" ? "Resolve" : "Re-open"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-white">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {activeConv.messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center p-6 text-muted-foreground text-xs">
                    No messages recorded. Type below to converse.
                  </div>
                ) : (
                  activeConv.messages.map((m) => {
                    const isBot = m.sender === "bot";
                    return (
                      <div key={m.id} className={`flex gap-2.5 text-xs max-w-[85%] ${isBot ? "mr-auto" : "ml-auto flex-row-reverse"}`}>
                        <div className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${
                          isBot 
                            ? "bg-indigo-950 border-indigo-500/20 text-indigo-400" 
                            : "bg-zinc-800 border-zinc-700 text-zinc-300"
                        }`}>
                          {isBot ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        </div>

                        <div className="space-y-1">
                          <div className={`rounded-xl px-3.5 py-2 leading-relaxed shadow-sm ${
                            isBot 
                              ? "bg-[#161622] text-neutral-200 border border-indigo-500/10 rounded-tl-none" 
                              : "bg-white text-black rounded-tr-none"
                          }`}>
                            {m.content}
                          </div>
                          <p className={`text-[9px] text-muted-foreground ${isBot ? "text-left" : "text-right"}`}>
                            {m.timestamp}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing Indicator / Loading State */}
                {isTyping && (
                  <div className="flex gap-2.5 text-xs mr-auto max-w-[80%]">
                    <div className="h-6 w-6 rounded-full bg-indigo-950 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="bg-[#161622] border border-indigo-500/10 rounded-xl rounded-tl-none px-4 py-2.5 flex items-center gap-1.5">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-border/40 bg-black/10 flex items-center gap-2">
                <Input
                  placeholder="Ask a question..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="bg-[#121217] border-border text-xs flex-1 h-9 rounded-lg"
                  disabled={isTyping}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputText.trim() || isTyping}
                  className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          ) : (
            /* Selected Nothing State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground text-xs">
              Select an inbox conversation to begin chatting.
            </div>
          )}
        </div>

        {/* Right Side: Visitor Information Panel */}
        <div className="lg:col-span-3 border border-border bg-[#09090b]/40 backdrop-blur-md rounded-xl overflow-y-auto p-4 space-y-5 shadow-inner glow-card">
          <div className="text-xs font-semibold text-white uppercase tracking-wider pb-1.5 border-b border-border/40">
            Visitor Profile
          </div>

          {activeConv ? (
            <>
              {/* Lead Score Radial/Highlight */}
              <div className="p-3 bg-[#121217] border border-border rounded-lg flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Lead Intent Score</span>
                  <p className="text-xl font-extrabold text-white font-mono">{activeConv.leadScore}<span className="text-xs text-muted-foreground">/100</span></p>
                </div>
                <Badge variant={activeConv.leadScore >= 80 ? "success" : "warning"} className="text-[9px] font-bold uppercase tracking-wider py-1">
                  {activeConv.leadScore >= 80 ? "Qualified" : "General"}
                </Badge>
              </div>

              {/* Bio Data */}
              <div className="space-y-3 text-xs">
                {activeConv.email && (
                  <div className="flex gap-2.5 items-start">
                    <Mail className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground font-medium">Email</span>
                      <p className="font-semibold text-white break-all">{activeConv.email}</p>
                    </div>
                  </div>
                )}

                {activeConv.company && (
                  <div className="flex gap-2.5 items-start">
                    <Building className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground font-medium">Company</span>
                      <p className="font-semibold text-white">{activeConv.company}</p>
                    </div>
                  </div>
                )}

                {activeConv.phone && (
                  <div className="flex gap-2.5 items-start">
                    <Phone className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground font-medium">Phone</span>
                      <p className="font-semibold text-white">{activeConv.phone}</p>
                    </div>
                  </div>
                )}

                {!activeConv.email && !activeConv.phone && (
                  <div className="text-[11px] text-muted-foreground italic">
                    No contact details captured yet for this visitor.
                  </div>
                )}
              </div>

              {/* Tech Metadata */}
              <div className="space-y-3 border-t border-border/40 pt-4 text-xs">
                <div className="flex gap-2.5 items-start">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Session Source</span>
                    <p className="font-semibold text-white">{activeConv.location}</p>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <Laptop className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Context</span>
                    <p className="font-semibold text-white">{activeConv.browser}</p>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Identifier</span>
                    <p className="font-mono text-white text-[10px] truncate max-w-[150px]">{activeConv.ipAddress}</p>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="border-t border-border/40 pt-4 space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-indigo-400" />
                  Assigned Tags
                </span>
                <div className="flex flex-wrap gap-1">
                  {activeConv.tags.map((t, idx) => (
                    <Badge key={idx} variant="secondary" className="text-[9px] px-2 py-0.5 bg-white/5 border border-white/5 text-neutral-300">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Compliance Info */}
              <div className="border-t border-border/40 pt-4 space-y-2 text-xs">
                <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  Integration Status
                </span>
                <div className="p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-emerald-300 leading-normal">
                  All messages are securely synchronized with the Groq Vector DB context indexer.
                </div>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground italic text-center py-6">
              No active session profile loaded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
