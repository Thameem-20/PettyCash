"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  DEFAULT_THEME_ID,
  THEME_COOKIE,
  getTheme,
  isThemeId,
  themeToCssVars,
  type ThemeId,
} from "@/lib/themes";

type ThemeContextValue = {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
});

function applyThemeToDocument(themeId: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", themeId);
  const vars = themeToCssVars(getTheme(themeId).vars);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  document.cookie = `${THEME_COOKIE}=${themeId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export function ThemeProvider({
  initialThemeId,
  children,
}: {
  initialThemeId: string;
  children: React.ReactNode;
}) {
  const [themeId, setThemeIdState] = useState<ThemeId>(
    isThemeId(initialThemeId) ? initialThemeId : DEFAULT_THEME_ID
  );

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    applyThemeToDocument(id);
  }, []);

  const value = useMemo(() => ({ themeId, setThemeId }), [themeId, setThemeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
