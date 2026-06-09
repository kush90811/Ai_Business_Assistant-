# Tarkshy AI Chatbot SaaS Foundation

This repository is the foundation for the multi-tenant SaaS platform.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Shadcn UI
- Supabase Auth and PostgreSQL
- OpenRouter-ready AI integration

## Structure

- `src/app` - App Router shell
- `src/config` - environment and platform configuration
- `src/components/ui` - Shadcn UI components
- `src/lib` - shared utilities and platform adapters
- `supabase` - local Supabase config and migrations

## Setup

1. Install dependencies.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase and OpenRouter credentials.
4. Run the dev server.