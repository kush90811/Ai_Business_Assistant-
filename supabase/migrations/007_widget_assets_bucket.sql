-- 007_widget_assets_bucket.sql
-- Creates the public 'widget-assets' storage bucket if it doesn't exist.
-- Configures RLS policies to allow public read access and tenant-isolated write access.

INSERT INTO storage.buckets (id, name, public)
VALUES ('widget-assets', 'widget-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public read access to anyone (so external embedded widgets can fetch images)
CREATE POLICY "widget_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'widget-assets');

-- Policy: Allow authenticated tenant users to insert their own logo files
CREATE POLICY "widget_assets_tenant_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'widget-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT client_id::text FROM public.client_users WHERE user_id = auth.uid()
    )
  );

-- Policy: Allow authenticated tenant users to update their own logo files
CREATE POLICY "widget_assets_tenant_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'widget-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT client_id::text FROM public.client_users WHERE user_id = auth.uid()
    )
  );

-- Policy: Allow authenticated tenant users to delete their own logo files
CREATE POLICY "widget_assets_tenant_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'widget-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT client_id::text FROM public.client_users WHERE user_id = auth.uid()
    )
  );
