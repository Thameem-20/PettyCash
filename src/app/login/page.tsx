"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Login failed");
        return;
      }
      const next = params.get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-[var(--login-paper)] px-5 py-10 sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(6,40,31,0.06) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden
      />

      <div className="login-panel-in relative w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <h1 className="login-display text-3xl font-bold tracking-tight text-[var(--login-ink)] sm:text-4xl">
            Petty Cash Management
          </h1>
          <h2 className="mt-6 text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-slate-500">Use your work email and password.</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
              className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 py-3 text-[16px] text-slate-900 outline-none transition-[border-color] placeholder:text-slate-400 focus:border-brand-600 md:text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full border-0 border-b-2 border-slate-200 bg-transparent py-3 pr-10 text-[16px] text-slate-900 outline-none transition-[border-color] placeholder:text-slate-400 focus:border-brand-600 md:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 transition-colors hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group relative mt-2 flex w-full items-center justify-center overflow-hidden bg-brand-700 px-4 py-3.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="absolute inset-0 translate-y-full bg-brand-900/20 transition-transform duration-300 group-hover:translate-y-0" />
            <span className="relative">{loading ? "Signing in…" : "Continue"}</span>
          </button>
        </form>

        <p className="mt-10 text-center text-xs text-slate-400">Secure internal access</p>
      </div>
    </div>
  );
}
