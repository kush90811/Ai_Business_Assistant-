-- 002_knowledge_base_rag.sql
-- Drop old tables if they exist
DROP TABLE IF EXISTS public.knowledge_chunks CASCADE;
DROP TABLE IF EXISTS public.knowledge_documents CASCADE;
DROP TABLE IF EXISTS public.knowledge_sources CASCADE;

-- Enable Vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: knowledge_documents
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'uploading',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: knowledge_chunks
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  chunk_text text NOT NULL,
  embedding vector(1536),
  chunk_index int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_workspace ON public.knowledge_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_workspace ON public.knowledge_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON public.knowledge_chunks(document_id);

-- Create HNSW index for high performance vector similarity search using Cosine Distance
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_workspace_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  workspace_id uuid,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_chunks.id,
    knowledge_chunks.document_id,
    knowledge_chunks.workspace_id,
    knowledge_chunks.chunk_text,
    1 - (knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE knowledge_chunks.workspace_id = filter_workspace_id
    AND 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant access permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
