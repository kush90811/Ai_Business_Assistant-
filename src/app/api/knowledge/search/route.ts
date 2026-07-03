/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCurrentSession } from "@/lib/auth/session";
import { generateEmbedding } from "@/lib/embeddings";

export async function POST(request: NextRequest) {
  try {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { query, workspaceId } = payload;

    if (!query || typeof query !== "string" || query.trim() === "") {
      return NextResponse.json({ error: "Query is required and must be a string." }, { status: 400 });
    }

    // Authenticate session if available (dashboard users)
    const session = await getCurrentSession();
    let targetWorkspaceId = workspaceId;

    if (session) {
      if (!session.tenant?.clientId) {
        return NextResponse.json({ error: "Unauthorized session." }, { status: 401 });
      }
      // Force the workspace_id from session context to prevent any data spoofing/leakage
      targetWorkspaceId = session.tenant.clientId;
    }

    if (!targetWorkspaceId) {
      return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // Verify workspace (client) exists
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", targetWorkspaceId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: "Workspace client not found." }, { status: 404 });
    }

    // 1. Generate query embedding vector
    console.log(`[RAG Search] Generating embedding for: "${query}"`);
    const queryEmbedding = await generateEmbedding(query.trim());

    // 2. Perform Cosine Similarity search in pgvector using the match_chunks RPC function
    console.log(`[RAG Search] Running pgvector match_chunks RPC for workspace: ${targetWorkspaceId}`);
    const { data: chunks, error: matchError } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Minimum cosine similarity score threshold (0.3 is standard)
      match_count: 5,        // Top 5 chunks
      filter_workspace_id: targetWorkspaceId,
    });

    if (matchError) {
      throw matchError;
    }

    console.log(`[RAG Search] Found ${chunks?.length || 0} relevant chunks.`);

    return NextResponse.json({ chunks: chunks || [] });

  } catch (error: any) {
    console.error("[RAG Search Error] Similarity search failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute semantic search." },
      { status: 500 }
    );
  }
}
