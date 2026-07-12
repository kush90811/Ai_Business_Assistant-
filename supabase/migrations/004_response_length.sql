-- 004_response_length.sql
-- Adds a response_length setting to widget_configs so each client can
-- control how verbose the AI assistant's replies are.
-- Values: 'short' (150 tokens), 'medium' (400 tokens), 'detailed' (800 tokens).

ALTER TABLE public.widget_configs
  ADD COLUMN IF NOT EXISTS response_length text NOT NULL DEFAULT 'medium';

ALTER TABLE public.widget_configs
  ADD CONSTRAINT widget_configs_response_length_check
  CHECK (response_length IN ('short', 'medium', 'detailed'));
