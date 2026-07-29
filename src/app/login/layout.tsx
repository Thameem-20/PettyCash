import { Syne } from "next/font/google";
import "./login.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-login-display",
  display: "swap",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={`login-shell ${syne.variable}`}>{children}</div>;
}
