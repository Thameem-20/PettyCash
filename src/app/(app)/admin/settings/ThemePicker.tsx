"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { THEMES, type ThemeId } from "@/lib/themes";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function ThemePicker({ initialThemeId }: { initialThemeId: ThemeId }) {
  const router = useRouter();
  const { themeId, setThemeId } = useTheme();
  const [selected, setSelected] = useState<ThemeId>(initialThemeId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const current = themeId || selected;

  async function apply(id: ThemeId) {
    setSelected(id);
    setThemeId(id); // live preview
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to save theme");
        return;
      }
      setMessage(`Applied “${THEMES.find((t) => t.id === id)?.name}” for everyone.`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground md:text-sm">
        Choose a color palette. It updates the whole app for all users — sidebar, buttons, charts,
        and accents.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map((theme) => {
          const active = current === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              disabled={saving}
              onClick={() => apply(theme.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all md:p-4",
                active
                  ? "border-primary ring-2 ring-primary/30 shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-muted/40"
              )}
            >
              <div className="mb-3 flex h-12 overflow-hidden rounded-lg md:h-14">
                {theme.preview.map((color) => (
                  <span
                    key={color}
                    className="flex-1"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{theme.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground md:text-xs">
                    {theme.description}
                  </p>
                </div>
                {active && (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {(message || error) && (
        <Card className="gap-0 p-3">
          {message && <p className="text-xs text-primary md:text-sm">{message}</p>}
          {error && <p className="text-xs text-rose-700 md:text-sm">{error}</p>}
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || current === "emerald"}
          onClick={() => apply("emerald")}
        >
          Reset to Forest
        </Button>
        {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>
    </div>
  );
}
