-- 006_widget_logo_url.sql
-- Adds logo_url to widget_configs to support custom chatbot avatars.

ALTER TABLE public.widget_configs
  ADD COLUMN IF NOT EXISTS logo_url text;
