/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCurrentSession } from "@/lib/auth/session";
import { generateEmbedding } from "@/lib/embeddings";
import { checkRateLimit, buildRateLimitKey } from "@/lib/rate-limit";
import { checkAllowedDomain } from "@/lib/domain-check";

const SearchPayloadSchema = z.object({
  query: z.string().min(1, "Query is required").max(2000),
  workspaceId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 0. Parse and validate payload
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = SearchPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, workspaceId } = parsed.data;

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

    // 1. Rate limiting — 60 req/min
    const rlKey = buildRateLimitKey(request, targetWorkspaceId);
    const rlResult = checkRateLimit(rlKey, 60);
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rlResult.retryAfterMs || 60000) / 1000)) },
        }
      );
    }

    const supabase = createSupabaseServiceClient();

    // 2. Domain enforcement (only for non-authenticated requests)
    if (!session) {
      const domainResult = await checkAllowedDomain(request, targetWorkspaceId, supabase);
      if (!domainResult.allowed) {
        return NextResponse.json({ error: domainResult.reason }, { status: 403 });
      }
    }

    // 3. Verify workspace (client) exists
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", targetWorkspaceId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: "Workspace client not found." }, { status: 404 });
    }

    // 4. Generate query embedding vector
    console.log(`[RAG Search] Generating embedding for: "${query}"`);
    const queryEmbedding = await generateEmbedding(query.trim());

    // 5. Perform Cosine Similarity search in pgvector using the match_chunks RPC function
    console.log(`[RAG Search] Running pgvector match_chunks RPC for workspace: ${targetWorkspaceId}`);
    const { data: chunks, error: matchError } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
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
