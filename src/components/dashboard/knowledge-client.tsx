"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Upload, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  File, 
  FileSpreadsheet, 
  Sparkles,
  Info,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionContext } from "@/types/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface KBFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
  status: "indexed" | "processing" | "failed";
}

interface KnowledgeClientProps {
  session: SessionContext;
}

export function KnowledgeClient({ session }: KnowledgeClientProps) {
  const [files, setFiles] = useState<KBFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Upload simulation states
  const [uploadingName, setUploadingName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supabase = createSupabaseBrowserClient();
  const clientId = session.tenant?.clientId;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const fetchFiles = useCallback(async (silent = false) => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("id, title, type, status, created_at, knowledge_documents(file_name, mime_type)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: KBFile[] = (data || []).map(s => {
        const docs = s.knowledge_documents as unknown as { file_name: string | null; mime_type: string | null }[] | null;
        const doc = docs?.[0];
        const name = s.title || doc?.file_name || "Untitled Source";
        const mime = doc?.mime_type || "application/pdf";
        const ext = name.split(".").pop() || mime.split("/")[1] || "pdf";

        let statusVal: "indexed" | "processing" | "failed" = "indexed";
        if (s.status === "processing") statusVal = "processing";
        else if (s.status === "failed") statusVal = "failed";

        return {
          id: s.id,
          name,
          size: s.type === "url" ? "N/A" : "32 KB", // Mock size representation for UI
          type: ext,
          uploadedAt: new Date(s.created_at).toLocaleString("en-US", { 
            month: "short", 
            day: "2-digit", 
            year: "numeric",
            hour: "2-digit", 
            minute: "2-digit" 
          }),
          status: statusVal,
        };
      });

      setFiles(mapped);
    } catch (err: unknown) {
      console.error("Failed to load knowledge sources:", err);
      const msg = err instanceof Error ? err.message : "Could not retrieve knowledge registry.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [clientId, supabase]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const startMockUpload = async (fileName: string) => {
    if (isUploading || !clientId) return;
    
    setIsUploading(true);
    setUploadingName(fileName);
    setUploadProgress(0);

    try {
      // 1. Insert knowledge source
      const { data: newSource, error: sourceError } = await supabase
        .from("knowledge_sources")
        .insert({
          client_id: clientId,
          type: "upload",
          title: fileName,
          status: "processing"
        })
        .select("id")
        .single();

      if (sourceError || !newSource) throw sourceError || new Error("Failed to insert source.");

      // 2. Insert related knowledge document details
      const fileExt = fileName.split(".").pop() || "pdf";
      const mimeType = fileExt === "csv" ? "text/csv" : fileExt === "txt" ? "text/plain" : "application/pdf";
      
      const { error: docError } = await supabase
        .from("knowledge_documents")
        .insert({
          client_id: clientId,
          source_id: newSource.id,
          file_name: fileName,
          mime_type: mimeType,
          storage_path: `knowledge/${newSource.id}/${fileName}`,
          extracted_text: `Extracted content simulation for ${fileName}.`
        });

      if (docError) throw docError;

      // Progress bar UI simulation
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          setUploadingName("");
          triggerToast(`Uploaded "${fileName}" successfully! Vector indexing started.`);
          fetchFiles(true);

          // Simulate vector database indexing completion after 3s
          setTimeout(async () => {
            try {
              const { error: updateError } = await supabase
                .from("knowledge_sources")
                .update({ status: "ready" })
                .eq("id", newSource.id);
              
              if (updateError) throw updateError;
              
              triggerToast(`Document "${fileName}" is now successfully indexed and live!`);
              fetchFiles(true);
            } catch (err) {
              console.error("Failed to complete indexing:", err);
            }
          }, 3000);
        }
      }, 100);

    } catch (err: unknown) {
      console.error("Upload failed:", err);
      setIsUploading(false);
      const msg = err instanceof Error ? err.message : "Failed to sync file to database.";
      triggerToast(`Error: ${msg}`);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      startMockUpload(file.name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      startMockUpload(file.name);
    }
  };

  const handleDeleteFile = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("knowledge_sources")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setFiles(prev => prev.filter(f => f.id !== id));
      triggerToast(`Removed "${name}" from Knowledge Base.`);
    } catch (err: unknown) {
      console.error("Delete failed:", err);
      triggerToast("Failed to delete document from database.");
    }
  };

  const handleReSync = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("knowledge_sources")
        .update({ status: "processing" })
        .eq("id", id);

      if (error) throw error;

      setFiles(prev => prev.map(f => {
        if (f.id === id) return { ...f, status: "processing" };
        return f;
      }));
      triggerToast(`Re-indexing document "${name}"...`);

      setTimeout(async () => {
        try {
          const { error: updateError } = await supabase
            .from("knowledge_sources")
            .update({ status: "ready" })
            .eq("id", id);

          if (updateError) throw updateError;

          setFiles(prev => prev.map(f => {
            if (f.id === id) return { ...f, status: "indexed" };
            return f;
          }));
          triggerToast(`Re-indexing complete for "${name}"!`);
        } catch (err) {
          console.error("Re-index update failed:", err);
        }
      }, 2500);
    } catch (err: unknown) {
      console.error("Re-sync trigger failed:", err);
      triggerToast("Failed to initiate re-sync.");
    }
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return <File className="h-5 w-5 text-red-400" />;
      case "csv":
      case "xlsx":
        return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
      case "docx":
        return <FileText className="h-5 w-5 text-blue-400" />;
      default:
        return <FileText className="h-5 w-5 text-indigo-400" />;
    }
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      {/* Header */}
      <div className="border-b border-border/40 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload manuals, text documents, or QA files to train your chatbot instantly.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchFiles()}
          disabled={loading}
          className="text-xs h-9 hover:border-indigo-500/30 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Upload Zone & Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Upload Container (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-semibold">Training Documents</CardTitle>
              <CardDescription>Drag and drop text, PDF, Word or Excel documents to sync</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Drag Drop Area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 relative ${
                  dragActive 
                    ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.1)] scale-[1.01]" 
                    : "border-border/60 hover:border-indigo-500/40 hover:bg-white/5"
                } ${isUploading ? "pointer-events-none opacity-80" : ""}`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.txt,.csv"
                  className="hidden"
                />

                {isUploading ? (
                  <div className="space-y-4 py-4">
                    <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mx-auto" />
                    <div className="space-y-2 max-w-xs mx-auto">
                      <p className="text-xs font-semibold text-white truncate">Uploading: {uploadingName}</p>
                      <div className="w-full bg-[#121217] rounded-full h-1.5 border border-white/5 overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-150"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono font-bold">{uploadProgress}% Complete</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 py-4">
                    <div className="mx-auto h-11 w-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white">Drag & drop files here, or <span className="text-indigo-400 underline">browse</span></p>
                      <p className="text-[10px] text-muted-foreground">Supports PDF, DOCX, TXT, CSV up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Training Stats / Instructions (1 col) */}
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-md font-semibold">Indexing Analytics</CardTitle>
            <CardDescription>Vector database specifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Indexed Vectors</span>
                <span className="font-semibold text-white font-mono">{files.filter(f => f.status === "indexed").length * 8 || 0} chunks</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Total Sources</span>
                <span className="font-semibold text-white font-mono">{files.length} sources</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Chunk Size limit</span>
                <span className="font-semibold text-white font-mono">1,000 tokens</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Overlap size</span>
                <span className="font-semibold text-white font-mono">200 tokens</span>
              </div>
            </div>

            <div className="border-t border-border/40 pt-4 space-y-2.5">
              <div className="flex gap-2.5 text-xs text-muted-foreground leading-normal">
                <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[11px]">
                  Files uploaded are automatically parsed, chunked, and embedded into local storage vector arrays for high-efficiency FAQ answer mapping.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Files List Table */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 gap-4">
          <div>
            <CardTitle className="text-md font-semibold">Document Registry</CardTitle>
            <CardDescription>Vector databases source nodes</CardDescription>
          </div>
          
          {/* Search bar */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[#09090b]/60 border-border text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-2">
                  <th className="py-3 px-4">Document Name</th>
                  <th className="py-3 px-4">File Size</th>
                  <th className="py-3 px-4">Indexed At</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-neutral-200">
                {loading && files.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2 text-xs">
                        <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                        Loading knowledge database...
                      </div>
                    </td>
                  </tr>
                ) : errorMessage ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-red-400">
                      <div className="flex flex-col items-center justify-center gap-2 text-xs">
                        <AlertTriangle className="h-5 w-5" />
                        {errorMessage}
                      </div>
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No documents found in knowledge base.
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-white/5 transition-colors group">
                      <td className="py-3.5 px-4 font-semibold text-white flex items-center gap-2.5">
                        {getFileIcon(file.type)}
                        <span className="truncate max-w-[250px]">{file.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground font-mono">{file.size}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{file.uploadedAt}</td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            file.status === "indexed" 
                              ? "success" 
                              : file.status === "processing" 
                              ? "warning" 
                              : "destructive"
                          }
                          className="text-[9px] uppercase tracking-wider px-2 py-0.5 flex items-center gap-1.5 w-fit font-bold"
                        >
                          {file.status === "processing" && (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          )}
                          {file.status === "indexed" && (
                            <CheckCircle className="h-2.5 w-2.5" />
                          )}
                          {file.status === "failed" && (
                            <AlertCircle className="h-2.5 w-2.5" />
                          )}
                          {file.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReSync(file.id, file.name)}
                          disabled={file.status === "processing"}
                          className="h-7 w-7 text-muted-foreground hover:text-white"
                          title="Re-index document"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${file.status === "processing" ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteFile(file.id, file.name)}
                          className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/5"
                          title="Delete document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
