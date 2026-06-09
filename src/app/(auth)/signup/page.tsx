"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ROUTES } from "@/config/app";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult.data.session;

    if (!session) {
      setLoading(false);
      setMessage("Account created. Check your email if confirmation is enabled.");
      router.push(ROUTES.public.login);
      router.refresh();
      return;
    }

    const onboardResponse = await fetch("/api/auth/onboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        companyName,
      }),
    });

    setLoading(false);

    if (!onboardResponse.ok) {
      const payload = (await onboardResponse.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "We could not complete tenant onboarding.");
      return;
    }

    setMessage("Account created and tenant initialized.");
    router.push(ROUTES.dashboard.root);
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form onSubmit={handleSubmit} className="w-full space-y-4 rounded-xl border p-6">
        <div>
          <h1 className="text-2xl font-semibold">Create account</h1>
          <p className="text-sm text-muted-foreground">Set up your AI Business Assistant access.</p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Full name</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Business name</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Email</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Password</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="text-sm text-muted-foreground">
          Already have an account? <a className="underline" href={ROUTES.public.login}>Sign in</a>
        </p>
      </form>
    </main>
  );
}
