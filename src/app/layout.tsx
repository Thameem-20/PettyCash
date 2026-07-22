import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import { ThemeProvider } from "@/components/ThemeProvider";
import DisableNumberInputWheel from "@/components/DisableNumberInputWheel";
import { getStoredThemeId } from "@/lib/appSettings";
import { getTheme, themeToCssVars } from "@/lib/themes";

export const metadata: Metadata = {
  title: {
    default: "Petty Cash",
    template: "%s | Petty Cash",
  },
  description: "Internal petty cash management system",
  applicationName: "Petty Cash",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: [{ url: "/icons/icon-192.png", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Petty Cash",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export async function generateViewport(): Promise<Viewport> {
  const themeId = await getStoredThemeId();
  const theme = getTheme(themeId);
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
    themeColor: theme.vars.primary,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const themeId = await getStoredThemeId();
  const cssVars = themeToCssVars(getTheme(themeId).vars);

  return (
    <html
      lang="en"
      data-theme={themeId}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      style={cssVars as React.CSSProperties}
    >
      <body className="font-sans">
        <ThemeProvider initialThemeId={themeId}>
          <PwaRegister />
          <DisableNumberInputWheel />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
