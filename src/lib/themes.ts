export type ThemeId =
  | "emerald"
  | "ocean"
  | "azure"
  | "indigo"
  | "rose"
  | "amber"
  | "slate"
  | "black";

export type ThemeVars = {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  brand50: string;
  brand100: string;
  brand200: string;
  brand300: string;
  brand400: string;
  brand500: string;
  brand600: string;
  brand700: string;
  brand800: string;
  brand900: string;
  brand950: string;
};

export type ThemePalette = {
  id: ThemeId;
  name: string;
  description: string;
  preview: [string, string, string];
  vars: ThemeVars;
};

export const THEME_COOKIE = "pc-theme";
export const DEFAULT_THEME_ID: ThemeId = "emerald";

export const THEMES: ThemePalette[] = [
  {
    id: "emerald",
    name: "Forest",
    description: "Fresh emerald green — the original look",
    preview: ["#059669", "#10b981", "#d1fae5"],
    vars: {
      primary: "#059669",
      primaryForeground: "#ffffff",
      accent: "#ecfdf5",
      accentForeground: "#065f46",
      ring: "#059669",
      sidebar: "#ecfdf5",
      sidebarForeground: "#064e3b",
      sidebarPrimary: "#059669",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#d1fae5",
      sidebarAccentForeground: "#065f46",
      sidebarBorder: "#a7f3d0",
      sidebarRing: "#059669",
      chart1: "#059669",
      chart2: "#10b981",
      chart3: "#34d399",
      chart4: "#6ee7b7",
      chart5: "#a7f3d0",
      brand50: "#f0fdf4",
      brand100: "#dcfce7",
      brand200: "#bbf7d0",
      brand300: "#86efac",
      brand400: "#4ade80",
      brand500: "#22c55e",
      brand600: "#059669",
      brand700: "#047857",
      brand800: "#166534",
      brand900: "#14532d",
      brand950: "#052e16",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep teal with cool coastal accents",
    preview: ["#0d9488", "#14b8a6", "#ccfbf1"],
    vars: {
      primary: "#0d9488",
      primaryForeground: "#ffffff",
      accent: "#f0fdfa",
      accentForeground: "#115e59",
      ring: "#0d9488",
      sidebar: "#f0fdfa",
      sidebarForeground: "#134e4a",
      sidebarPrimary: "#0d9488",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#ccfbf1",
      sidebarAccentForeground: "#115e59",
      sidebarBorder: "#99f6e4",
      sidebarRing: "#0d9488",
      chart1: "#0d9488",
      chart2: "#14b8a6",
      chart3: "#2dd4bf",
      chart4: "#5eead4",
      chart5: "#99f6e4",
      brand50: "#f0fdfa",
      brand100: "#ccfbf1",
      brand200: "#99f6e4",
      brand300: "#5eead4",
      brand400: "#2dd4bf",
      brand500: "#14b8a6",
      brand600: "#0d9488",
      brand700: "#0f766e",
      brand800: "#115e59",
      brand900: "#134e4a",
      brand950: "#042f2e",
    },
  },
  {
    id: "azure",
    name: "Azure",
    description: "Clear sky blue for a crisp, modern feel",
    preview: ["#0284c7", "#0ea5e9", "#e0f2fe"],
    vars: {
      primary: "#0284c7",
      primaryForeground: "#ffffff",
      accent: "#f0f9ff",
      accentForeground: "#075985",
      ring: "#0284c7",
      sidebar: "#f0f9ff",
      sidebarForeground: "#0c4a6e",
      sidebarPrimary: "#0284c7",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#e0f2fe",
      sidebarAccentForeground: "#075985",
      sidebarBorder: "#bae6fd",
      sidebarRing: "#0284c7",
      chart1: "#0284c7",
      chart2: "#0ea5e9",
      chart3: "#38bdf8",
      chart4: "#7dd3fc",
      chart5: "#bae6fd",
      brand50: "#f0f9ff",
      brand100: "#e0f2fe",
      brand200: "#bae6fd",
      brand300: "#7dd3fc",
      brand400: "#38bdf8",
      brand500: "#0ea5e9",
      brand600: "#0284c7",
      brand700: "#0369a1",
      brand800: "#075985",
      brand900: "#0c4a6e",
      brand950: "#082f49",
    },
  },
  {
    id: "indigo",
    name: "Indigo",
    description: "Rich indigo for a polished corporate look",
    preview: ["#4f46e5", "#6366f1", "#e0e7ff"],
    vars: {
      primary: "#4f46e5",
      primaryForeground: "#ffffff",
      accent: "#eef2ff",
      accentForeground: "#3730a3",
      ring: "#4f46e5",
      sidebar: "#eef2ff",
      sidebarForeground: "#312e81",
      sidebarPrimary: "#4f46e5",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#e0e7ff",
      sidebarAccentForeground: "#3730a3",
      sidebarBorder: "#c7d2fe",
      sidebarRing: "#4f46e5",
      chart1: "#4f46e5",
      chart2: "#6366f1",
      chart3: "#818cf8",
      chart4: "#a5b4fc",
      chart5: "#c7d2fe",
      brand50: "#eef2ff",
      brand100: "#e0e7ff",
      brand200: "#c7d2fe",
      brand300: "#a5b4fc",
      brand400: "#818cf8",
      brand500: "#6366f1",
      brand600: "#4f46e5",
      brand700: "#4338ca",
      brand800: "#3730a3",
      brand900: "#312e81",
      brand950: "#1e1b4b",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Warm rose accents with soft blush surfaces",
    preview: ["#e11d48", "#f43f5e", "#ffe4e6"],
    vars: {
      primary: "#e11d48",
      primaryForeground: "#ffffff",
      accent: "#fff1f2",
      accentForeground: "#9f1239",
      ring: "#e11d48",
      sidebar: "#fff1f2",
      sidebarForeground: "#881337",
      sidebarPrimary: "#e11d48",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#ffe4e6",
      sidebarAccentForeground: "#9f1239",
      sidebarBorder: "#fecdd3",
      sidebarRing: "#e11d48",
      chart1: "#e11d48",
      chart2: "#f43f5e",
      chart3: "#fb7185",
      chart4: "#fda4af",
      chart5: "#fecdd3",
      brand50: "#fff1f2",
      brand100: "#ffe4e6",
      brand200: "#fecdd3",
      brand300: "#fda4af",
      brand400: "#fb7185",
      brand500: "#f43f5e",
      brand600: "#e11d48",
      brand700: "#be123c",
      brand800: "#9f1239",
      brand900: "#881337",
      brand950: "#4c0519",
    },
  },
  {
    id: "amber",
    name: "Amber",
    description: "Golden amber for a warm, energetic vibe",
    preview: ["#d97706", "#f59e0b", "#fef3c7"],
    vars: {
      primary: "#d97706",
      primaryForeground: "#ffffff",
      accent: "#fffbeb",
      accentForeground: "#92400e",
      ring: "#d97706",
      sidebar: "#fffbeb",
      sidebarForeground: "#78350f",
      sidebarPrimary: "#d97706",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#fef3c7",
      sidebarAccentForeground: "#92400e",
      sidebarBorder: "#fde68a",
      sidebarRing: "#d97706",
      chart1: "#d97706",
      chart2: "#f59e0b",
      chart3: "#fbbf24",
      chart4: "#fcd34d",
      chart5: "#fde68a",
      brand50: "#fffbeb",
      brand100: "#fef3c7",
      brand200: "#fde68a",
      brand300: "#fcd34d",
      brand400: "#fbbf24",
      brand500: "#f59e0b",
      brand600: "#d97706",
      brand700: "#b45309",
      brand800: "#92400e",
      brand900: "#78350f",
      brand950: "#451a03",
    },
  },
  {
    id: "slate",
    name: "Slate",
    description: "Neutral slate — calm and professional",
    preview: ["#475569", "#64748b", "#e2e8f0"],
    vars: {
      primary: "#475569",
      primaryForeground: "#ffffff",
      accent: "#f8fafc",
      accentForeground: "#1e293b",
      ring: "#475569",
      sidebar: "#f8fafc",
      sidebarForeground: "#0f172a",
      sidebarPrimary: "#475569",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#e2e8f0",
      sidebarAccentForeground: "#1e293b",
      sidebarBorder: "#cbd5e1",
      sidebarRing: "#475569",
      chart1: "#475569",
      chart2: "#64748b",
      chart3: "#94a3b8",
      chart4: "#cbd5e1",
      chart5: "#e2e8f0",
      brand50: "#f8fafc",
      brand100: "#f1f5f9",
      brand200: "#e2e8f0",
      brand300: "#cbd5e1",
      brand400: "#94a3b8",
      brand500: "#64748b",
      brand600: "#475569",
      brand700: "#334155",
      brand800: "#1e293b",
      brand900: "#0f172a",
      brand950: "#020617",
    },
  },
  {
    id: "black",
    name: "Black",
    description: "Bold black accents for a sharp, minimal look",
    preview: ["#0a0a0a", "#262626", "#e5e5e5"],
    vars: {
      primary: "#0a0a0a",
      primaryForeground: "#ffffff",
      accent: "#f5f5f5",
      accentForeground: "#171717",
      ring: "#0a0a0a",
      sidebar: "#fafafa",
      sidebarForeground: "#0a0a0a",
      sidebarPrimary: "#0a0a0a",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#e5e5e5",
      sidebarAccentForeground: "#171717",
      sidebarBorder: "#d4d4d4",
      sidebarRing: "#0a0a0a",
      chart1: "#0a0a0a",
      chart2: "#404040",
      chart3: "#737373",
      chart4: "#a3a3a3",
      chart5: "#d4d4d4",
      brand50: "#fafafa",
      brand100: "#f5f5f5",
      brand200: "#e5e5e5",
      brand300: "#d4d4d4",
      brand400: "#a3a3a3",
      brand500: "#737373",
      brand600: "#0a0a0a",
      brand700: "#171717",
      brand800: "#262626",
      brand900: "#171717",
      brand950: "#0a0a0a",
    },
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

export function getTheme(id: string | null | undefined): ThemePalette {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

/** CSS custom properties applied to <html> for the selected palette. */
export function themeToCssVars(vars: ThemeVars): Record<string, string> {
  return {
    "--primary": vars.primary,
    "--primary-foreground": vars.primaryForeground,
    "--accent": vars.accent,
    "--accent-foreground": vars.accentForeground,
    "--ring": vars.ring,
    "--sidebar": vars.sidebar,
    "--sidebar-foreground": vars.sidebarForeground,
    "--sidebar-primary": vars.sidebarPrimary,
    "--sidebar-primary-foreground": vars.sidebarPrimaryForeground,
    "--sidebar-accent": vars.sidebarAccent,
    "--sidebar-accent-foreground": vars.sidebarAccentForeground,
    "--sidebar-border": vars.sidebarBorder,
    "--sidebar-ring": vars.sidebarRing,
    "--chart-1": vars.chart1,
    "--chart-2": vars.chart2,
    "--chart-3": vars.chart3,
    "--chart-4": vars.chart4,
    "--chart-5": vars.chart5,
    "--brand-50": vars.brand50,
    "--brand-100": vars.brand100,
    "--brand-200": vars.brand200,
    "--brand-300": vars.brand300,
    "--brand-400": vars.brand400,
    "--brand-500": vars.brand500,
    "--brand-600": vars.brand600,
    "--brand-700": vars.brand700,
    "--brand-800": vars.brand800,
    "--brand-900": vars.brand900,
    "--brand-950": vars.brand950,
  };
}

export function themeStyleString(id: string | null | undefined): string {
  const { vars } = getTheme(id);
  return Object.entries(themeToCssVars(vars))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
