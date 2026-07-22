"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO = [
  ["Admin", "admin@company.com"],
  ["Supervisor", "supervisor@company.com"],
  ["Accounts (Ziad)", "ziad@company.com"],
  ["Accounts Supervisor", "accsup@company.com"],
  ["Treasury", "treasury@company.com"],
  ["Cash Requester", "messenger@company.com"],
  ["Operations", "ops@company.com"],
  ["Compassion Cash Requester", "messenger2@company.com"],
  ["Compassion Supervisor (Asif)", "asif@company.com"],
  ["Compassion Accounts (Fazil)", "fazil@company.com"],
];

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  function selectDemo(em: string) {
    setEmail(em);
    setPassword("Pass@123");
    setDemoOpen(false);
  }

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
    <div className="flex min-h-screen items-center justify-center bg-muted p-3 md:p-4">
      <div className="w-full max-w-md">
        <Card className="gap-0 overflow-hidden p-0">
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-4 py-5 text-center md:px-6 md:py-7">
            <h1 className="text-lg font-bold text-white md:text-xl">Petty Cash Management</h1>
            <p className="mt-1 text-xs text-brand-100 md:text-sm">Sign in to your account</p>
          </div>

          <form onSubmit={submit} className="space-y-3 p-4 md:space-y-4 md:p-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="border-t border-border text-sm">
            <button
              type="button"
              onClick={() => setDemoOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 font-medium text-foreground hover:bg-muted"
              aria-expanded={demoOpen}
            >
              Demo accounts
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${demoOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {demoOpen && (
              <div className="border-t border-border px-2 pb-2 pt-1">
                <p className="px-2 py-2 text-xs text-muted-foreground">Password for all: Pass@123</p>
                <ul className="divide-y divide-border">
                  {DEMO.map(([label, em]) => (
                    <li key={em}>
                      <button
                        type="button"
                        onClick={() => selectDemo(em)}
                        className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                      >
                        <span className="block font-medium text-foreground">{label}</span>
                        <span className="text-xs text-muted-foreground">{em}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
