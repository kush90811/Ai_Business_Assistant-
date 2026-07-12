-- 005_business_profiles.sql
-- Table to store public-facing business profile metadata for each tenant.
-- The AI chatbot directly references this table to answer questions about the company.

CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  description text,
  address text,
  phone text,
  email text,
  website text,
  working_hours text,
  social_links jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by client_id
CREATE INDEX IF NOT EXISTS idx_business_profiles_client_id ON public.business_profiles(client_id);

-- Enable RLS
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for tenant isolation (users can only access their own client profile)
CREATE POLICY "business_profiles_tenant_isolation" ON public.business_profiles
  FOR ALL USING (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  ) WITH CHECK (
    client_id IN (SELECT client_id FROM public.client_users WHERE user_id = auth.uid())
  );

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_profiles TO service_role;
