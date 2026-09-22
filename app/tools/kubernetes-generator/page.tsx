import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Kubernetes Generator - OpsForge",
  description:
    "Generate Kubernetes Deployment, Service, and Namespace manifests without writing boilerplate YAML by hand.",
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
