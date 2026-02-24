"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const verify = searchParams.get("verify");
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(
    authError === "EmailSignin"
      ? "Failed to send magic link. Please try again."
      : authError
        ? "Something went wrong. Please try again."
        : null
  );
  const [loading, setLoading] = useState(false);

  // If NextAuth redirected here with ?verify=1, show the "check email" screen
  if (verify) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-violet-600">
              minitik
            </h1>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Check your email
            </p>
          </div>

          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50">
              <svg
                className="h-8 w-8 text-violet-600 dark:text-violet-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>

            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              We sent a magic link to your email. Click the link to sign in.
            </p>

            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Didn&apos;t receive it? Check spam or{" "}
              <a
                href="/login"
                className="text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:no-underline"
              >
                try again
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Use NextAuth's redirect flow — it will redirect to /login?verify=1 on success
    // or /login?error=EmailSignin on failure (via pages config)
    await signIn("email", {
      email,
      callbackUrl: "/",
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-violet-600">
            minitik
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Sign in to manage your videos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending..." : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
