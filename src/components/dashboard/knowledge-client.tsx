"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
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
  const [totalChunks, setTotalChunks] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Upload and progress states
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
      console.warn("[Knowledge Base UI] Cannot fetch documents: tenant clientId is undefined in session context.", session);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setErrorMessage("");

    try {
      console.log(`[Knowledge Base UI] Fetching registry documents for workspace: ${clientId}`);
      // 1. Fetch document registry
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, file_name, file_type, file_size, storage_path, status, created_at")
        .eq("workspace_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // 2. Fetch total chunk count
      const { count: chunksCount, error: chunksError } = await supabase
        .from("knowledge_chunks")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", clientId);

      if (chunksError) {
        console.error("[Knowledge Base UI Error] Failed to load chunks count:", chunksError);
      } else {
        setTotalChunks(chunksCount || 0);
      }

      const mapped: KBFile[] = (data || []).map(doc => {
        let statusVal: "indexed" | "processing" | "failed" = "indexed";
        if (doc.status === "processing" || doc.status === "uploading") {
          statusVal = "processing";
        } else if (doc.status === "failed") {
          statusVal = "failed";
        }

        return {
          id: doc.id,
          name: doc.file_name || "Untitled Document",
          size: doc.file_size || "N/A",
          type: doc.file_type || "txt",
          uploadedAt: new Date(doc.created_at).toLocaleString("en-US", { 
            month: "short", 
            day: "2-digit", 
            year: "numeric",
            hour: "2-digit", 
            minute: "2-digit" 
          }),
          status: statusVal,
        };
      });

      console.log(`[Knowledge Base UI Success] Found ${mapped.length} registered documents.`);
      setFiles(mapped);
    } catch (err: unknown) {
      console.error("[Knowledge Base UI Error] Failed to load knowledge documents:", err);
      const msg = err instanceof Error ? err.message : "Could not retrieve knowledge registry.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [clientId, supabase, session]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const startRealUpload = async (file: File) => {
    console.log("[Client Upload Request] Triggered startRealUpload for file:", file.name, "size:", file.size, "workspace:", clientId);

    if (!clientId) {
      const errMsg = "Cannot upload file: Workspace ID is undefined. Complete onboarding first.";
      console.error(`[Client Upload Request Error] ${errMsg}`);
      triggerToast(`Error: ${errMsg}`);
      return;
    }

    if (isUploading) {
      console.warn("[Client Upload Request Warning] Upload is already in progress, ignoring duplicate event.");
      return;
    }

    // Validate extension
    const allowedExtensions = ["pdf", "docx", "txt", "csv"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.includes(ext)) {
      const extMsg = "Unsupported file type. Please upload PDF, DOCX, TXT, or CSV.";
      console.error(`[Client Upload Request Error] ${extMsg} Extracted extension: ${ext}`);
      triggerToast(`Error: ${extMsg}`);
      return;
    }

    // Validate size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      const sizeMsg = "File size exceeds 10MB limit.";
      console.error(`[Client Upload Request Error] ${sizeMsg}`);
      triggerToast(`Error: ${sizeMsg}`);
      return;
    }
    
    setIsUploading(true);
    setUploadingName(file.name);
    setUploadProgress(10);
    setErrorMessage("");

    try {
      const documentId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      const storagePath = `${clientId}/${documentId}_${file.name}`;
      const fileSizeStr = formatFileSize(file.size);

      console.log(`[Client DB Insert] Attempting to insert placeholder document record: docId=${documentId}, path=${storagePath}, status=uploading`);
      // 1. Insert record into database in "uploading" status
      const { data: dbData, error: insertError } = await supabase
        .from("knowledge_documents")
        .insert({
          id: documentId,
          workspace_id: clientId,
          file_name: file.name,
          file_type: ext,
          file_size: fileSizeStr,
          storage_path: storagePath,
          status: "uploading"
        })
        .select();

      if (insertError) {
        console.error("[Client DB Insert Response Error] Failed to create database registry entry:", insertError);
        throw new Error(`Database error: ${insertError.message}`);
      }
      
      console.log("[Client DB Insert Response Success] Placeholder record inserted successfully:", dbData);
      setUploadProgress(40);

      console.log(`[Client Storage Upload] Uploading to Supabase Storage: bucket=knowledge-files, path=${storagePath}`);
      // 2. Upload file to Supabase storage bucket 'knowledge-files'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true
        });

      if (uploadError) {
        console.error("[Client Storage Upload Response Error] File storage upload failed:", uploadError);
        console.log(`[Client DB Update] Marking document status as failed in database: ${documentId}`);
        await supabase
          .from("knowledge_documents")
          .update({ status: "failed" })
          .eq("id", documentId);
        throw new Error(`Storage upload error: ${uploadError.message}`);
      }

      console.log("[Client Storage Upload Response Success] File stored in Supabase storage bucket:", uploadData);
      setUploadProgress(70);

      console.log(`[Client DB Update] Updating status to 'processing' for document: ${documentId}`);
      // Update status to processing
      const { error: processUpdateErr } = await supabase
        .from("knowledge_documents")
        .update({ status: "processing" })
        .eq("id", documentId);

      if (processUpdateErr) {
        console.warn("[Client DB Update Warning] Failed to update document status to 'processing':", processUpdateErr);
      }
      
      fetchFiles(true);
      setUploadProgress(90);

      console.log(`[Client API Process Invocator] Invoking backend parsing API: POST /api/knowledge/process, body={documentId: "${documentId}"}`);
      // 3. Call backend parsing & embeddings endpoint
      const response = await fetch("/api/knowledge/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      console.log(`[Client API Process Response] Status code: ${response.status}`);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("[Client API Process Response Error] Backend processing failed:", errorData);
        throw new Error(errorData.error || "Failed to process and index document.");
      }

      const successData = await response.json();
      console.log("[Client API Process Response Success] Document parsed, chunked, and embedded:", successData);

      setUploadProgress(100);
      triggerToast(`Uploaded and indexed "${file.name}" successfully!`);
      
    } catch (err: any) {
      console.error("[Client Upload Pipeline Crash] Error encountered during upload flow:", err);
      triggerToast(`Error: ${err.message || "Failed to process file."}`);
    } finally {
      setIsUploading(false);
      setUploadingName("");
      setUploadProgress(0);
      fetchFiles(true);
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
      startRealUpload(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      startRealUpload(file);
    }
  };

  const handleDeleteFile = async (id: string, name: string) => {
    console.log(`[Client Delete Request] Deleting document: id=${id}, name=${name}`);
    try {
      // 1. Fetch document storage path
      const { data: document, error: docError } = await supabase
        .from("knowledge_documents")
        .select("storage_path")
        .eq("id", id)
        .single();

      if (docError) throw docError;

      // 2. Remove file from Supabase Storage
      if (document?.storage_path) {
        console.log(`[Client Storage Delete] Removing file from Supabase storage: path=${document.storage_path}`);
        const { error: storageError } = await supabase.storage
          .from("knowledge-files")
          .remove([document.storage_path]);
        
        if (storageError) {
          console.error("[Client Storage Delete Error] Failed to delete storage file:", storageError.message);
        } else {
          console.log("[Client Storage Delete Success] Removed storage file successfully.");
        }
      }

      // 3. Delete DB record (cascading deletes chunks)
      console.log(`[Client DB Delete] Deleting database registry entry: id=${id}`);
      const { error: deleteError } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      console.log("[Client DB Delete Success] Database registry entry deleted.");
      setFiles(prev => prev.filter(f => f.id !== id));
      triggerToast(`Removed "${name}" from Knowledge Base.`);
      fetchFiles(true);
    } catch (err: unknown) {
      console.error("[Client Delete Request Error] Delete flow failed:", err);
      triggerToast("Failed to delete document from database.");
    }
  };

  const handleReSync = async (id: string, name: string) => {
    console.log(`[Client Re-sync Request] Re-indexing document: id=${id}, name=${name}`);
    try {
      // Set status to processing
      const { error: updateError } = await supabase
        .from("knowledge_documents")
        .update({ status: "processing" })
        .eq("id", id);

      if (updateError) throw updateError;

      setFiles(prev => prev.map(f => {
        if (f.id === id) return { ...f, status: "processing" };
        return f;
      }));
      
      triggerToast(`Re-indexing document "${name}"...`);

      // Invoke processing API
      console.log(`[Client Re-sync Invocator] Calling POST /api/knowledge/process for documentId: ${id}`);
      const response = await fetch("/api/knowledge/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId: id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[Client Re-sync API Response Error] Re-indexing failed:", errorData);
        throw new Error(errorData.error || "Failed to complete re-sync.");
      }

      console.log("[Client Re-sync API Response Success] Re-indexing successful.");
      triggerToast(`Re-indexing complete for "${name}"!`);
      fetchFiles(true);
    } catch (err: any) {
      console.error("[Client Re-sync Request Error] Re-sync flow failed:", err);
      triggerToast(`Error: ${err.message || "Failed to re-index document."}`);
      fetchFiles(true);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return <File className="h-5 w-5 text-red-400" />;
      case "csv":
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
              <CardDescription>Drag and drop text, PDF, Word or CSV documents to sync</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Hidden file input placed outside the clickable div */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt,.csv"
                className="hidden"
              />

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

        {/* Right Side: Indexing Analytics (1 col) */}
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-md font-semibold">Indexing Analytics</CardTitle>
            <CardDescription>Vector database specifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Total Documents</span>
                <span className="font-semibold text-white font-mono">{files.length} sources</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Total Chunks</span>
                <span className="font-semibold text-white font-mono">{totalChunks} chunks</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Indexed Documents</span>
                <span className="font-semibold text-emerald-400 font-mono">
                  {files.filter(f => f.status === "indexed").length} docs
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Failed Documents</span>
                <span className="font-semibold text-red-400 font-mono">
                  {files.filter(f => f.status === "failed").length} docs
                </span>
              </div>
            </div>

            <div className="border-t border-border/40 pt-4 space-y-2.5">
              <div className="flex gap-2.5 text-xs text-muted-foreground leading-normal">
                <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[11px]">
                  Files uploaded are automatically parsed, chunked (1,000 chars, 200 overlap), and embedded into OpenAI vector arrays for RAG chatbot context mappings.
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
