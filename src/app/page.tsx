export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
        <section className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Tarkshy Consultancy Services
          </p>
          <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">
            Multi-tenant AI chatbot SaaS foundation.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Next.js 15, TypeScript, Tailwind, Shadcn UI, Supabase, and an OpenRouter-ready
            architecture are wired in for the first implementation phase.
          </p>
        </section>
      </div>
    </main>
  );
}