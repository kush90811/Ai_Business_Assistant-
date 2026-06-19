/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCurrentSession } from "@/lib/auth/session";
import { generateEmbeddings } from "@/lib/embeddings";

/**
 * Custom CSV parser that turns rows into searchable, semantic strings.
 */
function parseCSV(content: string): string {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return "";

  // Helper to split a CSV line respecting quotes
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rowsText: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const rowContent = headers
      .map((header, idx) => {
        const val = values[idx] || "";
        return `${header}: ${val}`;
      })
      .join(", ");
    rowsText.push(rowContent);
  }

  return rowsText.join("\n");
}

/**
 * Text chunking function that splits text into chunks of specified size and overlap, respecting word boundaries.
 */
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  if (text.length <= chunkSize) {
    return [text.trim()];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    if (end > text.length) {
      end = text.length;
    } else {
      // Avoid splitting words: backtrack to find the nearest space
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + chunkSize - 100) {
        end = lastSpace;
      }
    }

    const chunk = text.substring(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;

    // Avoid starting in the middle of a word: forward-track to nearest space
    const nextSpace = text.indexOf(" ", start);
    if (nextSpace > 0 && nextSpace < end) {
      start = nextSpace + 1;
    }

    // Safety checks to prevent infinite loops
    if (chunkSize <= overlap || start >= end) {
      start = end; // Force advancement
    }

    if (end >= text.length) {
      break;
    }
  }

  return chunks.filter((c) => c.length > 0);
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServiceClient();

  // 1. Verify user session and permissions
  const session = await getCurrentSession();
  if (!session || !session.tenant?.clientId) {
    return NextResponse.json({ error: "Unauthorized user session." }, { status: 401 });
  }

  const workspaceId = session.tenant.clientId;
  
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { documentId } = payload;
  if (!documentId) {
    return NextResponse.json({ error: "documentId is required." }, { status: 400 });
  }

  try {
    // 2. Fetch the document metadata and verify workspace ownership
    const { data: document, error: docError } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: `Document not found in registry: ${docError?.message}` },
        { status: 404 }
      );
    }

    // Prevent cross-workspace data access
    if (document.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this document." },
        { status: 403 }
      );
    }

    // Update document status to processing
    await supabase
      .from("knowledge_documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // 3. Download the document from Supabase Storage
    console.log(`[RAG Pipeline] Downloading file from storage path: ${document.storage_path}`);
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("knowledge-files")
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(
        `Failed to download file from storage bucket: ${downloadError?.message || "Empty file content"}`
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Extract text depending on file type
    let extractedText = "";
    const fileType = document.file_type.toLowerCase();
    console.log(`[RAG Pipeline] Extracting text for file type: ${fileType}`);

    if (fileType === "pdf") {
      try {
        const pdf = require("pdf-parse");
        const parsedPdf = await pdf(buffer);
        extractedText = parsedPdf.text || "";
      } catch (pdfErr: any) {
        throw new Error(`PDF Parsing failed: ${pdfErr.message}`);
      }
    } else if (fileType === "docx") {
      try {
        const mammoth = require("mammoth");
        const parsedDocx = await mammoth.extractRawText({ buffer });
        extractedText = parsedDocx.value || "";
      } catch (docxErr: any) {
        throw new Error(`DOCX Parsing failed: ${docxErr.message}`);
      }
    } else if (fileType === "txt") {
      extractedText = buffer.toString("utf-8");
    } else if (fileType === "csv") {
      const csvRaw = buffer.toString("utf-8");
      extractedText = parseCSV(csvRaw);
    } else {
      throw new Error(`Unsupported file extension: .${fileType}`);
    }

    if (!extractedText.trim()) {
      throw new Error("No readable text content could be extracted from this document.");
    }

    // 5. Chunk the extracted text
    console.log(`[RAG Pipeline] Chunking extracted text (len: ${extractedText.length})`);
    const chunks = chunkText(extractedText, 1000, 200);
    console.log(`[RAG Pipeline] Generated ${chunks.length} chunks.`);

    if (chunks.length === 0) {
      throw new Error("Document text is empty or failed to chunk.");
    }

    // 6. Generate Embeddings using OpenAI model in batch
    console.log(`[RAG Pipeline] Generating OpenAI embeddings for ${chunks.length} chunks...`);
    const embeddings = await generateEmbeddings(chunks);

    // 7. Store Chunks in Supabase Vector database
    console.log(`[RAG Pipeline] Storing ${chunks.length} vector chunks in pgvector...`);
    
    // Clear any existing chunks for this document in case of a re-sync
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);

    const chunkInserts = chunks.map((text, idx) => ({
      document_id: documentId,
      workspace_id: workspaceId,
      chunk_text: text,
      embedding: embeddings[idx],
      chunk_index: idx,
    }));

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkInserts);

    if (insertError) {
      throw new Error(`Failed to store vector chunks in database: ${insertError.message}`);
    }

    // 8. Update document status to indexed
    console.log(`[RAG Pipeline] Document ${documentId} is successfully indexed.`);
    await supabase
      .from("knowledge_documents")
      .update({ status: "indexed" })
      .eq("id", documentId);

    return NextResponse.json({
      success: true,
      message: "Document processed and indexed successfully.",
      chunksCount: chunks.length,
    });

  } catch (error: any) {
    console.error(`[RAG Pipeline Error] Processing failed for document ${documentId}:`, error);
    
    // Mark document status as failed in database
    await supabase
      .from("knowledge_documents")
      .update({ status: "failed" })
      .eq("id", documentId);

    return NextResponse.json(
      { error: error.message || "Failed to process and index document." },
      { status: 500 }
    );
  }
}
