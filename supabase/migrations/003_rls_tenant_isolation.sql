-- 003_rls_tenant_isolation.sql
-- Enables Row Level Security on all public tables and the knowledge-files storage bucket.
-- Policies use client_users.user_id = auth.uid() as the source of truth for tenant membership.
-- service_role bypasses RLS automatically, so server-side API routes are unaffected.

-- ============================================================================
-- Helper: index on client_users(user_id) for fast policy lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_client_users_user_id_lookup
  ON public.client_users(user_id);

-- ============================================================================
-- 1. client_users — user can only see their own membership row(s)
-- ============================================================================
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_users_select_own"
  ON public.client_users
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. clients — user can only see and update clients they belong to
-- ============================================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_member"
  ON public.clients
  FOR SELECT
  USING (
    id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

CREATE POLICY "clients_update_member"
  ON public.clients
  FOR UPDATE
  USING (
    id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 3. profiles — user can only see/update their own profile row
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self"
  ON public.profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- 4. widget_configs — tenant isolation via client_id
-- ============================================================================
ALTER TABLE public.widget_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "widget_configs_tenant_isolation"
  ON public.widget_configs
  FOR ALL
  USING (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 5. chat_sessions — tenant isolation via client_id
-- ============================================================================
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_sessions_tenant_isolation"
  ON public.chat_sessions
  FOR ALL
  USING (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 6. chat_messages — tenant isolation via client_id
-- ============================================================================
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_tenant_isolation"
  ON public.chat_messages
  FOR ALL
  USING (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 7. leads — tenant isolation via client_id
-- ============================================================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_tenant_isolation"
  ON public.leads
  FOR ALL
  USING (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 8. knowledge_documents — tenant isolation via workspace_id
--    (workspace_id references clients.id, same as client_id semantically)
-- ============================================================================
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_documents_tenant_isolation"
  ON public.knowledge_documents
  FOR ALL
  USING (
    workspace_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    workspace_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 9. knowledge_chunks — tenant isolation via workspace_id
-- ============================================================================
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_chunks_tenant_isolation"
  ON public.knowledge_chunks
  FOR ALL
  USING (
    workspace_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    workspace_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 10. knowledge_sources — tenant isolation via client_id
--     (this table exists in 001_init.sql but may have been dropped by 002;
--      IF NOT EXISTS guards against failure if the table no longer exists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_sources') THEN
    EXECUTE 'ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'knowledge_sources' AND policyname = 'knowledge_sources_tenant_isolation') THEN
      EXECUTE '
        CREATE POLICY "knowledge_sources_tenant_isolation"
          ON public.knowledge_sources
          FOR ALL
          USING (
            client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
          )
          WITH CHECK (
            client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
          )';
    END IF;
  END IF;
END$$;

-- ============================================================================
-- 11. Storage RLS — knowledge-files bucket
--     File path convention: ${clientId}/${documentId}_${fileName}
--     The first folder segment is the tenant's client_id.
-- ============================================================================
CREATE POLICY "knowledge_files_tenant_isolation"
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'knowledge-files'
    AND (storage.foldername(name))[1] IN (
      SELECT client_id::text FROM public.client_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'knowledge-files'
    AND (storage.foldername(name))[1] IN (
      SELECT client_id::text FROM public.client_users WHERE user_id = auth.uid()
    )
  );
