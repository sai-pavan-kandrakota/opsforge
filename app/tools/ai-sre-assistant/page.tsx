import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "SRE Incident Analyzer - OpsForge",
  description: "Deterministic incident triage for Kubernetes, AWS, CI/CD, networking, database, and application failures — evidence-based classification and severity, entirely in your browser."
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
