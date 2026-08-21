import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "GitHub Actions Analyzer - OpsForge",
  description: "Analyze GitHub Actions workflows for CI/CD security, reliability, permissions, and best practices."
};

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />
      <ClientComponent />
      <SiteFooter />
    </main>
  );
}
