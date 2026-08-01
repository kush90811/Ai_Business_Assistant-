"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  Download, 
  Calendar, 
  ArrowUpDown,
  RefreshCw,
  AlertTriangle,
  Trash2,
  Kanban,
  Table,
  PhoneCall,
  Sparkles,
  Clock,
  Tag
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionContext } from "@/types/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { calculateLeadScore } from "@/lib/utils";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "new" | "contacted" | "qualified" | "nurturing";
  score: number;
  source: string;
  capturedAt: string;
  sessionId: string | null;
}

interface LeadsClientProps {
  session: SessionContext;
}

const STAGE_COLUMNS: { 
  id: Lead["status"]; 
  title: string; 
  subtitle: string; 
  color: string; 
  headerBg: string; 
  accentBorder: string;
}[] = [
  { id: "new", title: "New Leads", subtitle: "Freshly captured contacts", color: "text-sky-400", headerBg: "bg-sky-500/10 border-sky-500/20", accentBorder: "border-sky-500/40" },
  { id: "contacted", title: "Contacted", subtitle: "Outreach in progress", color: "text-amber-400", headerBg: "bg-amber-500/10 border-amber-500/20", accentBorder: "border-amber-500/40" },
  { id: "qualified", title: "Qualified", subtitle: "High purchase intent", color: "text-emerald-400", headerBg: "bg-emerald-500/10 border-emerald-500/20", accentBorder: "border-emerald-500/40" },
  { id: "nurturing", title: "Nurturing", subtitle: "Follow-up required", color: "text-purple-400", headerBg: "bg-purple-500/10 border-purple-500/20", accentBorder: "border-purple-500/40" },
];

export function LeadsClient({ session }: LeadsClientProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [viewMode, setViewMode] = useState<"crm" | "table">("crm");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "contacted" | "qualified" | "nurturing">("all");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [toastMessage, setToastMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Drag & Drop States
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Lead["status"] | null>(null);

  // Deletion States
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deleteSessions, setDeleteSessions] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const supabase = createSupabaseBrowserClient();
  const clientId = session.tenant?.clientId;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  const fetchLeads = useCallback(async (silent = false) => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    
    if (!silent) setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, email, phone, status, source, created_at, metadata, session_id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: Lead[] = (data || []).map(l => {
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
          phone: l.phone || "",
          status: (l.status as Lead["status"]) || "new",
          score,
          source: l.source || "chatbot",
          capturedAt: l.created_at,
          sessionId: l.session_id || null,
        };
      });

      setLeads(mapped);
    } catch (err: unknown) {
      console.error("Failed to load leads:", err);
      const msg = err instanceof Error ? err.message : "Failed to retrieve leads.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [clientId, supabase]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Lead Status Conversion & Intent Score Sync Handler
  const handleStatusChange = async (leadId: string, newStatus: Lead["status"]) => {
    if (!leadId) return;

    const targetLead = leads.find(l => l.id === leadId);
    if (!targetLead) return;
    if (targetLead.status === newStatus) return;

    // Optimistically update local state & recalculate score
    setLeads(prevLeads =>
      prevLeads.map(l => {
        if (l.id === leadId) {
          const updatedScore = calculateLeadScore({
            name: l.name,
            email: l.email,
            phone: l.phone,
            status: newStatus,
          });
          return { ...l, status: newStatus, score: updatedScore };
        }
        return l;
      })
    );

    triggerToast(`Lead "${targetLead.name}" moved to ${newStatus.toUpperCase()}!`);

    try {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus })
        .eq("id", leadId)
        .eq("client_id", clientId);

      if (error) throw error;
    } catch (err: unknown) {
      console.warn("Failed to sync lead status to database, retaining local UI update:", err);
    }
  };

  // Drag and Drop Handlers for Kanban Board
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("text/plain", leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, status: Lead["status"]) => {
    e.preventDefault();
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: Lead["status"]) => {
    e.preventDefault();
    setDragOverColumn(null);
    const leadId = e.dataTransfer.getData("text/plain") || draggedLeadId;
    if (leadId) {
      handleStatusChange(leadId, targetStatus);
    }
    setDraggedLeadId(null);
  };

  const toggleSort = (field: "date" | "score") => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleExportCSV = () => {
    if (filteredLeads.length === 0) {
      triggerToast("No leads available to export.");
      return;
    }

    const headers = ["Name,Email,Phone,Status,Intent Score,Source Page,Date Captured\n"];
    const rows = filteredLeads.map(l => 
      `"${l.name}","${l.email}","${l.phone}","${l.status}",${l.score},"${l.source}","${l.capturedAt}"`
    );
    const csvContent = headers.concat(rows.join("\n")).join("");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerToast(`Exported ${filteredLeads.length} leads successfully!`);
  };

  // Individual Lead Deletion Handler
  const handleConfirmDeleteSingle = async () => {
    if (!deleteLead || !clientId) return;
    setDeleteInProgress(true);

    try {
      // 1. Delete the lead from database
      const { error: leadError } = await supabase
        .from("leads")
        .delete()
        .eq("id", deleteLead.id)
        .eq("client_id", clientId);

      if (leadError) throw leadError;

      // 2. Delete the associated chat session if requested
      if (deleteSessions && deleteLead.sessionId) {
        const { error: sessionError } = await supabase
          .from("chat_sessions")
          .delete()
          .eq("id", deleteLead.sessionId)
          .eq("client_id", clientId);

        if (sessionError) throw sessionError;
      }

      setLeads(prev => prev.filter(l => l.id !== deleteLead.id));
      triggerToast(`Lead "${deleteLead.name}" deleted successfully.`);
      fetchLeads(true); // silent refresh
    } catch (err: unknown) {
      console.error("Failed to delete lead:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to delete lead.";
      triggerToast(`Error: ${errMsg}`);
    } finally {
      setDeleteInProgress(false);
      setDeleteLead(null);
      setDeleteSessions(false);
    }
  };

  // Bulk Leads Deletion Handler
  const handleConfirmDeleteAll = async () => {
    if (!clientId) return;
    setDeleteInProgress(true);

    try {
      if (deleteSessions) {
        // Fetch all session IDs associated with these leads first
        const { data: leadsData, error: fetchError } = await supabase
          .from("leads")
          .select("session_id")
          .eq("client_id", clientId);

        if (fetchError) throw fetchError;

        const sessionIds = (leadsData || [])
          .map(l => l.session_id)
          .filter((id): id is string => !!id);

        // Delete leads first
        const { error: leadError } = await supabase
          .from("leads")
          .delete()
          .eq("client_id", clientId);

        if (leadError) throw leadError;

        // Delete chat sessions (which cascades to chat_messages)
        if (sessionIds.length > 0) {
          const { error: sessionError } = await supabase
            .from("chat_sessions")
            .delete()
            .in("id", sessionIds)
            .eq("client_id", clientId);

          if (sessionError) throw sessionError;
        }
      } else {
        // Just delete leads
        const { error: leadError } = await supabase
          .from("leads")
          .delete()
          .eq("client_id", clientId);

        if (leadError) throw leadError;
      }

      setLeads([]);
      triggerToast("All leads deleted successfully.");
      fetchLeads(true); // silent refresh
    } catch (err: unknown) {
      console.error("Failed to delete all leads:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to delete all leads.";
      triggerToast(`Error: ${errMsg}`);
    } finally {
      setDeleteInProgress(false);
      setDeleteAllConfirm(false);
      setDeleteSessions(false);
    }
  };

  // Filtering & Sorting logic
  const filteredLeads = leads
    .filter(l => {
      const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.phone.includes(searchQuery);
      const matchesStatus = statusFilter === "all" ? true : l.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        comparison = new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime();
      } else if (sortBy === "score") {
        comparison = a.score - b.score;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  return (
    <div className="space-y-8 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161622] border border-indigo-500/30 rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm glass">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold text-white leading-normal">{toastMessage}</p>
        </div>
      )}

      {/* Individual Lead Delete Confirmation Modal */}
      {deleteLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f0f13] border border-white/5 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                Delete Lead
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Are you sure you want to delete the lead for <span className="text-white font-semibold">{deleteLead.name}</span>? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center space-x-2.5 bg-[#121217] p-3.5 rounded-xl border border-white/5">
              <input
                type="checkbox"
                id="delete-sessions-checkbox"
                checked={deleteSessions}
                onChange={(e) => setDeleteSessions(e.target.checked)}
                className="h-4 w-4 rounded border-white/5 text-indigo-600 focus:ring-indigo-500 bg-[#161622]"
              />
              <label htmlFor="delete-sessions-checkbox" className="text-xs text-neutral-300 cursor-pointer select-none">
                Also delete associated chat sessions and messages
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteLead(null);
                  setDeleteSessions(false);
                }}
                disabled={deleteInProgress}
                className="text-xs hover:border-white/10"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeleteSingle}
                disabled={deleteInProgress}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4"
              >
                {deleteInProgress ? "Deleting..." : "Delete Lead"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete All Leads Confirmation Modal */}
      {deleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f0f13] border border-white/5 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500 animate-pulse" />
                Delete All Leads
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Are you sure you want to delete all <span className="text-rose-400 font-semibold">{leads.length}</span> leads? This will clear all lead records belonging to this workspace.
              </p>
            </div>

            <div className="flex items-center space-x-2.5 bg-[#121217] p-3.5 rounded-xl border border-white/5">
              <input
                type="checkbox"
                id="delete-all-sessions-checkbox"
                checked={deleteSessions}
                onChange={(e) => setDeleteSessions(e.target.checked)}
                className="h-4 w-4 rounded border-white/5 text-indigo-600 focus:ring-indigo-500 bg-[#161622]"
              />
              <label htmlFor="delete-all-sessions-checkbox" className="text-xs text-neutral-300 cursor-pointer select-none">
                Also delete associated chat sessions and messages
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteAllConfirm(false);
                  setDeleteSessions(false);
                }}
                disabled={deleteInProgress}
                className="text-xs hover:border-white/10"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeleteAll}
                disabled={deleteInProgress}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4"
              >
                {deleteInProgress ? "Deleting All..." : "Delete All"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Controls */}
      <div className="border-b border-border/40 pb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Leads Pipeline CRM
            <span className="text-xs font-semibold font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-3 py-0.5">
              Odoo Pipeline Active
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag and drop leads between stage columns or switch to table view to manage customer conversions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 w-full lg:w-auto items-center">
          {/* View Mode Toggle Switch */}
          <div className="flex bg-[#121217] p-1 rounded-xl border border-white/10 shrink-0">
            <button
              onClick={() => setViewMode("crm")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "crm"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              CRM Kanban
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "table"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Table className="h-3.5 w-3.5" />
              Table View
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteAllConfirm(true)}
            disabled={loading || leads.length === 0}
            className="text-xs h-9 border-rose-500/20 hover:border-rose-500/50 hover:bg-rose-500/10 text-rose-400 gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLeads()}
            disabled={loading}
            className="text-xs h-9 hover:border-indigo-500/30 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleExportCSV}
            disabled={loading || filteredLeads.length === 0}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-xs font-semibold px-4 h-9 shadow-lg shadow-indigo-600/15"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Toolbar / Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#09090b]/40 backdrop-blur-md border border-border p-4 rounded-xl shadow-inner glow-card">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-[#121217] border-border text-xs"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
          {(["all", "new", "contacted", "qualified", "nurturing"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-lg border transition-all ${
                statusFilter === status
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-inner"
                  : "text-muted-foreground border-border/40 hover:text-white hover:bg-white/5"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN VIEW AREA: CRM Kanban or Table View */}
      {viewMode === "crm" ? (
        /* Odoo / HubSpot Style Drag-and-Drop CRM Kanban Board */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 min-h-[600px] items-start pb-8">
          {STAGE_COLUMNS.map((col) => {
            const columnLeads = filteredLeads.filter((l) => l.status === col.id);
            const isTargetDrop = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`flex flex-col rounded-2xl border transition-all duration-200 bg-[#0c0c10]/80 p-4 space-y-4 min-h-[580px] ${
                  isTargetDrop
                    ? `border-indigo-500 ring-2 ring-indigo-500/30 ${col.headerBg} shadow-2xl scale-[1.01]`
                    : `${col.accentBorder} hover:border-white/20`
                }`}
              >
                {/* Column Header */}
                <div className={`p-3 rounded-xl border flex items-center justify-between ${col.headerBg}`}>
                  <div className="space-y-0.5">
                    <h3 className={`text-sm font-extrabold tracking-tight flex items-center gap-2 ${col.color}`}>
                      {col.title}
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-medium">{col.subtitle}</p>
                  </div>
                  <Badge variant="outline" className={`font-mono text-xs px-2.5 py-0.5 font-bold ${col.color} border-current/30`}>
                    {columnLeads.length}
                  </Badge>
                </div>

                {/* Column Cards Container */}
                <div className="flex-1 space-y-3.5 overflow-y-auto pr-0.5">
                  {loading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-28 rounded-xl bg-white/5 border border-white/5" />
                      <div className="h-28 rounded-xl bg-white/5 border border-white/5" />
                    </div>
                  ) : columnLeads.length === 0 ? (
                    <div className={`h-40 border border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center ${
                      isTargetDrop ? "border-indigo-500/50 bg-indigo-500/10" : "border-white/10 bg-white/[0.01]"
                    }`}>
                      <p className="text-xs font-semibold text-neutral-500">No leads in this stage</p>
                      <p className="text-[10px] text-neutral-600 mt-1">Drag a lead card here to change status</p>
                    </div>
                  ) : (
                    columnLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        className={`group bg-[#13131a] hover:bg-[#181824] border border-white/10 hover:border-indigo-500/40 rounded-xl p-4 space-y-3.5 shadow-md hover:shadow-xl transition-all duration-200 cursor-grab active:cursor-grabbing relative overflow-hidden ${
                          draggedLeadId === lead.id ? "opacity-40 border-dashed border-indigo-400 scale-95" : ""
                        }`}
                      >
                        {/* Top Indicator bar */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
                              {lead.name.split(" ").map((n) => n[0]).join("")}
                            </div>
                            <div>
                              <h4 className="text-xs font-extrabold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-1.5">
                                {lead.name}
                              </h4>
                              <p className="text-[10px] text-neutral-400 truncate max-w-[150px]">{lead.email || "No email"}</p>
                            </div>
                          </div>

                          <button
                            onClick={() => setDeleteLead(lead)}
                            className="text-neutral-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete Lead"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Phone & Source Meta */}
                        <div className="space-y-1.5 pt-1 text-[11px] text-neutral-300 border-t border-white/5">
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-neutral-400 font-mono text-[10.5px]">
                              <PhoneCall className="h-3 w-3 text-indigo-400 shrink-0" />
                              {lead.phone}
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1">
                            <span className="flex items-center gap-1 font-mono bg-white/5 border border-white/5 rounded px-1.5 py-0.5 text-neutral-300">
                              <Tag className="h-2.5 w-2.5 text-indigo-400" />
                              {lead.source}
                            </span>
                            <span className="flex items-center gap-1 text-neutral-500">
                              <Clock className="h-2.5 w-2.5" />
                              {new Date(lead.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        </div>

                        {/* Card Footer: Intent Score & Interactive Status Conversion Dropdown */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          {/* Intent Score Badge */}
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold uppercase text-neutral-400">Score:</span>
                            <Badge
                              variant={lead.score >= 80 ? "success" : "warning"}
                              className="text-[9.5px] font-mono px-1.5 py-0.5 font-extrabold"
                            >
                              {lead.score}/100
                            </Badge>
                          </div>

                          {/* Interactive Status Conversion Dropdown */}
                          <select
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value as Lead["status"])}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1a1a24] border border-white/10 text-[10px] font-bold uppercase tracking-wider rounded-lg px-2 py-1 text-neutral-200 cursor-pointer focus:outline-none focus:border-indigo-500 hover:border-white/30 transition-colors"
                          >
                            <option value="new">NEW</option>
                            <option value="contacted">CONTACTED</option>
                            <option value="qualified">QUALIFIED</option>
                            <option value="nurturing">NURTURING</option>
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/45 bg-black/10 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3.5 px-4 font-semibold">Contact Info</th>
                    <th className="py-3.5 px-4 font-semibold">Phone Number</th>
                    <th className="py-3.5 px-4 font-semibold">
                      <button
                        onClick={() => toggleSort("date")}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Date Captured <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="py-3.5 px-4 font-semibold">Source Page</th>
                    <th className="py-3.5 px-4 font-semibold">Stage Conversion</th>
                    <th className="py-3.5 px-4 font-semibold text-right">
                      <button
                        onClick={() => toggleSort("score")}
                        className="flex items-center gap-1 justify-end hover:text-white transition-colors ml-auto"
                      >
                        Intent Score <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 text-neutral-200">
                  {loading && leads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <div className="flex items-center justify-center gap-2 text-xs">
                          <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                          Loading leads...
                        </div>
                      </td>
                    </tr>
                  ) : errorMessage ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-red-400">
                        <div className="flex flex-col items-center justify-center gap-2 text-xs">
                          <AlertTriangle className="h-5 w-5" />
                          {errorMessage}
                        </div>
                      </td>
                    </tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        No leads match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-white/5 transition-colors group">
                        {/* Name / Email */}
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-indigo-950/40 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px]">
                              {lead.name.split(" ").map((n) => n[0]).join("")}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-neutral-200 group-hover:text-indigo-300 transition-colors">
                                {lead.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-normal">{lead.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4 text-muted-foreground font-mono">{lead.phone || "—"}</td>

                        {/* Date */}
                        <td className="py-3.5 px-4 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                            {new Date(lead.capturedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </td>

                        {/* Source URL */}
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-[10px] bg-white/5 border border-white/5 rounded px-2 py-0.5 text-neutral-300">
                            {lead.source}
                          </span>
                        </td>

                        {/* Interactive Status Selector */}
                        <td className="py-3.5 px-4">
                          <select
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value as Lead["status"])}
                            className="bg-[#121217] border border-white/10 text-[10px] font-bold uppercase tracking-wider rounded-lg px-2.5 py-1 text-neutral-200 cursor-pointer focus:outline-none focus:border-indigo-500 hover:border-white/30 transition-colors"
                          >
                            <option value="new">NEW</option>
                            <option value="contacted">CONTACTED</option>
                            <option value="qualified">QUALIFIED</option>
                            <option value="nurturing">NURTURING</option>
                          </select>
                        </td>

                        {/* Intent Score */}
                        <td className="py-3.5 px-4 text-right">
                          <Badge
                            variant={lead.score >= 80 ? "success" : "warning"}
                            className="text-[10px] font-mono px-2 py-0.5 font-bold"
                          >
                            {lead.score}/100
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setDeleteLead(lead)}
                            className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Delete Lead"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
