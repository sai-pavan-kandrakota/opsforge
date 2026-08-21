import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Helm Analyzer - OpsForge",
  description: "Analyze Helm charts and Kubernetes templates for security, reliability, resources, probes, and production-readiness issues."
};

export default function Page() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />
      <ClientComponent />
      <SiteFooter />
    </main>
  );
}
