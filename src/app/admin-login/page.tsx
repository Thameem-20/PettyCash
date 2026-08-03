import { redirect } from "next/navigation";
import { Syne } from "next/font/google";
import { getSession } from "@/lib/session";
import LoginForm from "@/components/LoginForm";
import "../login/login.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-login-display",
  display: "swap",
});

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session && (session.role === "admin" || session.primary_role === "admin")) {
    redirect("/admin/settings");
  }

  return (
    <div className={`login-shell ${syne.variable}`}>
      <LoginForm
        adminOnly
        heading="Admin sign in"
        subtext="Administrator access only. Use this page during maintenance."
        defaultNext="/admin/settings"
      />
    </div>
  );
}
