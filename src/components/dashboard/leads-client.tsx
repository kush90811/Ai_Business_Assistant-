"use client";

import React, { useState } from "react";
import { 
  Search, 
  Download, 
  Calendar, 
  ArrowUpDown
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "new" | "contacted" | "qualified" | "nurturing";
  score: number;
  source: string;
  capturedAt: string;
}

const initialLeads: Lead[] = [
  {
    id: "lead-1",
    name: "Sarah Jenkins",
    email: "sarah@acme.co",
    phone: "+1 555-0192",
    status: "qualified",
    score: 94,
    source: "/pricing",
    capturedAt: "2026-06-10",
  },
  {
    id: "lead-2",
    name: "Michael Chen",
    email: "m.chen@techcorp.io",
    phone: "+65 9182-1209",
    status: "contacted",
    score: 81,
    source: "/features/ai-widget",
    capturedAt: "2026-06-09",
  },
  {
    id: "lead-3",
    name: "Emma Watson",
    email: "emma@design.co",
    phone: "+44 20 7946 0958",
    status: "new",
    score: 68,
    source: "/blog/customer-retention",
    capturedAt: "2026-06-08",
  },
  {
    id: "lead-4",
    name: "David Miller",
    email: "david@millersolutions.com",
    phone: "+1 555-0143",
    status: "nurturing",
    score: 55,
    source: "/landing-v2",
    capturedAt: "2026-06-05",
  },
  {
    id: "lead-5",
    name: "Jessica Taylor",
    email: "jessica@flowstate.dev",
    phone: "+61 2 9382 0192",
    status: "qualified",
    score: 88,
    source: "/pricing",
    capturedAt: "2026-06-03",
  },
  {
    id: "lead-6",
    name: "Aaron Patel",
    email: "aaron.p@globex.in",
    phone: "+91 98230 19283",
    status: "contacted",
    score: 74,
    source: "/features/integrations",
    capturedAt: "2026-05-29",
  },
];

export function LeadsClient() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "contacted" | "qualified" | "nurturing">("all");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [toastMessage, setToastMessage] = useState("");

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
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
    const headers = ["Name,Email,Phone,Status,Intent Score,Source Page,Date Captured\n"];
    const rows = filteredLeads.map(l => 
      `"${l.name}","${l.email}","${l.phone}","${l.status}",${l.score},"${l.source}","${l.capturedAt}"`
    );
    const csvContent = headers.concat(rows.join("\n")).join("");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tarkshy_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerToast(`Exported ${filteredLeads.length} leads successfully!`);
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

  const getStatusBadge = (status: Lead["status"]) => {
    switch (status) {
      case "qualified":
        return <Badge variant="success" className="uppercase text-[9px] font-bold tracking-wider px-2 py-0.5">qualified</Badge>;
      case "contacted":
        return <Badge variant="info" className="uppercase text-[9px] font-bold tracking-wider px-2 py-0.5">contacted</Badge>;
      case "nurturing":
        return <Badge variant="warning" className="uppercase text-[9px] font-bold tracking-wider px-2 py-0.5">nurturing</Badge>;
      case "new":
        return <Badge variant="outline" className="uppercase text-[9px] font-bold tracking-wider px-2 py-0.5">new</Badge>;
    }
  };

  return (
    <div className="space-y-8 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161622] border border-indigo-500/30 rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm glass">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Download className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold text-white leading-normal">{toastMessage}</p>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border/40 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Leads Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and export contacts captured automatically by your AI Chatbot Widget.
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-xs font-semibold px-4 h-9 shadow-lg shadow-indigo-600/15"
          asChild={false}
        >
          <Download className="h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      {/* Toolbar / Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#09090b]/40 backdrop-blur-md border border-border p-4 rounded-xl shadow-inner glow-card">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, email..."
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

      {/* Table Container */}
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
                      className="flex items-center gap-1.5 hover:text-white transition-colors"
                    >
                      Date Captured
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 font-semibold">Source Page</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    <button 
                      onClick={() => toggleSort("score")} 
                      className="flex items-center gap-1.5 hover:text-white transition-colors ml-auto"
                    >
                      Intent Score
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-neutral-200">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
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
                            {lead.name.split(" ").map(n=>n[0]).join("")}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-neutral-200 group-hover:text-indigo-300 transition-colors">{lead.name}</span>
                            <span className="text-[10px] text-muted-foreground font-normal">{lead.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 text-muted-foreground font-mono">{lead.phone}</td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                          {new Date(lead.capturedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </span>
                      </td>

                      {/* Source URL */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[10px] bg-white/5 border border-white/5 rounded px-2 py-0.5 text-neutral-300">
                          {lead.source}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(lead.status)}</td>

                      {/* Intent Score */}
                      <td className="py-3.5 px-4 text-right">
                        <Badge variant={lead.score >= 80 ? "success" : "warning"} className="text-[10px] font-mono px-2 py-0.5">
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
      </Card>
    </div>
  );
}
